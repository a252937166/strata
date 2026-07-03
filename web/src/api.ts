export interface SourceFile { name: string; content: string }

export interface Rule {
  id: string;
  title: string;
  category: string;
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

export interface BlastHit {
  ruleId: string;
  nodeIds: string[];
  severity: "direct" | "indirect" | "verify";
  why: string;
  evidence: { file: string; lines: [number, number]; quote: string; verified?: boolean };
}

export interface Impact {
  change: string;
  interpretation: string;
  blastRadius: BlastHit[];
  untouched: string[];
  plan: { step: number; action: string; where: string; detail: string }[];
  risks: string[];
  estimate: { legacyWay: string; withStrata: string };
  evidenceCheck?: { checked: number; verified: number; failed: { where: string; reason: string }[] };
}

export interface IssueResult {
  dryRun: boolean;
  repo: string;
  issues: { title: string; url?: string; number?: number }[];
  payloads: { title: string; body: string; labels: string[] }[];
}

export interface ModernModule {
  id: string;
  title: string;
  paragraph: string;
  cobolLines: [number, number];
  modern: string;
  tests: string;
  notes: string;
}
export interface Modernization { modules: ModernModule[] }

const j = async <T>(r: Response): Promise<T> => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? r.statusText);
  return body as T;
};

export const api = {
  corpus: () => fetch("/api/corpus").then((r) => j<{ files: SourceFile[] }>(r)),
  analyze: (files?: SourceFile[]) =>
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(files ? { files } : {}),
    }).then((r) => j<Analysis>(r)),
  impact: (analysisId: string, change: string) =>
    fetch("/api/impact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId, change }),
    }).then((r) => j<Impact>(r)),
  modernize: (analysisId: string, change: string, impact: Impact) =>
    fetch("/api/modernize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId, change, impact }),
    }).then((r) => j<Modernization>(r)),
  fileIssues: (analysisId: string, change: string, impact: Impact, dryRun = true) =>
    fetch("/api/issues/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId, change, impact, dryRun }),
    }).then((r) => j<IssueResult>(r)),
};

export const SHOWCASE_CHANGES = [
  "Raise the overtime multiplier from 1.5x to 1.75x for weekday overtime, effective next pay week.",
  "New regulation: employee pension contributions must also be deducted for National Insurance purposes (NI moves from gross basis to pension-adjusted basis).",
  "Add a new grade G8 for logistics team leads at 22.40/hour, on the standard pension scheme.",
];
