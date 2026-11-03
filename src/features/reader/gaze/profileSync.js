// Keeps an account's profiles in step between this device (IndexedDB) and the
// server (D1). Newest `updatedAt` wins; a delete is final.
//
// The merge rules live in the pure `planSync` so they can be tested as a table;
// `syncProfiles` / `pushRecord` apply them through an injected `api` and `store`
// (the real ones are profileApi.js and profileStore.js).

const time = (iso) => Date.parse(iso) || 0;

/** A local record in the shape the server's profile has, owned by `ownerId`. */
export function fromRemote(profile, ownerId) {
  return {
    id: profile.id,
    name: profile.name,
    points: profile.points ?? null,
    calibrationVersion: profile.calibrationVersion ?? null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    ownerId,
    syncState: "synced",
    deletedAt: null,
  };
}

/**
 * Decide what to do, without doing it.
 *
 * Only this account's records take part; guest-local records (ownerId null) are
 * never uploaded by sync.
 *
 * @returns {{
 *   adopt: object[],       // records to write locally (taken from the server)
 *   removeLocal: string[], // ids to remove locally
 *   push: object[],        // local records the server should receive
 *   sendDelete: string[],  // ids whose local delete the server must learn
 * }}
 */
export function planSync(localRecords, remoteProfiles, ownerId) {
  const plan = { adopt: [], removeLocal: [], push: [], sendDelete: [] };
  const local = new Map(
    localRecords.filter((r) => r.ownerId === ownerId).map((r) => [r.id, r])
  );
  const remote = new Map(remoteProfiles.map((p) => [p.id, p]));

  for (const id of new Set([...local.keys(), ...remote.keys()])) {
    const l = local.get(id);
    const r = remote.get(id);

    if (!l) {
      // Server only: new to this device, unless it was deleted.
      if (!r.deletedAt) plan.adopt.push(fromRemote(r, ownerId));
      continue;
    }

    if (!r) {
      // Local only: a tombstone for something the server never knew is just
      // dropped; anything else needs uploading.
      if (l.deletedAt) plan.removeLocal.push(id);
      else plan.push.push(l);
      continue;
    }

    // On both sides.
    if (r.deletedAt) {
      plan.removeLocal.push(id); // deleted elsewhere; deletes are final
    } else if (l.deletedAt) {
      plan.sendDelete.push(id); // deleted here; tell the server
    } else if (time(r.updatedAt) > time(l.updatedAt)) {
      plan.adopt.push(fromRemote(r, ownerId));
    } else if (time(l.updatedAt) > time(r.updatedAt)) {
      plan.push.push(l);
    } else if (l.syncState !== "synced") {
      plan.adopt.push(fromRemote(r, ownerId)); // same edit; just mark it synced
    }
  }
  return plan;
}

/**
 * Send one local record to the server and reconcile with the answer.
 * Returns "synced", "removed", or "pending" (still needs a retry).
 * A 401 (signed out) propagates so the caller can re-check the session.
 */
export async function pushRecord({ api, store, ownerId, record }) {
  try {
    if (record.deletedAt) {
      try {
        await api.deleteRemoteProfile(record.id);
      } catch (err) {
        if (err.status !== 404) throw err; // 404: the server never had it
      }
      await store.removeRecord(record.id);
      return "removed";
    }

    const winner = await api.pushProfile(record);

    // The user may have edited again while the request was in flight; if so,
    // keep their newer edit pending instead of overwriting it.
    const current = await store.getRecord(record.id);
    if (!current || current.updatedAt !== record.updatedAt) return "pending";

    if (winner.deletedAt) {
      await store.removeRecord(record.id);
      return "removed";
    }
    await store.putRecord(fromRemote(winner, ownerId));
    return "synced";
  } catch (err) {
    if (err.status === 401) throw err;
    return "pending"; // network or server trouble: retry on the next sync
  }
}

/**
 * Full two-way sync for an account.
 * @returns {Promise<{ pushed: number, failed: number }>}
 * @throws on a failed fetch or a 401; per-record failures are counted instead.
 */
export async function syncProfiles({ api, store, ownerId }) {
  const remote = await api.fetchProfiles();
  const snapshot = await store.getAllRecords();
  const plan = planSync(snapshot, remote, ownerId);
  const seen = new Map(snapshot.map((r) => [r.id, r]));

  for (const record of plan.adopt) {
    // The user may have edited since the snapshot; never overwrite that with
    // older server data. It stays pending and is pushed on the next sync.
    const was = seen.get(record.id);
    const now = await store.getRecord(record.id);
    const changed = was
      ? !now || now.updatedAt !== was.updatedAt || now.syncState !== was.syncState || !!now.deletedAt !== !!was.deletedAt
      : !!now;
    if (changed) continue;
    await store.putRecord(record);
  }
  for (const id of plan.removeLocal) await store.removeRecord(id);

  const toSend = [
    ...plan.push,
    ...plan.sendDelete.map((id) => ({ id, deletedAt: true })),
  ];
  let pushed = 0;
  let failed = 0;
  for (const item of toSend) {
    const record = item.deletedAt === true ? await store.getRecord(item.id) : item;
    if (!record) continue;
    const outcome = await pushRecord({ api, store, ownerId, record });
    if (outcome === "pending") failed += 1;
    else pushed += 1;
  }
  return { pushed, failed };
}

/** Run async tasks one at a time, in order (so overlapping syncs can't interleave). */
export function createSerializer() {
  let chain = Promise.resolve();
  return (task) => {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  };
}
