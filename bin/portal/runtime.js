#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_FAMILIAR_BASE_URL = "https://familiar.chrsvdmrw.workers.dev";
const DEFAULT_PORT = 8788;
const DEFAULT_HOST = "127.0.0.1";
const ENV_FILES = [".env", "dev.vars"];
const QUICK_TUNNEL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

await loadEnvFiles();

const port = Number(process.env.PORTAL_PORT || process.env.EXECUTOR_PORT || DEFAULT_PORT);
const host = DEFAULT_HOST;
const familiarBaseUrl = process.env.FAMILIAR_BASE_URL || DEFAULT_FAMILIAR_BASE_URL;
const cloudflaredBin = process.env.CLOUDFLARED_BIN || "cloudflared";

let portalChild = null;
let tunnelChild = null;

try {
  if (await isPortalHealthy(host, port)) {
    console.log(`Using existing portal on http://${host}:${port}`);
  } else {
    portalChild = spawn(process.execPath, ["./bin/portal/server.js"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"]
    });

    await waitForPortal(host, port, portalChild);
    console.log(`Started portal on http://${host}:${port}`);
  }

  tunnelChild = spawn(cloudflaredBin, ["tunnel", "--url", `http://${host}:${port}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const publicUrl = await waitForTunnelUrl(tunnelChild);
  console.log(`Tunnel URL: ${publicUrl}`);

  if (process.env.FAMILIAR_API_TOKEN) {
    const integration = await updateIntegrationBaseUrl(familiarBaseUrl, process.env.FAMILIAR_API_TOKEN, publicUrl);
    console.log(`Updated Familiar integration base_url to ${integration.base_url}`);
  } else {
    console.log("FAMILIAR_API_TOKEN not set; skipped Familiar integration update.");
  }

  forwardProcessOutput(tunnelChild, "[cloudflared]");

  const cleanup = () => {
    stopChild(tunnelChild);
    stopChild(portalChild);
  };

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  await new Promise((resolve) => {
    const onExit = () => resolve();
    tunnelChild.once("exit", onExit);
    if (portalChild) {
      portalChild.once("exit", onExit);
    }
  });
} catch (error) {
  stopChild(tunnelChild);
  stopChild(portalChild);
  console.error(error.message);
  process.exitCode = 1;
}

function stopChild(child) {
  if (child && child.exitCode === null) {
    child.kill("SIGINT");
  }
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

async function isPortalHealthy(hostname, portNumber) {
  try {
    const response = await fetch(`http://${hostname}:${portNumber}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForPortal(hostname, portNumber, child) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error("Portal exited before becoming ready.");
    }

    if (await isPortalHealthy(hostname, portNumber)) {
      return;
    }

    await sleep(200);
  }

  throw new Error("Timed out waiting for portal health check.");
}

async function waitForTunnelUrl(child) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let resolved = false;

    const onData = (chunk) => {
      const text = chunk.toString("utf8");
      buffer += text;
      const match = buffer.match(QUICK_TUNNEL_PATTERN);
      if (match && !resolved) {
        resolved = true;
        resolve(match[0]);
      }
    };

    const onExit = (code) => {
      if (!resolved) {
        reject(new Error(`cloudflared exited before publishing a tunnel URL${code === null ? "" : ` (code ${code})`}.`));
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
    child.once("error", (error) => {
      reject(new Error(`Failed to start cloudflared: ${error.message}`));
    });
  });
}

function forwardProcessOutput(child, prefix) {
  const write = (chunk) => {
    const text = chunk.toString("utf8").trimEnd();
    if (!text) {
      return;
    }
    for (const line of text.split(/\r?\n/)) {
      console.log(`${prefix} ${line}`);
    }
  };

  child.stdout.on("data", write);
  child.stderr.on("data", write);
}

async function updateIntegrationBaseUrl(baseUrl, apiToken, publicUrl) {
  const response = await fetch(new URL("/api/v1/integration", baseUrl), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      base_url: publicUrl
    })
  });

  const text = await response.text();
  const data = safeParseJson(text);

  if (!response.ok) {
    throw new Error(`Failed to update Familiar integration base_url: HTTP ${response.status} ${text || response.statusText}`);
  }

  if (!data?.integration?.base_url) {
    throw new Error("Familiar integration update succeeded but no integration.base_url was returned.");
  }

  return data.integration;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
