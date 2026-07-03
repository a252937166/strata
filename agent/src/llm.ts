import https from "node:https";

/**
 * Minimal OpenAI-compatible chat client on the Node built-in https module —
 * no SDK, no global fetch, runs on the small Node 16 VPS this ships to.
 * The agent is model-agnostic: any /chat/completions endpoint plugs in.
 */
const API_KEY = process.env.STRATA_LLM_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";
const BASE_URL = process.env.STRATA_LLM_BASE ?? "https://api.deepseek.com";
const MODEL = process.env.STRATA_LLM_MODEL ?? "deepseek-v4-pro";

export function llmAvailable(): boolean {
  return API_KEY.length > 0;
}

function chatOnce(system: string, user: string, maxTokens: number): Promise<string> {
  // relative join so a base with a path (e.g. https://host/v1) keeps its prefix
  const url = new URL("chat/completions", BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.15,
    max_tokens: maxTokens,
    stream: false,
  });
  return new Promise<string>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 180_000,
      },
      (res) => {
        let out = "";
        res.on("data", (d) => (out += d));
        res.on("end", () => {
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`LLM ${res.statusCode}: ${out.slice(0, 300)}`));
            return;
          }
          try {
            const j = JSON.parse(out);
            const content = String(j.choices?.[0]?.message?.content ?? "").trim();
            if (!content) {
              reject(new Error(`LLM empty content (finish=${j.choices?.[0]?.finish_reason})`));
              return;
            }
            resolve(content);
          } catch (e) {
            reject(new Error(`LLM bad envelope: ${(e as Error).message}`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("LLM request timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** Pull the first JSON object/array out of a model reply (tolerates fences/prose). */
export function extractJson<T>(text: string): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.search(/[\[{]/);
  if (start < 0) throw new Error(`no JSON in reply: ${text.slice(0, 200)}`);
  // walk to the matching close bracket
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === open) depth++;
    if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(candidate.slice(start, i + 1)) as T;
    }
  }
  throw new Error("unbalanced JSON in reply");
}

/**
 * Chat with retries; the reasoning model occasionally returns prose or truncates.
 * Optional `validate` runs semantic schema checks on the parsed JSON — when it
 * reports problems, the next attempt is a structured repair prompt carrying the
 * exact validation errors, so the model fixes shape instead of regenerating blind.
 */
export async function chatJson<T>(
  system: string,
  user: string,
  maxTokens = 6000,
  validate?: (v: T) => string[],
): Promise<T> {
  let lastErr: Error | null = null;
  let repair = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const text = await chatOnce(system, user + repair, maxTokens);
      const parsed = extractJson<T>(text);
      const problems = validate ? validate(parsed) : [];
      if (problems.length) {
        repair = `\n\nYOUR PREVIOUS REPLY FAILED SCHEMA VALIDATION:\n- ${problems.slice(0, 12).join("\n- ")}\nReturn the corrected complete JSON object only.`;
        throw new Error(`schema: ${problems.slice(0, 4).join("; ")}`);
      }
      return parsed;
    } catch (e) {
      lastErr = e as Error;
      console.warn(`llm attempt ${attempt}/3 failed: ${lastErr.message.slice(0, 160)}`);
    }
  }
  throw lastErr ?? new Error("llm failed");
}
