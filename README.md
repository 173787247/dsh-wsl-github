# dsh-wsl-github
> **Install set:** part of [dsh-wsl-kit](https://github.com/173787247/dsh-wsl-kit). Prefer `KIT_SET=daily` | `llm` | `github` | `full` (see kit README). Fault tree: [TROUBLESHOOTING.md](https://github.com/173787247/dsh-wsl-kit/blob/master/docs/TROUBLESHOOTING.md).


DeepSeek Harness tools: **`github_app_hint`** + **`github_repo_status`** — GitHub App auth for the current repo’s open PRs and latest Actions run.

Part of **[dsh-wsl-kit](https://github.com/173787247/dsh-wsl-kit)**.

[中文说明 → README.zh.md](./README.zh.md)

---

## Why this plugin exists

WSL agents already have [`dsh-wsl-cred`](https://github.com/173787247/dsh-wsl-cred) (`cred_hint`) for **git push** credentials. They still need the **GitHub API** for “what PRs are open?” and “did CI pass?”—without dumping a PAT into chat.

This plugin mints a short-lived **GitHub App installation token** in memory. Tool output never includes the private key, JWT, or token. Pair with [`dsh-wsl-browser`](https://github.com/173787247/dsh-wsl-browser) (`win_open_url`) to open returned `html_url`s on Windows.

It is intentionally small. It is **not** a 40-tool GitHub connector.

## How it fits dsh-wsl-kit

DSH in **WSL** + Chat in a **Windows** browser is the kit’s home turf. GitHub work splits across plugins:

| Job | Plugin | Tool |
|-----|--------|------|
| Push / HTTPS credentials | [dsh-wsl-cred](https://github.com/173787247/dsh-wsl-cred) | `cred_hint` |
| API: open PRs + latest Actions | **this plugin** | `github_app_hint`, `github_repo_status` |
| Open PR / Actions in Windows | [dsh-wsl-browser](https://github.com/173787247/dsh-wsl-browser) | `win_open_url` |
| Proxy / Node 24 fetch issues | [dsh-wsl-net](https://github.com/173787247/dsh-wsl-net) | `net_doctor` |

**Why the kit path is convenient**

- One install pack (`dsh-wsl-kit` / `install.sh`) instead of ad-hoc PAT wiring.
- Secrets stay on disk under `~/.dsh/` and in process memory—not in Trajectory.
- Same mental model as the rest of the kit: small tools, clear OS boundary.
- Enough of a real GitHub App integration to join the [GitHub Developer Program](https://docs.github.com/en/integrations/concepts/github-developer-program).

Suite overview: [dsh-wsl-kit README](https://github.com/173787247/dsh-wsl-kit#readme).

## Tools

| Tool | Role |
|------|------|
| `github_app_hint` | Whether App credentials are present, plus setup steps (no secrets) |
| `github_repo_status` | Open PRs (up to 5) + latest Actions run. `repo` optional; default is `git origin` |

## End-to-end usage (WSL)

1. **Install the plugin** (with the kit or alone):

```sh
dsh plugin --profile web add github:173787247/dsh-wsl-github
```

2. **Register the GitHub App once** (permissions are pre-filled from [`github-app-manifest.json`](./github-app-manifest.json)):

```sh
npm run register-app
```

On GitHub: keep or rename the app → **Create GitHub App**. The script writes App ID + PEM to `~/.dsh/` and does **not** print secrets.

| Permission | Access | Why |
|------------|--------|-----|
| **Metadata** | Read | Repo name, default branch |
| **Pull requests** | Read | List open PRs |
| **Actions** | Read | Latest workflow run |
| Webhook | Off | This plugin polls the API; it does not receive events |
| Install scope | Private app (`public: false`) | Install on your account while developing |

3. **Install the App** on your GitHub account (link printed by the script, or [apps/dsh-wsl-github](https://github.com/apps/dsh-wsl-github)). Choose **All repositories** or only the repos you need.

4. **Load env before `dsh web`** (WSL / bash):

```sh
set -a
source "$HOME/.dsh/dsh-wsl-github.env"
set +a
dsh web
```

Windows PowerShell (if you start DSH from Windows):

```powershell
Get-Content "$HOME\.dsh\dsh-wsl-github.env" | ForEach-Object {
  if ($_ -match '^(GITHUB_[A-Z_]+)=(.*)$') { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] }
}
```

5. Open a **new** session. Ask the agent:

   - “Run `github_app_hint`.”
   - “Run `github_repo_status` for this repo.”
   - “Open that `html_url` with `win_open_url`.”

If HTTPS to GitHub fails, run `net_doctor`. If `git push` fails, run `cred_hint`—that is a different problem from this plugin.

Manual App creation (no script): [Register a GitHub App](https://github.com/settings/apps/new), Homepage `https://github.com/173787247/dsh-wsl-kit`, same permissions as the table, webhook off, then:

```sh
export GITHUB_APP_ID=123456
export GITHUB_APP_PRIVATE_KEY_PATH="$HOME/.dsh/dsh-wsl-github.pem"
```

`GITHUB_TOKEN` / `GH_TOKEN` is a last-resort smoke-test fallback, not the intended auth.

Optional: after the App can call the API, join the Developer Program at [github.com/developer/register](https://github.com/developer/register) (product website can be this kit or plugin repo URL).

## Config

```yaml
- id: dsh-wsl-github
  name: dsh-wsl-github
  config:
    timeoutMs: 20000
    appId: ""
    privateKeyPath: ""
    installationId: ""
```

Empty strings mean “read from env”. A later profile `config` object **replaces** the whole block.

## Test

```sh
npm test
```

## License

MIT
