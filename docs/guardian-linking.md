# Guardian linking

How a parent connects to a student, and where each decision is actually made.

## The flow

```
app/index.tsx           "I am a Parent — Connect Child"
  └─ parent/register    Step 1 — the child's 6-character code
     │                  Checked against Firestore BEFORE sign-up.
     │                  Shows the matched student's name to confirm.
     └─ parent/details  Step 2 — the guardian's own name, email, password
        │               Creates the Auth account, the users profile, the link.
        └─ parent/confirm    Linked, or waiting for the student to approve
           └─ parent/dashboard
```

A guardian who already has an account never repeats this. A second, third or
fourth child is added from the dashboard — the **+ Add Child** button in the
header, the dashed card at the bottom of the list, or the button inside the
switch-child sheet. All three open the same code box and run the same two
checks as sign-up.

## Why the code lives in Firestore

The code used to be minted by Flask and kept in Postgres. That made the check
in step 1 impossible: `/api/guardian-links/redeem` is gated on the parent role,
and a guardian has no account yet when they type the code. So step 1 could only
check the *shape* of the code — six characters, no `O`/`0`/`I`/`1` — and a
wrong code was not caught until after an account had already been created.

`guardian_codes/{CODE}` fixes that. The document id **is** the code, for two
reasons:

1. Security rules can `get()` a known path but can never run a query. A rule
   can rebuild this path; it could not resolve a `where` clause.
2. Uniqueness comes free. Firestore `create` only applies when the document is
   absent, so two students can never hold the same code — and a collision
   surfaces as a denied write, which `mintCode` retries.

`get` is open to everyone, including a device with no account. The code is the
secret — the same secret the student reads aloud to their parent — and `list`
stays denied, so codes can be presented but never enumerated.

## Who decides what

Nothing that governs access is trusted from the client, even though the client
writes the link document.

| Decision | Where it is made |
|---|---|
| Does this code exist, and whose is it? | `guardian_codes/{CODE}`, read by rule |
| Does the link start approved or pending? | `firestore.rules` — re-derived from the code's `is_minor` |
| What can a new guardian see? | `firestore.rules` — all-on for a minor, all-off otherwise |
| Approve, narrow, revoke | The student, gated on `is_minor == false` |

Under RA 10173 a student under 18 is represented by their guardian, so that
guardian unlocks the moment the code is redeemed and the student cannot change
it. At 18 and over the student is the data subject: the link stays `pending`
and shows nothing until they approve it from their profile.

`is_minor` is derived on the student's device from their own `birthdate`. That
is exactly as trustworthy as the Flask path it replaced — `student_birthdate`
in `services/guardian_access.py` reads the same student-editable field — and
the blast radius is bounded: a student who lies about it only changes whether
their **own** guardian needs their approval.

## What still goes through Flask

Per-class grades, attendance and quiz scores. This is not a leftover. An
attendance document holds the records map for the whole class, and a Firestore
rule can only allow or deny an entire document, so the backend is the only
place the data can be narrowed to one child. See `src/lib/api.ts`.

The two halves fail independently. With no server running, the children list,
approval state and the whole add-a-child flow still work; only the academic
detail is replaced with a notice.

### Known gap

Flask resolves guardian links from its own Postgres `parent_student_links`
table. Links created in the app exist only in Firestore, so those endpoints do
not yet recognise them and return `not_linked` — the dashboard degrades and the
class screen says so in plain words, but the detail is genuinely unavailable
until the backend reads links from Firestore too (or mirrors app-created links
back into Postgres). That is the next piece of work on this feature.

## Files

| File | Holds |
|---|---|
| `src/lib/guardianCodes.ts` | Every Firestore read and write for codes and links |
| `src/lib/parent.ts` | The Flask portal reads, and the shared types |
| `app/parent/register.tsx` | Step 1, the code box |
| `app/parent/details.tsx` | Step 2, sign-up and link creation |
| `app/parent/dashboard.tsx` | Children list, and the add-a-child code box |
| `src/components/ParentalAccessPanel.tsx` | The student's code, toggles and revoke |
| `activklass-backend/firestore.rules` | What actually enforces all of the above |
