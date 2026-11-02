import React from "react";
import LegalLayout, { Section } from "./LegalLayout.jsx";

// DRAFT: review (ideally with legal advice) before public launch, and update
// when cloud profile sync (Phase 2) and PDF storage (Phase 3) ship.
export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="November 2026 (draft)">
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

      <Section title="Your sheet music and calibration">
        <p>
          PDFs you open are read by your browser and are not uploaded. Your
          calibration profiles are stored in your browser on your device.
          Clearing your browser data removes them.
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

      <Section title="Sharing">
        <p>
          We do not sell your information or share it with advertisers. Sign-in
          is provided by Google, and the service is hosted on Cloudflare, which
          processes requests on our behalf.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          You can sign out at any time. Account deletion is coming; until then,
          contact us at [CONTACT EMAIL] and we will delete your account.
        </p>
      </Section>

      <Section title="Contact">
        <p>[CONTACT EMAIL]</p>
      </Section>
    </LegalLayout>
  );
}
