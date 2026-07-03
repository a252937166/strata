"""
STRATA — Agentverse / ASI:One agent (Agent Chat Protocol).

The conversation-first entry point to STRATA: send a plain-English business
change for the bundled legacy COBOL payroll system, get back the full change
dossier — blast radius with verified line citations, regression contract,
ordered plan, risks, rollback plan and modernization module summaries.

Runs as an Agentverse **Hosted Agent** (paste this file into a new blank agent
on https://agentverse.ai) or locally as a mailbox agent with `uagents` installed.
The heavy lifting happens in the STRATA agent service at https://strata.axiqo.xyz
(open source: https://github.com/a252937166/strata).

Example prompts to try in ASI:One:
  - "Raise the overtime multiplier from 1.5x to 1.75x for weekday overtime."
  - "New regulation: NI must move from gross basis to pension-adjusted basis."
  - "Add a new grade G8 for logistics team leads at 22.40/hour."
"""

import re
from datetime import datetime, timezone
from uuid import uuid4

import requests
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)

STRATA_API = "https://strata.axiqo.xyz/api/run"
ISSUES_API = "https://strata.axiqo.xyz/api/issues/github"
WEB = "https://strata.axiqo.xyz"

agent = Agent()  # hosted agents inject name/seed/mailbox automatically
chat_proto = Protocol(spec=chat_protocol_spec)

HELP = (
    "I am STRATA — an X-ray for legacy systems.\n\n"
    "Describe a business change for the bundled 1987-style COBOL payroll system "
    "and I will trace its blast radius (with line-verified evidence), the regression "
    "contract, an ordered plan, risks, a rollback plan and modernization modules.\n\n"
    "Try: \"Raise the overtime multiplier from 1.5x to 1.75x for weekday overtime.\"\n"
    f"Visual companion (optional): {WEB}"
)


def text_msg(text: str, end_session: bool = False) -> ChatMessage:
    content = [TextContent(type="text", text=text)]
    if end_session:
        content.append(EndSessionContent(type="end-session"))
    return ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(), content=content)


def clean_change(text: str) -> str:
    """ASI:One prefixes messages with @mentions — strip them so showcase
    changes hit the precomputed cache exactly."""
    return re.sub(r"^(\s*@\S+\s*)+", "", text).strip()


META_RE = re.compile(
    r"\b(purpose|capabilit\w*|who are you|what do you do|what can you do|"
    r"your function|how do you work|introduce yourself|chat protocol|test your)\b",
    re.I,
)


def is_meta_question(text: str) -> bool:
    """Greetings / self-description probes get the HELP card, not an excavation."""
    t = text.lower().strip()
    if len(t) < 8 or t in {"hi", "hello", "help", "what can you do"}:
        return True
    return bool(META_RE.search(t)) and (t.endswith("?") or len(t.split()) <= 16)


CHANGE_RE = re.compile(
    r"\b(raise|lower|increase|reduce|change|add|remove|introduce|move|switch|update|"
    r"replace|cap|uncap|multiplier|rate|grade|pension|tax|regulation|overtime|"
    r"deduction|bonus|payroll|policy|rule|band|threshold|effective)\b",
    re.I,
)


def looks_like_change(text: str) -> bool:
    """Only real change requests are worth an excavation (and a warm LLM run) —
    everything else gets the HELP card instead of a confusing pending reply."""
    return bool(CHANGE_RE.search(text))


def run_strata(change: str) -> str:
    """Cache-first agent run (hosted execution budgets are tight):
    answered from cache -> full dossier now; otherwise the backend is warmed
    asynchronously and the user is told to re-ask in a couple of minutes."""
    r = requests.post(
        STRATA_API,
        json={"change": change, "modernize": True, "cachedOnly": True},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    if data.get("pending"):
        # fire-and-forget: kick the full run so the cache warms while we reply
        try:
            requests.post(STRATA_API, json={"change": change, "modernize": True}, timeout=2)
        except requests.exceptions.RequestException:
            pass  # expected — the backend keeps processing after we disconnect
        return (
            "**Excavation started.** This is a novel change, so the agent is reading the "
            "legacy listing and tracing the blast radius live — that takes about 1–3 minutes "
            "with a reasoning model.\n\n"
            "Ask me the **same change again in ~2 minutes** and I will return the full dossier "
            "instantly. Or watch it live on the visual console: " + WEB + "\n\n"
            "Instant examples (precomputed):\n"
            "- Raise the overtime multiplier from 1.5x to 1.75x for weekday overtime, effective next pay week.\n"
            "- New regulation: employee pension contributions must also be deducted for National Insurance purposes (NI moves from gross basis to pension-adjusted basis).\n"
            "- Add a new grade G8 for logistics team leads at 22.40/hour, on the standard pension scheme."
        )
    dossier = data.get("dossier", "")
    counts = data.get("counts", {})
    impact = data.get("impact") or {}
    ev = impact.get("evidenceCheck") or {}
    head = (
        f"**STRATA run complete** — {counts.get('rules', '?')} rules, "
        f"{counts.get('nodes', '?')} nodes, {counts.get('edges', '?')} edges; "
        f"{ev.get('verified', '?')}/{ev.get('checked', '?')} citations passed the source check (failures are flagged, never trusted).\n\n"
    )
    # tool execution: turn the plan into GitHub issue payloads (dry-run unless the
    # backend has GITHUB_TOKEN/GITHUB_REPO configured, then live with dryRun:false)
    assets = ""
    try:
        ir = requests.post(
            ISSUES_API,
            json={
                "analysisId": data.get("analysisId"),
                "change": impact.get("change", change),
                "impact": impact,
                "dryRun": True,
            },
            timeout=60,
        )
        ir.raise_for_status()
        issues = ir.json()
        if issues.get("dryRun"):
            assets = (
                f"\n\n**Execution assets** — built {len(issues.get('payloads', []))} "
                f"GitHub issue payloads (one per plan step; live filing enabled via "
                f"GITHUB_TOKEN/GITHUB_REPO on the backend)."
            )
        else:
            links = "\n".join(
                f"- {i.get('title')}: {i.get('url')}" for i in issues.get("issues", [])
            )
            assets = f"\n\n**Execution assets** — filed GitHub issues:\n{links}"
    except Exception as e:  # noqa: BLE001 — issue tool is additive, never fatal
        assets = f"\n\n(issue tool unavailable: {e})"
    tail = f"\n\nFull visual dossier & dependency graph: {WEB}"
    return head + dossier + assets + tail


@chat_proto.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    # acknowledge receipt per the Chat Protocol
    await ctx.send(
        sender,
        ChatAcknowledgement(
            timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id
        ),
    )
    for item in msg.content:
        if isinstance(item, StartSessionContent):
            await ctx.send(sender, text_msg(HELP))
        elif isinstance(item, TextContent):
            change = clean_change(item.text)
            if is_meta_question(change) or not looks_like_change(change):
                await ctx.send(sender, text_msg(HELP))
                continue
            ctx.logger.info(f"change request from {sender}: {change[:120]}")
            try:
                await ctx.send(sender, text_msg(run_strata(change), end_session=True))
            except Exception as e:  # noqa: BLE001 — report, never crash the agent
                ctx.logger.error(f"strata run failed: {e}")
                await ctx.send(
                    sender,
                    text_msg(
                        f"The excavation hit a fault line: {e}\n"
                        f"Try one of the showcase changes, or the web console: {WEB}",
                        end_session=True,
                    ),
                )


@chat_proto.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.info(f"ack from {sender} for {msg.acknowledged_msg_id}")


agent.include(chat_proto, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
