import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatJson } from "./llm.js";
import {
  validateAnalysis,
  validateImpact,
  validateModernization,
  verifyImpactEvidence,
  type EvidenceCheck,
} from "./verify.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
const CACHE_DIR = process.env.STRATA_CACHE ?? path.join(ROOT, "agent", "data", "cache");

// ---------- types the frontend renders ----------
export interface SourceFile { name: string; content: string }

export interface Rule {
  id: string;
  title: string;
  category: "pay" | "overtime" | "tax" | "pension" | "deduction" | "data" | "compliance" | "quirk";
  plainEnglish: string;
  source: { file: string; paragraph: string; lines: [number, number] };
  constants: { name: string; value: string; meaning: string }[];
  risk: "low" | "medium" | "high";
  riskWhy: string;
}

export interface GraphNode { id: string; label: string; kind: string; file: string; rules: string[] }
export interface GraphEdge { from: string; to: string; kind: string }

export interface Analysis {
  id: string;
  summary: { language: string; domain: string; loc: number; eraClues: string[]; headline: string };
  rules: Rule[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Impact {
  change: string;
  interpretation: string;
  blastRadius: {
    ruleId: string;
    nodeIds: string[];
    severity: "direct" | "indirect" | "verify";
    why: string;
    evidence: { file: string; lines: [number, number]; quote: string; verified?: boolean };
  }[];
  untouched: string[];
  plan: { step: number; action: string; where: string; detail: string }[];
  risks: string[];
  estimate: { legacyWay: string; withStrata: string };
  /** filled by the verifier: how many citations were checked against real source */
  evidenceCheck?: EvidenceCheck;
}

export interface Modernization {
  modules: {
    id: string;
    title: string;
    paragraph: string;
    cobolLines: [number, number];
    modern: string;
    tests: string;
    notes: string;
  }[];
}

// ---------- helpers ----------
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

function cacheGet<T>(key: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${key}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}
function cachePut(key: string, value: unknown) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(value, null, 1));
}

/** Number every line so the model can cite exact ranges. */
function numbered(files: SourceFile[]): string {
  return files
    .map((f) => {
      const body = f.content
        .split("\n")
        .map((l, i) => `${String(i + 1).padStart(4)}| ${l}`)
        .join("\n");
      return `===== FILE: ${f.name} =====\n${body}`;
    })
    .join("\n\n");
}

export function loadCorpus(): SourceFile[] {
  const dir = path.join(ROOT, "corpus");
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(cbl|cpy|cob)$/i.test(f))
    .sort()
    .map((name) => ({ name, content: fs.readFileSync(path.join(dir, name), "utf8") }));
}

// ---------- stage 1: decode + map ----------
const ANALYZE_RULES_SYSTEM = `You are STRATA, a legacy-systems archaeologist agent. You read decades-old enterprise source code and excavate its BUSINESS RULES: every rule the code enforces, in precise plain English an analyst can act on. Include rules hiding in comments, magic numbers, patch history, ordering dependencies and dead-but-load-bearing fields.

Output requirements:
- risk=high for anything with hidden coupling, hardcoded policy that drifts (rates, bands), date windowing, or "do not touch" folklore; explain why in riskWhy (one sentence).
- Every rule cites file + paragraph + [startLine, endLine] from the numbered listing.
- plainEnglish: 1-2 tight sentences. Keep reasoning minimal; extract, don't deliberate.
- Respond with ONLY one JSON object, schema:
{"summary":{"language":str,"domain":str,"loc":int,"eraClues":[str max 6],"headline":str},
 "rules":[{"id":"R1","title":str,"category":"pay|overtime|tax|pension|deduction|data|compliance|quirk","plainEnglish":str,"source":{"file":str,"paragraph":str,"lines":[int,int]},"constants":[{"name":str,"value":str,"meaning":str}],"risk":"low|medium|high","riskWhy":str}]}`;

const ANALYZE_GRAPH_SYSTEM = `You are STRATA's dependency mapper. From the numbered legacy source and the rule list, emit the dependency graph:
- nodes: every PROCEDURE DIVISION paragraph, every DB2 table, every physical file (SELECT...ASSIGN), every copybook, plus one node per major constant block. id: short kebab-case; label: the real name; kind: paragraph|table|file|copybook|constants. Attach the rule ids that live in each node (rules array, may be empty).
- edges: relationships actually present in the code — PERFORM/GO TO (kind "performs"), reads/writes of files+tables ("reads"/"writes"), copybook or constant usage ("uses"), comment-documented ordering dependencies ("depends").
Keep reasoning minimal. Respond with ONLY one JSON object:
{"nodes":[{"id":str,"label":str,"kind":str,"file":str,"rules":[str]}],
 "edges":[{"from":str,"to":str,"kind":str}]}`;

