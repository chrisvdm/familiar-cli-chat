#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_BASE_URL = "https://familiar.chrsvdmrw.workers.dev";
const DEFAULT_EXECUTOR_HOST = "127.0.0.1";
const DEFAULT_PORTAL_PORT = 8788;
const STATE_DIR = path.join(process.cwd(), ".cli-chat");
const STATE_FILE = path.join(STATE_DIR, "session.json");
const CHANNEL_MESSAGES_FILE = path.join(STATE_DIR, "channel-messages.json");
const PORTAL_SERVER_LOG_FILE = path.join(STATE_DIR, "portal-server.log");
const PORTAL_RUNTIME_LOG_FILE = path.join(STATE_DIR, "portal-runtime.log");
const DISCORD_LISTENER_LOG_FILE = path.join(STATE_DIR, "discord-listener.log");
const ENV_FILES = [".env", "dev.vars"];
const DEFAULT_ENV_FILE = ".env";
const SPINNER_FRAMES = ["|", "/", "-", "\\"];

function printUsage() {
  console.log(`cli-chat

Usage:
  cli-chat chat
  cli-chat send "message text"
  cli-chat init-account
  cli-chat status
  cli-chat sync-tools [path/to/tools.json]
  cli-chat thread new [name]
  cli-chat thread set <thread_id>
  cli-chat thread clear
  cli-chat whoami
  cli-chat help

Environment:
  FAMILIAR_API_TOKEN        Required for all commands except init-account
  FAMILIAR_BASE_URL         Optional, defaults to ${DEFAULT_BASE_URL}
  FAMILIAR_CHANNEL_TYPE     Optional, defaults to "cli"
  FAMILIAR_CHANNEL_ID       Optional, defaults to a persisted local UUID
  FAMILIAR_THREAD_ID        Optional override for the active thread
  FAMILIAR_TOOLS_FILE       Optional default tools file for sync-tools
  AUTO_START_PORTAL         Optional, defaults to "true" for chat
  AUTO_START_EXECUTOR       Legacy alias for AUTO_START_PORTAL
  PORTAL_PORT               Optional, defaults to ${DEFAULT_PORTAL_PORT}
  EXECUTOR_PORT             Legacy alias for PORTAL_PORT
  CLI_CHAT_VERBOSE_STARTUP  Optional, defaults to "false"
`);
}

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  return { command, rest };
}

async function ensureStateDir() {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await ensureStateDir();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function loadState() {
  const state = await readJson(STATE_FILE, {});

  if (!state.channelId) {
    state.channelId = randomUUID();
    await writeJson(STATE_FILE, state);
  }

  return state;
}

async function saveState(nextState) {
  await writeJson(STATE_FILE, nextState);
}

async function readChannelMessages() {
  return readJson(CHANNEL_MESSAGES_FILE, []);
}

async function loadEnvFiles() {
  for (const fileName of ENV_FILES) {
    const filePath = path.join(process.cwd(), fileName);
    let raw;

    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}

async function upsertEnvValue(fileName, key, value) {
  const filePath = path.join(process.cwd(), fileName);
  let raw = "";

  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const lines = raw ? raw.split(/\r?\n/) : [];
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (!line.trim() || line.trim().startsWith("#")) {
      return line;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      return line;
    }

    const currentKey = line.slice(0, separatorIndex).trim();
    if (currentKey !== key) {
      return line;
    }

    replaced = true;
    return `${key}=${value}`;
  });

  if (!replaced) {
    nextLines.push(`${key}=${value}`);
  }

  const outputText = nextLines.filter((line, index, list) => {
    return !(index === list.length - 1 && line === "");
  }).join("\n");

  await fs.writeFile(filePath, `${outputText}\n`, "utf8");
  process.env[key] = value;
}

function getConfig(state) {
  return {
    baseUrl: process.env.FAMILIAR_BASE_URL || DEFAULT_BASE_URL,
    apiToken: process.env.FAMILIAR_API_TOKEN || "",
    channelType: process.env.FAMILIAR_CHANNEL_TYPE || "cli",
    channelId: process.env.FAMILIAR_CHANNEL_ID || state.channelId,
    threadId: process.env.FAMILIAR_THREAD_ID || state.threadId || null
  };
}

function getPortalConfig() {
  return {
    enabled: !["0", "false", "no"].includes(String(
      process.env.AUTO_START_PORTAL || process.env.AUTO_START_EXECUTOR || "true"
    ).toLowerCase()),
    mode: String(process.env.AUTO_START_PORTAL_MODE || "auto").toLowerCase(),
    host: DEFAULT_EXECUTOR_HOST,
    port: Number(process.env.PORTAL_PORT || process.env.EXECUTOR_PORT || DEFAULT_PORTAL_PORT)
  };
}

