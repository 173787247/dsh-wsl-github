# Changelog

## 0.2.0

- `github_app_hint`: detect `~/.dsh/dsh-wsl-github.env` existence only (never read PEM); missing env points to kit example; present env advises `source` + `restart-dsh-web.sh`.
- Advice covers role split vs `cred_hint` / `ssh_agent_hint` / `win_open_url`.
- Pure helpers `githubEnvPath` / `detectGithubEnvFile`; unit tests for env injection.

## 0.1.0

- Initial public release of `dsh-wsl-github` for DeepSeek Harness on Windows + WSL.
