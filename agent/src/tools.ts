import https from "node:https";
import type { Analysis, Impact, Modernization } from "./pipeline.js";

/**
 * Real tool execution: turn the impact plan into GitHub issues.
 * Two modes:
 *   dry-run  — build the exact payloads, create nothing (default without a token)
 *   live     — POST to the GitHub REST API, return the created issue URLs
 * Config: GITHUB_TOKEN (fine-grained, issues:write) + GITHUB_REPO ("owner/repo").
 */

export interface IssuePayload { title: string; body: string; labels: string[] }
export interface IssueResult { dryRun: boolean; repo: string; issues: { title: string; url?: string; number?: number }[]; payloads: IssuePayload[] }

const GH_TOKEN = process.env.GITHUB_TOKEN ?? "";
const GH_REPO = process.env.GITHUB_REPO ?? "";

export function githubConfigured(): boolean {
  return GH_TOKEN.length > 0 && /^[\w.-]+\/[\w.-]+$/.test(GH_REPO);
}

export function buildIssuePayloads(change: string, imp: Impact, ruleTitle: (id: string) => string): IssuePayload[] {
  return (imp.plan ?? []).map((p) => {
    const hits = (imp.blastRadius ?? [])
      .filter((b) => p.detail.includes(ruleTitle(b.ruleId)) || b.why.includes(p.where) || p.where.includes(b.evidence.file))
      .slice(0, 3);
    const evid = (hits.length ? hits : (imp.blastRadius ?? []).slice(0, 2))
      .map((b) => `- [${b.severity.toUpperCase()}] ${ruleTitle(b.ruleId)} — \`${b.evidence.file}\` L${b.evidence.lines[0]}-${b.evidence.lines[1]}${b.evidence.verified ? " ✓verified" : ""}`)
      .join("\n");
    return {
      title: `[STRATA] Step ${p.step}: ${p.action} (${p.where})`,
      body: [
        `**Change:** ${imp.change || change}`,
        ``,
        p.detail,
        ``,
        `**Blast-radius evidence**`,
        evid,
        ``,
        `**Acceptance**`,
        `- [ ] Change implemented at \`${p.where}\``,
        `- [ ] Characterization tests pass for every approved module`,
        `- [ ] Regression contract holds: ${imp.untouched?.length ?? 0} pinned rules verified unchanged`,
        ``,
        `_Filed by STRATA — human-approved change dossier. Step ${p.step}/${imp.plan.length}._`,
      ].join("\n"),
      labels: ["strata", "legacy-change"],
    };
  });
}

function ghPost(pathName: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: "api.github.com", path: pathName, method: "POST",
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          "User-Agent": "strata-agent",
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        }, timeout: 20_000 },
      (res) => {
        let out = "";
        res.on("data", (d) => (out += d));
        res.on("end", () => {
          try { resolve({ status: res.statusCode ?? 0, json: JSON.parse(out || "{}") }); }
          catch { resolve({ status: res.statusCode ?? 0, json: {} }); }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("github timeout")));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

export async function fileGithubIssues(
  change: string, imp: Impact, ruleTitle: (id: string) => string, dryRun: boolean,
): Promise<IssueResult> {
  const payloads = buildIssuePayloads(change, imp, ruleTitle);
  const wantLive = !dryRun && githubConfigured();
  const result: IssueResult = { dryRun: !wantLive, repo: GH_REPO || "(unconfigured — dry run)", issues: [], payloads };
  if (!wantLive) {
    result.issues = payloads.map((p) => ({ title: p.title }));
    return result;
  }
  for (const p of payloads) {
    const r = await ghPost(`/repos/${GH_REPO}/issues`, p);
    if (r.status === 201) result.issues.push({ title: p.title, url: String(r.json.html_url), number: Number(r.json.number) });
    else result.issues.push({ title: `${p.title} — FAILED (${r.status})` });
  }
  return result;
}

// ---------- server-side dossier (markdown) — the conversation-first artifact ----------

export function buildDossier(
  analysis: Analysis, imp: Impact, modern: Modernization | null, opts?: { issueLinks?: { title: string; url?: string }[] },
): string {
  const ruleTitle = (id: string) => analysis.rules.find((r) => r.id === id)?.title ?? id;
  const L: string[] = [
    `# STRATA Change Dossier`,
    ``,
    `- **System:** ${analysis.summary.headline}`,
    `- **Change:** ${imp.change}`,
    `- **Interpretation:** ${imp.interpretation}`,
    imp.evidenceCheck ? `- **Evidence check:** ${imp.evidenceCheck.verified}/${imp.evidenceCheck.checked} citations passed the source check (failed citations are flagged)` : ``,
    ``,
    `## Blast radius (${imp.blastRadius.length})`,
    ...imp.blastRadius.map((b) =>
      `- **[${b.severity.toUpperCase()}] ${ruleTitle(b.ruleId)}** — ${b.why}\n  - evidence: \`${b.evidence.file}\` L${b.evidence.lines[0]}-${b.evidence.lines[1]}${b.evidence.verified ? " ✓checked" : " ⚑flagged"}: "${b.evidence.quote}"`),
    ``,
    `## Regression contract — must NOT change (${imp.untouched.length})`,
    ...imp.untouched.map((id) => `- ${ruleTitle(id)}`),
    ``,
    `## Plan`,
    ...imp.plan.map((p) => `${p.step}. **${p.action}** @ ${p.where} — ${p.detail}`),
    ``,
    `## Risks`,
    ...imp.risks.map((r) => `- ⚠ ${r}`),
    ``,
    `## Rollback plan`,
    `Revert plan steps in reverse order (${imp.plan.length} → 1); the characterization tests pin today's behavior, so a green run confirms the pre-change state. The regression contract above is the rollback verification checklist.`,
  ];
  if (opts?.issueLinks?.length) {
    L.push(``, `## Execution assets — GitHub issues`);
    for (const i of opts.issueLinks) L.push(i.url ? `- [${i.title}](${i.url})` : `- ${i.title} (dry-run payload ready)`);
  }
  if (modern?.modules.length) {
    L.push(``, `## Modernization modules (proposed — human approval required)`);
    for (const m of modern.modules) L.push(`- **${m.title}** replaces ${m.paragraph} (L${m.cobolLines[0]}-${m.cobolLines[1]}) — TypeScript + characterization tests included`);
  }
  L.push(``, `---`, `STRATA proposes; people approve. Nothing ships without a recorded human decision.`);
  return L.filter((x) => x !== undefined).join("\n");
}
