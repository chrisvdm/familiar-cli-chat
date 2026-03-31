# Portal

This folder contains the local runtime that Familiar calls for tool execution.

Files:
- `server.js`: the local HTTP server that exposes `GET /health` and `POST /tools/execute`
- `runtime.js`: the wrapper that starts or reuses the server, opens the Cloudflare tunnel, and updates Familiar's integration `base_url`

Current routes:
- `GET /health`
- `POST /tools/execute`
- `POST /channels/messages`

## Usage

### Full hosted flow

Run:

```bash
npm run portal
```

What it does:
- starts or reuses the local portal server on `127.0.0.1:${EXECUTOR_PORT:-8788}`
- starts a Cloudflare quick tunnel
- detects the public tunnel URL
- updates Familiar's integration `base_url` when `FAMILIAR_API_TOKEN` is present

Required env for this mode:
- `FAMILIAR_API_TOKEN`
- optionally `FAMILIAR_BASE_URL`
- optionally `CLOUDFLARED_BIN`

### Server only

Run:

```bash
npm run portal:server
```

What it does:
- starts only the local HTTP server
- does not create a tunnel
- does not update Familiar integration config

This is useful for:
- local smoke tests
- manual curl testing
- running the tunnel yourself

### Example health check

```bash
curl http://127.0.0.1:8788/health
```

### Example tool execution request

```bash
curl -X POST http://127.0.0.1:8788/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "echo_back",
    "arguments": {
      "text": "hello"
    }
  }'
```

### Example channel delivery request

```bash
curl -X POST http://127.0.0.1:8788/channels/messages \
  -H "Content-Type: application/json" \
  -d '{
    "channel": {
      "type": "cli",
      "id": "local-dev"
    },
    "thread_id": "thread_abc",
    "content": "Hello from Familiar delivery."
  }'
```

In this repo, channel deliveries are stored in:
- [`.cli-chat/channel-messages.json`](/Users/chris/Dev/cli-chat/.cli-chat/channel-messages.json)

The running CLI chat watches that file for the active local channel and prints new entries as they arrive.

Typical usage:

```bash
npm run portal
```

That runs `runtime.js`, which manages the full hosted Familiar flow.

If you only want the local server:

```bash
npm run portal:server
```

That runs `server.js` without starting a tunnel.

Packaging notes:
- `bin/portal/` is the only portal entrypoint location in the repo
- `runtime.js` is the product-facing CLI surface
- `server.js` is the local integration surface that hosted Familiar calls through the tunnel
- internal portal design notes live under `docs/internal/portal/` and are intentionally gitignored
