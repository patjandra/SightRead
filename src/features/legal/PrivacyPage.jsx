import React from "react";
import LegalLayout, { Section } from "./LegalLayout.jsx";

// Keep in sync with what the app stores.
export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="November 3, 2026">
      <p>
        SightRead is a tool for reading sheet music hands-free. This page
        explains what information it uses and where that information lives.
      </p>

      <Section title="Your camera">
        <p>
          Gaze tracking runs entirely in your browser. Camera video is analyzed
          on your device and is never recorded, uploaded, or sent to our
          servers. The camera is on only while you are calibrating or tracking.
        </p>
      </Section>

      <Section title="Your sheet music">
        <p>
          PDFs you open are read by your browser and are not uploaded or stored
          by us unless you choose to.
        </p>
        <p>
          If you are signed in and choose "Save to account", we store a copy of
          that PDF and its file name in private storage tied to your account, so
          you can open it on your other devices. Only you can access it; we do
          not share it or look through it. Saved PDFs are limited to 25 MB each
          and 500 MB in total, and stay until you delete them.
        </p>
        <p>
          When you open a saved PDF, a copy is also kept in your browser on that
          device so it opens without a connection (up to 100 MB; the least
          recently opened are removed first). The side panel shows how many are
          kept. They are removed when you sign out, delete the PDF, or delete
          your account. If you are offline when you open the app, the
          copies kept for the last signed-in account can still be opened on that
          device.
        </p>
      </Section>

      <Section title="Your calibration profiles">
        <p>
          A calibration profile is a name you choose plus three numbers that
          describe where your gaze lands on the screen. By default, profiles
          are stored only in your browser on your device, and clearing your
          browser data removes them.
        </p>
        <p>
          If you are signed in and save a profile to your account, we store its
          name, those three numbers, and when it was created and last changed,
          so it is available on your other devices. We never store camera
          images.
        </p>
        <p>
          Signing out removes your account's profiles from that browser; they
          remain in your account for your next sign-in. Profiles you created
          without saving them to your account stay on the device.
        </p>
      </Section>

      <Section title="If you sign in">
        <p>
          Signing in is optional. When you sign in with Google, we receive your
          Google account identifier, email address, name, and profile picture
          URL, and store them to recognize your account. We do not receive your
          Google password.
        </p>
        <p>
          We set one cookie to keep you signed in (up to 30 days of inactivity)
          and a short-lived cookie during sign-in to protect it. We use no
          advertising or analytics cookies.
        </p>
      </Section>

      <Section title="Spotify">
        <p>
          The Music section lets you connect your own Spotify account. By
          default the connection lasts only for the current browser tab. If you
          are signed in and tick "Remember me", we store an encrypted Spotify
          refresh token with your account so Spotify is ready the next time you
          sign in. We never store your Spotify password, listening history, or
          playlists, and we can't play anything without your connection. "Disconnect
          Spotify" and deleting your account both remove the stored token. You
          can also revoke access any time from your Spotify account settings.
        </p>
      </Section>

      <Section title="Sharing">
        <p>
          We do not sell your information or share it with advertisers. Sign-in
          is provided by Google, and the service is hosted on Cloudflare, which
          processes requests on our behalf.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          You can delete any saved PDF at any time; the stored file is removed
          immediately.
        </p>
        <p>
          You can delete any saved profile at any time. This removes its name
          and calibration values from your account and, the next time they
          sync, from your other devices. We keep only a blank marker with a
          timestamp so those devices know to remove it.
        </p>
        <p>
          You can sign out at any time. "Delete account" in the side panel
          permanently removes your account, saved PDFs, and synced profiles.
        </p>
      </Section>

      <Section title="Contact">
        <p><a href="mailto:patjandra@gmail.com" className="underline hover:text-white">patjandra@gmail.com</a></p>
      </Section>
    </LegalLayout>
  );
}
