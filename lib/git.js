const GITHUB_HOST = /(^|\.)github\.com$/i;

export function parseGithubRepo(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, error: "empty repo" };

  const ownerRepo = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (ownerRepo && !text.includes("://") && !text.includes("@")) {
    return pack(ownerRepo[1], ownerRepo[2]);
  }

  const ssh = text.match(/^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (ssh && GITHUB_HOST.test(ssh[1])) {
    return pack(ssh[2], ssh[3]);
  }

  try {
    const withScheme = text.startsWith("git@") ? "" : (text.includes("://") ? text : `https://${text}`);
    if (!withScheme) return { ok: false, error: "not a GitHub repo" };
    const u = new URL(withScheme.replace(/^ssh:\/\//i, "https://"));
    if (!GITHUB_HOST.test(u.hostname.replace(/^www\./i, ""))) {
      return { ok: false, error: "only github.com remotes are supported" };
    }
    const parts = u.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (parts.length < 2) return { ok: false, error: "not a GitHub repo" };
    return pack(parts[0], parts[1]);
  } catch {
    return { ok: false, error: "not a GitHub repo" };
  }
}

function pack(owner, repo) {
  const name = String(repo).replace(/\.git$/i, "");
  if (!owner || !name) return { ok: false, error: "not a GitHub repo" };
  return { ok: true, owner, repo: name, full: `${owner}/${name}` };
}
