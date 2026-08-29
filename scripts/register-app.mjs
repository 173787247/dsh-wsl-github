#!/usr/bin/env node
/**
 * Register the GitHub App from github-app-manifest.json via GitHub's manifest flow.
 * Writes App ID + PEM to ~/.dsh (never prints secrets).
 *
 * https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const PORT = Number(process.env.DSH_GITHUB_APP_PORT) || 8765;
const HOST = "127.0.0.1";
const ROOT = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(ROOT, "..", "github-app-manifest.json");
const DIR = join(homedir(), ".dsh");
const PEM_PATH = join(DIR, "dsh-wsl-github.pem");
const ENV_PATH = join(DIR, "dsh-wsl-github.env");

const baseManifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const redirectUrl = `http://${HOST}:${PORT}/callback`;
const manifest = { ...baseManifest, redirect_url: redirectUrl };

const formHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>Register dsh-wsl-github</title></head>
<body>
  <p>正在跳转到 GitHub 创建 App（权限已预填：Metadata / Pull requests / Actions 只读）…</p>
  <form id="f" action="https://github.com/settings/apps/new" method="post">
    <input type="hidden" name="manifest" id="manifest">
  </form>
  <script>
    document.getElementById("manifest").value = ${JSON.stringify(JSON.stringify(manifest))};
    document.getElementById("f").submit();
  </script>
</body>
</html>`;

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

function page(title, body) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:40rem;margin:2rem auto;line-height:1.5">
${body}
</body></html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (url.pathname === "/" || url.pathname === "/start") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(formHtml);
    return;
  }
  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
    res.end(page("缺少 code", "<p>GitHub 没有返回 code。请关掉本页，重新运行 <code>npm run register-app</code>。</p>"));
    return;
  }
  try {
    const converted = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "dsh-wsl-github-register",
      },
    });
    const data = await converted.json();
    if (!converted.ok) {
      throw new Error(data.message || `HTTP ${converted.status}`);
    }
    mkdirSync(DIR, { recursive: true });
    writeFileSync(PEM_PATH, String(data.pem || ""), { mode: 0o600 });
    writeFileSync(
      ENV_PATH,
      [
        `GITHUB_APP_ID=${data.id}`,
        `GITHUB_APP_PRIVATE_KEY_PATH=${PEM_PATH.replace(/\\/g, "/")}`,
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    const slug = data.slug || "dsh-wsl-github";
    const installUrl = `https://github.com/apps/${slug}/installations/new`;
    const settingsUrl = data.html_url || `https://github.com/settings/apps/${slug}`;
    console.log("");
    console.log("GitHub App created.");
    console.log(`  App ID:  ${data.id}`);
    console.log(`  slug:    ${slug}`);
    console.log(`  PEM:     ${PEM_PATH}`);
    console.log(`  env:     ${ENV_PATH}`);
    console.log("");
    console.log("Next:");
    console.log(`  1. Install the app on your account: ${installUrl}`);
    console.log(`  2. source the env file (or copy the two exports into your shell)`);
    console.log(`  3. Join Developer Program: https://github.com/developer/register`);
    console.log("");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page("App 已创建", `
      <h1>dsh-wsl-github App 已创建</h1>
      <p>App ID <strong>${data.id}</strong> 已写入 <code>${ENV_PATH}</code>。私钥在 <code>${PEM_PATH}</code>（不会出现在此页）。</p>
      <ol>
        <li><a href="${installUrl}">安装到你的 GitHub 账号</a>（选你自己的仓库即可）</li>
        <li>在 WSL / 终端里执行：<pre>set -a; source ${ENV_PATH.replace(/\\/g, "/")}; set +a</pre></li>
        <li>然后打开 <a href="https://github.com/developer/register">GitHub Developer Program</a></li>
      </ol>
      <p>App 设置：<a href="${settingsUrl}">${settingsUrl}</a></p>
      <p>可以关掉这个窗口，并结束终端里的 register-app。</p>
    `));
    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
    res.end(page("转换失败", `<p>${msg}</p><p>请在一小时内完成，并重新运行 <code>npm run register-app</code>。</p>`));
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/start`;
  console.log("Opening GitHub App registration…");
  console.log(`If the browser does not open, visit: ${url}`);
  console.log("Permissions (pre-filled): Metadata read, Pull requests read, Actions read. Webhook off.");
  console.log("On GitHub: keep the name (or rename if taken) → Create GitHub App.");
  openBrowser(url);
});
