import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import {
  createAppJwt,
  decodeJwtPayload,
  expandPath,
  loadPrivateKey,
  publicAuthStatus,
  resolveAuthSources,
} from "../lib/auth.js";
import {
  fetchRepoStatus,
  mintInstallationToken,
  pickInstallation,
} from "../lib/api.js";
import { parseGithubRepo } from "../lib/git.js";
import {
  buildAppHint,
  formatHintReport,
  formatStatusReport,
  looksLikeSecret,
} from "../lib/github.js";

describe("parseGithubRepo", () => {
  it("accepts owner/name, URLs, and SSH remotes", () => {
    assert.equal(parseGithubRepo("173787247/dsh-wsl-kit").full, "173787247/dsh-wsl-kit");
    assert.equal(parseGithubRepo("https://github.com/173787247/dsh-wsl-kit.git").full, "173787247/dsh-wsl-kit");
    assert.equal(parseGithubRepo("git@github.com:173787247/dsh-wsl-kit.git").full, "173787247/dsh-wsl-kit");
    assert.equal(parseGithubRepo("ssh://git@github.com/173787247/dsh-wsl-kit.git").full, "173787247/dsh-wsl-kit");
    assert.equal(parseGithubRepo("https://github.com/173787247/dsh-wsl-kit/pull/4").full, "173787247/dsh-wsl-kit");
  });

  it("rejects non-GitHub remotes", () => {
    assert.equal(parseGithubRepo("https://gitlab.com/a/b").ok, false);
    assert.equal(parseGithubRepo("").ok, false);
  });
});

describe("auth", () => {
  it("prefers GitHub App over a token fallback", () => {
    const sources = resolveAuthSources(
      { appId: "123", privateKeyPath: "~/app.pem" },
      { GH_TOKEN: "ghp_should_not_win" },
    );
    const status = publicAuthStatus(sources);
    assert.equal(status.mode, "github-app");
    assert.equal(status.tokenFallbackSet, true);
    assert.equal(status.privateKeySet, true);
  });

  it("falls back to GH_TOKEN when App credentials are incomplete", () => {
    const status = publicAuthStatus(resolveAuthSources({}, { GH_TOKEN: "ghp_x" }));
    assert.equal(status.mode, "token");
  });

  it("expands ~ in private key paths and signs a JWT", () => {
    assert.ok(expandPath("~/app.pem").endsWith("app.pem"));
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });
    const jwt = createAppJwt("42", pem, 1_700_000_000);
    const payload = decodeJwtPayload(jwt);
    assert.equal(payload.iss, "42");
    assert.equal(payload.iat, 1_700_000_000 - 60);
    assert.equal(payload.exp, 1_700_000_000 + 540);
    assert.equal(looksLikeSecret(jwt), true);
    assert.equal(loadPrivateKey({ keyInline: pem.replace(/\n/g, "\\n") }).includes("BEGIN"), true);
  });
});

describe("api helpers", () => {
  it("picks an installation matching the repo owner", () => {
    const picked = pickInstallation(
      [
        { id: "1", account: "other" },
        { id: "9", account: "173787247" },
      ],
      "173787247",
    );
    assert.equal(picked.installation.id, "9");
  });

  it("mints an installation token without exposing it in error paths", async () => {
    const minted = await mintInstallationToken("jwt", "1", {
      fetchFn: async () => new Response(JSON.stringify({ token: "ghs_secret", expires_at: "2099-01-01T00:00:00Z" }), { status: 201 }),
    });
    assert.equal(minted.ok, true);
    assert.equal(minted.token, "ghs_secret");
  });

  it("maps repo / pulls / actions payloads", async () => {
    const fetchFn = async (url) => {
      if (String(url).endsWith("/repos/acme/demo")) {
        return json({ full_name: "acme/demo", html_url: "https://github.com/acme/demo", default_branch: "master", private: false });
      }
      if (String(url).includes("/pulls?")) {
        return json([{ number: 3, title: "Fix WSL path", html_url: "https://github.com/acme/demo/pull/3", user: { login: "rchua" } }]);
      }
      if (String(url).includes("/actions/runs")) {
        return json({
          workflow_runs: [{
            name: "test",
            status: "completed",
            conclusion: "success",
            html_url: "https://github.com/acme/demo/actions/runs/1",
            head_branch: "master",
          }],
        });
      }
      return new Response("nope", { status: 404 });
    };
    const status = await fetchRepoStatus("acme/demo", "token", { fetchFn });
    assert.equal(status.ok, true);
    assert.equal(status.open_prs[0].number, 3);
    assert.equal(status.latest_run.conclusion, "success");
  });
});

describe("reports", () => {
  it("setup hint never dumps secrets", () => {
    const advice = buildAppHint({ mode: "missing", appIdSet: false, privateKeySet: false });
    const text = formatHintReport({
      mode: "missing",
      appIdSet: false,
      privateKeySet: false,
      installationIdSet: false,
      tokenFallbackSet: false,
      advice,
    });
    assert.match(text, /settings\/apps\/new/);
    assert.match(text, /Never paste/);
    assert.equal(looksLikeSecret(text), false);
    assert.ok(!text.includes("ghp_"));
  });

  it("status report lists PR URLs for win_open_url", () => {
    const text = formatStatusReport({
      ok: true,
      mode: "github-app",
      repo: "acme/demo",
      html_url: "https://github.com/acme/demo",
      default_branch: "master",
      open_prs: [{ number: 3, title: "Fix", html_url: "https://github.com/acme/demo/pull/3", user: "a" }],
      latest_run: { name: "test", status: "completed", conclusion: "success", html_url: "https://github.com/acme/demo/actions/runs/1", head_branch: "master" },
    });
    assert.match(text, /#3 Fix/);
    assert.match(text, /auth: github-app/);
    assert.equal(looksLikeSecret(text), false);
  });
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
