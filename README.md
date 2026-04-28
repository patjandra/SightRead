👁️ SightRead

SightRead is a gaze-based scrolling application that allows musicians to read digital sheet music hands-free. By tracking eye movement through a webcam, SightRead automatically scrolls content in real time—so you can play without interruption.

🚀 Demo (Coming Soon)

Add a demo video or GIF here

🧠 Motivation

Musicians using digital sheet music often face a simple but frustrating problem:

Stop playing to scroll manually
Or rely on tempo-based auto-scroll that doesn’t match their pace

SightRead solves this by adapting to the user’s natural reading speed, using gaze tracking to control scrolling dynamically.

✨ Features
🎼 Core Functionality
Upload and view sheet music PDFs
Continuous vertical scrolling
Hands-free control using eye movement
Smooth, dynamic scroll speed based on gaze position
👁️ Gaze Tracking
Webcam-based tracking using MediaPipe
Simple calibration (top / middle / bottom)
Real-time gaze estimation
Confidence-based tracking with automatic pause
⚙️ Controls
Start / Pause tracking toggle
Sensitivity adjustment
Zoom in/out for sheet music
Multiple local calibration profiles
🔒 Privacy First
No images or video stored
Only calibration data saved locally
No backend or login required
🏗️ Architecture

Webcam → MediaPipe → Face/Eye Landmarks
→ Gaze Estimation
→ Calibration Mapping
→ Scroll Controller
→ PDF Viewer

🛠️ Tech Stack
Frontend (Web MVP)
React (Vite)
Tailwind CSS
PDF.js / react-pdf
MediaPipe (Face Landmarker)
Desktop (Planned)
Electron or Tauri
OS-level scroll simulation (robotjs / nut.js)
📁 Project Structure
src/
  components/
    PDFViewer.jsx
    CalibrationScreen.jsx
    ControlPanel.jsx
    ProfileSelector.jsx
    TrackingWarning.jsx

  gaze/
    mediapipeTracker.js
    gazeEstimator.js
    calibrationManager.js

  scroll/
    scrollController.js

  hooks/
    useGazeTracking.js
    useScrollControl.js
    useLocalProfiles.js
⚙️ How It Works
1. Calibration

Users look at three points (top, center, bottom).
This creates a mapping from raw gaze data → screen position.

2. Gaze Detection

MediaPipe tracks facial and eye landmarks.
A normalized vertical gaze value is computed:

gazeY ∈ [0, 1]
3. Scroll Logic
Top 30% → scroll up
Middle 40% → no scroll
Bottom 30% → scroll down

Scroll speed increases the further the gaze is from the center using a non-linear curve.

🎯 MVP Scope
Web-based application
PDF upload + viewer
Webcam gaze tracking
Smooth scroll based on gaze
Local calibration profiles
No external integrations
🧪 Running Locally
npm install
npm run dev

Open in browser:

http://localhost:5173
🖥️ Desktop Roadmap

Future versions will include:

Desktop app (Electron/Tauri)
Global toggle (on/off)
Scroll any application (PDFs, browsers, etc.)
OS-level scroll injection
⚠️ Limitations
Gaze tracking is approximate (not hardware-grade)
Requires good lighting and webcam positioning
Optimized for vertical scrolling
Desktop-level control not yet implemented
🛣️ Future Work
Improved gaze accuracy and smoothing
Full-screen calibration (2D mapping)
Keyboard shortcuts
Cross-device profile sync
Hardware eye tracker support
General-purpose scrolling beyond musicians
