import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseGithubRepo } from "./lib/git.js";
import {
  createAppJwt,
  loadPrivateKey,
  publicAuthStatus,
  resolveAuthSources,
} from "./lib/auth.js";
import {
  fetchRepoStatus,
  listInstallations,
  mintInstallationToken,
  pickInstallation,
} from "./lib/api.js";
import {
  buildAppHint,
  detectGithubEnvFile,
  formatHintReport,
  formatStatusReport,
} from "./lib/github.js";

const execFileAsync = promisify(execFile);

export const name = "dsh-wsl-github";
export const inject = ["tools", "systemPrompt"];

export function apply(ctx, config = {}) {
  const timeoutMs = positive(config.timeoutMs, 20_000);
  const cache = { token: "", exp: 0, installationId: "" };

  ctx.systemPrompt.section({
    name: "tool:github_repo_status",
    order: 123,
    text: [
      "Use github_app_hint when GitHub API auth is missing or unclear.",
      "Use github_repo_status for the current GitHub repo's open PRs and latest Actions run.",
      "Never paste App private keys, JWTs, or tokens into chat.",
      "Open returned html_url values with win_open_url in the Windows browser.",
      "git push credentials are a different problem — use cred_hint.",
    ].join(" "),
  });

  ctx.tools.register({
    name: "github_app_hint",
    description: "Report whether a GitHub App (or token fallback) is configured and how to set it up. Never returns secrets.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: { type: "string" },
          appIdSet: { type: "boolean" },
          privateKeySet: { type: "boolean" },
          installationIdSet: { type: "boolean" },
          tokenFallbackSet: { type: "boolean" },
          envFilePath: { type: "string" },
          envFileExists: { type: "boolean" },
          advice: { type: "array", items: { type: "string" } },
        },
      },
      render: (_args, value) => [{ type: "text", text: formatHintReport(value) }],
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    execute() {
      const status = publicAuthStatus(resolveAuthSources(config));
      const envFile = detectGithubEnvFile();
      return {
        ...status,
        envFilePath: envFile.path,
        envFileExists: envFile.exists,
        advice: buildAppHint(status, { envFile }),
      };
    },
    presentCall: () => ({ card: "generic", title: "GitHub App hint" }),
    presentResult: (_args, result) => (
      result.isError
        ? { card: "generic", title: "GitHub App hint failed", content: result.content }
        : { card: "generic", title: "GitHub App hint", content: result.content }
    ),
  });

  ctx.tools.register({
    name: "github_repo_status",
    description: "Show a GitHub repo's open pull requests and latest Actions run via GitHub App (or GH_TOKEN fallback). Defaults to git origin. Never returns secrets.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        repo: {
          type: "string",
          description: "owner/name or GitHub URL. Default: git remote origin.",
        },
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean" },
          mode: { type: "string" },
          repo: { type: "string" },
          html_url: { type: "string" },
          default_branch: { type: "string" },
          private: { type: "boolean" },
          open_prs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                number: { type: "integer" },
                title: { type: "string" },
                html_url: { type: "string" },
                user: { type: "string" },
              },
            },
          },
          latest_run: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              status: { type: "string" },
              conclusion: { type: "string" },
              html_url: { type: "string" },
              head_branch: { type: "string" },
            },
          },
          pulls_error: { type: "string" },
          actions_error: { type: "string" },
          advice: { type: "string" },
          error: { type: "string" },
        },
      },
      render: (_args, value) => [{ type: "text", text: formatStatusReport(value) }],
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parsed = args?.repo
        ? parseGithubRepo(args.repo)
        : await originRepo(exec?.cwd);
      if (!parsed.ok) {
        return fail("missing", parsed.error || "could not resolve owner/repo");
      }
      const access = await getAccessToken(config, cache, parsed.owner, exec?.signal);
      if (!access.ok) {
        return fail(access.mode || "missing", access.error);
      }
      const status = await fetchRepoStatus(parsed.full, access.token, { signal: exec?.signal });
      if (!status.ok) {
        return fail(access.mode, status.error || "GitHub API request failed");
      }
      return {
        ...status,
        mode: access.mode,
        advice: access.note || "Open html_url with win_open_url if you want the Windows browser.",
      };
    },
    presentCall: () => ({ card: "generic", title: "GitHub repo status" }),
    presentResult: (_args, result) => (
      result.isError
        ? { card: "generic", title: "GitHub repo status failed", content: result.content }
        : { card: "generic", title: "GitHub repo status", content: result.content }
    ),
  });
}

function fail(mode, error) {
  return {
    ok: false,
    mode,
    repo: "",
    html_url: "",
    default_branch: "",
    private: false,
    open_prs: [],
    latest_run: { name: "", status: "", conclusion: "", html_url: "", head_branch: "" },
    pulls_error: "",
    actions_error: "",
    advice: "Run github_app_hint for setup. Never paste keys into chat.",
    error,
  };
}

async function originRepo(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf8",
      timeout: 5_000,
    });
    return parseGithubRepo(String(stdout || "").trim());
  } catch {
    return { ok: false, error: "no git origin; pass repo as owner/name" };
  }
}

async function getAccessToken(config, cache, owner, signal) {
  const sources = resolveAuthSources(config);
  const status = publicAuthStatus(sources);
  if (status.mode === "token") {
    return { ok: true, token: sources.token, mode: "token", note: "Using GH_TOKEN/GITHUB_TOKEN fallback." };
  }
  if (status.mode !== "github-app") {
    return { ok: false, mode: "missing", error: "GitHub App credentials missing" };
  }
  if (cache.token && Date.now() < cache.exp) {
    return { ok: true, token: cache.token, mode: "github-app", note: "" };
  }
  let pem;
  try {
    pem = loadPrivateKey(sources);
  } catch (err) {
    return {
      ok: false,
      mode: "github-app",
      error: `Could not read private key file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!pem) {
    return { ok: false, mode: "github-app", error: "GitHub App private key is empty" };
  }
  let jwt;
  try {
    jwt = createAppJwt(sources.appId, pem);
  } catch (err) {
    return {
      ok: false,
      mode: "github-app",
      error: `Could not sign GitHub App JWT: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  let installationId = sources.installationId;
  let note = "";
  if (!installationId) {
    const listed = await listInstallations(jwt, { signal });
    if (!listed.ok) {
      return { ok: false, mode: "github-app", error: listed.error || "failed to list installations" };
    }
    const picked = pickInstallation(listed.installations, owner);
    if (!picked.ok) return { ok: false, mode: "github-app", error: picked.error };
    installationId = picked.installation.id;
    note = picked.note || "";
  }
  const minted = await mintInstallationToken(jwt, installationId, { signal });
  if (!minted.ok) {
    return { ok: false, mode: "github-app", error: minted.error || "failed to mint installation token" };
  }
  const exp = minted.expiresAt ? Date.parse(minted.expiresAt) : Date.now() + 50 * 60 * 1000;
  cache.token = minted.token;
  cache.exp = Number.isFinite(exp) ? exp - 5 * 60 * 1000 : Date.now() + 50 * 60 * 1000;
  cache.installationId = installationId;
  return { ok: true, token: minted.token, mode: "github-app", note };
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