function getDiscordListenerConfig() {
  return {
    enabled: !["0", "false", "no"].includes(String(
      process.env.AUTO_START_DISCORD_LISTENER || "true"
    ).toLowerCase()),
    hasToken: Boolean(String(process.env.DISCORD_BOT_TOKEN || "").trim())
  };
}

function planDiscordListenerStartup({ enabled, hasToken }) {
  if (!enabled) {
    return {
      action: "skip",
      reason: "disabled"
    };
  }

  if (!hasToken) {
    return {
      action: "skip",
      reason: "missing-token"
    };
  }

  return {
    action: "start"
  };
}

function getVerboseStartup() {
  return ["1", "true", "yes"].includes(String(process.env.CLI_CHAT_VERBOSE_STARTUP || "false").toLowerCase());
}

function requireToken(config) {
  if (!config.apiToken) {
    throw new Error("Missing FAMILIAR_API_TOKEN.");
  }
}

async function request(config, pathname, { method = "GET", body, headers = {} } = {}) {
  const url = new URL(pathname, config.baseUrl);
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: config.apiToken ? `Bearer ${config.apiToken}` : undefined,
      "Content-Type": body ? "application/json" : undefined,
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text ? safeParseJson(text) : null;

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.payload = data ?? text;
    throw error;
  }

  return data ?? text;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function buildInputPayload(config, message, threadId, tools) {
  return compact({
    thread_id: threadId || undefined,
    tools: tools || undefined,
    input: {
      kind: "text",
      text: message
    },
    channel: {
      type: config.channelType,
      id: config.channelId
    }
  });
}

function extractThreadName(payload) {
  const queue = [payload];

  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || typeof value !== "object") {
      continue;
    }

    const id = typeof value.id === "string" ? value.id : null;
    const name = typeof value.name === "string" ? value.name.trim() : "";

    if (id && name) {
      return name;
    }

    for (const nested of Object.values(value)) {
      queue.push(nested);
    }
  }

  return null;
}

function extractThreadId(payload) {
  const queue = [payload];

  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || typeof value !== "object") {
      continue;
    }

    if (typeof value.thread_id === "string") {
      return value.thread_id;
    }

    for (const nested of Object.values(value)) {
      queue.push(nested);
    }
  }

  return null;
}

function collectAssistantTexts(payload) {
  const collected = [];
  const seen = new Set();
  const queue = [payload];

  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || typeof value !== "object") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        queue.push(entry);
      }
      continue;
    }

    const role = typeof value.role === "string" ? value.role.toLowerCase() : "";
    const textCandidates = [
      value.text,
      value.content,
      value.message,
      value.output_text,
      value.reply
    ];

    for (const candidate of textCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        const key = `${role}:${candidate.trim()}`;
        if ((role === "assistant" || role === "model" || role === "reply") && !seen.has(key)) {
          seen.add(key);
          collected.push(candidate.trim());
        }
      }
    }

    for (const nested of Object.values(value)) {
      queue.push(nested);
    }
  }

  return collected;
}

function formatPayload(payload) {
  if (typeof payload?.response?.content === "string" && payload.response.content.trim()) {
    return payload.response.content.trim();
  }

  const assistantTexts = collectAssistantTexts(payload);
  if (assistantTexts.length > 0) {
    return assistantTexts.join("\n\n");
  }

  return JSON.stringify(payload, null, 2);
}

function collectUnreadChannelMessages(messages, channel, seenIds) {
  const unread = [];

  for (const entry of messages) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const entryChannel = entry.channel || {};
    if (entryChannel.type !== channel.type || entryChannel.id !== channel.id) {
      continue;
    }

    if (!entry.id || seenIds.has(entry.id)) {
      continue;
    }

    seenIds.add(entry.id);
    unread.push(entry);
  }

  return unread;
}

function renderChannelMessage(entry) {
  return entry.content;
}

function getThreadDisplay(state, fallbackThreadId) {
  if (state?.threadName) {
    return state.threadName;
  }

  if (fallbackThreadId) {
    return fallbackThreadId;
  }

  return "(auto)";
}

function applyThreadStateFromResponse(state, configThreadId, response) {
  const nextThreadId = extractThreadId(response) || configThreadId;
  const nextThreadName = extractThreadName(response) || state.threadName || null;
  let stateChanged = false;

  if (nextThreadId && nextThreadId !== state.threadId) {
    state.threadId = nextThreadId;
    stateChanged = true;
  }

  if (nextThreadName && nextThreadName !== state.threadName) {
    state.threadName = nextThreadName;
    stateChanged = true;
  }

  return stateChanged;
}

