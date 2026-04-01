import test from "node:test";
import assert from "node:assert/strict";

import {
  applyThreadStateFromResponse,
  classifyHostedPortalBaseUrl,
  classifyHostedPortalHealth,
  diagnoseStatus,
  describeManagedProcess,
  extractThreadId,
  extractThreadName,
  formatEnabled,
  formatChatStartup,
  formatHealth,
  formatManagedProcessSummary,
  formatRouteState,
  formatStatus,
  getThreadDisplay,
  planDiscordListenerStartup,
  planPortalStartup,
  shouldIgnoreThreadMetadataError
} from "../bin/cli-chat.js";

test("extractThreadName finds nested thread names", () => {
  const payload = {
    response: {
      thread: {
        id: "thread_123",
        name: "Scratchpad"
      }
    }
  };

  assert.equal(extractThreadName(payload), "Scratchpad");
});

test("extractThreadId finds nested thread ids", () => {
  const payload = {
    result: {
      thread_id: "thread_456"
    }
  };

  assert.equal(extractThreadId(payload), "thread_456");
});

test("getThreadDisplay prefers thread name over thread id", () => {
  assert.equal(getThreadDisplay({ threadName: "Focus" }, "thread_789"), "Focus");
  assert.equal(getThreadDisplay({}, "thread_789"), "thread_789");
  assert.equal(getThreadDisplay({}, null), "(auto)");
});

test("applyThreadStateFromResponse backfills a missing name without changing thread id", () => {
  const state = {
    threadId: "thread_123",
    threadName: null
  };
  const response = {
    response: {
      thread: {
        id: "thread_123",
        name: "Recovered Name"
      }
    }
  };

  const changed = applyThreadStateFromResponse(state, "thread_123", response);

  assert.equal(changed, true);
  assert.deepEqual(state, {
    threadId: "thread_123",
    threadName: "Recovered Name"
  });
});

test("applyThreadStateFromResponse preserves the current name when the response has none", () => {
  const state = {
    threadId: "thread_123",
    threadName: "Existing Name"
  };

  const changed = applyThreadStateFromResponse(state, "thread_123", {
    response: {
      content: "No thread metadata here"
    }
  });

  assert.equal(changed, false);
  assert.deepEqual(state, {
    threadId: "thread_123",
    threadName: "Existing Name"
  });
});

test("planPortalStartup always starts runtime in runtime mode", () => {
  assert.deepEqual(
    planPortalStartup("runtime", {
      localHealthy: true,
      hostedRouteOk: true
    }),
    { action: "start-runtime" }
  );
});

test("planPortalStartup reuses or starts the local server in server mode", () => {
  assert.deepEqual(
    planPortalStartup("server", {
      localHealthy: true,
      hostedRouteOk: false
    }),
    { action: "reuse-local-server" }
  );

  assert.deepEqual(
    planPortalStartup("server", {
      localHealthy: false,
      hostedRouteOk: false
    }),
    { action: "start-local-server" }
  );
});

test("planPortalStartup promotes to runtime in auto mode when the hosted route is stale", () => {
  assert.deepEqual(
    planPortalStartup("auto", {
      localHealthy: true,
      hostedRouteOk: false
    }),
    { action: "start-runtime" }
  );
});

test("planPortalStartup prefers the local server in auto mode when the hosted route is healthy", () => {
  assert.deepEqual(
    planPortalStartup("auto", {
      localHealthy: true,
      hostedRouteOk: true
    }),
    { action: "reuse-local-server" }
  );

  assert.deepEqual(
    planPortalStartup("auto", {
      localHealthy: false,
      hostedRouteOk: true
    }),
    { action: "start-local-server" }
  );
});

test("planDiscordListenerStartup skips when disabled", () => {
  assert.deepEqual(
    planDiscordListenerStartup({
      enabled: false,
      hasToken: true
    }),
    {
      action: "skip",
      reason: "disabled"
    }
  );
});

test("planDiscordListenerStartup skips when the bot token is missing", () => {
  assert.deepEqual(
    planDiscordListenerStartup({
      enabled: true,
      hasToken: false
    }),
    {
      action: "skip",
      reason: "missing-token"
    }
  );
});

test("planDiscordListenerStartup starts only when enabled and configured", () => {
  assert.deepEqual(
    planDiscordListenerStartup({
      enabled: true,
      hasToken: true
    }),
    {
      action: "start"
    }
  );
});

test("describeManagedProcess returns a stable empty shape without a child", () => {
  assert.deepEqual(
    describeManagedProcess(null, "/tmp/test.log"),
    {
      kind: null,
      pid: null,
      running: false,
      log: "/tmp/test.log"
    }
  );
});

