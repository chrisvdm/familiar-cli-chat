#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_BASE_URL = "https://familiar.chrsvdmrw.workers.dev";
const DEFAULT_EXECUTOR_HOST = "127.0.0.1";
const DEFAULT_EXECUTOR_PORT = 8788;
const STATE_DIR = path.join(process.cwd(), ".cli-chat");
const STATE_FILE = path.join(STATE_DIR, "session.json");
const ENV_FILES = [".env", "dev.vars"];
const DEFAULT_ENV_FILE = ".env";

function printUsage() {
  console.log(`cli-chat

Usage:
  cli-chat chat
  cli-chat send "message text"
  cli-chat init-account
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
  EXECUTOR_PORT             Optional, defaults to ${DEFAULT_EXECUTOR_PORT}
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
    host: DEFAULT_EXECUTOR_HOST,
    port: Number(process.env.EXECUTOR_PORT || DEFAULT_EXECUTOR_PORT)
  };
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

async function isExecutorHealthy({ host, port }) {
  try {
    const response = await fetch(`http://${host}:${port}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensurePortalRunning(portalConfig) {
  if (!portalConfig.enabled) {
    return null;
  }

  if (await isExecutorHealthy(portalConfig)) {
    console.log(`Using existing portal on http://${portalConfig.host}:${portalConfig.port}`);
    return null;
  }

  const child = spawn(process.execPath, ["./bin/portal.js"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"]
  });

  const waitForReady = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (child.exitCode !== null) {
        throw new Error("Portal exited before becoming ready.");
      }

      if (await isExecutorHealthy(portalConfig)) {
        return;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
    }

    throw new Error("Timed out waiting for portal to become ready.");
  };

  await waitForReady();
  console.log(`Started portal on http://${portalConfig.host}:${portalConfig.port}`);
  return child;
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
  const response = await request(config, "/api/v1/input", {
    method: "POST",
    body: payload,
    headers: {
      "Idempotency-Key": randomUUID()
    }
  });

  const nextThreadId = extractThreadId(response) || config.threadId;
  if (nextThreadId && nextThreadId !== state.threadId) {
    state.threadId = nextThreadId;
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
      if (threadId) {
        state.threadId = threadId;
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
      await saveState(state);
      console.log(`Active thread set to ${threadId}`);
      return;
    }
    case "clear": {
      delete state.threadId;
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
  const portalProcess = await ensurePortalRunning(getPortalConfig());
  const rl = readline.createInterface({ input, output });

  const cleanupPortal = () => {
    if (portalProcess && portalProcess.exitCode === null) {
      portalProcess.kill("SIGINT");
    }
  };

  process.once("SIGINT", cleanupPortal);
  process.once("SIGTERM", cleanupPortal);

  console.log(`Connected to ${authenticatedConfig.baseUrl}`);
  console.log(`Channel: ${authenticatedConfig.channelType}:${authenticatedConfig.channelId}`);
  console.log(`Thread: ${authenticatedConfig.threadId || "(auto)"}`);
  console.log("Commands: /new, /thread, /clear, /whoami, /exit");

  try {
    while (true) {
      const line = (await rl.question("> ")).trim();
      if (!line) {
        continue;
      }

      if (line === "/exit" || line === "/quit") {
        break;
      }

      if (line === "/thread") {
        console.log(state.threadId || "(none)");
        continue;
      }

      if (line === "/clear") {
        delete state.threadId;
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
        if (threadId) {
          state.threadId = threadId;
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
    cleanupPortal();
    rl.close();
  }
}

async function main() {
  await loadEnvFiles();
  const state = await loadState();
  const config = getConfig(state);
  const { command, rest } = parseArgs(process.argv.slice(2));

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

main().catch((error) => {
  if (error?.status) {
    printApiError(error);
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
