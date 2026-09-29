# ActivKlass Mobile

<div align="center">
  <img src="assets/images/logo.png" alt="ActivKlass Logo" width="120" />
  <h3>Bridging Classrooms & Homes</h3>
  <p>Adaptive AI Remediation & Guardian Monitoring Mobile Portal</p>

  [![React Native](https://img.shields.io/badge/React_Native-0.86-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
  [![Expo SDK](https://img.shields.io/badge/Expo-SDK_57-000020?logo=expo&logoColor=white)](https://expo.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Tailwind CSS](https://img.shields.io/badge/NativeWind-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://www.nativewind.dev/)
  [![Firebase](https://img.shields.io/badge/Firebase-Auth_%26_Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
  [![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()
</div>

---

## 📖 Overview

**ActivKlass Mobile** is the cross-platform mobile application companion to the ActivKlass Learning Platform. Built with **React Native** and **Expo SDK 57**, it provides students with personalized, AI-driven study tools and remediation modules, while empowering parents and guardians to stay securely informed about academic standing and attendance in real time.

The application is engineered strictly around the **Philippine Republic Act No. 10173 (Data Privacy Act of 2012)**, enforcing privacy-by-design consent gates for adult students and automatic legal representation for minor learners.

---

## ✨ Key Features

### 🎓 Student Experience
- **Unified Single-Tab Authentication**: Intelligent credential detection accepts either school-issued Student Login IDs (e.g., `snhs-123456`) or Guardian email addresses without manual role switching.
- **Academic Dashboard**: Real-time course grade overview, overall academic standing forecast, and attendance metrics.
- **Adaptive AI Remediation**: Custom AI study guides and concept reinforcement modules triggered by identified weak topics.
- **Interactive Quiz Player**: Objective and short-answer assessments with instant submission and detailed AI explanations for missed concepts.
- **Privacy & Consent Manager**: Full control over linked guardians—approve incoming parent requests, toggle granular permissions (grades, attendance, quiz scores, AI insights), or revoke access at any time.
- **Notifications Hub**: Timely updates on grade postings, attendance records, and review assignments.

### 👨‍👩‍👧 Parent & Guardian Experience
- **Multi-Child Monitoring**: Link one or multiple students using secure 6-character invitation codes generated from the student portal.
- **Quick Child Switcher**: Effortlessly toggle between linked students directly from the dashboard header with active status tags.
- **Class Deep-Dives**: View comprehensive course details, attendance logs, and teacher announcements.
- **Expandable Learning Insights**: Accordion cards featuring teacher guidance, focus areas, study notes, and direct links to curated study materials.

### 🛡️ Privacy & Compliance (RA 10173)
- **Minors (< 18 years)**: Automatically linked under parental authority upon redeeming a valid invitation code.
- **Adult Students (≥ 18 years)**: Links remain in a strict `pending` state until the student explicitly grants consent from their mobile portal.
- **Granular Visibility**: Students can toggle on/off visibility per section (Grades, Attendance, Insights, Quizzes) independently for each guardian.

---

## 🛠️ Tech Stack & Architecture

- **Core Framework**: React Native `0.86.2` with Expo SDK `57.0.15`
- **Routing**: Expo Router `~57.0.15` (File-based, typed routing)
- **Styling**: NativeWind `^4.2.6` (Tailwind CSS `3.4`) with dynamic Dark / Light theme tokens
- **Icons**: `@expo/vector-icons` (Monochrome glyphs matching active palette)
- **Database & Sync**: Firebase Cloud Firestore (Direct realtime snapshot listeners)
- **Authentication**: Firebase Auth with custom school domain email resolution
- **Testing**:
  - `Vitest` for business logic, permissions, and validation rules (150+ unit tests)
  - `Jest` + `@testing-library/react-native` for screen rendering and mounting smoke tests

---

## 📁 Project Structure

```text
activklass-mobile/
├── app/                          # Expo Router navigation routes
│   ├── index.tsx                 # Starter / Landing screen
│   ├── login.tsx                 # Unified authentication screen
│   ├── student/                  # Student portal screens
│   │   ├── _layout.tsx           # Student bottom tab navigator
│   │   ├── dashboard.tsx         # Student home & metrics
│   │   ├── classes.tsx           # Enrolled classes list
│   │   ├── remediation.tsx       # AI study guides list
│   │   ├── profile.tsx           # Student profile & ParentalAccessPanel
│   │   ├── quiz-player.tsx       # Quiz execution screen
│   │   ├── quiz-feedback.tsx     # Quiz results & AI explanations
│   │   └── notifications.tsx     # Student notification center
│   └── parent/                   # Parent portal screens
│       ├── _layout.tsx           # Guardian stack navigator
│       ├── register.tsx          # Step 1: Child invitation code verification
│       ├── details.tsx           # Step 2: Parent account details
│       ├── confirm.tsx           # Step 3: Registration confirmation
│       ├── dashboard.tsx         # Multi-child monitoring dashboard
│       ├── profile.tsx           # Parent account settings
│       └── class/[classId].tsx   # Class grades, attendance & AI insights
├── assets/                       # Static images, branding logos, icons
├── src/
│   ├── components/               # Reusable UI widgets & modals
│   ├── config/                   # Firebase initialization & clients
│   ├── context/                  # AuthContext & ThemeContext
│   ├── hooks/                    # Custom hooks (useRequireAuth, etc.)
│   ├── lib/                      # Pure business logic, helpers, and data mappers
│   │   ├── guardianCodes.ts      # Code generation, validation & linking
│   │   ├── logins.ts             # Credential normalization & mapping
│   │   ├── quizGrading.ts        # Quiz submission calculations
│   │   ├── risk.ts               # Student academic standing algorithms
│   │   └── studentData.ts        # Student metrics loaders
│   ├── test/                     # Vitest and Jest test suites
│   └── theme/                    # Dynamic color palette definitions
├── app.json                      # Expo application manifest
├── eas.json                      # EAS Build & Update profiles
└── package.json                  # Scripts & dependencies
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have installed:
1. **Node.js** (LTS version 20.x or 22.x recommended) — [Download Node.js](https://nodejs.org/)
2. **Git** — [Download Git](https://git-scm.com/)
3. **Android Studio** (for Android Virtual Device emulator) or the **Expo Go** app on your physical iOS/Android phone.

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/danadepz/activklass-mobile.git
cd activklass-mobile
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id

# Backend API Endpoint (Vercel / Cloud URL)
EXPO_PUBLIC_API_URL=https://your-backend-api.vercel.app/api
```

### 3. Launch Development Server

```bash
npx expo start
```

In the interactive terminal:
- Press **`a`** to launch on a running Android Studio emulator or connected Android device.
- Press **`i`** to launch on an iOS simulator (macOS required).
- Scan the printed **QR Code** using **Expo Go** (Android) or the native Camera app (iOS) to test on a physical phone.

---

## 🧪 Testing & Code Quality

The codebase enforces strict test coverage and type-safety across all routes:

```bash
# Run all unit logic tests (Vitest)
npm run test:logic

# Run all screen mounting & interaction tests (Jest)
npm run test:screens

# Run both test suites sequentially
npm test

# Run TypeScript typecheck
npx tsc --noEmit

# Run Expo ESLint
npm run lint
```

---

## 📦 Deployment & Distribution

### Building Standalone Android APK (for Testers)

To generate an installable Android `.apk` file that testers can download directly without Google Play:

1. **Install EAS CLI and authenticate:**
   ```bash
   npm install -g eas-cli
   eas login
   ```

2. **Trigger an APK cloud build:**
   ```bash
   eas build -p android --profile preview
   ```

3. When the build completes, EAS outputs a public download link and QR code for testers.

### Over-The-Air (OTA) Updates

Publish instant JavaScript updates to testers' devices without reinstalling:

```bash
eas update --branch preview --message "Update description"
```

---

## 📄 License

This repository is developed as part of the ActivKlass Capstone Project. All rights reserved.