export async function analyze(files: SourceFile[]): Promise<Analysis> {
  const key = `analyze-${sha(JSON.stringify(files))}`;
  const hit = cacheGet<Analysis>(key);
  if (hit) return hit;

  const listing = numbered(files);
  const part1 = await chatJson<Pick<Analysis, "summary" | "rules">>(
    ANALYZE_RULES_SYSTEM, listing, 12000,
    (v) => validateAnalysis({ ...v, nodes: [{}], edges: [] }),
  );
  const part2 = await chatJson<Pick<Analysis, "nodes" | "edges">>(
    ANALYZE_GRAPH_SYSTEM,
    `RULES:\n${JSON.stringify(part1.rules.map((r) => ({ id: r.id, title: r.title, paragraph: r.source.paragraph })))}\n\nNUMBERED SOURCE:\n${listing}`,
    12000,
    (v) => validateAnalysis({ summary: { headline: "x" }, rules: [{ id: "x", title: "x", plainEnglish: "x", source: { file: "x", lines: [1, 1] } }], ...v }),
  );
  const analysis: Analysis = { id: key, ...part1, ...part2 };
  cachePut(key, analysis);
  return analysis;
}

// ---------- stage 2: impact ----------
const IMPACT_SYSTEM = `You are STRATA's change-impact analyst. Input: (a) the excavated business rules and dependency graph of a legacy system, (b) the numbered source, (c) a proposed business change in plain language.

Produce a decision-grade impact analysis:
- interpretation: restate the change precisely, resolving ambiguity with stated assumptions.
- blastRadius: every rule that must change (direct), that is coupled and may change (indirect), or whose behavior must be re-verified even if unchanged (verify). Severity means exactly that. Each entry cites node ids from the graph and quotes the decisive source lines.
- untouched: rule ids the change must NOT alter — the regression contract.
- plan: ordered, concrete engineering steps a maintainer follows (edit X in paragraph Y, rebind Z, regression-run W). Respect ordering dependencies found in the code.
- risks: sharp warnings (hidden coupling, rounding, ordering, historic quirks).
- estimate: one line for how long this takes the traditional way (specialists reading code) vs with this dossier in hand. Be honest, not salesy.

Respond with ONLY one JSON object, schema:
{"change":str,"interpretation":str,
 "blastRadius":[{"ruleId":str,"nodeIds":[str],"severity":"direct|indirect|verify","why":str,"evidence":{"file":str,"lines":[int,int],"quote":str}}],
 "untouched":[str],
 "plan":[{"step":int,"action":str,"where":str,"detail":str}],
 "risks":[str],
 "estimate":{"legacyWay":str,"withStrata":str}}`;

export async function impact(files: SourceFile[], analysis: Analysis, change: string): Promise<Impact> {
  const key = `impact-${sha(analysis.id + "::" + change.trim().toLowerCase())}`;
  const hit = cacheGet<Impact>(key);
  if (hit) {
    hit.evidenceCheck = verifyImpactEvidence(files, hit);
    return hit;
  }

  const user = `PROPOSED CHANGE: ${change}

EXCAVATED RULES + GRAPH:
${JSON.stringify({ rules: analysis.rules, nodes: analysis.nodes, edges: analysis.edges })}

NUMBERED SOURCE:
${numbered(files)}`;
  const result = await chatJson<Impact>(IMPACT_SYSTEM, user, 10000, validateImpact);
  // anti-hallucination pass: every citation is checked against the real source
  result.evidenceCheck = verifyImpactEvidence(files, result);
  cachePut(key, result);
  return result;
}

// ---------- stage 3: modernize ----------
const MODERNIZE_SYSTEM = `You are STRATA's modernization engineer. Input: the numbered legacy source, the excavated rules, a business change, and its impact analysis.

For each DIRECTLY affected area (group by paragraph), emit a modernization module:
- modern: clean TypeScript implementing that paragraph's business logic WITH the proposed change applied. Small pure functions, decimal-safe integer pence arithmetic, constants lifted into a typed config object with source-line citations in comments. No I/O.
- tests: characterization tests (plain function assertions, vitest style) that pin CURRENT legacy behavior for everything the change must not alter, plus new cases proving the changed behavior. Derive expected numbers by hand from the legacy rules; show the arithmetic in comments.
- notes: what a reviewer must check before approving (rounding mode, ordering, parity quirks preserved on purpose).
- cobolLines: the [start,end] lines of the legacy paragraph this replaces.

Human stays in control: modules are proposals for review, so make them self-explanatory.
Respond with ONLY one JSON object, schema:
{"modules":[{"id":"M1","title":str,"paragraph":str,"cobolLines":[int,int],"modern":str,"tests":str,"notes":str}]}`;

export async function modernize(
  files: SourceFile[],
  analysis: Analysis,
  change: string,
  imp: Impact,
): Promise<Modernization> {
  const key = `modern-${sha(analysis.id + "::" + change.trim().toLowerCase())}`;
  const hit = cacheGet<Modernization>(key);
  if (hit) return hit;

  const user = `PROPOSED CHANGE: ${change}

IMPACT ANALYSIS:
${JSON.stringify(imp)}

EXCAVATED RULES:
${JSON.stringify(analysis.rules)}

NUMBERED SOURCE:
${numbered(files)}`;
  const result = await chatJson<Modernization>(MODERNIZE_SYSTEM, user, 12000, validateModernization);
  cachePut(key, result);
  return result;
}
