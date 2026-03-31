#!/usr/bin/env node

import fs from "node:fs/promises";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";

const DEFAULT_PORT = 8788;
const ENV_FILES = [".env", "dev.vars"];
const execFileAsync = promisify(execFile);
const PORTAL_LOG_DIR = path.join(process.cwd(), ".cli-chat");
const PORTAL_LOG_FILE = path.join(PORTAL_LOG_DIR, "portal.log");
const CHANNEL_MESSAGES_FILE = path.join(PORTAL_LOG_DIR, "channel-messages.json");

await loadEnvFiles();

const port = Number(process.env.EXECUTOR_PORT || DEFAULT_PORT);
const host = "127.0.0.1";

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      return sendJson(response, 200, {
        ok: true,
        service: "portal"
      });
    }

    if (request.method === "POST" && request.url === "/channels/messages") {
      const payload = await readJsonBody(request);
      await logPortalEvent("channel-message-request", payload);
      const result = await storeChannelMessage(payload);
      const successBody = {
        ok: true,
        state: "completed",
        result
      };
      await logPortalEvent("channel-message-response", successBody);
      return sendJson(response, 200, successBody);
    }

    if (request.method !== "POST" || request.url !== "/tools/execute") {
      return sendJson(response, 404, {
        ok: false,
        error: "Not found."
      });
    }

    const payload = await readJsonBody(request);
    await logPortalEvent("request", payload);
    const result = await executeTool(payload);
    const successBody = {
      ok: true,
      state: "completed",
      result
    };
    await logPortalEvent("response", successBody);

    return sendJson(response, 200, successBody);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const errorBody = {
      ok: false,
      state: "failed",
      error: error.message
    };
    await logPortalEvent("response", errorBody);
    return sendJson(response, statusCode, errorBody);
  }
});

server.listen(port, host, () => {
  console.log(`Portal listening on http://${host}:${port}`);
});

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(body, null, 2));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body.");
    error.statusCode = 400;
    throw error;
  }
}

async function executeTool(payload) {
  const toolName = payload?.tool_name;
  const args = payload?.arguments || {};

  switch (toolName) {
    case "echo_back":
      return {
        summary: String(args.text || "")
      };
    case "send_discord_message":
      return sendDiscordDefaultWebhookMessage(args);
    case "send_discord_webhook_message":
      return sendDiscordWebhookMessage(args);
    default: {
      const error = new Error(`Unsupported tool: ${toolName || "(missing)"}`);
      error.statusCode = 400;
      throw error;
    }
  }
}

async function storeChannelMessage(payload) {
  const channel = extractChannel(payload);
  const content = extractMessageContent(payload);
  const threadId = extractThreadId(payload);

  if (!channel.id || !channel.type) {
    const error = new Error("Missing channel.id or channel.type.");
    error.statusCode = 400;
    throw error;
  }

  if (!content) {
    const error = new Error("Missing channel message content.");
    error.statusCode = 400;
    throw error;
  }

  const messages = await readChannelMessages();
  const entry = {
    id: extractDeliveryId(payload),
    thread_id: threadId,
    channel,
    content,
    received_at: new Date().toISOString(),
    payload
  };

  messages.push(entry);
  await writeChannelMessages(messages.slice(-500));

  return {
    summary: "Stored channel message.",
    channel_type: channel.type,
    channel_id: channel.id,
    thread_id: threadId || null,
    message_id: entry.id
  };
}

async function sendDiscordWebhookMessage(args) {
  const webhookUrl = String(args.webhook_url || "").trim();
  const message = String(args.message || "").trim();

  if (!webhookUrl) {
    const error = new Error("Missing webhook_url.");
    error.statusCode = 400;
    throw error;
  }

  if (!message) {
    const error = new Error("Missing message.");
    error.statusCode = 400;
    throw error;
  }

  const sentMessage = await webhookRequest(webhookUrl, {
    content: message
  });

  return {
    summary: "Sent Discord webhook message.",
    discord_channel_id: sentMessage.channel_id,
    discord_message_id: sentMessage.id
  };
}

async function sendDiscordDefaultWebhookMessage(args) {
  const webhookUrl = String(process.env.DISCORD_WEBHOOK_URL || "").trim();
  const message = String(args.message || args.text || "").trim();

  if (!webhookUrl) {
    const error = new Error("Missing DISCORD_WEBHOOK_URL.");
    error.statusCode = 500;
    throw error;
  }

  if (!message) {
    const error = new Error("Missing message.");
    error.statusCode = 400;
    throw error;
  }

  const sentMessage = await webhookRequest(webhookUrl, {
    content: message
  });

  return {
    summary: "Sent Discord message.",
    discord_channel_id: sentMessage.channel_id,
    discord_message_id: sentMessage.id
  };
}

async function webhookRequest(webhookUrl, body) {
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");

  const { stdout } = await execFileAsync("curl", [
    "-sS",
    "-X",
    "POST",
    url.toString(),
    "-H",
    "Accept: application/json",
    "-H",
    "Content-Type: application/json",
    "-d",
    JSON.stringify(body),
    "-w",
    "\n%{http_code}"
  ]);

  const lastNewline = stdout.lastIndexOf("\n");
  const text = lastNewline >= 0 ? stdout.slice(0, lastNewline) : stdout;
  const statusCode = Number(lastNewline >= 0 ? stdout.slice(lastNewline + 1).trim() : "0");
  const data = safeParseJson(text);
  const ok = statusCode >= 200 && statusCode < 300;

  if (!ok) {
    const details = data ? JSON.stringify(data) : text;
    const error = new Error(`Discord webhook error ${statusCode}: ${details}`);
    error.statusCode = statusCode || 502;
    throw error;
  }

  if (!data || typeof data !== "object") {
    const error = new Error("Discord webhook returned an empty or non-JSON success response.");
    error.statusCode = 502;
    throw error;
  }

  return data;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractChannel(payload) {
  const directChannel = payload?.channel;
  if (directChannel && typeof directChannel === "object") {
    return {
      type: String(directChannel.type || "").trim(),
      id: String(directChannel.id || "").trim()
    };
  }

  return {
    type: String(payload?.channel_type || "").trim(),
    id: String(payload?.channel_id || "").trim()
  };
}

function extractThreadId(payload) {
  const candidates = [
    payload?.thread_id,
    payload?.thread?.id,
    payload?.message?.thread_id
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function extractDeliveryId(payload) {
  const candidates = [
    payload?.message_id,
    payload?.delivery_id,
    payload?.id,
    payload?.message?.id,
    payload?.result?.execution_id
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function extractMessageContent(payload) {
  const candidates = [
    payload?.content,
    payload?.text,
    payload?.message,
    payload?.message?.content,
    payload?.message?.text,
    payload?.result?.content,
    payload?.response?.content
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

async function readChannelMessages() {
  try {
    const raw = await fs.readFile(CHANNEL_MESSAGES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeChannelMessages(messages) {
  await fs.mkdir(PORTAL_LOG_DIR, { recursive: true });
  await fs.writeFile(CHANNEL_MESSAGES_FILE, `${JSON.stringify(messages, null, 2)}\n`, "utf8");
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

async function logPortalEvent(kind, payload) {
  await fs.mkdir(PORTAL_LOG_DIR, { recursive: true });
  const entry = {
    ts: new Date().toISOString(),
    kind,
    payload
  };
  await fs.appendFile(PORTAL_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}
