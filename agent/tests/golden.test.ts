/**
 * Golden tests over the precomputed showcase fixtures (agent/data/cache).
 * No LLM key needed — these pin the *shape and grounding* of what the agent
 * ships: schema validity, evidence citations that really exist in the corpus,
 * dossier completeness, and issue-payload generation.
 *
 * Run: npm test   (tsx tests/golden.test.ts)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus, type Analysis, type Impact, type Modernization } from "../src/pipeline.js";
import {
  validateAnalysis, validateImpact, validateModernization,
  verifyImpactEvidence, verifyRuleSources,
} from "../src/verify.js";
import { buildDossier, buildIssuePayloads } from "../src/tools.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, "..", "data", "cache");

let failures = 0;
const ok = (cond: boolean, name: string, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const files = loadCorpus();
ok(files.length >= 2, "corpus loads", `${files.length} files`);

const cacheFiles = fs.readdirSync(CACHE).filter((f) => f.endsWith(".json"));
const analyses = cacheFiles.filter((f) => f.startsWith("analyze-"));
const impacts = cacheFiles.filter((f) => f.startsWith("impact-"));
const moderns = cacheFiles.filter((f) => f.startsWith("modern-"));
ok(analyses.length >= 1, "analyze fixture present");
ok(impacts.length >= 3, "3 showcase impact fixtures present", String(impacts.length));
ok(moderns.length >= 3, "3 showcase modernization fixtures present", String(moderns.length));

const read = <T>(f: string) => JSON.parse(fs.readFileSync(path.join(CACHE, f), "utf8")) as T;

// ---- analyze: schema + every rule cites a real location ----
for (const f of analyses) {
  const a = read<Analysis>(f);
  const errs = validateAnalysis(a);
  ok(errs.length === 0, `analyze schema (${f})`, errs.slice(0, 3).join("; "));
  const src = verifyRuleSources(files, a);
  ok(src.verified === src.checked, `rule source citations all valid (${f})`,
    `${src.verified}/${src.checked}${src.failed.length ? " — " + src.failed[0].reason : ""}`);
  ok(a.rules.length >= 15, "rule count sane", `${a.rules.length} rules`);
  ok(a.rules.some((r) => r.risk === "high"), "high-risk archaeology surfaced");
}

// ---- impact: schema + verified evidence + regression contract + plan ----
const analysis = read<Analysis>(analyses[0]);
for (const f of impacts) {
  const imp = read<Impact>(f);
  const errs = validateImpact(imp);
  ok(errs.length === 0, `impact schema (${f})`, errs.slice(0, 3).join("; "));
  const ev = verifyImpactEvidence(files, imp);
  ok(ev.verified / ev.checked >= 0.7, `≥70% evidence quotes verified in source (${f})`,
    `${ev.verified}/${ev.checked}`);
  ok(imp.untouched.length >= 3, "regression contract non-trivial", `${imp.untouched.length} pinned rules`);
  ok(imp.plan.length >= 3 && imp.plan.every((p, i) => p.step === i + 1), "plan ordered 1..n");

  // ---- dossier + issue payloads build from every impact ----
  const dossier = buildDossier(analysis, imp, null);
  ok(dossier.includes("## Rollback plan") && dossier.includes("## Regression contract"), "dossier has rollback + contract");
  const ruleTitle = (id: string) => analysis.rules.find((r) => r.id === id)?.title ?? id;
  const payloads = buildIssuePayloads(imp.change, imp, ruleTitle);
  ok(payloads.length === imp.plan.length, "one issue payload per plan step");
  ok(payloads.every((p) => p.body.includes("Acceptance") && p.body.includes("Regression contract")), "payloads carry acceptance criteria");
}

// ---- modernize: schema + tests attached + real line ranges ----
const maxLoc = Math.max(...files.map((f) => f.content.split("\n").length));
for (const f of moderns) {
  const m = read<Modernization>(f);
  const errs = validateModernization(m);
  ok(errs.length === 0, `modernization schema (${f})`, errs.slice(0, 3).join("; "));
  ok(m.modules.every((x) => x.tests.length > 100), "every module carries characterization tests");
  ok(m.modules.every((x) => x.cobolLines[0] >= 1 && x.cobolLines[1] <= maxLoc + 50), "module line ranges plausible");
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall golden checks passed");
process.exit(failures ? 1 : 0);
