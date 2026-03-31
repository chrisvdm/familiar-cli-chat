import test from "node:test";
import assert from "node:assert/strict";

import {
  applyThreadStateFromResponse,
  extractThreadId,
  extractThreadName,
  getThreadDisplay,
  planPortalStartup
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
