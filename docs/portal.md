# Portal

`portal` is the local tool runtime that ships with this repo.

It exists to make Familiar tools feel like part of one local product instead of a loose collection of API handlers.

## What Portal Does

- exposes a local HTTP surface for tool execution
- receives Familiar tool calls at `POST /tools/execute`
- runs tool-specific logic locally
- returns blocking results back to Familiar

## What Portal Is Not

- it is not Familiar itself
- it is not a local model runtime
- it is not a generalized plugin platform yet

## Why The Name Exists

Inside Familiar docs, the protocol term is `executor`.

That is accurate, but it is too implementation-centered for the product language of this repo. `portal` is the user-facing name for the same local runtime role.

So the distinction is:
- `portal` is the product/runtime name in this repo
- `executor` is the Familiar protocol concept it implements

## Current Behavior

- `npm start -- chat` auto-starts the portal by default
- `npm run portal` runs the portal on its own
- if a portal is already running on `127.0.0.1:$EXECUTOR_PORT`, chat reuses it

## Current Routes

- `GET /health`
- `POST /tools/execute`

## Current Tool Support

- `echo_back`
- `send_discord_message`
- `send_discord_webhook_message`

## Future Direction

If the project grows, the portal is the right place for:
- tool registration
- structured logging
- local secrets handling
- richer delivery integrations

For now, it stays intentionally small and concrete.