async function appendLogLine(filePath, line) {
  await ensureStateDir();
  await fs.appendFile(filePath, `${line}\n`, "utf8");
}

async function readLogTail(filePath, maxLines = 10) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw.split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function buildStartupError(message, logFile) {
  const tail = await readLogTail(logFile);
  const suffix = tail.length > 0
    ? `\nLog tail from ${logFile}:\n${tail.join("\n")}`
    : `\nSee ${logFile} for startup logs.`;
  return new Error(`${message}\nLog file: ${logFile}${suffix}`);
}

function attachChildLogging(child, label, logFile, { mirrorToConsole = false } = {}) {
  const writeChunk = async (streamLabel, chunk) => {
    const text = chunk.toString("utf8");
    const lines = text.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      const entry = `[${new Date().toISOString()}] [${label}] [${streamLabel}] ${line}`;
      try {
        await appendLogLine(logFile, entry);
      } catch (error) {
        if (mirrorToConsole) {
          console.error(`[${label}] failed to write log: ${error.message}`);
        }
      }

      if (mirrorToConsole) {
        const target = streamLabel === "stderr" ? console.error : console.log;
        target(`[${label}] ${line}`);
      }
    }
  };

  child.stdout?.on("data", (chunk) => {
    void writeChunk("stdout", chunk);
  });
  child.stderr?.on("data", (chunk) => {
    void writeChunk("stderr", chunk);
  });
  child.once("exit", (code, signal) => {
    void appendLogLine(
      logFile,
      `[${new Date().toISOString()}] [${label}] [exit] code=${code ?? "null"} signal=${signal ?? "null"}`
    );
  });
}

function createManagedChild(scriptPath, logFile, label) {
  const child = spawn(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  attachChildLogging(child, label, logFile, { mirrorToConsole: getVerboseStartup() });
  return child;
}

function describeManagedProcess(handle, logFile) {
  const child = handle?.process || null;

  return {
    kind: handle?.kind || null,
    pid: child?.pid || null,
    running: Boolean(child && child.exitCode === null),
    log: logFile
  };
}

function planPortalStartup(mode, { localHealthy, hostedRouteOk }) {
  if (mode === "runtime") {
    return {
      action: "start-runtime"
    };
  }

  if (mode === "server") {
    return localHealthy
      ? { action: "reuse-local-server" }
      : { action: "start-local-server" };
  }

  if (hostedRouteOk) {
    return localHealthy
      ? { action: "reuse-local-server" }
      : { action: "start-local-server" };
  }

  return {
    action: "start-runtime"
  };
}

async function assertChildStillRunning(child, logFile, message) {
  if (child.exitCode !== null) {
    throw await buildStartupError(message, logFile);
  }
}

async function ensureChildSurvivesStartup(child, logFile, message, delayMs = 500) {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

  await assertChildStillRunning(child, logFile, message);
}

function startChannelInboxWatcher(channel) {
  const seenIds = new Set();
  let disposed = false;
  let polling = false;
  let interval = null;

  const poll = async () => {
    if (disposed || polling) {
      return;
    }

    polling = true;

    try {
      const messages = await readChannelMessages();
      const unread = collectUnreadChannelMessages(messages, channel, seenIds);

      for (const entry of unread) {
        output.write(`\n${renderChannelMessage(entry)}\n> `);
      }
    } catch (error) {
      output.write(`\n[portal] Failed to read channel inbox: ${error.message}\n> `);
    } finally {
      polling = false;
    }
  };

  const prime = async () => {
    const messages = await readChannelMessages();
    collectUnreadChannelMessages(messages, channel, seenIds);
    if (!interval) {
      interval = setInterval(() => {
        void poll();
      }, 1000);
      interval.unref();
    }
  };

  const stop = () => {
    disposed = true;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  return {
    prime,
    stop
  };
}

function printApiError(error) {
  console.error(error.message);
  if (error.payload) {
    if (typeof error.payload === "string") {
      console.error(error.payload);
    } else {
      console.error(JSON.stringify(error.payload, null, 2));
    }
  }
}

function createSpinner(label) {
  if (!output.isTTY) {
    return {
      start() {},
      update() {},
      stop(message) {
        if (message) {
          console.log(message);
        }
      }
    };
  }

  let frameIndex = 0;
  let timer = null;
  let currentLabel = label;

  const render = () => {
    output.write(`\r${SPINNER_FRAMES[frameIndex]} ${currentLabel}`);
    frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
  };

  return {
    start() {
      if (timer) {
        return;
      }
      render();
      timer = setInterval(render, 100);
      timer.unref();
    },
    update(nextLabel) {
      currentLabel = nextLabel;
    },
    stop(message) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      output.write("\r\x1b[2K");
      if (message) {
        console.log(message);
      }
    }
  };
}

async function fetchIntegration(config) {
  try {
    return await request(config, "/api/v1/integration");
  } catch {
    return null;
  }
}

function isLocalHostname(hostname) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(hostname || "").toLowerCase());
}

