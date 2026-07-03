import { useEffect, useMemo, useRef, useState } from "react";
import {
  api, SHOWCASE_CHANGES,
  type Analysis, type Impact, type IssueResult, type Modernization, type SourceFile,
} from "./api";
import Graph, { type HighlightMap } from "./Graph";

/* ------------------------------------------------------------------ */
/* small building blocks                                               */
/* ------------------------------------------------------------------ */

function CountUp({ value, ms = 900 }: { value: number; ms?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{n}</>;
}

function Typewriter({ lines, speed = 14 }: { lines: string[]; speed?: number }) {
  const [shown, setShown] = useState<string[]>([]);
  useEffect(() => {
    setShown([]);
    let li = 0, ci = 0, alive = true;
    const step = () => {
      if (!alive || li >= lines.length) return;
      const line = lines[li];
      ci += 1 + Math.floor(Math.random() * 2);
      const partial = line.slice(0, ci);
      setShown((prev) => {
        const next = prev.slice(0, li);
        next[li] = partial;
        return next;
      });
      if (ci >= line.length) { li += 1; ci = 0; }
      setTimeout(step, speed + Math.random() * 18);
    };
    step();
    return () => { alive = false; };
  }, [lines, speed]);
  return (
    <div className="type-lines">
      {shown.map((l, i) => (
        <div key={i}>
          <span className="type-prompt">▸</span> {l}
          {i === shown.length - 1 && <span className="caret">█</span>}
        </div>
      ))}
    </div>
  );
}

/** CRT source viewer with optional highlighted line range. */
function CrtCode({
  files, focus, height = 420,
}: {
  files: SourceFile[];
  focus: { file: string; lines: [number, number] } | null;
  height?: number;
}) {
  const [tab, setTab] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    const idx = files.findIndex((f) => f.name.toLowerCase() === focus.file.toLowerCase());
    if (idx >= 0 && idx !== tab) setTab(idx);
  }, [focus, files]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focus || !bodyRef.current) return;
    const el = bodyRef.current.querySelector(`[data-line="${focus.lines[0]}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus, tab]);

  const file = files[tab];
  if (!file) return null;
  const inFocusFile = focus && focus.file.toLowerCase() === file.name.toLowerCase();

  return (
    <div className="crt" style={{ height }}>
      <div className="crt-top">
        <span className="crt-lamp" />
        {files.map((f, i) => (
          <button key={f.name} className={`crt-tab ${i === tab ? "on" : ""}`} onClick={() => setTab(i)}>
            {f.name}
          </button>
        ))}
        <span className="crt-title">TSO/ISPF · BROWSE</span>
      </div>
      <div className="crt-body" ref={bodyRef}>
        {file.content.split("\n").map((line, i) => {
          const n = i + 1;
          const hot = inFocusFile && focus && n >= focus.lines[0] && n <= focus.lines[1];
          return (
            <div key={n} data-line={n} className={`crt-line ${hot ? "hot" : ""}`}>
              <span className="crt-no">{String(n).padStart(4)}</span>
              <span className="crt-src">{line || " "}</span>
            </div>
          );
        })}
      </div>
      <div className="crt-scan" />
    </div>
  );
}

const CATEGORY_ICON: Record<string, string> = {
  pay: "£", overtime: "⏱", tax: "§", pension: "⛱", deduction: "−",
  data: "▤", compliance: "⚖", quirk: "☠",
};

/* ------------------------------------------------------------------ */
/* main app                                                            */
/* ------------------------------------------------------------------ */

type StageId = 0 | 1 | 2 | 3 | 4;
const STAGES = [
  { key: "EXCAVATE", sub: "load the site" },
  { key: "DECODE", sub: "business rules" },
  { key: "MAP", sub: "dependency graph" },
  { key: "IMPACT", sub: "blast radius" },
  { key: "MODERNIZE", sub: "reviewed change" },
];

export default function App() {
  const [corpus, setCorpus] = useState<SourceFile[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState<StageId>(0);
  const [focus, setFocus] = useState<{ file: string; lines: [number, number] } | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const [change, setChange] = useState("");
  const [impacting, setImpacting] = useState(false);
  const [impactRes, setImpactRes] = useState<Impact | null>(null);

  const [modernizing, setModernizing] = useState(false);
  const [modern, setModern] = useState<Modernization | null>(null);

  const [filing, setFiling] = useState(false);
  const [issuesRes, setIssuesRes] = useState<IssueResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "approved" | "rejected">>({});
  const [err, setErr] = useState<string | null>(null);

  const decodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const impactRef = useRef<HTMLDivElement>(null);
  const modernRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.corpus().then((r) => setCorpus(r.files)).catch(() => {});
  }, []);

  const scrollTo = (ref: React.RefObject<HTMLDivElement>) =>
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);

  /* ---------- stage 1: excavate ---------- */
  const excavate = async (files?: SourceFile[]) => {
    setScanning(true);
    setErr(null);
    // a fresh dig resets everything downstream
    setAnalysis(null);
    setImpactRes(null);
    setModern(null);
    setDecisions({});
    setIssuesRes(null);
    setChange("");
    setFocus(null);
    setSelectedNode(null);
    if (files) setCorpus(files);
    const t0 = Date.now();
    try {
      const a = await api.analyze(files);
      // theatrical minimum so the scan reads as a scan
      const wait = Math.max(0, 3600 - (Date.now() - t0));
      await new Promise((r) => setTimeout(r, wait));
      setAnalysis(a);
      setStage(1);
      scrollTo(decodeRef);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  /* ---------- paste-your-own-listing ---------- */
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState("PASTED.CBL");
  const [pasteText, setPasteText] = useState("");
  const pasteLines = pasteText ? pasteText.split("\n").length : 0;
  const bundledSite = corpus.some((f) => f.name === "PAYROLL01.CBL");
  const excavatePasted = () => {
    if (pasteLines < 5 || pasteLines > 4000) return;
    excavate([{ name: pasteName.trim() || "PASTED.CBL", content: pasteText }]);
  };

  /* ---------- stage 4: impact ---------- */
  const runImpact = async (text?: string) => {
    const q = (text ?? change).trim();
    if (!analysis || q.length < 8 || impacting) return;
    if (text) setChange(text);
    setImpacting(true);
    setImpactRes(null);
    setModern(null);
    setDecisions({});
    setErr(null);
    const t0 = Date.now();
    try {
      const r = await api.impact(analysis.id, q);
      await new Promise((res) => setTimeout(res, Math.max(0, 2600 - (Date.now() - t0))));
      setImpactRes(r);
      setStage(3);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setImpacting(false);
    }
  };

  /* ---------- stage 5: modernize ---------- */
  const runModernize = async () => {
    if (!analysis || !impactRes || modernizing) return;
    setModernizing(true);
    setErr(null);
    const t0 = Date.now();
    try {
      const r = await api.modernize(analysis.id, impactRes.change || change, impactRes);
      await new Promise((res) => setTimeout(res, Math.max(0, 2800 - (Date.now() - t0))));
      setModern(r);
      setStage(4);
      scrollTo(modernRef);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setModernizing(false);
    }
  };

  const highlight: HighlightMap = useMemo(() => {
    if (!impactRes) return { hits: {}, active: false };
    const hits: HighlightMap["hits"] = {};
    for (const b of impactRes.blastRadius) {
      for (const id of b.nodeIds) {
        const cur = hits[id];
        // direct beats indirect beats verify
        const rank = { direct: 3, indirect: 2, verify: 1 } as const;
        if (!cur || rank[b.severity] > rank[cur]) hits[id] = b.severity;
      }
    }
    return { hits, active: true };
  }, [impactRes]);

  const ruleById = useMemo(
    () => new Map((analysis?.rules ?? []).map((r) => [r.id, r])),
    [analysis],
  );
  const nodeById = useMemo(
    () => new Map((analysis?.nodes ?? []).map((n) => [n.id, n])),
    [analysis],
  );

  const approvedCount = Object.values(decisions).filter((d) => d === "approved").length;
  const decidedCount = Object.values(decisions).filter(Boolean).length;
  // hard review gate: no export, no tool execution, until EVERY module carries
  // an explicit human decision and at least one is approved
  const gateOpen = modern ? decidedCount === modern.modules.length && approvedCount > 0 : false;

  const exportDossier = () => {
    if (!analysis || !impactRes || !modern) return;
    const lines: string[] = [
      `# STRATA Change Dossier`,
      ``,
      `- System: ${analysis.summary.headline}`,
      `- Change: ${impactRes.change || change}`,
      `- Interpretation: ${impactRes.interpretation}`,
      `- Exported: ${new Date().toISOString()}`,
      ``,
      `## Blast radius (${impactRes.blastRadius.length})`,
      ...impactRes.blastRadius.map((b) => {
        const r = ruleById.get(b.ruleId);
        return `- **[${b.severity.toUpperCase()}] ${r?.title ?? b.ruleId}** — ${b.why}\n  - evidence: ${b.evidence.file} L${b.evidence.lines[0]}-${b.evidence.lines[1]}: \`${b.evidence.quote}\``;
      }),
      ``,
      `## Regression contract (must not change)`,
      ...impactRes.untouched.map((id) => `- ${ruleById.get(id)?.title ?? id}`),
      ``,
      `## Plan`,
      ...impactRes.plan.map((p) => `${p.step}. **${p.action}** @ ${p.where} — ${p.detail}`),
      ``,
      `## Risks`,
      ...impactRes.risks.map((r) => `- ⚠ ${r}`),
      ``,
      `## Execution assets — ready-to-file issues`,
      `One issue per plan step, ready to paste into GitHub/Jira. Acceptance criteria bind each step to the regression contract above.`,
      ...impactRes.plan.flatMap((p) => {
        const hits = impactRes.blastRadius.filter((b) => {
          const r = ruleById.get(b.ruleId);
          return r && (p.detail.includes(r.title) || p.where.includes(b.evidence.file) || b.why.includes(p.where));
        }).slice(0, 3);
        const evid = (hits.length ? hits : impactRes.blastRadius.slice(0, 2)).map(
          (b) => `> - [${b.severity.toUpperCase()}] ${ruleById.get(b.ruleId)?.title ?? b.ruleId} — ${b.evidence.file} L${b.evidence.lines[0]}-${b.evidence.lines[1]}`,
        );
        return [
          ``,
          `### Issue ${p.step}: ${p.action} (${p.where})`,
          `> **${p.action}**`,
          `>`,
          `> ${p.detail}`,
          `>`,
          `> Blast-radius evidence:`,
          ...evid,
          `>`,
          `> Acceptance:`,
          `> - [ ] Change implemented at \`${p.where}\``,
          `> - [ ] Characterization tests pass for every approved module`,
          `> - [ ] Regression contract holds: ${impactRes.untouched.length} pinned rules verified unchanged`,
        ];
      }),
      ``,
      `## Rollback plan`,
      `Revert plan steps in reverse order (${impactRes.plan.length} → 1). After rollback, re-run the characterization tests: they pin today's behavior, so a green run confirms the system is back to its pre-change state. The regression contract above is the rollback verification checklist.`,
      ``,
      `## Reviewed modernization modules`,
      ...modern.modules.flatMap((m) => [
        ``,
        `### ${m.title} — ${decisions[m.id] ?? "pending"}`,
        `Replaces ${m.paragraph} (L${m.cobolLines[0]}-${m.cobolLines[1]})`,
        "```ts", m.modern, "```",
        "```ts", m.tests, "```",
        `> Reviewer notes: ${m.notes}`,
      ]),
      ``,
      `---`,
      `Every module above carries an explicit human decision. STRATA proposes; people approve.`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "strata-change-dossier.md";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ------------------------------------------------------------------ */

  return (
    <div className="shell">
      {/* ---------- top bar ---------- */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▓▒░</span> STRATA
        </div>
        <div className="brand-sub">x-ray for legacy systems</div>
        <div className="spacer" />
        <span className="chip"><span className="lamp on" /> agent online</span>
        <span className="chip mono">{corpus.map((f) => f.name).join(" · ") || "corpus…"}</span>
        <a className="chip" href="https://github.com/a252937166/strata" target="_blank" rel="noreferrer">GitHub ↗</a>
      </header>

      {/* ---------- hero ---------- */}
      <section className="hero">
        <div className="hero-left">
          <div className="hero-kicker">CONDUCT TRACK · MAKE LEGACY MOVE</div>
          <h1>
            Forty years of code.<br />
            <span className="hero-amber">Nobody left who read it.</span>
          </h1>
          <p className="hero-sub">
            STRATA is an AI agent that excavates legacy systems: it reads the code nobody
            understands, surfaces every business rule with line-level evidence, maps the hidden
            dependencies, then lets you ask <em>“what if we change this?”</em> — and reviews every
            proposed fix with a human in charge.
          </p>
          <div className="hero-cta">
            <button className="btn-dig" onClick={() => document.getElementById("site")?.scrollIntoView({ behavior: "smooth" })}>
              ⛏ START DIGGING
            </button>
            <span className="hero-note">live agent · realistic 1987-style payroll listing below</span>
          </div>
        </div>
        <div className="hero-strata" aria-hidden>
          <div className="layer l1"><span>2026 · your change request</span></div>
          <div className="layer l2"><span>2013 · auto-enrolment bolt-on</span></div>
          <div className="layer l3"><span>2009 · “temporary” tax patch</span></div>
          <div className="layer l4"><span>1999 · Y2K windowing, pivot 66</span></div>
          <div className="layer l5"><span>1996 · union agreement 96/2</span></div>
          <div className="layer l6"><span>1987 · PAYROLL01.CBL</span></div>
          <div className="drill" />
        </div>
      </section>

      {/* ---------- stage rail ---------- */}
      <nav className="rail">
        {STAGES.map((s, i) => (
          <div key={s.key} className={`rail-step ${stage >= i ? "done" : ""} ${stage === i ? "now" : ""}`}>
            <span className="rail-no">{String(i + 1).padStart(2, "0")}</span>
            <span className="rail-key">{s.key}</span>
            <span className="rail-sub">{s.sub}</span>
          </div>
        ))}
      </nav>

      {err && <div className="toast err">⚠ {err}</div>}

      {/* ---------- 01 EXCAVATE ---------- */}
      <section className="stage" id="site">
        <div className="stage-head">
          <span className="stage-no">01</span>
          <h2>Excavate the site</h2>
          <p>A realistic 1987-style COBOL payroll module (synthetic, written to be faithful): DB2 rewrite in ’99, patches through 2011. The kind of file change requests go to die in.</p>
        </div>
        <div className="dig-grid">
          <div className={`dig-code ${scanning ? "scanning" : ""}`}>
            <CrtCode files={corpus} focus={focus} height={470} />
          </div>
          <div className="dig-side">
            {!scanning && !analysis && !pasteOpen && (
              <>
                <div className="dig-brief">
                  <div className="brief-row"><span>site</span><b>NORTHFIELD MFG · weekly payroll</b></div>
                  <div className="brief-row"><span>artifacts</span><b>{corpus.length} files · {corpus.reduce((n, f) => n + f.content.split("\n").length, 0)} lines</b></div>
                  <div className="brief-row"><span>last uprated</span><b>04/2019 (!)</b></div>
                  <div className="brief-row"><span>documentation</span><b className="bad">none found</b></div>
                </div>
                <button className="btn-dig big" onClick={() => excavate()}>⛏ EXCAVATE — run the agent</button>
                <button className="btn-ghost paste-toggle" onClick={() => setPasteOpen(true)}>▤ or paste your own listing — the agent runs live on it</button>
                <div className="dig-hint">The agent reads every line, extracts the business rules with evidence, and maps the dependency graph. Nothing is hardcoded.</div>
              </>
            )}
            {!scanning && !analysis && pasteOpen && (
              <div className="paste-panel">
                <div className="paste-head">
                  <span>YOUR EXCAVATION SITE</span>
                  <input className="paste-name mono" value={pasteName} onChange={(e) => setPasteName(e.target.value)} spellCheck={false} />
                </div>
                <textarea
                  className="paste-text mono"
                  placeholder={"Paste any legacy listing here — COBOL, PL/I, RPG, old Java, stored procedures…\nThe agent extracts rules, maps dependencies and takes change requests on it."}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  spellCheck={false}
                />
                <div className="paste-meta mono">
                  <span className={pasteLines > 4000 ? "bad" : ""}>{pasteLines} / 4000 lines</span>
                  <span>live model run · ~2–4 min</span>
                </div>
                <button className="btn-dig big" disabled={pasteLines < 5 || pasteLines > 4000} onClick={excavatePasted}>
                  ⛏ EXCAVATE MY CODE — live
                </button>
                <button className="btn-ghost" onClick={() => setPasteOpen(false)}>← back to the bundled site</button>
              </div>
            )}
            {scanning && (
              <div className="scan-console">
                <Typewriter lines={[
                  "mount TSO volume … ok",
                  ...corpus.map((f) => `chunking ${f.name} … ${f.content.split("\n").length} lines`),
                  bundledSite ? "carbon-dating comments … 1987–2011 detected" : "carbon-dating comments … analyzing era markers",
                  bundledSite ? "extracting business rules …" : "live model run — novel code takes 2–4 minutes …",
                  "extracting business rules …",
                  "tracing control-flow edges …",
                  "resolving tables & files …",
                  "capturing institutional knowledge …",
                ]} />
              </div>
            )}
            {analysis && !scanning && (
              <div className="dig-done">
                <div className="done-stamp">SITE MAPPED</div>
                <div className="done-stats">
                  <div><b><CountUp value={analysis.rules.length} /></b><span>rules</span></div>
                  <div><b><CountUp value={analysis.nodes.length} /></b><span>nodes</span></div>
                  <div><b><CountUp value={analysis.edges.length} /></b><span>edges</span></div>
                  <div><b className="bad"><CountUp value={analysis.rules.filter((r) => r.risk === "high").length} /></b><span>high-risk</span></div>
                </div>
                <button className="btn-ghost" onClick={() => scrollTo(decodeRef)}>▼ descend to the rules</button>
                <button className="btn-ghost paste-toggle" onClick={() => { setPasteOpen(true); setAnalysis(null); setStage(0); }}>▤ dig a different site — paste your own listing</button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- 02 DECODE ---------- */}
      {analysis && (
        <section className="stage" ref={decodeRef}>
          <div className="stage-head">
            <span className="stage-no">02</span>
            <h2>Decode — {analysis.summary.headline}</h2>
            <p>
              {analysis.summary.language} · {analysis.summary.domain} · {analysis.summary.loc} lines.
              Every card below is institutional knowledge that lived only in this file — click one to see the exact lines.
            </p>
            <div className="era-tags">
              {analysis.summary.eraClues.map((c) => <span key={c} className="era-tag">⌛ {c}</span>)}
            </div>
          </div>
          <div className="rules-grid">
            {analysis.rules.map((r, i) => (
              <button
                key={r.id}
                className={`rule-card risk-${r.risk} ${focus && focus.lines[0] === r.source.lines[0] ? "active" : ""}`}
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => setFocus({ file: r.source.file, lines: r.source.lines })}
              >
                <div className="rule-top">
                  <span className="rule-cat">{CATEGORY_ICON[r.category] ?? "•"} {r.category}</span>
                  <span className={`rule-risk ${r.risk}`}>{r.risk}</span>
                </div>
                <div className="rule-title">{r.title}</div>
                <div className="rule-body">{r.plainEnglish}</div>
                {r.constants.length > 0 && (
                  <div className="rule-consts">
                    {r.constants.slice(0, 3).map((c) => (
                      <span key={c.name} className="const-pill" title={c.meaning}>{c.name} = {c.value}</span>
                    ))}
                  </div>
                )}
                <div className="rule-src">▤ {r.source.file} · {r.source.paragraph} · L{r.source.lines[0]}–{r.source.lines[1]}</div>
                {r.risk === "high" && <div className="rule-why">⚠ {r.riskWhy}</div>}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---------- 03 MAP ---------- */}
      {analysis && (
        <section className="stage" ref={mapRef}>
          <div className="stage-head">
            <span className="stage-no">03</span>
            <h2>Map — the dependencies nobody wrote down</h2>
            <p>Paragraphs, DB2 tables, files and constant blocks; edges are actual PERFORM / read / write relationships from the code. Drag your eyes, click a node.</p>
          </div>
          <div className="map-grid">
            <div className="map-canvas-wrap">
              <Graph
                nodes={analysis.nodes}
                edges={analysis.edges}
                highlight={highlight}
                selected={selectedNode}
                onSelect={setSelectedNode}
              />
              {impactRes && (
                <div className="map-legend">
                  <span><i className="dot-direct" /> direct change</span>
                  <span><i className="dot-indirect" /> coupled</span>
                  <span><i className="dot-verify" /> re-verify</span>
                </div>
              )}
            </div>
            <div className="map-side">
              {selectedNode && nodeById.get(selectedNode) ? (
                <>
                  <div className="node-kind">{nodeById.get(selectedNode)!.kind}</div>
                  <div className="node-name">{nodeById.get(selectedNode)!.label}</div>
                  <div className="node-file mono">{nodeById.get(selectedNode)!.file}</div>
                  <div className="node-rules">
                    {nodeById.get(selectedNode)!.rules.length === 0 && <div className="muted">no rules pinned here</div>}
                    {nodeById.get(selectedNode)!.rules.map((rid) => {
                      const r = ruleById.get(rid);
                      if (!r) return null;
                      return (
                        <button key={rid} className="node-rule" onClick={() => { setFocus({ file: r.source.file, lines: r.source.lines }); document.getElementById("site")?.scrollIntoView({ behavior: "smooth" }); }}>
                          <span className={`rule-risk ${r.risk}`}>{r.risk}</span> {r.title}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="map-hint">
                  <div className="map-hint-title">፨ reading the map</div>
                  <p>Node size = how load-bearing it is (edges + rules). Amber = paragraphs, cyan = DB2 tables, violet = copybooks, yellow = constant blocks.</p>
                  <p>After you run an impact below, the blast radius lights up here.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---------- 04 IMPACT ---------- */}
      {analysis && (
        <section className="stage" ref={impactRef}>
          <div className="stage-head">
            <span className="stage-no">04</span>
            <h2>Ask: “what happens if we change this?”</h2>
            <p>The question that costs weeks of consultant time. Type a business change in plain language — the agent answers with evidence, a plan, and a regression contract.</p>
          </div>
          <div className="impact-input-row">
            <div className="impact-inputwrap">
              <span className="impact-prompt">Δ</span>
              <input
                className="impact-input"
                placeholder='e.g. "raise the overtime multiplier to 1.75x"'
                value={change}
                onChange={(e) => setChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runImpact()}
                disabled={impacting}
              />
              <button className="btn-dig" onClick={() => runImpact()} disabled={impacting || change.trim().length < 8}>
                {impacting ? "TRACING…" : "RUN IMPACT"}
              </button>
            </div>
            <div className="impact-examples">
              {bundledSite ? SHOWCASE_CHANGES.map((c, i) => (
                <button key={i} className="example-chip" disabled={impacting} onClick={() => runImpact(c)}>
                  {["⏱ overtime 1.75×", "⚖ NI regulation shift", "▤ new grade G8"][i]}
                </button>
              )) : (
                <span className="impact-note mono">your own site — describe any change to it in plain language (live run, ~1–3 min)</span>
              )}
            </div>
          </div>

          {impacting && (
            <div className="sonar">
              <div className="sonar-ring" /><div className="sonar-ring d2" /><div className="sonar-ring d3" />
              <div className="sonar-label">tracing blast radius through {analysis.edges.length} edges…</div>
            </div>
          )}

          {impactRes && !impacting && (
            <div className="impact-results">
              <div className="interp-card">
                <div className="interp-label">AGENT READS THE CHANGE AS</div>
                <div className="interp-text">{impactRes.interpretation}</div>
                {impactRes.evidenceCheck && (
                  <div className="evcheck mono" title="file exists · line range valid · quote found — failures are flagged, never trusted">
                    citations checked against source: {impactRes.evidenceCheck.verified} passed · {impactRes.evidenceCheck.checked - impactRes.evidenceCheck.verified} flagged
                  </div>
                )}
                <div className="estimate">
                  <div className="est old"><span>the old way</span><b>{impactRes.estimate.legacyWay}</b></div>
                  <div className="est-vs">→</div>
                  <div className="est new"><span>with this dossier</span><b>{impactRes.estimate.withStrata}</b></div>
                </div>
              </div>

              <div className="blast-grid">
                <div className="blast-col">
                  <h3 className="blast-h">☄ blast radius <em>{impactRes.blastRadius.length}</em></h3>
                  {impactRes.blastRadius.map((b, i) => {
                    const r = ruleById.get(b.ruleId);
                    return (
                      <div key={i} className={`blast-card sev-${b.severity}`} style={{ animationDelay: `${i * 90}ms` }}>
                        <div className="blast-top">
                          <span className={`sev-badge ${b.severity}`}>{b.severity}</span>
                          <span className="blast-title">{r?.title ?? b.ruleId}</span>
                        </div>
                        <div className="blast-why">{b.why}</div>
                        <button
                          className="blast-evidence mono"
                          onClick={() => { setFocus({ file: b.evidence.file, lines: b.evidence.lines }); document.getElementById("site")?.scrollIntoView({ behavior: "smooth" }); }}
                        >
                          ▤ {b.evidence.file} L{b.evidence.lines[0]}–{b.evidence.lines[1]}{b.evidence.verified && <span className="ev-tick" title="quote found within the cited source lines"> ✓</span>} · “{b.evidence.quote.slice(0, 80)}{b.evidence.quote.length > 80 ? "…" : ""}”
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="blast-col">
                  <h3 className="blast-h">🛡 regression contract <em>{impactRes.untouched.length}</em></h3>
                  <div className="untouched">
                    {impactRes.untouched.map((id) => (
                      <div key={id} className="untouched-row">✓ {ruleById.get(id)?.title ?? id}</div>
                    ))}
                  </div>
                  <h3 className="blast-h">⚠ risks</h3>
                  {impactRes.risks.map((r, i) => <div key={i} className="risk-row">{r}</div>)}
                </div>
              </div>

              <h3 className="blast-h plan-h">▦ the plan</h3>
              <div className="plan-steps">
                {impactRes.plan.map((p) => (
                  <div key={p.step} className="plan-step" style={{ animationDelay: `${p.step * 80}ms` }}>
                    <span className="plan-no">{p.step}</span>
                    <div>
                      <div className="plan-action">{p.action} <span className="plan-where mono">@ {p.where}</span></div>
                      <div className="plan-detail">{p.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="modernize-cta">
                <button className="btn-dig big" onClick={runModernize} disabled={modernizing}>
                  {modernizing ? "FORGING MODERN CODE…" : "⚒ MODERNIZE THE AFFECTED PARAGRAPHS"}
                </button>
                {modernizing && <div className="forge-note">writing TypeScript + characterization tests that pin today’s behavior…</div>}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------- 05 MODERNIZE ---------- */}
      {modern && (
        <section className="stage" ref={modernRef}>
          <div className="stage-head">
            <span className="stage-no">05</span>
            <h2>Modernize — you stay in control</h2>
            <p>Legacy left, modern right. Characterization tests pin the behavior that must not change. Nothing ships without your explicit decision on every module.</p>
          </div>
          {modern.modules.map((m) => (
            <div key={m.id} className={`module ${decisions[m.id] ?? ""}`}>
              <div className="module-head">
                <span className="module-title">{m.title}</span>
                <span className="module-src mono">replaces {m.paragraph} · L{m.cobolLines[0]}–{m.cobolLines[1]}</span>
                <div className="module-actions">
                  {decisions[m.id] === "approved" && <span className="stamp ok">APPROVED</span>}
                  {decisions[m.id] === "rejected" && <span className="stamp no">REJECTED</span>}
                  {!decisions[m.id] && (
                    <>
                      <button className="btn-ok" onClick={() => setDecisions((d) => ({ ...d, [m.id]: "approved" }))}>✓ approve</button>
                      <button className="btn-no" onClick={() => setDecisions((d) => ({ ...d, [m.id]: "rejected" }))}>✕ reject</button>
                    </>
                  )}
                </div>
              </div>
              <div className="module-grid">
                <div className="module-legacy">
                  <div className="pane-label crt-label">LEGACY · COBOL</div>
                  <pre className="cobol-pane">{corpusExcerpt(corpus, m.cobolLines)}</pre>
                </div>
                <div className="module-modern">
                  <div className="pane-label">MODERN · TYPESCRIPT</div>
                  <pre className="ts-pane">{m.modern}</pre>
                  <div className="pane-label">CHARACTERIZATION TESTS</div>
                  <pre className="ts-pane tests">{m.tests}</pre>
                  <div className="module-notes">☞ {m.notes}</div>
                </div>
              </div>
            </div>
          ))}
          <div className="dossier-bar">
            <div className="dossier-count" title="the gate opens only when every module carries an explicit decision">
              {decidedCount}/{modern.modules.length} decided · {approvedCount} approved
            </div>
            <button className="btn-dig" disabled={!gateOpen} onClick={exportDossier}
              title={gateOpen ? "" : "decide every module (approve/reject) first"}>
              ⬇ EXPORT CHANGE DOSSIER (.md)
            </button>
            <button
              className="btn-dig"
              title={gateOpen ? "" : "decide every module (approve/reject) first"}
              disabled={!gateOpen || filing}
              onClick={async () => {
                if (!analysis || !impactRes) return;
                setFiling(true);
                try { setIssuesRes(await api.fileIssues(analysis.id, impactRes.change || change, impactRes, false)); }
                catch (e) { setIssuesRes({ dryRun: true, repo: "error", issues: [{ title: `failed: ${(e as Error).message}` }], payloads: [] }); }
                finally { setFiling(false); }
              }}
            >
              {filing ? "FILING…" : "⚑ FILE GITHUB ISSUES"}
            </button>
            <div className="dossier-note">obligation → evidence → decision → artifact — with ready-to-file issues and a rollback plan. The audit trail writes itself.</div>
          </div>
          {issuesRes && (
            <div className="issues-result">
              <div className="issues-head mono">
                {issuesRes.dryRun
                  ? `⚑ dry run — ${issuesRes.payloads.length} issue payloads built (set GITHUB_TOKEN/GITHUB_REPO for live filing)`
                  : `⚑ filed ${issuesRes.issues.filter((i) => i.url).length}/${issuesRes.issues.length} issues → ${issuesRes.repo}`}
              </div>
              {issuesRes.issues.map((i, k) => (
                <div key={k} className="issues-row">
                  {i.url ? <a href={i.url} target="_blank" rel="noreferrer">#{i.number} {i.title}</a> : <span>{i.title}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="foot">
        <div>STRATA — built for UK AI Agent Hackathon EP5 · Conduct Track “Make Legacy Move”</div>
        <div className="mono">agent: pluggable LLM · graph & evidence computed from source · human approves every change</div>
      </footer>
    </div>
  );
}

function corpusExcerpt(files: SourceFile[], lines: [number, number]): string {
  const main = files.find((f) => /\.cbl$/i.test(f.name)) ?? files[0];
  if (!main) return "";
  const all = main.content.split("\n");
  const s = Math.max(0, lines[0] - 1);
  const e = Math.min(all.length, lines[1]);
  return all.slice(s, e).map((l, i) => `${String(s + i + 1).padStart(4)}  ${l}`).join("\n");
}
