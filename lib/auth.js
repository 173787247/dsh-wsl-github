import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sign } from "node:crypto";

export function resolveAuthSources(config = {}, env = process.env) {
  return {
    appId: String(config.appId || env.GITHUB_APP_ID || "").trim(),
    keyPath: String(config.privateKeyPath || env.GITHUB_APP_PRIVATE_KEY_PATH || "").trim(),
    keyInline: String(env.GITHUB_APP_PRIVATE_KEY || "").trim(),
    installationId: String(config.installationId || env.GITHUB_APP_INSTALLATION_ID || "").trim(),
    token: String(env.GITHUB_TOKEN || env.GH_TOKEN || "").trim(),
  };
}

export function publicAuthStatus(sources) {
  const privateKeySet = Boolean(sources.keyInline || sources.keyPath);
  let mode = "missing";
  if (sources.appId && privateKeySet) mode = "github-app";
  else if (sources.token) mode = "token";
  return {
    mode,
    appIdSet: Boolean(sources.appId),
    privateKeySet,
    installationIdSet: Boolean(sources.installationId),
    tokenFallbackSet: Boolean(sources.token),
  };
}

export function expandPath(p, home = homedir()) {
  const raw = String(p || "").trim();
  if (!raw) return "";
  if (raw === "~") return home;
  if (raw.startsWith("~/") || raw.startsWith("~\\")) return resolve(home, raw.slice(2));
  return raw;
}

export function normalizePem(raw) {
  return String(raw || "").replace(/\\n/g, "\n").trim();
}

export function loadPrivateKey(sources, { readFile = readFileSync } = {}) {
  if (sources.keyInline) return normalizePem(sources.keyInline);
  if (sources.keyPath) {
    const path = expandPath(sources.keyPath);
    return normalizePem(readFile(path, "utf8"));
  }
  return "";
}

export function createAppJwt(appId, privateKeyPem, nowSec = Math.floor(Date.now() / 1000)) {
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: nowSec - 60,
    exp: nowSec + 540,
    iss: String(appId),
  };
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${h}.${p}`;
  const sig = sign("sha256", Buffer.from(data), privateKeyPem);
  return `${data}.${sig.toString("base64url")}`;
}

export function decodeJwtPayload(jwt) {
  const parts = String(jwt || "").split(".");
  if (parts.length !== 3) return null;
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}
