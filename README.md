# cli-chat

Local Node.js CLI chat client for the Familiar hosted API.

## Requirements

- Node.js 22+

## Setup

```bash
npm install
```

Optional environment variables:

```bash
export FAMILIAR_API_TOKEN="your-token"
export FAMILIAR_BASE_URL="https://familiar.chrsvdmrw.workers.dev"
export FAMILIAR_CHANNEL_TYPE="cli"
export FAMILIAR_CHANNEL_ID="my-local-machine"
export FAMILIAR_THREAD_ID="thread_abc"
export FAMILIAR_TOOLS_FILE="./tools.example.json"
```

If you do not have a token yet, create an account through the API:

```bash
node ./bin/cli-chat.js init-account
```

`chat` mode can also bootstrap itself. If no `FAMILIAR_API_TOKEN` is present in the environment, `.env`, or `dev.vars`, the CLI creates a Familiar account automatically, writes the returned token to `.env`, and continues into chat.

## Commands

Start an interactive chat:

```bash
npm start -- chat
```

Send a single message:

```bash
node ./bin/cli-chat.js send "Hello"
```

Sync tools from a JSON file:

```bash
node ./bin/cli-chat.js sync-tools ./tools.example.json
```

Manage thread state:

```bash
node ./bin/cli-chat.js thread new "Scratchpad"
node ./bin/cli-chat.js thread set thread_abc
node ./bin/cli-chat.js thread clear
```

Inspect the current account:

```bash
node ./bin/cli-chat.js whoami
```

## Interactive Commands

Inside `chat` mode:

- `/new [name]` creates and activates a new thread
- `/thread` prints the current thread id
- `/clear` clears the active thread
- `/whoami` fetches the current account payload
- `/exit` quits

The CLI persists local session state in `.cli-chat/session.json`.

## Notes

- Familiar accepts normalized text input at `POST /api/v1/input`.
- Tool configuration uses `POST /api/v1/tools/sync`.
- This CLI only handles the local chat interface. If your tools need execution, that still happens through your Familiar executor integration.
