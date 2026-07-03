import path from "node:path";
import express from "express";
import cors from "cors";
import { llmAvailable } from "./llm.js";
import {
  ROOT,
  analyze,
  impact,
  loadCorpus,
  modernize,
  type Analysis,
  type SourceFile,
} from "./pipeline.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT ?? 4032);
const HOST = process.env.HOST ?? "0.0.0.0";

/** In-memory registry of analyses so impact/modernize can reference them. */
const analyses = new Map<string, { analysis: Analysis; files: SourceFile[] }>();

app.get("/api/meta", (_req, res) => {
  res.json({
    name: "strata",
    llm: llmAvailable() ? "online" : "offline",
    corpus: loadCorpus().map((f) => ({ name: f.name, loc: f.content.split("\n").length })),
  });
});

app.get("/api/corpus", (_req, res) => {
  res.json({ files: loadCorpus() });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const files: SourceFile[] =
      Array.isArray(req.body?.files) && req.body.files.length
        ? req.body.files.map((f: SourceFile) => ({ name: String(f.name), content: String(f.content) }))
        : loadCorpus();
    const totalLoc = files.reduce((n, f) => n + f.content.split("\n").length, 0);
    if (totalLoc > 4000) {
      res.status(400).json({ error: "listing too large for the live demo (4000-line cap)" });
      return;
    }
    const analysis = await analyze(files);
    analyses.set(analysis.id, { analysis, files });
    res.json(analysis);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post("/api/impact", async (req, res) => {
  try {
    const { analysisId, change } = req.body ?? {};
    const entry = analyses.get(String(analysisId));
    if (!entry) {
      res.status(404).json({ error: "analysis not found — run /api/analyze first" });
      return;
    }
    if (!change || String(change).trim().length < 8) {
      res.status(400).json({ error: "describe the business change (a sentence or two)" });
      return;
    }
    const result = await impact(entry.files, entry.analysis, String(change).slice(0, 500));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post("/api/modernize", async (req, res) => {
  try {
    const { analysisId, change, impact: imp } = req.body ?? {};
    const entry = analyses.get(String(analysisId));
    if (!entry) {
      res.status(404).json({ error: "analysis not found — run /api/analyze first" });
      return;
    }
    const result = await modernize(entry.files, entry.analysis, String(change).slice(0, 500), imp);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ---- static web app ----
const webDist = path.join(ROOT, "web", "dist");
app.use(express.static(webDist));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).send("web UI not built yet — cd web && npm run build");
  });
});

app.listen(PORT, HOST, () => {
  console.log(`STRATA agent on ${HOST}:${PORT} — llm ${llmAvailable() ? "online" : "OFFLINE (set STRATA_LLM_KEY)"}`);
  // Warm the registry with the bundled corpus if a cached analysis exists,
  // so impact/modernize work immediately after a restart.
  analyze(loadCorpus())
    .then((a) => {
      analyses.set(a.id, { analysis: a, files: loadCorpus() });
      console.log(`corpus analysis ready: ${a.id} (${a.rules.length} rules, ${a.nodes.length} nodes)`);
    })
    .catch((e) => console.warn("corpus warmup skipped:", (e as Error).message.slice(0, 120)));
});
