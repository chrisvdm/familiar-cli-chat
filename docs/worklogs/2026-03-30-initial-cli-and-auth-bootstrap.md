# Worklog: Initial CLI and Auth Bootstrap

Date:
- 2026-03-30

Scope:
- Build the first local Node.js CLI for Familiar.
- Make first-run authentication self-bootstrapping.
- Record debugging findings that affected implementation choices.

## What Was Built

- A Node 22 CLI entrypoint at [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js).
- Commands for:
  - `chat`
  - `send`
  - `init-account`
  - `sync-tools`
  - `thread new`
  - `thread set`
  - `thread clear`
  - `whoami`
- Repo-local session persistence in [`.cli-chat/session.json`](/Users/chris/Dev/cli-chat/.cli-chat/session.json).
- Token persistence in [`.env`](/Users/chris/Dev/cli-chat/.env).
- Example tool configuration in [tools.example.json](/Users/chris/Dev/cli-chat/tools.example.json).

## External Contract Used

Primary Familiar endpoints used or validated:
- `POST /api/v1/accounts`
- `GET /api/v1/account`
- `POST /api/v1/input`
- `POST /api/v1/tools/sync`
- `POST /api/v1/threads`

Observed behavior from docs and live calls:
- Familiar accepts normalized text input.
- Chat replies may arrive in a structured response envelope containing `response.content`.
- Account creation returns a token value directly.

## Problems Hit

### 1. Network access was blocked in the sandbox

Symptom:
- Initial `curl` and `fetch` calls failed before any useful API interaction.

Resolution:
- Re-ran network-dependent commands with escalated permissions.

Takeaway:
- Treat Familiar integration verification as network-dependent from the start.

### 2. The workspace started empty

Symptom:
- No repo, no source tree, no package manifest.

Resolution:
- Treated the task as greenfield and created the minimal project structure from scratch.

Takeaway:
- For follow-up work, assume the current structure is intentional and small, not incomplete.

### 3. `npm start -- chat` failed with `Missing FAMILIAR_API_TOKEN.`

Symptom:
- The CLI worked only when the token was exported manually in the shell.
- A local [`.env`](/Users/chris/Dev/cli-chat/.env) existed, but the process did not read it.

Root cause:
- The first implementation only read `process.env`.

Resolution:
- Added startup loading for `.env` and `dev.vars`.

Takeaway:
- For local CLIs, file-based env loading is part of basic usability, not an optional enhancement.

### 4. Interactive chat printed the entire Familiar JSON envelope

Symptom:
- Sending a simple message such as `hello` printed metadata-heavy JSON instead of the assistant reply text.

Root cause:
- The formatter only tried generic assistant text extraction and fell back to raw JSON too often.

Resolution:
- Prefer `payload.response.content` when present.

Takeaway:
- Default chat UX should optimize for readable assistant content, not debug payloads.

### 5. First-run auth still required a manual setup step

Symptom:
- The user had to run `init-account` or export a token before `chat` became usable.

Root cause:
- Token checks were strict, but there was no first-run recovery path.

Resolution:
- `chat` now creates a Familiar account automatically when no token is configured and persists the returned token to `.env`.

Takeaway:
- If the common command is `chat`, it needs to own onboarding as well.

## Verification Performed

- Syntax check:
  - `node --check ./bin/cli-chat.js`
- Normal authenticated startup:
  - `printf '/exit\n' | npm start -- chat`
- Explicit account verification:
  - `node ./bin/cli-chat.js whoami`
- First-run bootstrap in a clean temp copy with no token file:
  - `printf '/exit\n' | npm start -- chat`
  - Confirmed it created an account and wrote a new `.env`

## Current Risks and Gaps

- The env loader is intentionally simple and may not handle all edge cases from more complex dotenv files.
- There is no dedicated verbose/debug mode for printing raw Familiar envelopes.
- Multi-account or profile management does not exist yet.
- The CLI does not yet include a local executor stub or end-to-end tool execution workflow.

## Recommendations For Future Changes

- If output formatting changes, keep a plain-text default and add debug output behind a flag.
- If auth grows more complex, move token/profile logic into a dedicated config module.
- If tool execution is added, document the executor protocol separately rather than expanding this worklog indefinitely.
