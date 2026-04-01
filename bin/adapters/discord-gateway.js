#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_PORTAL_BASE_URL = "http://127.0.0.1:8788";
const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const ENV_FILES = [".env", "dev.vars"];
const STATE_DIR = path.join(process.cwd(), ".cli-chat");
const STATE_FILE = path.join(STATE_DIR, "session.json");
const GATEWAY_INTENTS = 1 | 512 | 4096 | 32768;

await loadEnvFiles();

const botToken = String(process.env.DISCORD_BOT_TOKEN || "").trim();
const portalBaseUrl = String(process.env.PORTAL_BASE_URL || DEFAULT_PORTAL_BASE_URL).trim();
const mirrorToCli = !["0", "false", "no"].includes(String(process.env.DISCORD_MIRROR_TO_CLI || "true").toLowerCase());
const replyInDiscord = !["0", "false", "no"].includes(String(process.env.DISCORD_REPLY_TO_CHANNEL || "true").toLowerCase());
const verbose = ["1", "true", "yes"].includes(String(process.env.DISCORD_LISTENER_VERBOSE || "false").toLowerCase());

if (!botToken) {
  throw new Error("Missing DISCORD_BOT_TOKEN.");
}

let botUserId = null;
let websocket = null;
let heartbeatTimer = null;
let lastSequence = null;
let reconnectDelayMs = 2000;

await connectLoop();

async function connectLoop() {
  while (true) {
    try {
      const gatewayUrl = await getGatewayUrl();
      await runGatewaySession(gatewayUrl);
      reconnectDelayMs = 2000;
    } catch (error) {
      console.error(`[discord] ${error.message}`);
    }

    await sleep(reconnectDelayMs);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 15000);
  }
}

async function getGatewayUrl() {
  const response = await fetch(`${DISCORD_API_BASE_URL}/gateway/bot`, {
    headers: {
      Authorization: `Bot ${botToken}`,
      Accept: "application/json"
    }
  });

  const text = await response.text();
  const data = text ? safeParseJson(text) : null;

  if (!response.ok || !data?.url) {
    throw new Error(`Failed to get Discord gateway URL: HTTP ${response.status} ${text || response.statusText}`);
  }

  const url = new URL(data.url);
  url.searchParams.set("v", "10");
  url.searchParams.set("encoding", "json");
  return url.toString();
}

async function runGatewaySession(gatewayUrl) {
  await closeGateway();

  websocket = new WebSocket(gatewayUrl);

  return new Promise((resolve, reject) => {
    websocket.addEventListener("open", () => {
      logDebug("[discord] Gateway connected.");
    });

    websocket.addEventListener("message", async (event) => {
      try {
        const payload = safeParseJson(String(event.data));
        if (!payload) {
          return;
        }

        if (typeof payload.s === "number") {
          lastSequence = payload.s;
        }

        switch (payload.op) {
          case 10:
            startHeartbeat(payload.d?.heartbeat_interval);
            identifyGateway();
            return;
          case 11:
            return;
          case 0:
            await handleDispatch(payload.t, payload.d);
            return;
          case 7:
            reject(new Error("Discord requested reconnect."));
            return;
          default:
            return;
        }
      } catch (error) {
        reject(error);
      }
    });

    websocket.addEventListener("close", (event) => {
      stopHeartbeat();
      websocket = null;
      reject(new Error(`Discord gateway closed (${event.code}).`));
    });

    websocket.addEventListener("error", () => {
      reject(new Error("Discord gateway connection failed."));
    });
  });
}

function identifyGateway() {
  websocket?.send(JSON.stringify({
    op: 2,
    d: {
      token: botToken,
      intents: GATEWAY_INTENTS,
      properties: {
        os: process.platform,
        browser: "cli-chat",
        device: "cli-chat"
      }
    }
  }));
}

function startHeartbeat(intervalMs) {
  stopHeartbeat();

  if (!intervalMs) {
    throw new Error("Discord gateway did not provide heartbeat interval.");
  }

  heartbeatTimer = setInterval(() => {
    websocket?.send(JSON.stringify({
      op: 1,
      d: lastSequence
    }));
  }, intervalMs);
  heartbeatTimer.unref();
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function closeGateway() {
  stopHeartbeat();
  if (websocket) {
    try {
      websocket.close();
    } catch {
      // Ignore close errors during reconnect.
    }
    websocket = null;
  }
}

async function handleDispatch(type, data) {
  if (type === "READY") {
    botUserId = data?.user?.id || null;
    logDebug(`[discord] Ready as ${data?.user?.username || "bot"} (${botUserId || "unknown"}).`);
    return;
  }

  if (type !== "MESSAGE_CREATE") {
    return;
  }

  await handleMessageCreate(data);
}

async function handleMessageCreate(message) {
  if (!message || message.author?.bot) {
    return;
  }

  const isDm = !message.guild_id;
  const mentionsBot = Array.isArray(message.mentions) && botUserId
    ? message.mentions.some((mention) => mention?.id === botUserId)
    : false;

  if (!isDm && !mentionsBot) {
    return;
  }

  const text = normalizeMessageText(message.content || "", botUserId);
  if (!text) {
    return;
  }

  logDebug(`[discord] ${message.author?.username || "user"}: ${text}`);

  if (mirrorToCli) {
    await mirrorToCliChannel(`<-[discord] ${message.author?.username || "user"}: ${text}`);
  }

  const portalResponse = await postJson(new URL("/conversation/input", portalBaseUrl), {
    channel: {
      type: "discord",
      id: String(message.channel_id || "")
    },
    input: {
      kind: "text",
      text
    },
    metadata: {
      source: "discord",
      guild_id: message.guild_id || null,
      message_id: message.id,
      author_id: message.author?.id || null
    }
  });

  const replyText = extractReplyText(portalResponse);
  if (!replyText) {
    logDebug("[discord] Familiar returned no assistant text.");
    return;
  }

  if (replyInDiscord) {
    await sendDiscordChannelMessage(message.channel_id, replyText);
  }

  if (mirrorToCli) {
    await mirrorToCliChannel(`->[discord] familiar: ${replyText}`);
  }
}

function normalizeMessageText(content, currentBotUserId) {
  const raw = String(content || "").trim();
  if (!raw) {
    return "";
  }

  if (!currentBotUserId) {
    return raw;
  }

  return raw
    .replaceAll(`<@${currentBotUserId}>`, "")
    .replaceAll(`<@!${currentBotUserId}>`, "")
    .trim();
}

function extractReplyText(portalResponse) {
  const candidates = [
    portalResponse?.result?.response_content,
    portalResponse?.result?.familiar_response?.response?.content,
    portalResponse?.result?.familiar_response?.response?.text,
    portalResponse?.result?.summary
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

async function sendDiscordChannelMessage(channelId, content) {
  const response = await fetch(`${DISCORD_API_BASE_URL}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to send Discord channel message: HTTP ${response.status} ${text || response.statusText}`);
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const data = text ? safeParseJson(text) : null;

  if (!response.ok) {
    throw new Error(`Request failed for ${url.pathname}: HTTP ${response.status} ${text || response.statusText}`);
  }

  return data ?? text;
}

async function mirrorToCliChannel(content) {
  const session = await readJson(STATE_FILE, {});
  if (!session?.channelId) {
    return;
  }

  await postJson(new URL("/channels/messages", portalBaseUrl), {
    channel: {
      type: "cli",
      id: session.channelId
    },
    thread_id: session.threadId || null,
    content
  });
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
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
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

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function logDebug(message) {
  if (verbose) {
    console.log(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
