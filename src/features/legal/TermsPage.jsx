import React from "react";
import LegalLayout, { Section } from "./LegalLayout.jsx";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="November 3, 2026">
      <p>
        By using SightRead you agree to these terms. If you do not agree, please
        do not use the service.
      </p>

      <Section title="The service">
        <p>
          SightRead lets you view PDFs and scroll them using your gaze. It is
          provided as is, without warranties of any kind. Gaze tracking is
          approximate and may not work well in every setup, so do not rely on it
          where a missed scroll could cause harm.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          Signing in with Google is optional. You are responsible for activity
          under your account. We may suspend accounts that abuse the service.
        </p>
      </Section>

      <Section title="Your content">
        <p>
          You keep ownership of the content you use with SightRead. You are
          responsible for having the right to use any sheet music you open, and
          you agree not to use the service to infringe anyone's rights. Only save
          files to your account that you have the right to store. Saved files are
          private to your account, and we may remove files that break these
          terms.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the extent permitted by law, we are not liable for indirect or
          consequential losses arising from your use of the service.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We may update these terms; continued use means you accept the changes.
          Questions: <a href="mailto:patjandra@gmail.com" className="underline hover:text-white">patjandra@gmail.com</a>
        </p>
      </Section>
    </LegalLayout>
  );
}