function classifyHostedPortalBaseUrl(baseUrl) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return {
      ok: false,
      warning: "Familiar integration base_url is not configured. Run `npm run portal` to publish a tunnel and update it."
    };
  }

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return {
      ok: false,
      warning: `Familiar integration base_url is invalid: ${baseUrl}`
    };
  }

  if (isLocalHostname(url.hostname)) {
    return {
      ok: false,
      warning: `Familiar integration base_url points to a local address (${baseUrl}), which hosted Familiar cannot reach. Run \`npm run portal\`.`
    };
  }

  return {
    ok: true,
    baseUrl,
    url
  };
}

function classifyHostedPortalHealth(baseUrl, { reachable, responseOk, data }) {
  if (!reachable) {
    return {
      ok: false,
      warning: `Familiar integration base_url is set to ${baseUrl}, but it is not reachable right now. Run \`npm run portal\` to refresh the public tunnel.`
    };
  }

  if (!responseOk || data?.ok !== true || data?.service !== "portal") {
    return {
      ok: false,
      warning: `Familiar integration base_url is set to ${baseUrl}, but /health did not return a valid portal response. Run \`npm run portal\` to refresh the public tunnel.`
    };
  }

  return {
    ok: true,
    baseUrl
  };
}

async function checkHostedPortalRoute(config) {
  const payload = await fetchIntegration(config);
  const baseUrl = payload?.integration?.base_url;
  const baseUrlResult = classifyHostedPortalBaseUrl(baseUrl);
  if (!baseUrlResult.ok) {
    return baseUrlResult;
  }

  try {
    const healthResponse = await fetch(new URL("/health", baseUrlResult.url), {
      headers: {
        Accept: "application/json"
      }
    });
    const text = await healthResponse.text();
    const data = text ? safeParseJson(text) : null;

    return classifyHostedPortalHealth(baseUrl, {
      reachable: true,
      responseOk: healthResponse.ok,
      data
    });
  } catch {
    return classifyHostedPortalHealth(baseUrl, {
      reachable: false,
      responseOk: false,
      data: null
    });
  }
}

