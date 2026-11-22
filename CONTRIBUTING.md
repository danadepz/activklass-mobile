# Contributing

## GitHub workflow

- Create a short, descriptive branch from current `main` and open a focused pull request against `main`.
- State user impact, affected web/backend contracts, risks, and verification commands/results.
- Preserve all existing/uncommitted work. Stage explicit file paths and inspect the index and working tree before commit. Do not force-push or rewrite shared history.
- Never commit `.env`, private signing keys, service-account JSON, credentials, local databases, user data, or generated release artifacts unless a maintainer has explicitly designed a tracked artifact workflow.
- Do not merge, publish an APK, or deploy without owner approval.

## Engineering standards

Read `AGENTS.md`, `CLAUDE.md`, and relevant app/docs before editing. Use source, config, and tests as the truth; distinguish configured intent from deployed status, implemented functionality from plans, and software tests from research outcomes.

Coordinate API/schema/rules/shared-logic changes with the web and backend repositories. Keep guardian authorization least-privilege and test revocation/denial paths. Do not claim legal compliance based solely on app behavior. Avoid adding dependencies, paid services, or live provider operations without authorization.

Run affected checks from [TESTING.md](TESTING.md), run `git diff --check`, and disclose checks not run. Include device/browser verification for user-visible flows when practical.
