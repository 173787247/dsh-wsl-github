export function buildAppHint(status) {
  const advice = [
    "Never paste a GitHub App private key, JWT, or access token into chat or the system prompt.",
    "Prefer a GitHub App (this plugin) over a personal access token. Use cred_hint for git push credentials.",
    "Create the app at https://github.com/settings/apps/new — Homepage URL can be https://github.com/173787247/dsh-wsl-kit.",
    "Disable webhooks. Permissions: Metadata read, Pull requests read, Actions read. Install on your account.",
    "Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH (PEM file, not in git). Optional: GITHUB_APP_INSTALLATION_ID.",
    "After github_repo_status, open html_url with win_open_url to view the PR or Actions run in the Windows browser.",
  ];
  if (status.mode === "github-app") {
    advice.push("GitHub App credentials are present. Installation access tokens are minted in memory and never returned to the model.");
  } else if (status.mode === "token") {
    advice.push("Falling back to GH_TOKEN/GITHUB_TOKEN. Fine for a local smoke test; switch to a GitHub App for the Developer Program.");
  } else {
    advice.push("No GitHub App credentials yet. github_repo_status will fail until App ID + private key (or a token fallback) are set.");
  }
  if (status.appIdSet && !status.privateKeySet) {
    advice.push("App ID is set but the private key is missing.");
  }
  return advice;
}

export function formatHintReport(value) {
  const lines = [
    "github_app_hint",
    `mode: ${value.mode}`,
    `appIdSet: ${value.appIdSet}`,
    `privateKeySet: ${value.privateKeySet}`,
    `installationIdSet: ${value.installationIdSet}`,
    `tokenFallbackSet: ${value.tokenFallbackSet}`,
  ];
  for (const tip of value.advice || []) lines.push(`- ${tip}`);
  return lines.join("\n");
}

export function formatStatusReport(value) {
  if (!value.ok) {
    return `github_repo_status failed: ${value.error || "unknown error"}`;
  }
  const lines = [
    `repo: ${value.repo}`,
    `url: ${value.html_url}`,
    `default_branch: ${value.default_branch || "(unknown)"}`,
    `auth: ${value.mode}`,
  ];
  const prs = value.open_prs || [];
  if (prs.length === 0) {
    lines.push("open_prs: (none)");
  } else {
    lines.push("open_prs:");
    for (const pr of prs) {
      lines.push(`  #${pr.number} ${pr.title} ${pr.html_url}`);
    }
  }
  const run = value.latest_run || {};
  if (run.html_url) {
    lines.push(`latest_run: ${run.name} ${run.status}/${run.conclusion || "pending"} ${run.html_url}`);
  } else {
    lines.push("latest_run: (none)");
  }
  if (value.pulls_error) lines.push(`pulls_note: ${value.pulls_error}`);
  if (value.actions_error) lines.push(`actions_note: ${value.actions_error}`);
  if (value.advice) lines.push(value.advice);
  return lines.join("\n");
}

export function looksLikeSecret(text) {
  return /BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|ghp_|github_pat_|ghs_/i.test(String(text || ""));
}
