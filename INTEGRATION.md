# Integration contracts

## Identity and transport

- Firebase Authentication provides user identity.
- Direct Firestore/Storage calls use the Firebase client SDK and backend-owned `firestore.rules` / `storage.rules`.
- Flask calls go through `src/lib/api.ts`, use `EXPO_PUBLIC_API_URL`, and attach `Authorization: Bearer <Firebase ID token>`.
- Exact methods, schemas, role checks, errors, and response shapes are defined by the current route implementation and client call sites. Do not treat comments or historical docs as proof of a live call.

## Current integration areas

Current source has server callers for initial password changes, quiz attempt unlock/review/explanation, risk prediction, and parent-facing API operations in `src/lib/parent.ts`. Other guardian linking, learner records, and parent data workflows also use Firestore directly in their respective data modules. Some older server-backed parent operations may be unused; check reachability before removing routes.

| Concern | Main client owner | Server/rules owner |
|---|---|---|
| Sign-in and session | `src/config/`, auth context | Firebase Authentication |
| Guardian linking and consent | `src/lib/guardianCodes.ts` and related screens | Firestore rules and corresponding backend authorization paths |
| Learner records and guardian views | `src/lib/` data modules | Firestore schema/rules; selected Flask endpoints where actively called |
| Quiz attempts and explanations | `src/lib/api.ts`, `src/lib/attemptSession.ts`, student screens | Backend quiz/attempt blueprints |
| Risk prediction | `src/lib/risk.ts` | Backend `/api/predict` contract |
| Initial password update | student/parent change-password screens | Backend auth endpoint |

## Change checklist

1. Search all callers in `app/` and `src/`, distinguishing executable code from comments/tests.
2. Update API payload/result types, auth handling, Firestore rules, and server behavior together.
3. Add/update tests for token handling, role boundaries, and failure states.
4. Keep shared web/mobile algorithm ports aligned and run the parity test where available.
5. Document known limits. Risk model training evidence and research performance are separate from transport correctness.

See [backend integration](https://github.com/danadepz/activklass-backend/blob/main/INTEGRATION.md) and [web integration](https://github.com/danadepz/activklass-web/blob/main/INTEGRATION.md).
