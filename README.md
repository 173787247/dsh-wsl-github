# dsh-wsl-github

DeepSeek Harness tools: **`github_app_hint`** + **`github_repo_status`** — GitHub App auth for the current repo’s open PRs and latest Actions run.

Part of **[dsh-wsl-kit](https://github.com/173787247/dsh-wsl-kit)**.

[中文说明 ↓](#中文)

---

## English

### Why

WSL agents already have `cred_hint` for **git push** credentials. They still need **GitHub API** for “what PRs are open?” and “did CI pass?” — without dumping a PAT into chat.

This plugin mints a short-lived **GitHub App installation token** in memory. Tool output never includes the private key, JWT, or token. Pair with [`dsh-wsl-browser`](https://github.com/173787247/dsh-wsl-browser) (`win_open_url`) to open returned `html_url`s on Windows.

It is intentionally small. It is not a 40-tool GitHub connector.

### Tools

| Tool | Role |
|------|------|
| `github_app_hint` | Whether App credentials are present, plus setup steps (no secrets) |
| `github_repo_status` | Open PRs (up to 5) + latest Actions run. `repo` optional; default is `git origin` |

### GitHub App setup

权限已写死在 [`github-app-manifest.json`](./github-app-manifest.json)，不必自己勾：

| Permission | Access | Why |
|---|---|---|
| **Metadata** | Read | 读仓库名、默认分支 |
| **Pull requests** | Read | 列出未关闭 PR |
| **Actions** | Read | 读最近一次 workflow run |
| Webhook | Off | 本插件轮询 API，不收事件 |
| Where can this app be installed? | Only this account（开发时） | 清单里 `public: false` |

最快：在本目录运行下面命令，浏览器会打开 GitHub 创建页（权限已预填）。点 **Create GitHub App** 后，脚本把 App ID 和 PEM 写到 `~/.dsh/`，**不会**把密钥打到终端。

```sh
npm run register-app
```

然后：

1. 打开终端里打印的 **Install** 链接，装到你自己的账号（可选全部仓库或只选几个）。
2. 加载环境变量：

```sh
set -a
source "$HOME/.dsh/dsh-wsl-github.env"
set +a
```

Windows PowerShell：

```powershell
Get-Content "$HOME\.dsh\dsh-wsl-github.env" | ForEach-Object {
  if ($_ -match '^(GITHUB_[A-Z_]+)=(.*)$') { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] }
}
```

3. 不要把 PEM 提交进 git，也不要贴进 DSH 聊天。
4. API 通了之后，打开 [github.com/developer/register](https://github.com/developer/register) 加入 [GitHub Developer Program](https://docs.github.com/en/integrations/concepts/github-developer-program)。

手动创建（不用脚本）时打开 [Register a GitHub App](https://github.com/settings/apps/new)，Homepage 填 `https://github.com/173787247/dsh-wsl-kit`，按上表勾权限，关掉 webhook，生成私钥，再：

```sh
export GITHUB_APP_ID=123456
export GITHUB_APP_PRIVATE_KEY_PATH="$HOME/.dsh/dsh-wsl-github.pem"
```

`GITHUB_TOKEN` / `GH_TOKEN` 只适合本机冒烟，不是正式鉴权。

### Install

```sh
dsh plugin --profile web add github:173787247/dsh-wsl-github
```

Restart `dsh web` and open a **new** session.

### Config

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

### Test

```sh
npm test
```

### License

MIT

---

## 中文

### 为什么需要

`cred_hint` 管的是 **git 推送凭据**。Agent 还需要 **GitHub API**：当前仓库开着哪些 PR、最近一次 Actions 是否绿。不要把 PAT 贴进对话。

本插件用 **GitHub App** 在内存里换短期 installation token，工具输出不含私钥 / JWT / token。PR 链接用现有的 `win_open_url` 在 Windows 浏览器打开。

刻意做小：不是通用 GitHub 连接器。

### 工具

| 工具 | 作用 |
|------|------|
| `github_app_hint` | 是否已配置 App，以及怎么配（不回传密钥） |
| `github_repo_status` | 未关闭 PR（最多 5 条）+ 最近一次 Actions。可传 `repo`，默认 `git origin` |

### 安装

```sh
dsh plugin --profile web add github:173787247/dsh-wsl-github
```

### 创建 GitHub App

本目录执行 `npm run register-app`，浏览器会打开 GitHub，权限已预填（Metadata / Pull requests / Actions 只读，webhook 关闭）。点 Create 后，App ID 和 PEM 写入 `~/.dsh/`，不要贴进聊天。

然后安装到自己的账号，加载 `~/.dsh/dsh-wsl-github.env`，再打开 https://github.com/developer/register 。

### 许可

MIT
