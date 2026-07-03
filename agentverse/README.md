# STRATA on Agentverse / ASI:One

`strata_agent.py` is the Agent Chat Protocol wrapper that makes STRATA discoverable
and usable through **ASI:One** — the whole core flow (analyze → impact → modernize →
dossier) runs in one conversation, no custom frontend required. The web console at
https://strata.axiqo.xyz stays as an optional visual companion.

## Deploy as an Agentverse Hosted Agent (~3 minutes)

1. Sign in at https://agentverse.ai → **Agents → + New Agent → Blank Agent**.
2. Name it `strata-legacy-xray`, paste the entire `strata_agent.py` into `agent.py`, hit **Start**.
   Hosted agents have `requests` and `uagents` preinstalled; no other setup.
3. In the agent's **Overview**, fill the README (copy the profile blurb below), so the
   ASI:One index can route intents to it.
4. Grab the **agent address** (`agent1q...`) and the profile URL, then update the badges
   section in the repo README.
5. Test in ASI:One: search for the agent (or open a chat with its address) and send
   one of the example prompts.

## Profile blurb (paste into the Agentverse agent README)

```
![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

STRATA — X-ray for legacy systems. Send a plain-English business change for a
legacy COBOL payroll system; get back a decision-grade change dossier: blast
radius with line-verified evidence, a regression contract (what must NOT
change), an ordered engineering plan, risks, a rollback plan, and modern
TypeScript modules with characterization tests, gated by human approval.

Example prompts:
- Raise the overtime multiplier from 1.5x to 1.75x for weekday overtime.
- New regulation: NI must move from gross basis to pension-adjusted basis.
- Add a new grade G8 for logistics team leads at 22.40/hour.
```

## Run locally instead (mailbox agent)

```bash
pip install uagents requests
python agentverse/strata_agent.py
# first run prints the agent address; connect it to Agentverse via the Mailbox
# flow printed in the console, then chat from ASI:One.
```

## How it works

The wrapper is intentionally thin: parse the chat message → `POST https://strata.axiqo.xyz/api/run`
(one-shot analyze → impact → modernize, with evidence verification) → stream the dossier back
as chat text. The pipeline, verifier, tests and tooling live in this repo under `agent/`.
