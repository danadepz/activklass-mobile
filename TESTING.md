# Testing

Commands are defined by `package.json` and `vitest.config.mts` / `jest.config.js`.

```sh
npm run test:logic
npm run test:screens
npm test
npx tsc --noEmit
npm run lint
```

- `test:logic` runs Vitest logic/unit tests.
- `test:screens` runs Jest with `--runInBand` for screen tests.
- `npm test` runs both suites sequentially.
- TypeScript checking and Expo lint are separate commands; they are not implicitly included in `npm test`.

Install with `npm ci`. Screen tests may require the configured Jest mocks in `jest.setup.js`. Use Firebase emulators or fakes for data/auth behavior; do not point tests at production. Report exact commands and results in pull requests; a test file count is not evidence of execution or success.

For API integration changes, test both the mobile request behavior and backend route/auth behavior. For guardian privacy, validate allowed and denied access paths. For mirrored web/mobile logic, coordinate the web parity test.
