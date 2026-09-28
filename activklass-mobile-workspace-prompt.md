You are working in `activklass-mobile`, the Expo / React Native client of ActivKlass. Read your own CLAUDE.md and AGENTS.md first. This note is from the web workspace (2026-09-12) and tells you which modules the mobile app is responsible for, what already exists, what is missing or unverified, and what is coming. Treat it as the module checklist for the defense demo. Do not build beyond it.

## Who the mobile app serves

Mobile is the **student** and **parent (guardian)** client only. Teachers, admins and the superadmin use the web portal. Guardians are **mobile-only by owner decision**: the web has no parent portal and `/parent` on the web just points at the app. Every parent module below therefore lives only here.

## Shared rules you must keep (they are enforced by `firestore.rules` in `activklass-backend`)

- Firestore is the system of record. Read it directly. Flask (`src/lib/api.ts`) is only for what needs the Admin SDK or a model: risk prediction, AI generation, account provisioning.
- A student may read **only** `gradebooks/{classId}/entries/{studentId}` for grades. It is derived by the teacher's client; never compute or write grades on mobile.
- Quiz attempts are created at **Start** (`status: 'in_progress'`) and updated on submit with `submitted_at`, `total_score`, `per_question[]`, `attempt_number`. Count attempts with `finishedAttempts()`. The score field is **`total_score`**, never `score` (mobile once wrote `score` and every teacher view silently dropped those attempts).
- `src/lib/quizPool.ts`, `src/lib/quizFeedback.ts` and `src/lib/quizAttempts.ts` are TypeScript ports of the web's `src/lib/quizPool.js`, `quizFeedback.js`, `quizAttempts.js`. The web's `portParity.test.js` imports both sides and fails if they drift. Edit one, edit the other. Never fix a parity failure by editing the test.
- `in` queries chunk at **10** ids, not 30. The rules engine judges `documentId() in` per document and refuses the whole query past 18.
- Syllabi live in two places: `syllabi/{syllabus_id}` (from the teacher's syllabus page) and `classes/{classId}/syllabus/current` (seed). Since 2026-09-12 the web's `loadSyllabus` reads `syllabus_id` first and falls back to the per-class document. Mobile's `studentData.ts` must resolve the same way or a remediation's topic will not find its module.
- Messages a student or parent reads never name vendors or exceptions. No "Firebase", no "Failed to fetch", no raw error text.
- Never add a dependency or paid service without owner approval. Blaze (Storage) is the only approved spend; Cloud Functions and FCM are not approved.

## Student modules (from the System Implementation Progress Report)

Status is what the web workspace could see in your repo today. **Verify each "exists" in the app before trusting it.**

| Module | Mobile status | Notes |
|---|---|---|
| Login / Logout | exists (`app/login.tsx`) | Students sign in with an issued login like `srnhs-200012`, not an email. Password for every seeded demo account is in the backend's `seed_demo.py`. |
| Update Password | **verify** | Web forces anyone with `is_temp_password` to change it before any other screen. Parent has `parent/change-pass.tsx`; confirm the student path exists and is gated the same way. |
| Update Profile | exists (`student/profile.tsx`) | Profile derives "of legal age" from `birthdate`; a student never writes `birthdate`. RA 10173 consent lives in `consent_records/{uid}`. |
| View Classes / View Class Details | exists (`student/classes.tsx`, `student/class/[classId].tsx`) | Class screen has announcements, syllabus, attendance, quizzes, grades tabs. |
| View Assigned Quizzes | exists | Read `quizzes` where `class_ids` contains the class. |
| Answer Quiz | exists (`student/quiz-player.tsx`) | Start creates the attempt; timer, backtracking and shuffle flags come from the quiz document. Verified end to end on web 2026-09-12. |
| View Activity & Quiz Results | exists (`student/quiz-feedback.tsx`) | Respect the quiz's `release_results` and "students see" settings. |
| View Grades | exists (grades tab) | From `entries` only. Pass mark and point-scale direction come from the entry's `passing_percent` / `point_scale_direction` (T-45, 2026-09-11). Do not hard-code 75. |
| Contest Scores / Contest Attendance Mark | exists (class screen) | Writes `grade_contests` / `attendance_contests`. Student-facing form validation has **not** had a pass yet on either client. |
| View Attendance | exists (attendance tab) | |
| View Posted Announcements | exists (announcements tab) | |
| View Notifications | exists (`student/notifications.tsx`) | **In-app only.** No push. FCM was deliberately deferred; do not add it. |
| Review Assigned Remediation | exists (`student/remediation.tsx`) | Reads `remediations` where `student_id == me`. |
| Review Materials | **missing or unverified** | On web this is the section of a review guide that lists the sub-module's learning materials (file, link, note) and, since 2026-09-12, a **"Where this fits in your modules"** card (Module n › Sub-module n) with a **Read more in Modules** link. Mobile's remediation screen shows none of those strings. Port it. |
| Take Test Mastery | **missing or unverified** | On web this is the section of a review guide that offers the linked practice quiz and shows mastery as the best scored attempt ("Developing · 76%", buckets Needs / Developing / Mastered at 60 and 80). Mastery is **derived on read, never stored**. The logic is `scaffolding.js` on web; port it beside the other parity modules. |
| View Subject Analytics | **missing** | Web has an Analytics tab per class: current grade, own average vs class, attendance, per-item trend, component breakdown. Mobile's class screen has no analytics tab. |
| Predict Class Standing | exists on dashboard (`student/dashboard.tsx`) | Calls Flask `/api/predict`. Word it for a student: name what is slipping and by how much, never a flat "at risk". Note: on web this panel is currently only rendered in the "no analytics yet" state, which is a bug being reported; on mobile make sure it renders for a student **with** grades too. |
| Generate Invite Code (guardian code) | exists | `guardian_codes/{code}`: single-use, rotated. |
| Configure Parent Access Permissions | exists | Visibility scopes on the `guardian_links` document. Rules can only allow or deny a whole document, so scopes are enforced by what the parent client chooses to read, not by the rules. |
| View Linked Parent / Revoke Parent Access Link | exists | |

## Parent modules (mobile-only)

| Module | Mobile status | Notes |
|---|---|---|
| Create Account via Invite Code | exists (`parent/register.tsx`) | Step 1 checks the child's guardian code for real before the account is created. Parents keep real emails; the school never issues or disables theirs. |
| Add Child / Switch Child | exists (`parent/dashboard.tsx`) | The progress report still marks both as partial. Walk them in the app and tell the owner if they hold. |
| View child's grades, attendance, remediation | exists (`parent/class/[classId].tsx`, `parentRecords.ts`) | Read only what the link's scopes allow. |
| Change password | exists (`parent/change-pass.tsx`) | |
| Notifications for parents | **not built** | Not planned for the defense. |

## Decisions that affect you (do not re-open)

- **No Bloom's-level tagging or per-level mastery.** Decided 2026-09-12. Mastery is per syllabus topic. Nothing on mobile should ask a student or show a cognitive level.
- **Guardians are mobile-only.** Decided. Do not propose a web parent portal.
- **Trial expiry and seat limits are recorded, not enforced.** Nothing on mobile gates on them.
- **Teachers see only their own students.** Enforced server-side via `users.teacher_ids`. Mobile never writes `teacher_ids`, `student_ids`, or `role`.

## Future work, in the order it is likely to be asked for

1. Port **Review Materials** and **Take Test Mastery** into `student/remediation.tsx`, including the "Where this fits in your modules" card and the `syllabus_id`-first syllabus resolution.
2. Add a **Subject Analytics** tab to the class screen, reading `entries` and the student's own attempts.
3. Make sure **Predict Class Standing** renders for graded students, and reads the class's pass mark from the entry.
4. **Student-facing validation pass** (contest evidence, profile) sharing the rules in the web's `src/lib/validation.js`; there is no TypeScript port yet, so agree with the web workspace before creating one.
5. **Forced temporary-password change** for students on mobile, matching the web gate.
6. A **full browser-equivalent walkthrough** of every row above on a device or emulator, as the demo student (Carlo, `srnhs-200012`, at-risk with an Atomic Structure review guide) and as a demo parent, before the defense. Record what you verified and how in your own docs, the same way the web's `docs/ROADMAP.md` does.

## What not to do

- Do not build a teacher screen, an admin screen, or anything not in the tables above.
- Do not add push notifications, a second Firebase project, or any paid API tier.
- Do not compute grades, write `teacher_ids`, or write `score` instead of `total_score`.
- Do not edit the web repo or its parity test from this workspace. If a shared module needs to change, say so and change both sides in step.
