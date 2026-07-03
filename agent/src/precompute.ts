/**
 * Precompute the demo path so first visitors get instant results:
 * 1. analyze the bundled corpus
 * 2. run the three showcase change requests through impact + modernize
 * Everything lands in agent/data/cache and ships with the deploy.
 */
import { analyze, impact, loadCorpus, modernize } from "./pipeline.js";

export const SHOWCASE_CHANGES = [
  "Raise the overtime multiplier from 1.5x to 1.75x for weekday overtime, effective next pay week.",
  "New regulation: employee pension contributions must also be deducted for National Insurance purposes (NI moves from gross basis to pension-adjusted basis).",
  "Add a new grade G8 for logistics team leads at 22.40/hour, on the standard pension scheme.",
];

const files = loadCorpus();
console.log(`corpus: ${files.map((f) => f.name).join(", ")}`);

const t0 = Date.now();
const a = await analyze(files);
console.log(`analyze ok: ${a.rules.length} rules, ${a.nodes.length} nodes, ${a.edges.length} edges (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

for (const change of SHOWCASE_CHANGES) {
  const t1 = Date.now();
  const imp = await impact(files, a, change);
  console.log(`impact ok [${change.slice(0, 40)}…]: ${imp.blastRadius.length} hits (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
  const t2 = Date.now();
  const mod = await modernize(files, a, change, imp);
  console.log(`modernize ok: ${mod.modules.length} modules (${((Date.now() - t2) / 1000).toFixed(1)}s)`);
}
console.log("PRECOMPUTE DONE");
