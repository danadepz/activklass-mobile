# ActivKlass mobile — documentation precedence

**Current correction:** Current mobile source includes selected Flask API calls, and its APK distribution evidence does not imply iOS distribution. Treat contradictory dated notes in CLAUDE.md and older shared docs as stale; confirm behavior in current code/configuration before changes.
# AGENTS.md — ActivKlass (mobile)

**Read `CLAUDE.md` in this folder first.** It is the real instruction file for this repo —
the lanes, what each pane may edit, the git rules, the project's shape — and it is the one
that gets kept up to date. This file exists only because Codex does not read `CLAUDE.md`
on its own. It is a pointer plus the desk rules that are written down nowhere else; it is
not a replacement, and it is not a summary to work from.

**The lane table lives at `C:/CAPSTONE/activklass-web/OWNERSHIP.md`** — read it before
your first edit, and treat anything it marks Shared as needing a heads-up first.

## Expo — keep this in mind

**Expo HAS CHANGED.**

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## You are working a ticket desk, not just a repo

Tester tickets from Discord are mirrored into `C:/CAPSTONE/_tools/discord/tickets/`
and triaged into issues with ids like `T-247`. The desk's own instructions live in
**`C:/CAPSTONE/_tools/discord/desk/`** as plain markdown — read the file, do not
improvise from this summary:

| File | What |
|---|---|
| `desk/tickets.md` | triage tickets into issues + dispatch cards |
| `desk/debug.md` | fix ONE issue from its card |
| `desk/roadmap.md` | group issues into convoys |
| `desk/handoff.md` | write a verification brief, record verdicts |
| `desk/update.md` | the "update" command: commit, push, republish the APK |

Read `C:/CAPSTONE/_tools/discord/DESK-HANDOVER.md` once at the start of a session.

You also have these as skills: `/tickets`, `/debug`, `/roadmap`, `/handoff`. They are
the same documents, invokable.

## The five rules that override anything you would otherwise do

**1. End every commit body with the trailer.** `Fixes T-NN (<ticket-name>)` for a bug,
`Builds T-NN (<ticket-name>)` for a suggestion. **This is the only thing that makes your
work visible to the board.** A fix with no trailer is invisible: the owner sees the issue
as still broken, a later pass re-dispatches it, and the tester is never told. This has
happened repeatedly — T-225 and T-229 landed untrailered and had to be found by hand, and
T-247's fix sat uncommitted in the working tree while the ticket read unfixed. If you are
unsure of the id, stop and ask rather than committing without it.

**2. A commit is a CLAIM, not a fix.** Set the issue's ledger state to
`awaiting verification`, never to `verified`, and never close a ticket. Then run:

```
python C:/CAPSTONE/_tools/discord/verify_fix.py T-NN
```

It reverts your source changes, keeps your tests, and reruns the suite. **If the suite
stays GREEN your test does not bite and the fix is UNPROVEN**, however correct it looks.
Five of eight fixes failed exactly this check on 2026-09-28, which is why the script
exists. Say in the commit body how you broke it and what the failure message was.

**3. Never `git add -A`, `git add .`, or `git commit -a`.** Several agents work these
checkouts at once and those sweep up other panes' in-flight edits. Stage explicit paths.
`C:/CAPSTONE/_tools/discord/.env` holds a live Discord bot token — when the owner says
"update", run `python C:/CAPSTONE/_tools/discord/update.py` (dry run), show the output,
then `--yes`. Never hand-roll those git commands; the script refuses to stage anything
that looks like a secret and a `git add -A` you type yourself does not.

**4. Never edit the watcher's files:** `tickets/_index.md`, `tickets/_state.json`,
`tickets/open/`, `tickets/closed/`. A scheduled task owns them and will fight you.
`tickets/_ledger.md` and `tickets/_dispatch/` are yours to write.

**5. Only one agent is the ticket pane at a time.** Issue ids are handed out by reading
the ledger for the next free number, so two agents triaging at once will both pick the
same `T-NN`. That already happened (two panes both took T-224). If the owner has another
agent triaging, do fixes and leave the ledger alone.

## Convoys
If a convoy prompt opens with `DO NOT START THIS CONVOY WHILE Cnn IS RUNNING`, that is
real — stop and tell the owner. A `Scope note` is **not** a block: you may run beside that
convoy, just stay off the files it names. If you plan a roadmap yourself rather than
running `plan_roadmap.py`, follow `desk/roadmap.md` step 4b before claiming any two
convoys can run in parallel.

## Replies to testers
Pairs only — no greeting, no names, one `Issue:` / `✅ Fixed:` pair per thing they raised.
`✅ Fixed:` always starts with **Now**. Never name Firebase, Flask, Vite, an exception or
a file path in text a tester reads. Full rules in `desk/debug.md` step 7.

## Current architecture and documentation

Use `README.md`, `ARCHITECTURE.md`, `INTEGRATION.md`, `TESTING.md`, and `DEPLOYMENT.md` for current repository guidance. Mobile source currently makes selected Flask calls (including risk prediction, initial password changes, and quiz flows); older `CLAUDE.md` statements that the app makes no server calls are stale. Re-derive callers from executable source before changing backend routes. The APK release channel is evidenced; iOS configuration alone is not release evidence.

Across all repos, preserve existing work, keep docs grounded in source/config/tests, and distinguish deployment configuration from verified live state and implementation from research claims.\n