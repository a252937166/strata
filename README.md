# STRATA — X-ray for legacy systems

**Live demo:** https://strata.axiqo.xyz · **video:** https://youtu.be/WvKXTKfEhRM · built for **UK AI Agent Hackathon EP5 × Conduct**, Conduct Track *“Make Legacy Move”*.

Large enterprises run on code written decades ago by people who have left. When the business needs a change — a new rate, a new regulation, a new grade — someone has to answer *“what will this touch?”* by reading undocumented source. That answer costs weeks of specialist time, per change.

STRATA is an AI agent that turns that archaeology into an afternoon, **with a human approving every step**:

1. **EXCAVATE** — point it at a legacy listing (bundled: a real-shape 1987 COBOL payroll module with a DB2 rewrite and 24 years of patches).
2. **DECODE** — the agent extracts every business rule with line-level evidence: the overtime cap from a 1991 memo, the “temporary” 2009 tax patch, the Y2K pivot-66 windowing, the dead-but-load-bearing copybook field.
3. **MAP** — an interactive dependency graph of paragraphs, DB2 tables, files and constant blocks — the edges actually present in the code.
4. **IMPACT** — type a business change in plain language. The agent traces the blast radius (direct / coupled / re-verify) with quoted evidence, produces an ordered engineering plan, and — critically — a **regression contract**: the rules that must *not* change.
5. **MODERNIZE** — for each affected paragraph the agent writes modern TypeScript plus **characterization tests** that pin today’s behavior. Every module requires an explicit human **approve / reject**; the approved set exports as a change dossier (`obligation → evidence → decision → artifact`) that includes **ready-to-file GitHub/Jira issue drafts** (one per plan step, acceptance criteria bound to the regression contract) and a **rollback plan** verified by the characterization tests.

## Why this matches the Conduct brief

> “Pick a slow, inefficient process that happens at large enterprises today, and build a tool that lets a user do it far faster with AI, **while staying in control**.”

The process: change-impact analysis on legacy systems. Today: consultants grep, interview retirees, and assemble spreadsheets — weeks per change. With STRATA the same question is answered in minutes with evidence you can click, and the human review gate is structural, not decorative: nothing exports without a recorded decision per module.

## Architecture

```
corpus/            the excavation site (COBOL + copybook, 336 lines of 1987–2011 history)
agent/             Node + Express agent service
  src/llm.ts       model-agnostic /chat/completions client (any OpenAI-compatible endpoint)
  src/pipeline.ts  4 agent stages: rules → graph → impact → modernize (JSON-schema outputs, cached)
  src/server.ts    API + static host
web/               Vite + React console (zero UI dependencies; the force-graph is hand-rolled canvas)
```

- The agent is **model-agnostic** — set `STRATA_LLM_BASE / STRATA_LLM_KEY / STRATA_LLM_MODEL` to any OpenAI-compatible endpoint (local Ollama works).
- Every model output is schema-shaped JSON with retries; line citations come from a numbered listing, so evidence links are exact.
- Analyses are cached by content hash: the bundled site is instant, pasted listings run live.

## Run it

```bash
cd agent && npm i && STRATA_LLM_KEY=sk-... npm start     # :4032
cd web && npm i && npm run dev                            # :5175 (proxied)
```

Optional: `npm run precompute` warms the bundled corpus + three showcase changes.

## Honest limits

Rule extraction and impact tracing are advisory — that is the point of the review gate. The bundled corpus is synthetic-but-faithful COBOL (written to be plausibly 1987, incl. the folklore comments); paste your own listing to test the agent on real material, up to the demo’s 4,000-line cap.
