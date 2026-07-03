import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "./api";

/** Hand-rolled force-directed graph on canvas — zero dependencies. */

export interface HighlightMap {
  /** nodeId -> severity color key */
  hits: Record<string, "direct" | "indirect" | "verify">;
  active: boolean;
}

interface SimNode extends GraphNode {
  x: number; y: number; vx: number; vy: number; r: number;
}

const KIND_COLOR: Record<string, string> = {
  paragraph: "#ffb454",
  table: "#4dd8e6",
  file: "#9d8cff",
  copybook: "#c792ea",
  constants: "#ffd866",
};
const SEV_COLOR = { direct: "#ff4d4d", indirect: "#ff9f43", verify: "#4dabf7" } as const;

export default function Graph({
  nodes, edges, highlight, onSelect, selected,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlight: HighlightMap;
  onSelect: (id: string | null) => void;
  selected: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  hoverRef.current = hover;
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to);
      m.get(e.to)!.add(e.from);
    }
    return m;
  }, [edges]);

  // (re)seed simulation when nodes change
  useEffect(() => {
    const W = 900, H = 620;
    simRef.current = nodes.map((n, i) => {
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      const rad = 180 + (i % 3) * 60;
      const deg = adj.get(n.id)?.size ?? 0;
      return {
        ...n,
        x: W / 2 + Math.cos(angle) * rad,
        y: H / 2 + Math.sin(angle) * rad,
        vx: 0, vy: 0,
        r: Math.min(26, 10 + deg * 1.6 + n.rules.length * 1.2),
      };
    });
  }, [nodes, adj]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let t = 0;

    const edgePairs = edges
      .map((e) => ({ ...e }))
      .filter((e) => e.from !== e.to);

    function step() {
      const sim = simRef.current;
      const W = canvas.width / devicePixelRatio;
      const H = canvas.height / devicePixelRatio;
      // physics
      for (let i = 0; i < sim.length; i++) {
        const a = sim[i];
        // repulsion
        for (let k = i + 1; k < sim.length; k++) {
          const b = sim[k];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) d2 = 1;
          const d = Math.sqrt(d2);
          const force = 2600 / d2;
          const fx = (dx / d) * force, fy = (dy / d) * force;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
        // gravity to center
        a.vx += (W / 2 - a.x) * 0.0018;
        a.vy += (H / 2 - a.y) * 0.0022;
      }
      // springs
      const byId = new Map(sim.map((n) => [n.id, n]));
      for (const e of edgePairs) {
        const a = byId.get(e.from), b = byId.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const want = 120;
        const f = (d - want) * 0.004;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
      for (const n of sim) {
        n.vx *= 0.86; n.vy *= 0.86;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(n.r + 8, Math.min(W - n.r - 8, n.x));
        n.y = Math.max(n.r + 8, Math.min(H - n.r - 8, n.y));
      }

      // draw
      ctx.clearRect(0, 0, W, H);
      const hl = highlightRef.current;
      const hov = hoverRef.current;
      const sel = selectedRef.current;
      const focus = sel ?? hov;

      // edges
      for (const e of edgePairs) {
        const a = byId.get(e.from), b = byId.get(e.to);
        if (!a || !b) continue;
        const touchesFocus = focus && (e.from === focus || e.to === focus);
        const aHit = hl.active ? hl.hits[a.id] : undefined;
        const bHit = hl.active ? hl.hits[b.id] : undefined;
        const hot = aHit && bHit;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (hot) {
          ctx.strokeStyle = "rgba(255,90,70,0.55)";
          ctx.lineWidth = 1.8;
        } else if (touchesFocus) {
          ctx.strokeStyle = "rgba(255,214,102,0.75)";
          ctx.lineWidth = 1.8;
        } else {
          ctx.strokeStyle = hl.active ? "rgba(140,150,180,0.10)" : "rgba(140,150,180,0.22)";
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }

      // nodes
      t += 0.03;
      for (const n of sim) {
        const hit = hl.active ? hl.hits[n.id] : undefined;
        const dim = hl.active && !hit;
        const base = KIND_COLOR[n.kind] ?? "#8be9fd";
        const color = hit ? SEV_COLOR[hit] : base;
        const isFocus = focus === n.id;

        // glow for hits / focus
        if (hit || isFocus) {
          const pulse = 6 + Math.sin(t * 2 + n.x) * 3;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + pulse, 0, Math.PI * 2);
          ctx.fillStyle = hit
            ? `${SEV_COLOR[hit]}26`
            : "rgba(255,214,102,0.15)";
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = dim ? "rgba(60,66,86,0.65)" : color;
        ctx.globalAlpha = dim ? 0.55 : 1;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = isFocus ? 3 : 1.4;
        ctx.strokeStyle = isFocus ? "#ffd666" : "rgba(10,12,18,0.9)";
        ctx.stroke();

        // label
        ctx.font = "11px 'IBM Plex Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = dim ? "rgba(150,156,178,0.5)" : "rgba(236,240,252,0.92)";
        ctx.fillText(n.label.length > 20 ? n.label.slice(0, 19) + "…" : n.label, n.x, n.y + n.r + 14);
      }

      // expose live node positions for the demo recorder
      (window as unknown as { __nodes?: unknown }).__nodes = sim.map((n) => ({ id: n.id, x: n.x, y: n.y, r: n.r }));

      raf = requestAnimationFrame(step);
    }

    // hi-dpi
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [edges, nodes]);

  const pick = (ev: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    let found: string | null = null;
    for (const n of simRef.current) {
      const dx = n.x - x, dy = n.y - y;
      if (dx * dx + dy * dy <= (n.r + 6) * (n.r + 6)) { found = n.id; break; }
    }
    return found;
  };

  return (
    <canvas
      ref={canvasRef}
      className="graph-canvas"
      onMouseMove={(e) => setHover(pick(e))}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => onSelect(pick(e))}
    />
  );
}
