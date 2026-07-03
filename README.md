# STRATA — X-ray for legacy systems

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)
![ci](https://github.com/a252937166/strata/actions/workflows/ci.yml/badge.svg)

**Live demo:** https://strata.axiqo.xyz · **video:** https://youtu.be/WvKXTKfEhRM · built for **UK AI Agent Hackathon EP5 × Conduct**, Conduct Track *“Make Legacy Move”*.

Large enterprises run on code written decades ago by people who have left. When the business needs a change — a new rate, a new regulation, a new grade — someone has to answer *“what will this touch?”* by reading undocumented source. That answer costs weeks of specialist time, per change.

STRATA is an AI agent that turns that archaeology into an afternoon, **with a human approving every step**:

1. **EXCAVATE** — point it at a legacy listing (bundled: a realistic 1987-style COBOL payroll module with a DB2 rewrite and 24 years of patches; synthetic, written to be faithful).
2. **DECODE** — the agent extracts every business rule with line-level evidence: the overtime cap from a 1991 memo, the “temporary” 2009 tax patch, the Y2K pivot-66 windowing, the dead-but-load-bearing copybook field.
3. **MAP** — an interactive dependency graph of paragraphs, DB2 tables, files and constant blocks — the edges actually present in the code.
4. **IMPACT** — type a business change in plain language. The agent traces the blast radius (direct / coupled / re-verify) with quoted evidence — **every citation machine-verified against the real source lines** — an ordered engineering plan, and a **regression contract**: the rules that must *not* change.
5. **MODERNIZE** — for each affected paragraph the agent writes modern TypeScript plus **characterization tests** that pin today’s behavior. Every module requires an explicit human **approve / reject**; the approved set exports as a change dossier (`obligation → evidence → decision → artifact`) with **GitHub issue filing (dry-run or live)** and a **rollback plan**.

## Agent access (ASI:One / Agentverse)

The core flow runs **conversation-first** — no custom frontend required:

- **Chat Protocol agent:** [`agentverse/strata_agent.py`](agentverse/strata_agent.py) (deploy notes in [`agentverse/README.md`](agentverse/README.md))
- **Agent name:** `strata-legacy-xray`
- **Agent address / Agentverse profile / ASI:One session:** _pending registration — see agentverse/README.md_
- **One-shot API the agent wraps:**

```bash
curl -X POST https://strata.axiqo.xyz/api/run \
  -H "Content-Type: application/json" \
  -d '{"change":"Raise the overtime multiplier from 1.5x to 1.75x for weekday overtime."}'
# → { impact, modernization, dossier (markdown), evidenceCheck, ... }
```

## Judge quick start

**Option A — conversation (ASI:One or curl):** run the `curl` above (or chat with the agent once registered). The three showcase changes return instantly from cache; novel changes run live in ~1–3 min.

**Option B — web console:** open https://strata.axiqo.xyz → *START DIGGING* → click a rule card (jumps to the exact source lines) → type or pick a change → *TRACE THE BLAST RADIUS* → *MODERNIZE* → approve a module → *EXPORT CHANGE DOSSIER* / *FILE GITHUB ISSUES*.

**Option C — local:**

```bash
cd agent && npm i && STRATA_LLM_KEY=sk-... npm start   # :4032, serves web/dist too
cd web && npm i && npm run build
npm test                                               # golden tests, no key needed
```

## Why this matches the Conduct brief

> “Pick a slow, inefficient process that happens at large enterprises today, and build a tool that lets a user do it far faster with AI, while staying in control.”

The process: change-impact analysis on legacy systems. Today: consultants grep, interview retirees, and assemble spreadsheets — weeks per change. With STRATA the same question is answered in minutes with evidence you can click, and the human review gate is structural, not decorative: nothing exports without a recorded decision per module.

## Architecture

```
corpus/            the excavation site (COBOL + copybook, 336 lines of 1987–2011 history)
agent/             Node + Express agent service
  src/llm.ts       model-agnostic /chat/completions client + schema-repair retry loop
  src/pipeline.ts  4 agent stages: rules → graph → impact → modernize (JSON-schema outputs, cached)
  src/verify.ts    anti-hallucination layer: every line citation checked against real source
  src/tools.ts     execution assets: GitHub issue filing (dry-run/live) + dossier builder
  src/server.ts    API + /api/run one-shot + static host
  tests/           golden tests over the showcase fixtures (run in CI)
agentverse/        Agent Chat Protocol wrapper for ASI:One + deploy notes
web/               Vite + React console (zero UI dependencies; the force-graph is hand-rolled canvas)
```

- The agent is **model-agnostic** — set `STRATA_LLM_BASE / STRATA_LLM_KEY / STRATA_LLM_MODEL` to any OpenAI-compatible endpoint (local Ollama works).
- Every model output is schema-shaped JSON with **runtime validation and a structured repair loop**; line citations come from a numbered listing and are **verified against the source** (`evidenceCheck` in every impact response).
- Real tool execution: `POST /api/issues/github` files the impact plan as GitHub issues — `GITHUB_TOKEN` + `GITHUB_REPO` for live mode, dry-run payloads otherwise.
- Analyses are cached by content hash: the bundled site is instant, pasted listings run live.

## Honest limits

Rule extraction and impact tracing are advisory — that is the point of the review gate. The bundled corpus is synthetic-but-faithful COBOL (written to be plausibly 1987, incl. the folklore comments); paste your own listing to test the agent on real material, up to the demo’s 4,000-line cap (no repo-scale indexing yet). Live requests on novel changes take ~1–3 minutes with a reasoning model; GitHub filing defaults to dry-run unless a token is configured.
