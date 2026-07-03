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


def run_strata(change: str) -> str:
    """One-shot agent run: analyze -> impact -> modernize -> dossier."""
    r = requests.post(
        STRATA_API,
        json={"change": change, "modernize": True},
        timeout=560,
    )
    r.raise_for_status()
    data = r.json()
    dossier = data.get("dossier", "")
    counts = data.get("counts", {})
    ev = (data.get("impact") or {}).get("evidenceCheck") or {}
    head = (
        f"**STRATA run complete** — {counts.get('rules', '?')} rules, "
        f"{counts.get('nodes', '?')} nodes, {counts.get('edges', '?')} edges; "
        f"{ev.get('verified', '?')}/{ev.get('checked', '?')} citations verified against source.\n\n"
    )
    tail = f"\n\nFull visual dossier & dependency graph: {WEB}"
    return head + dossier + tail


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
            change = item.text.strip()
            if len(change) < 8 or change.lower() in {"hi", "hello", "help", "what can you do"}:
                await ctx.send(sender, text_msg(HELP))
                continue
            ctx.logger.info(f"change request from {sender}: {change[:120]}")
            await ctx.send(
                sender,
                text_msg(
                    "Excavating… reading the legacy listing, tracing the blast radius and "
                    "writing the dossier. Novel changes take 1–3 minutes (cached showcase "
                    "changes return instantly)."
                ),
            )
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
