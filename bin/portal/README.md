# Portal

This folder contains the local runtime that Familiar calls for tool execution.

Files:
- `server.js`: the local HTTP server that exposes `GET /health` and `POST /tools/execute`
- `runtime.js`: the wrapper that starts or reuses the server, opens the Cloudflare tunnel, and updates Familiar's integration `base_url`

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