test("describeManagedProcess reports pid and running state for a live child", () => {
  assert.deepEqual(
    describeManagedProcess(
      {
        kind: "runtime",
        process: {
          pid: 1234,
          exitCode: null
        }
      },
      "/tmp/runtime.log"
    ),
    {
      kind: "runtime",
      pid: 1234,
      running: true,
      log: "/tmp/runtime.log"
    }
  );
});

test("describeManagedProcess reports a stopped child when exitCode is set", () => {
  assert.deepEqual(
    describeManagedProcess(
      {
        kind: "discord-listener",
        process: {
          pid: 4567,
          exitCode: 1
        }
      },
      "/tmp/discord.log"
    ),
    {
      kind: "discord-listener",
      pid: 4567,
      running: false,
      log: "/tmp/discord.log"
    }
  );
});

test("classifyHostedPortalBaseUrl rejects missing, invalid, and local base URLs", () => {
  assert.deepEqual(classifyHostedPortalBaseUrl(""), {
    ok: false,
    warning: "Familiar integration base_url is not configured. Run `npm run portal` to publish a tunnel and update it."
  });

  assert.deepEqual(classifyHostedPortalBaseUrl("not a url"), {
    ok: false,
    warning: "Familiar integration base_url is invalid: not a url"
  });

  assert.deepEqual(classifyHostedPortalBaseUrl("http://127.0.0.1:8788"), {
    ok: false,
    warning: "Familiar integration base_url points to a local address (http://127.0.0.1:8788), which hosted Familiar cannot reach. Run `npm run portal`."
  });
});

test("classifyHostedPortalBaseUrl accepts a public base URL", () => {
  const result = classifyHostedPortalBaseUrl("https://portal.example.com");

  assert.equal(result.ok, true);
  assert.equal(result.baseUrl, "https://portal.example.com");
  assert.equal(result.url.hostname, "portal.example.com");
});

test("classifyHostedPortalHealth distinguishes unreachable, invalid, and healthy routes", () => {
  assert.deepEqual(
    classifyHostedPortalHealth("https://portal.example.com", {
      reachable: false,
      responseOk: false,
      data: null
    }),
    {
      ok: false,
      warning: "Familiar integration base_url is set to https://portal.example.com, but it is not reachable right now. Run `npm run portal` to refresh the public tunnel."
    }
  );

  assert.deepEqual(
    classifyHostedPortalHealth("https://portal.example.com", {
      reachable: true,
      responseOk: false,
      data: null
    }),
    {
      ok: false,
      warning: "Familiar integration base_url is set to https://portal.example.com, but /health did not return a valid portal response. Run `npm run portal` to refresh the public tunnel."
    }
  );

  assert.deepEqual(
    classifyHostedPortalHealth("https://portal.example.com", {
      reachable: true,
      responseOk: true,
      data: {
        ok: true,
        service: "portal"
      }
    }),
    {
      ok: true,
      baseUrl: "https://portal.example.com"
    }
  );
});

test("formatManagedProcessSummary renders a compact process summary", () => {
  assert.equal(
    formatManagedProcessSummary("managed_process", {
      kind: "runtime",
      running: true,
      pid: 1234,
      log: "/tmp/runtime.log"
    }),
    "managed_process: runtime | running=yes | pid=1234 | log=/tmp/runtime.log"
  );
});

test("formatEnabled, formatHealth, and formatRouteState keep status labels consistent", () => {
  assert.equal(formatEnabled(true), "yes");
  assert.equal(formatEnabled(false), "no");
  assert.equal(formatHealth(true), "yes");
  assert.equal(formatHealth(false), "no");
  assert.equal(formatRouteState(true), "yes");
  assert.equal(formatRouteState(false), "no");
  assert.equal(formatRouteState(null), "unknown");
});

test("shouldIgnoreThreadMetadataError treats unsupported thread lookup routes as non-fatal", () => {
  assert.equal(shouldIgnoreThreadMetadataError(404), true);
  assert.equal(shouldIgnoreThreadMetadataError(405), true);
  assert.equal(shouldIgnoreThreadMetadataError(500), false);
  assert.equal(shouldIgnoreThreadMetadataError(undefined), false);
});

