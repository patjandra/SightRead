import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ReaderPage from "./features/reader/ReaderPage.jsx";
import SignInPage from "./features/auth/SignInPage.jsx";
import PrivacyPage from "./features/legal/PrivacyPage.jsx";
import TermsPage from "./features/legal/TermsPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ReaderPage />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