async function isExecutorHealthy({ host, port }) {
  try {
    const response = await fetch(`http://${host}:${port}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startPortalServer(portalConfig) {
  const child = createManagedChild("./bin/portal/server.js", PORTAL_SERVER_LOG_FILE, "portal-server");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await assertChildStillRunning(child, PORTAL_SERVER_LOG_FILE, "Portal server exited before becoming ready.");

    if (await isExecutorHealthy(portalConfig)) {
      console.log(`Started portal on http://${portalConfig.host}:${portalConfig.port}`);
      return child;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
  }

  throw await buildStartupError("Timed out waiting for portal to become ready.", PORTAL_SERVER_LOG_FILE);
}

async function startPortalRuntime() {
  const child = createManagedChild("./bin/portal/runtime.js", PORTAL_RUNTIME_LOG_FILE, "portal-runtime");
  await ensureChildSurvivesStartup(
    child,
    PORTAL_RUNTIME_LOG_FILE,
    "Portal runtime exited during startup."
  );
  return child;
}

async function startDiscordListener() {
  const child = createManagedChild("./bin/adapters/discord-gateway.js", DISCORD_LISTENER_LOG_FILE, "discord-listener");
  await ensureChildSurvivesStartup(
    child,
    DISCORD_LISTENER_LOG_FILE,
    "Discord listener exited during startup."
  );
  return child;
}

async function waitForHostedPortalRoute(config, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const route = await checkHostedPortalRoute(config);
    if (route.ok) {
      return route;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }

  return checkHostedPortalRoute(config);
}

async function waitForHostedPortalRouteOrRuntimeExit(config, runtimeChild, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await assertChildStillRunning(
      runtimeChild,
      PORTAL_RUNTIME_LOG_FILE,
      "Portal runtime exited before a public portal route became ready."
    );

    const route = await checkHostedPortalRoute(config);
    if (route.ok) {
      return route;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }

  await assertChildStillRunning(
    runtimeChild,
    PORTAL_RUNTIME_LOG_FILE,
    "Portal runtime exited before a public portal route became ready."
  );

  return checkHostedPortalRoute(config);
}

async function ensurePortalRunning(config, portalConfig) {
  if (!portalConfig.enabled) {
    return null;
  }

  const spinner = createSpinner("Checking portal route...");
  spinner.start();

  const mode = portalConfig.mode;
  try {
    const localHealthy = await isExecutorHealthy(portalConfig);
    const route = mode === "auto" ? await checkHostedPortalRoute(config) : null;
    const startupPlan = planPortalStartup(mode, {
      localHealthy,
      hostedRouteOk: route?.ok === true
    });

    if (startupPlan.action === "start-runtime") {
      spinner.update("Starting portal runtime...");
      const runtimeChild = await startPortalRuntime();
      spinner.update("Waiting for public portal route...");
      const nextRoute = await waitForHostedPortalRouteOrRuntimeExit(config, runtimeChild);
      spinner.stop();
      return {
        process: runtimeChild,
        kind: "runtime",
        warning: nextRoute.ok ? null : nextRoute.warning
      };
    }

    if (startupPlan.action === "start-local-server") {
      spinner.update("Starting local portal server...");
      const processHandle = await startPortalServer(portalConfig);
      spinner.stop();
      return {
        process: processHandle,
        kind: "server"
      };
    }

    if (startupPlan.action === "reuse-local-server") {
      spinner.stop(`Using existing portal on http://${portalConfig.host}:${portalConfig.port}`);
      return null;
    }

    throw new Error(`Unsupported portal startup action: ${startupPlan.action}`);
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

async function loadToolsFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("Tools file must be a JSON array.");
  }

  return parsed;
}

async function sendMessage(config, state, message, tools) {
  const payload = buildInputPayload(config, message, config.threadId, tools);
  const response = await request(config, "/api/v1/conversation/input", {
    method: "POST",
    body: payload,
    headers: {
      "Idempotency-Key": randomUUID()
    }
  });

  if (applyThreadStateFromResponse(state, config.threadId, response)) {
    await saveState(state);
  }

  return response;
}

async function commandInitAccount(state) {
  const baseUrl = process.env.FAMILIAR_BASE_URL || DEFAULT_BASE_URL;
  const response = await request(
    {
      baseUrl,
      apiToken: "",
      channelType: "cli",
      channelId: state.channelId,
      threadId: state.threadId || null
    },
    "/api/v1/accounts",
    {
      method: "POST",
      body: {}
    }
  );

  if (typeof response?.token?.value === "string" && response.token.value) {
    await upsertEnvValue(DEFAULT_ENV_FILE, "FAMILIAR_API_TOKEN", response.token.value);
    if (!process.env.FAMILIAR_BASE_URL) {
      await upsertEnvValue(DEFAULT_ENV_FILE, "FAMILIAR_BASE_URL", baseUrl);
    }
  }

  console.log(JSON.stringify(response, null, 2));
}

async function fetchThreadMetadata(config, threadId) {
  if (!threadId) {
    return null;
  }

  try {
    return await request(config, `/api/v1/threads/${encodeURIComponent(threadId)}`);
  } catch (error) {
    if (error?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function hydrateThreadName(config, state, threadId) {
  if (!config.apiToken || !threadId || state.threadName) {
    return state.threadName || null;
  }

  const metadata = await fetchThreadMetadata(config, threadId);
  const nextThreadName = extractThreadName(metadata);

  if (nextThreadName && nextThreadName !== state.threadName) {
    state.threadName = nextThreadName;
    await saveState(state);
  }

  return state.threadName || null;
}

async function ensureAuthenticated(config, state, { interactive = false } = {}) {
  if (config.apiToken) {
    return config;
  }

  if (interactive) {
    console.log("No Familiar token found. Creating a new account...");
  }

  const response = await request(
    {
      baseUrl: config.baseUrl,
      apiToken: "",
      channelType: config.channelType,
      channelId: config.channelId,
      threadId: state.threadId || null
    },
    "/api/v1/accounts",
    {
      method: "POST",
      body: {}
    }
  );

  const token = response?.token?.value;
  if (typeof token !== "string" || !token) {
    throw new Error("Familiar account creation succeeded but no token was returned.");
  }

  await upsertEnvValue(DEFAULT_ENV_FILE, "FAMILIAR_API_TOKEN", token);
  if (!process.env.FAMILIAR_BASE_URL) {
    await upsertEnvValue(DEFAULT_ENV_FILE, "FAMILIAR_BASE_URL", config.baseUrl);
  }

  if (interactive) {
    console.log(`Created account ${response?.account?.id || ""}`.trim());
  }

  return {
    ...config,
    apiToken: token
  };
}

async function commandWhoAmI(config) {
  requireToken(config);
  const response = await request(config, "/api/v1/account");
  console.log(JSON.stringify(response, null, 2));
}

async function commandSyncTools(config, rest) {
  requireToken(config);
  const filePath = path.resolve(rest[0] || process.env.FAMILIAR_TOOLS_FILE || "./tools.example.json");
  const tools = await loadToolsFile(filePath);
  const response = await request(config, "/api/v1/tools/sync", {
    method: "POST",
    body: { tools },
    headers: {
      "Idempotency-Key": randomUUID()
    }
  });

  console.log(`Synced ${tools.length} tool(s) from ${filePath}`);
  console.log(JSON.stringify(response, null, 2));
}

async function commandSend(config, state, rest) {
  requireToken(config);
  const message = rest.join(" ").trim();
  if (!message) {
    throw new Error('Usage: cli-chat send "message text"');
  }

  const response = await sendMessage(config, state, message);
  console.log(formatPayload(response));
}

async function buildStatus(config, state, { portalHandle = null, discordListenerHandle = null } = {}) {
  const portalConfig = getPortalConfig();
  const discordConfig = getDiscordListenerConfig();
  const discordPlan = planDiscordListenerStartup(discordConfig);
  const localPortalHealthy = await isExecutorHealthy(portalConfig);
  const hostedPortalRoute = config.apiToken ? await checkHostedPortalRoute(config) : null;

  return {
    familiar_base_url: config.baseUrl,
    channel: `${config.channelType}:${config.channelId}`,
    thread: {
      id: state.threadId || config.threadId || null,
      name: state.threadName || null,
      display: getThreadDisplay(state, state.threadId || config.threadId)
    },
    portal: {
      auto_start: portalConfig.enabled,
      mode: portalConfig.mode,
      local_url: `http://${portalConfig.host}:${portalConfig.port}`,
      local_healthy: localPortalHealthy,
      hosted_route_ok: hostedPortalRoute?.ok ?? null,
      hosted_route_warning: hostedPortalRoute?.ok === false ? hostedPortalRoute.warning : null,
      managed_process: describeManagedProcess(portalHandle, portalHandle?.kind === "runtime"
        ? PORTAL_RUNTIME_LOG_FILE
        : PORTAL_SERVER_LOG_FILE),
      runtime_log: PORTAL_RUNTIME_LOG_FILE,
      server_log: PORTAL_SERVER_LOG_FILE
    },
    discord: {
      auto_start: discordConfig.enabled,
      configured: discordConfig.hasToken,
      startup_action: discordPlan.action,
      startup_reason: discordPlan.reason || null,
      managed_process: describeManagedProcess(discordListenerHandle, DISCORD_LISTENER_LOG_FILE)
    }
  };
}

function formatManagedProcessSummary(label, managedProcess) {
  if (!managedProcess) {
    return `${label}: unavailable`;
  }

  const parts = [
    `${label}: ${managedProcess.kind || "none"}`,
    `running=${managedProcess.running ? "yes" : "no"}`,
    `pid=${managedProcess.pid ?? "-"}`,
    `log=${managedProcess.log}`
  ];

  return parts.join(" | ");
}

function diagnoseStatus(status) {
  const findings = [];
  const portalNeedsAttention = [];

  if (status.portal.auto_start && !status.portal.local_healthy) {
    portalNeedsAttention.push(`local health check is failing at ${status.portal.local_url}`);
  }

  if (status.portal.hosted_route_warning) {
    portalNeedsAttention.push(status.portal.hosted_route_warning);
  }

  if (
    status.portal.managed_process?.kind &&
    status.portal.managed_process.running === false
  ) {
    portalNeedsAttention.push(`managed process is not running (check ${status.portal.managed_process.log})`);
  }

  if (portalNeedsAttention.length > 0) {
    findings.push({
      severity: "high",
      message: `Portal needs attention: ${portalNeedsAttention.join("; ")}.`,
      nextStep: "Run `npm run portal` to refresh the local runtime and hosted route, then recheck `cli-chat status`."
    });
  }

  if (status.discord.startup_action === "skip" && status.discord.startup_reason === "missing-token") {
    findings.push({
      severity: "medium",
      message: "Discord listener auto-start is enabled but DISCORD_BOT_TOKEN is not configured.",
      nextStep: "Set `DISCORD_BOT_TOKEN` in `.env` if you want chat to auto-start the Discord listener."
    });
  }

  if (
    status.discord.startup_action === "start" &&
    status.discord.managed_process?.running === false
  ) {
    findings.push({
      severity: "medium",
      message: `Discord listener should be running but is not. Check ${status.discord.managed_process.log}.`,
      nextStep: `Inspect ${status.discord.managed_process.log} and restart chat or run \`npm run discord:listen\`.`
    });
  }

  const order = {
    high: 0,
    medium: 1,
    low: 2
  };

  return findings.sort((left, right) => order[left.severity] - order[right.severity]);
}

function formatStatus(status) {
  const findings = diagnoseStatus(status);
  const lines = [
    `Familiar: ${status.familiar_base_url}`,
    `Channel: ${status.channel}`,
    `Thread: ${status.thread.display}`
  ];

  if (status.thread.id) {
    lines.push(`Thread Id: ${status.thread.id}`);
  }

  if (status.thread.name) {
    lines.push(`Thread Name: ${status.thread.name}`);
  }

  lines.push("");
  lines.push("Diagnosis");
  if (findings.length === 0) {
    lines.push("  ok");
  } else {
    for (const finding of findings) {
      lines.push(`  - [${finding.severity}] ${finding.message}`);
      if (finding.nextStep) {
        lines.push(`    next: ${finding.nextStep}`);
      }
    }
  }

  lines.push("");
  lines.push("Portal");
  lines.push(`  auto_start=${status.portal.auto_start ? "yes" : "no"} mode=${status.portal.mode}`);
  lines.push(`  local_url=${status.portal.local_url}`);
  lines.push(`  local_healthy=${status.portal.local_healthy ? "yes" : "no"}`);
  lines.push(`  hosted_route_ok=${status.portal.hosted_route_ok === null ? "unknown" : status.portal.hosted_route_ok ? "yes" : "no"}`);
  if (status.portal.hosted_route_warning) {
    lines.push(`  warning=${status.portal.hosted_route_warning}`);
  }
  lines.push(`  ${formatManagedProcessSummary("managed_process", status.portal.managed_process)}`);

  lines.push("");
  lines.push("Discord");
  lines.push(`  auto_start=${status.discord.auto_start ? "yes" : "no"} configured=${status.discord.configured ? "yes" : "no"}`);
  lines.push(`  startup_action=${status.discord.startup_action}${status.discord.startup_reason ? ` (${status.discord.startup_reason})` : ""}`);
  lines.push(`  ${formatManagedProcessSummary("managed_process", status.discord.managed_process)}`);

  return lines.join("\n");
}

async function commandStatus(config, state, options = {}) {
  await hydrateThreadName(config, state, state.threadId || config.threadId || null);
  const status = await buildStatus(config, state, options);
  if (options.json === true) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(formatStatus(status));
}

async function commandThread(config, state, rest) {
  const [action, ...args] = rest;

  switch (action) {
    case "new": {
      requireToken(config);
      const name = args.join(" ").trim();
      const response = await request(config, "/api/v1/threads", {
        method: "POST",
        body: compact({ name: name || undefined }),
        headers: {
          "Idempotency-Key": randomUUID()
        }
      });
      const threadId = extractThreadId(response);
      const threadName = extractThreadName(response) || name || null;
      if (threadId) {
        state.threadId = threadId;
        state.threadName = threadName;
        await saveState(state);
      }
      console.log(JSON.stringify(response, null, 2));
      return;
    }
    case "set": {
      const threadId = args[0];
      if (!threadId) {
        throw new Error("Usage: cli-chat thread set <thread_id>");
      }
      state.threadId = threadId;
      delete state.threadName;
      await hydrateThreadName(config, state, threadId);
      await saveState(state);
      console.log(`Active thread set to ${threadId}`);
      return;
    }
    case "clear": {
      delete state.threadId;
      delete state.threadName;
      await saveState(state);
      console.log("Cleared active thread.");
      return;
    }
    default:
      throw new Error("Usage: cli-chat thread <new|set|clear> [...]");
  }
}

async function commandChat(config, state) {
  const authenticatedConfig = await ensureAuthenticated(config, state, { interactive: true });
  await hydrateThreadName(authenticatedConfig, state, state.threadId || authenticatedConfig.threadId || null);
  let portalHandle = null;
  let discordListenerHandle = null;
  const rl = readline.createInterface({ input, output });
  const inboxWatcher = startChannelInboxWatcher({
    type: authenticatedConfig.channelType,
    id: authenticatedConfig.channelId
  });

  const cleanupPortal = () => {
    const child = portalHandle?.process;
    if (child && child.exitCode === null) {
      child.kill("SIGINT");
    }
  };

  const cleanupDiscordListener = () => {
    const child = discordListenerHandle?.process;
    if (child && child.exitCode === null) {
      child.kill("SIGINT");
    }
  };

  process.once("SIGINT", cleanupPortal);
  process.once("SIGTERM", cleanupPortal);
  process.once("SIGINT", cleanupDiscordListener);
  process.once("SIGTERM", cleanupDiscordListener);

  try {
    portalHandle = await ensurePortalRunning(authenticatedConfig, getPortalConfig());
    const discordPlan = planDiscordListenerStartup(getDiscordListenerConfig());
    if (discordPlan.action === "start") {
      discordListenerHandle = {
        kind: "discord-listener",
        process: await startDiscordListener()
      };
    }
    await inboxWatcher.prime();

    console.log(`Connected to ${authenticatedConfig.baseUrl}`);
    console.log(`Channel: ${authenticatedConfig.channelType}:${authenticatedConfig.channelId}`);
    console.log(`Thread: ${getThreadDisplay(state, authenticatedConfig.threadId)}`);
    console.log("Commands: /new, /thread, /clear, /status, /whoami, /exit");

    if (portalHandle?.warning) {
      console.log(`Warning: ${portalHandle.warning}`);
    } else {
      const portalRoute = await checkHostedPortalRoute(authenticatedConfig);
      if (!portalRoute.ok) {
        console.log(`Warning: ${portalRoute.warning}`);
      }
    }

    while (true) {
      const line = (await rl.question("> ")).trim();
      if (!line) {
        continue;
      }

      if (line === "/exit" || line === "/quit" || line === "/q" || line === "/:q") {
        console.log("Goodbye! 👋");
        break;
      }

      if (line === "/thread") {
        console.log(getThreadDisplay(state, state.threadId || authenticatedConfig.threadId));
        continue;
      }

      if (line === "/status") {
        await commandStatus(authenticatedConfig, state, {
          portalHandle,
          discordListenerHandle
        });
        continue;
      }

      if (line === "/clear") {
        delete state.threadId;
        delete state.threadName;
        await saveState(state);
        console.log("Active thread cleared.");
        continue;
      }

      if (line === "/whoami") {
        const whoami = await request(authenticatedConfig, "/api/v1/account");
        console.log(JSON.stringify(whoami, null, 2));
        continue;
      }

      if (line.startsWith("/new")) {
        const name = line.slice(4).trim();
        const response = await request(authenticatedConfig, "/api/v1/threads", {
          method: "POST",
          body: compact({ name: name || undefined }),
          headers: {
            "Idempotency-Key": randomUUID()
          }
        });
        const threadId = extractThreadId(response);
        const threadName = extractThreadName(response) || name || null;
        if (threadId) {
          state.threadId = threadId;
          state.threadName = threadName;
          await saveState(state);
        }
        console.log(JSON.stringify(response, null, 2));
        continue;
      }

      const nextConfig = {
        ...authenticatedConfig,
        threadId: state.threadId || authenticatedConfig.threadId
      };
      const response = await sendMessage(nextConfig, state, line);
      console.log(`\n${formatPayload(response)}\n`);
    }
  } finally {
    process.removeListener("SIGINT", cleanupPortal);
    process.removeListener("SIGTERM", cleanupPortal);
    process.removeListener("SIGINT", cleanupDiscordListener);
    process.removeListener("SIGTERM", cleanupDiscordListener);
    inboxWatcher.stop();
    cleanupDiscordListener();
    cleanupPortal();
    rl.close();
  }
}

async function main() {
  await loadEnvFiles();
  const state = await loadState();
  const config = getConfig(state);
  const { command, rest } = parseArgs(process.argv.slice(2));
  const wantsJson = rest.includes("--json");

  switch (command) {
    case "chat":
      await commandChat(config, state);
      return;
    case "send":
      await commandSend(config, state, rest);
      return;
    case "init-account":
      await commandInitAccount(state);
      return;
    case "status":
      await commandStatus(config, state, { json: wantsJson });
      return;
    case "sync-tools":
      await commandSyncTools(config, rest);
      return;
    case "thread":
      await commandThread(config, state, rest);
      return;
    case "whoami":
      await commandWhoAmI(config);
      return;
    case "help":
    case "--help":
    case "-h":
    default:
      printUsage();
  }
}

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    if (error?.status) {
      printApiError(error);
    } else {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}

export {
  applyThreadStateFromResponse,
  classifyHostedPortalBaseUrl,
  classifyHostedPortalHealth,
  diagnoseStatus,
  describeManagedProcess,
  extractThreadId,
  extractThreadName,
  formatManagedProcessSummary,
  formatStatus,
  getThreadDisplay,
  planDiscordListenerStartup,
  planPortalStartup
};