test("diagnoseStatus reports actionable portal and Discord problems", () => {
  const findings = diagnoseStatus({
    portal: {
      auto_start: true,
      local_url: "http://127.0.0.1:8788",
      local_healthy: false,
      hosted_route_warning: "Hosted route is stale.",
      managed_process: {
        kind: "runtime",
        running: false,
        log: "/tmp/portal.log"
      }
    },
    discord: {
      startup_action: "skip",
      startup_reason: "missing-token",
      managed_process: {
        running: false,
        log: "/tmp/discord.log"
      }
    }
  });

  assert.deepEqual(findings, [
    {
      severity: "high",
      message: "Portal needs attention: local health check is failing at http://127.0.0.1:8788; Hosted route is stale.; managed process is not running (check /tmp/portal.log).",
      nextStep: "Run `npm run portal` to refresh the local runtime and hosted route, then recheck `cli-chat status`."
    },
    {
      severity: "medium",
      message: "Discord listener auto-start is enabled but DISCORD_BOT_TOKEN is not configured.",
      nextStep: "Set `DISCORD_BOT_TOKEN` in `.env` if you want chat to auto-start the Discord listener."
    }
  ]);
});

test("diagnoseStatus reports a dead Discord listener when it should be running", () => {
  const findings = diagnoseStatus({
    portal: {
      auto_start: false,
      local_url: "http://127.0.0.1:8788",
      local_healthy: true,
      hosted_route_warning: null,
      managed_process: {
        kind: null,
        running: false,
        log: "/tmp/portal.log"
      }
    },
    discord: {
      startup_action: "start",
      startup_reason: null,
      managed_process: {
        running: false,
        log: "/tmp/discord.log"
      }
    }
  });

  assert.deepEqual(findings, [
    {
      severity: "medium",
      message: "Discord listener should be running but is not. Check /tmp/discord.log.",
      nextStep: "Inspect /tmp/discord.log and restart chat or run `npm run discord:listen`."
    }
  ]);
});

test("formatStatus renders a readable status summary", () => {
  const text = formatStatus({
    familiar_base_url: "https://familiar.example.com",
    channel: "cli:local-dev",
    thread: {
      id: "thread_123",
      name: "Scratchpad",
      display: "Scratchpad"
    },
    portal: {
      auto_start: true,
      mode: "auto",
      local_url: "http://127.0.0.1:8788",
      local_healthy: true,
      hosted_route_ok: false,
      hosted_route_warning: "Route is stale.",
      managed_process: {
        kind: "runtime",
        running: true,
        pid: 111,
        log: "/tmp/portal.log"
      }
    },
    discord: {
      auto_start: true,
      configured: false,
      startup_action: "skip",
      startup_reason: "missing-token",
      managed_process: {
        kind: null,
        running: false,
        pid: null,
        log: "/tmp/discord.log"
      }
    }
  });

  assert.match(text, /Familiar: https:\/\/familiar\.example\.com/);
  assert.match(text, /Diagnosis/);
  assert.match(text, /- \[high\] Portal needs attention:/);
  assert.match(text, /next: Run `npm run portal` to refresh the local runtime and hosted route, then recheck `cli-chat status`\./);
  assert.match(text, /Thread Name: Scratchpad/);
  assert.match(text, /Portal/);
  assert.doesNotMatch(text, /warning=Route is stale\./);
  assert.match(text, /Discord/);
  assert.doesNotMatch(text, /startup_action=skip \(missing-token\)/);
});

test("formatChatStartup renders a compact startup summary with top diagnosis", () => {
  const text = formatChatStartup({
    familiar_base_url: "https://familiar.example.com",
    channel: "cli:local-dev",
    thread: {
      display: "Scratchpad"
    },
    portal: {
      startup_severity: "warn",
      startup_message: "Hosted portal route is still stale after refresh attempt; direct CLI chat should still work, but portal-dependent features may fail.",
      auto_start: true,
      local_url: "http://127.0.0.1:8788",
      local_healthy: false,
      hosted_route_warning: "Hosted route is stale.",
      managed_process: {
        kind: "runtime",
        running: false,
        log: "/tmp/portal.log"
      }
    },
    discord: {
      startup_action: "skip",
      startup_reason: "missing-token",
      managed_process: {
        running: false,
        log: "/tmp/discord.log"
      }
    }
  });

  assert.match(text, /Connected to https:\/\/familiar\.example\.com/);
  assert.match(text, /Channel: cli:local-dev/);
  assert.match(text, /Thread: Scratchpad/);
  assert.match(text, /Startup: \[warn\] Hosted portal route is still stale after refresh attempt; direct CLI chat should still work, but portal-dependent features may fail\./);
  assert.match(text, /Commands: \/new, \/thread, \/clear, \/status, \/whoami, \/exit/);
});
