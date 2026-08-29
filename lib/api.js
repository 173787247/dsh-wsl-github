export const API_BASE = "https://api.github.com";
export const USER_AGENT = "dsh-wsl-github";

export function ghHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function ghJson(url, { token, method = "GET", fetchFn = fetch, signal, body } = {}) {
  const res = await fetchFn(url, {
    method,
    headers: ghHeaders(token),
    signal,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 200) };
    }
  }
  if (!res.ok) {
    const message = data && typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: message };
  }
  return { ok: true, status: res.status, data };
}

export async function listInstallations(jwt, { fetchFn = fetch, signal, apiBase = API_BASE } = {}) {
  const res = await ghJson(`${apiBase}/app/installations`, { token: jwt, fetchFn, signal });
  if (!res.ok) return res;
  const rows = Array.isArray(res.data) ? res.data : [];
  return {
    ok: true,
    status: res.status,
    installations: rows.map((row) => ({
      id: String(row.id ?? ""),
      account: String(row.account?.login ?? ""),
    })),
  };
}

export function pickInstallation(installations, owner = "") {
  const rows = Array.isArray(installations) ? installations.filter((i) => i.id) : [];
  if (rows.length === 0) return { ok: false, error: "GitHub App is not installed on any account" };
  const want = String(owner || "").toLowerCase();
  if (want) {
    const match = rows.find((i) => i.account.toLowerCase() === want);
    if (match) return { ok: true, installation: match, note: "" };
  }
  const first = rows[0];
  const note = rows.length > 1
    ? `Multiple installations; using ${first.account || first.id}. Set installationId to pin one.`
    : "";
  return { ok: true, installation: first, note };
}

export async function mintInstallationToken(jwt, installationId, { fetchFn = fetch, signal, apiBase = API_BASE } = {}) {
  const res = await ghJson(
    `${apiBase}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    { token: jwt, method: "POST", fetchFn, signal },
  );
  if (!res.ok) return res;
  const token = String(res.data?.token || "");
  if (!token) return { ok: false, error: "GitHub App returned an empty installation token" };
  return {
    ok: true,
    token,
    expiresAt: String(res.data?.expires_at || ""),
  };
}

export async function fetchRepoStatus(full, token, { fetchFn = fetch, signal, apiBase = API_BASE } = {}) {
  const repoRes = await ghJson(`${apiBase}/repos/${full}`, { token, fetchFn, signal });
  if (!repoRes.ok) return repoRes;
  const pullsRes = await ghJson(
    `${apiBase}/repos/${full}/pulls?state=open&per_page=5&sort=updated`,
    { token, fetchFn, signal },
  );
  const runsRes = await ghJson(
    `${apiBase}/repos/${full}/actions/runs?per_page=1`,
    { token, fetchFn, signal },
  );
  const repo = repoRes.data || {};
  const pulls = pullsRes.ok && Array.isArray(pullsRes.data) ? pullsRes.data : [];
  const runs = runsRes.ok && Array.isArray(runsRes.data?.workflow_runs) ? runsRes.data.workflow_runs : [];
  const run = runs[0] || null;
  return {
    ok: true,
    repo: String(repo.full_name || full),
    html_url: String(repo.html_url || ""),
    default_branch: String(repo.default_branch || ""),
    private: Boolean(repo.private),
    open_prs: pulls.map((pr) => ({
      number: Number(pr.number) || 0,
      title: String(pr.title || ""),
      html_url: String(pr.html_url || ""),
      user: String(pr.user?.login || ""),
    })),
    latest_run: run
      ? {
        name: String(run.name || ""),
        status: String(run.status || ""),
        conclusion: String(run.conclusion || ""),
        html_url: String(run.html_url || ""),
        head_branch: String(run.head_branch || ""),
      }
      : { name: "", status: "", conclusion: "", html_url: "", head_branch: "" },
    pulls_error: pullsRes.ok ? "" : pullsRes.error,
    actions_error: runsRes.ok ? "" : runsRes.error,
  };
}
