# Architecture

## System context

```text
Mobile app ───── Firebase Authentication / Firestore / Storage
    │                         ▲
    └── selected authenticated /api calls ── Flask API

Web app ─────── Firebase services and selected Flask API routes
```

Firestore remains the system of record. Direct Firebase access is authorized by rules in `activklass-backend`. The diagram describes source behavior and does not assert service deployment state.

## App layers

- `app/`: Expo Router file-based screens and layouts.
- `src/components/`: shared UI components.
- `src/config/`: Firebase and runtime configuration.
- `src/context/`, `src/hooks/`: auth/theme state and reusable access patterns.
- `src/lib/`: API transport, Firestore access, data mapping, and pure domain logic.
- `assets/`: application artwork and resources.

## Data and identity

Firebase Authentication provides identity. Firestore and Storage are accessed with the Firebase client SDK and protected by backend-owned security rules. Selected server-only capabilities call Flask through `src/lib/api.ts`, which attaches the Firebase ID token. `EXPO_PUBLIC_API_URL` is public runtime configuration, not a secret.

The student and guardian flows use consent/linking data and scoped access. Do not infer legal compliance from the UI alone; authorization must match server and Firestore rules. The app's risk UI includes local domain logic as well as current server-backed flows; consult [INTEGRATION.md](INTEGRATION.md) before changing either path.

## Shared code

Some web domain logic has a TypeScript mobile port. The web repository's `src/lib/portParity.test.js` checks selected parity across sibling checkouts. Change both implementations when a shared contract requires it, and include both repositories in review.

## References

- [Backend architecture](https://github.com/danadepz/activklass-backend/blob/main/ARCHITECTURE.md)
- [Web architecture](https://github.com/danadepz/activklass-web/blob/main/ARCHITECTURE.md)
- [Guardian linking notes](docs/guardian-linking.md)\n