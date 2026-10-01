/**
 * GitHub workflow-dispatch helper (D-01, D-02, D-04, D-05).
 *
 * Sends exactly one POST asking GitHub to start the "Scrape promos" workflow
 * on main with the morning odds/profit step forced on. The token must be a
 * fine-grained PAT scoped to this repo with Actions read and write. It is
 * only ever placed in the Authorization header: never logged or returned.
 * No retries (D-05): failure is logged and reported to the caller.
 */

export type DispatchResult = { ok: true } | { ok: false; status?: number };

export const DEFAULT_GH_REPO = "btorio15/promoprofit";
const WORKFLOW_FILE = "scrape-promos.yml";
const REF = "main";

export async function dispatchScrapeWorkflow(opts: {
  token: string;
  repo?: string;
  fetchImpl?: typeof fetch;
}): Promise<DispatchResult> {
  const repo = opts.repo ?? DEFAULT_GH_REPO;
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${opts.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "promoprofit-cron",
        "Content-Type": "application/json",
      },
      // workflow_dispatch inputs are strings; the workflow compares == 'true'.
      body: JSON.stringify({ ref: REF, inputs: { force_morning_observe: "true" } }),
      cache: "no-store",
    });

    if (res.ok) return { ok: true };

    let snippet = "";
    try {
      snippet = (await res.text()).slice(0, 200);
    } catch {
      snippet = "";
    }
    console.error("githubDispatch failed:", res.status, snippet);
    return { ok: false, status: res.status };
  } catch (err) {
    console.error(
      "githubDispatch failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return { ok: false };
  }
}
