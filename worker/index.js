import { Hono } from "hono";
import { ApiError, errorBody } from "./errors.js";
import { csrf } from "./middleware/csrf.js";
import auth from "./routes/auth.js";

// Only /api/* reaches the Worker (see `run_worker_first` in wrangler.jsonc);
// everything else is static assets.
// `googleKeySet` lets tests verify tokens against a local key; in production it
// is undefined and Google's published keys are used.
export function createApp({ googleKeySet } = {}) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (googleKeySet) c.set("googleKeySet", googleKeySet);
    await next();
  });
  app.use("/api/*", csrf);
  app.route("/api/auth", auth);

  app.notFound((c) =>
    c.json(errorBody("not_found", "No such endpoint."), 404)
  );

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(errorBody(err.code, err.message), err.status);
    }
    console.error("[sightread] unhandled error:", err);
    return c.json(errorBody("internal_error", "Something went wrong."), 500);
  });

  return app;
}

export default createApp();
