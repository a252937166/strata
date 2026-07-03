import type { Analysis, Impact, Modernization, SourceFile } from "./pipeline.js";

/**
 * Evidence verifier — the anti-hallucination layer.
 * Every line citation the model makes is checked against the actual source:
 *   1. the cited file must exist,
 *   2. the cited line range must be inside the file,
 *   3. the quoted text must actually appear within the cited lines (whitespace-normalized).
 * Failed citations are flagged, never silently trusted.
 */

export interface EvidenceCheck {
  checked: number;
  verified: number;
  failed: { where: string; reason: string }[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function quoteInLines(files: SourceFile[], file: string, lines: [number, number], quote: string): string | null {
  const f = files.find((x) => x.name === file);
  if (!f) return `file "${file}" not in corpus`;
  const all = f.content.split("\n");
  const [a, b] = lines;
  if (!(a >= 1 && b >= a && a <= all.length)) return `line range [${a},${b}] outside 1..${all.length}`;
  const window = norm(all.slice(a - 1, Math.min(b, all.length)).join(" "));
  const q = norm(quote);
  if (!q) return "empty quote";
  if (window.includes(q)) return null;
  // tolerate small paraphrase: 80% of quote tokens must appear in the window
  const toks = q.split(" ").filter((t) => t.length > 2);
  if (toks.length >= 3) {
    const hitRate = toks.filter((t) => window.includes(t)).length / toks.length;
    if (hitRate >= 0.8) return null;
  }
  return "quote not found within cited lines";
}

/** Annotates impact.blastRadius[].evidence with {verified} and returns stats. */
export function verifyImpactEvidence(files: SourceFile[], imp: Impact): EvidenceCheck {
  const res: EvidenceCheck = { checked: 0, verified: 0, failed: [] };
  for (const b of imp.blastRadius ?? []) {
    res.checked++;
    const err = quoteInLines(files, b.evidence.file, b.evidence.lines, b.evidence.quote);
    (b.evidence as { verified?: boolean }).verified = !err;
    if (err) res.failed.push({ where: `${b.ruleId} @ ${b.evidence.file}`, reason: err });
    else res.verified++;
  }
  return res;
}

/** Checks every rule's source citation range exists in the corpus. */
export function verifyRuleSources(files: SourceFile[], analysis: Analysis): EvidenceCheck {
  const res: EvidenceCheck = { checked: 0, verified: 0, failed: [] };
  for (const r of analysis.rules ?? []) {
    res.checked++;
    const f = files.find((x) => x.name === r.source.file);
    const n = f ? f.content.split("\n").length : 0;
    const [a, b] = r.source.lines;
    if (f && a >= 1 && b >= a && a <= n) res.verified++;
    else res.failed.push({ where: `${r.id} @ ${r.source.file}`, reason: f ? `lines [${a},${b}] outside 1..${n}` : "file missing" });
  }
  return res;
}

// ---------- runtime schema validation (hand-rolled: zero deps, node16-safe) ----------

type Err = string[];
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isArr = Array.isArray;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !isArr(v);

function pair(v: unknown): v is [number, number] {
  return isArr(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
}

export function validateAnalysis(v: unknown): Err {
  const e: Err = [];
  if (!isObj(v)) return ["analysis: not an object"];
  if (!isObj(v.summary) || !isStr((v.summary as Record<string, unknown>).headline)) e.push("summary.headline missing");
  if (!isArr(v.rules) || !v.rules.length) e.push("rules: empty");
  else v.rules.forEach((r, i) => {
    if (!isObj(r) || !isStr(r.id) || !isStr(r.title) || !isStr(r.plainEnglish)) e.push(`rules[${i}]: id/title/plainEnglish`);
    else if (!isObj(r.source) || !isStr((r.source as Record<string, unknown>).file) || !pair((r.source as Record<string, unknown>).lines)) e.push(`rules[${i}].source`);
  });
  if (!isArr(v.nodes) || !v.nodes.length) e.push("nodes: empty");
  if (!isArr(v.edges)) e.push("edges: missing");
  return e;
}

const SEVS = new Set(["direct", "indirect", "verify"]);

export function validateImpact(v: unknown): Err {
  const e: Err = [];
  if (!isObj(v)) return ["impact: not an object"];
  if (!isStr(v.interpretation)) e.push("interpretation missing");
  if (!isArr(v.blastRadius) || !v.blastRadius.length) e.push("blastRadius: empty");
  else v.blastRadius.forEach((b, i) => {
    if (!isObj(b) || !isStr(b.ruleId) || !SEVS.has(String(b.severity)) || !isStr(b.why)) e.push(`blastRadius[${i}]: ruleId/severity/why`);
    else if (!isObj(b.evidence) || !isStr((b.evidence as Record<string, unknown>).file) || !pair((b.evidence as Record<string, unknown>).lines) || !isStr((b.evidence as Record<string, unknown>).quote)) e.push(`blastRadius[${i}].evidence`);
  });
  if (!isArr(v.untouched)) e.push("untouched: missing");
  if (!isArr(v.plan) || !v.plan.length) e.push("plan: empty");
  else v.plan.forEach((p, i) => {
    if (!isObj(p) || !isNum(p.step) || !isStr(p.action) || !isStr(p.where) || !isStr(p.detail)) e.push(`plan[${i}]`);
  });
  if (!isArr(v.risks)) e.push("risks: missing");
  if (!isObj(v.estimate)) e.push("estimate: missing");
  return e;
}

export function validateModernization(v: unknown): Err {
  const e: Err = [];
  if (!isObj(v)) return ["modernization: not an object"];
  if (!isArr(v.modules) || !v.modules.length) e.push("modules: empty");
  else v.modules.forEach((m, i) => {
    if (!isObj(m) || !isStr(m.id) || !isStr(m.title) || !isStr(m.modern) || !isStr(m.tests) || !pair(m.cobolLines)) e.push(`modules[${i}]`);
  });
  return e;
}
