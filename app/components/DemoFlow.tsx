"use client";

import React, { useState, useEffect, useRef } from "react";
import { useThemeMode } from "@/app/providers";
import { Maximize2, Minimize2 } from "lucide-react";
import "./DemoFlow.css";

// --- Node definitions (top-left coords in a 1200×600 space) ---
const NW = 168;
const NH = 72;

interface NodeDef {
  x: number;
  y: number;
  icon: string;
  title: string;
  sub: string;
  color: string;
}

const NODES: Record<string, NodeDef> = {
  User: {
    x: 40,
    y: 120,
    icon: "👤",
    title: "User",
    sub: "gives a URL",
    color: "#94a3b8",
  },
  A1: {
    x: 270,
    y: 120,
    icon: "🔍",
    title: "Discoverer",
    sub: "explore + plan",
    color: "#4ade80",
  },
  A2: {
    x: 500,
    y: 120,
    icon: "✍️",
    title: "Designer",
    sub: "write the tests",
    color: "#60a5fa",
  },
  A3: {
    x: 730,
    y: 120,
    icon: "🔧",
    title: "Tester",
    sub: "run + self-heal",
    color: "#fb923c",
  },
  A4: {
    x: 960,
    y: 120,
    icon: "📊",
    title: "Reporter",
    sub: "explain + report",
    color: "#c084fc",
  },
  PW: {
    x: 300,
    y: 430,
    icon: "🌐",
    title: "Playwright",
    sub: "real browser",
    color: "#2dd4bf",
  },
  DB: {
    x: 730,
    y: 430,
    icon: "🗄️",
    title: "Knowledge DB",
    sub: "plans·scripts·fixes",
    color: "#94a3b8",
  },
};

const center = (n: string) => ({
  x: NODES[n].x + NW / 2,
  y: NODES[n].y + NH / 2,
});

// --- Steps representation ---
interface StepDef {
  f: string;
  t: string;
  ph: number;
  k: "call" | "data" | "work";
  route: string;
  m: string;
  roundTrip?: boolean;
  chat?: [string, string][];
}

const STEPS: StepDef[] = [
  {
    f: "User",
    t: "A1",
    ph: 0,
    k: "call",
    route: "User → Discoverer",
    m: '"Test this website" — hands over a URL',
    chat: [
      ["User", "Here's a website — can you test it for me?"],
      ["A1", "Sure! I'll explore it live first, then write a plan."],
    ],
  },
  {
    f: "DB",
    t: "A1",
    ph: 1,
    k: "data",
    route: "Knowledge DB → Discoverer",
    m: "Its own previous plan for this site (memory / head-start)",
    roundTrip: true,
    chat: [
      ["A1", "Do we have a prior test plan for this URL?"],
      ["DB", "Yes - here's the plan I saved last time."],
    ],
  },
  {
    f: "A1",
    t: "PW",
    ph: 1,
    k: "call",
    route: "Discoverer → Playwright",
    m: "Open the site & click through it",
    chat: [
      ["A1", "Open the site and click through every page."],
      ["PW", "On it — driving the real browser now."],
    ],
  },
  {
    f: "PW",
    t: "A1",
    ph: 1,
    k: "data",
    route: "Playwright → Discoverer",
    m: "Pages + screenshots",
    chat: [
      ["PW", "Done. Sending you pages + screenshots."],
      ["A1", "Great - now I can see the real user flows."],
    ],
  },
  {
    f: "A1",
    t: "A1",
    ph: 1,
    k: "work",
    route: "Discoverer (working)",
    m: "Write a plain-English Test Plan — the user flows worth testing",
    chat: [["A1", "Writing a Test Plan - the flows worth testing."]],
  },
  {
    f: "A1",
    t: "A2",
    ph: 2,
    k: "call",
    route: "Discoverer → Designer",
    m: "Hand over the Test Plan",
    chat: [
      ["A1", "Here's the Test Plan. Over to you, Designer."],
      ["A2", "Thanks - I'll turn these flows into test scripts."],
    ],
  },
  {
    f: "DB",
    t: "A2",
    ph: 2,
    k: "data",
    route: "Knowledge DB → Designer",
    m: "Matching test scripts from past runs → REUSE them",
    roundTrip: true,
    chat: [
      ["A2", "Any prior test scripts that match these flows?"],
      ["DB", "Yes - reuse these, they passed last time"],
    ],
  },
  {
    f: "A2",
    t: "A2",
    ph: 2,
    k: "work",
    route: "Designer (working)",
    m: "Write new scripts for what isn't covered - spec files only, does NOT run them",
    chat: [
      [
        "A2",
        "Writing new scripts for the flows not covered by prior runs.",
      ],
    ],
  },
  {
    f: "A2",
    t: "A3",
    ph: 3,
    k: "call",
    route: "Designer → Tester",
    m: "Hand over the finished test spec files",
    chat: [
      ["A2", "Spec files are ready. Tester, they're yours."],
      ["A3", "Got them — running everything in the browser now."],
    ],
  },
  {
    f: "A3",
    t: "PW",
    ph: 3,
    k: "call",
    route: "Tester → Playwright",
    m: "Run every test in the browser",
    chat: [
      ["A3", "Run every test against the live site."],
      ["PW", "Running… executing each spec."],
    ],
  },
  {
    f: "PW",
    t: "A3",
    ph: 3,
    k: "data",
    route: "Playwright → Tester",
    m: "Pass / fail results",
    chat: [
      ["PW", "Results in: most passed, a few failed."],
      ["A3", "Let me take a look at those failures."],
    ],
  },
  {
    f: "DB",
    t: "A3",
    ph: 3,
    k: "data",
    route: "Knowledge DB → Tester",
    m: "Fixes that worked before for similar failures",
    roundTrip: true,
    chat: [
      ["A3", "Have we fixed failures like these before?"],
      ["DB", "Yes - here are the fixes that worked last time."],
    ],
  },
  {
    f: "A3",
    t: "A3",
    ph: 3,
    k: "work",
    route: "Tester (working)",
    m: "Repair what failed · park the unfixable",
    chat: [["A3", "Repairing what I can..."]],
  },
  {
    f: "A3",
    t: "A4",
    ph: 4,
    k: "call",
    route: "Tester → Reporter",
    m: "Final results + screenshots",
    chat: [
      ["A3", "Final results + screenshots. Reporter, wrap it up."],
      ["A4", "On it - writing this up for User."],
    ],
  },
  {
    f: "A4",
    t: "A4",
    ph: 4,
    k: "work",
    route: "Reporter (working)",
    m: "Write a human-readable Report — summary · issues · recommended fixes",
    chat: [
      [
        "A4",
        "Writing the Report — summary, issues, recommended fixes.",
      ],
    ],
  },
  {
    f: "A4",
    t: "User",
    ph: 4,
    k: "data",
    route: "Reporter → User",
    m: "📄 Test Report",
    chat: [
      ["A4", "Your Test Report is ready 📄"],
      ["User", "Thank you!"],
    ],
  },
  {
    f: "A4",
    t: "DB",
    ph: 4,
    k: "call",
    route: "Reporter → Knowledge DB",
    m: "Save this run → next run is smarter",
    chat: [
      ["A4", "Saving this run on DB."],
      ["DB", "Stored. I'll remember it for next time."],
    ],
  },
];

const PHASES = [
  "Kick-off",
  "Step 1 · Explore the live site, then plan",
  "Step 2 · Reuse what works, write the rest",
  "Step 3 · Run for real, then self-heal",
  "Step 4 · Explain the results",
];

// --- S-curve path builder ---
function buildPath(f: string, t: string) {
  const a = center(f);
  const b = center(t);
  if ((f === "A4" && t === "User") || (f === "User" && t === "A4")) {
    const top = 40;
    return `M ${a.x} ${a.y} C ${a.x} ${top}, ${b.x} ${top}, ${b.x} ${b.y}`;
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return `M ${a.x} ${a.y} C ${a.x + dx * 0.5} ${a.y}, ${b.x - dx * 0.5} ${b.y}, ${b.x} ${b.y}`;
  }
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy * 0.5}, ${b.x} ${b.y - dy * 0.5}, ${b.x} ${b.y}`;
}

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

export function DemoFlow() {
  const { theme } = useThemeMode();
  const [speed, setSpeed] = useState<number>(0.5);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [phaseText, setPhaseText] = useState<string>("Ready");
  const [isDoneDisabled, setIsDoneDisabled] = useState<boolean>(false);

  const stageRef = useRef<SVGSVGElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // We keep playing and index state in refs so the animation loops
  // always read the exact current value without relying on React rendering cycles.
  const playingRef = useRef<boolean>(false);
  const idxRef = useRef<number>(-1);
  const speedRef = useRef<number>(0.5);
  const animRef = useRef<number | null>(null);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Cached DOM elements generated on SVG layout initialization
  const edgesRef = useRef<Record<string, { el: SVGPathElement; from: string; to: string; len: number; arrows: Record<string, SVGPolygonElement> }>>({});
  const nodeElsRef = useRef<Record<string, SVGGElement>>({});
  const pulseRef = useRef<SVGCircleElement | null>(null);
  const allArrowsRef = useRef<SVGPolygonElement[]>([]);
  const bubbleLayerRef = useRef<SVGGElement | null>(null);
  const bubbleElsRef = useRef<SVGForeignObjectElement[]>([]);
  const dbParticlesGroupRef = useRef<SVGGElement | null>(null);
  const pgConsoleFORef = useRef<SVGForeignObjectElement | null>(null);

  const BASE = 2400; // base duration in ms

  // Sync speed state with animation ref
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Sync playing state with animation ref
  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  // SVG Initialization and construction
  useEffect(() => {
    if (!stageRef.current) return;

    // Reset content first to prevent duplicating elements in React dev environments
    stageRef.current.innerHTML = "";

    const SVGNS = "http://www.w3.org/2000/svg";
    const el = (tag: string, attrs: Record<string, any>, text?: string) => {
      const e = document.createElementNS(SVGNS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text !== undefined && text !== null) e.textContent = text;
      return e;
    };

    // --- Build edges structure ---
    const edges: Record<string, { from: string; to: string; d: string; el?: SVGPathElement; len?: number }> = {};
    const directed = new Set<string>();

    STEPS.forEach((s) => {
      if (s.f !== s.t) {
        directed.add(s.f + ">" + s.t);
        const key = pairKey(s.f, s.t);
        if (!edges[key]) {
          edges[key] = { from: s.f, to: s.t, d: buildPath(s.f, s.t) };
        }
      }
    });

    // 1. Edges Group
    const edgeLayer = el("g", {});
    stageRef.current.appendChild(edgeLayer);

    const edgesCached: typeof edgesRef.current = {};

    Object.keys(edges).forEach((key) => {
      const e = edges[key];
      const p = el("path", { d: e.d, class: "edge dashed" }) as SVGPathElement;
      edgeLayer.appendChild(p);
      edgesCached[key] = {
        el: p,
        from: e.from,
        to: e.to,
        len: p.getTotalLength(),
        arrows: {},
      };
    });
    edgesRef.current = edgesCached;

    // 2. Arrows Group
    const arrowLayer = el("g", {});
    stageRef.current.appendChild(arrowLayer);
    const allArrows: SVGPolygonElement[] = [];

    const norm = (x: number, y: number) => {
      const d = Math.hypot(x, y) || 1;
      return { x: x / d, y: y / d };
    };

    const insideCard = (p: SVGPoint, n: NodeDef, pad: number) =>
      p.x >= n.x - pad &&
      p.x <= n.x + NW + pad &&
      p.y >= n.y - pad &&
      p.y <= n.y + NH + pad;

    const makeArrow = (path: SVGPathElement, len: number, n: NodeDef, side: "to" | "from") => {
      const STEP = 1;
      const OVERLAP = 2.5;
      let edgeL = 0;
      let tip = { x: 0, y: 0 };
      let dir = { x: 0, y: 0 };

      if (side === "to") {
        edgeL = 0;
        for (let q = len; q >= 0; q -= STEP) {
          if (!insideCard(path.getPointAtLength(q), n, 0)) {
            edgeL = q;
            break;
          }
        }
        const onEdge = path.getPointAtLength(edgeL);
        const ahead = path.getPointAtLength(Math.min(len, edgeL + 8));
        dir = norm(ahead.x - onEdge.x, ahead.y - onEdge.y);
        tip = {
          x: onEdge.x + dir.x * OVERLAP,
          y: onEdge.y + dir.y * OVERLAP,
        };
      } else {
        edgeL = len;
        for (let q = 0; q <= len; q += STEP) {
          if (!insideCard(path.getPointAtLength(q), n, 0)) {
            edgeL = q;
            break;
          }
        }
        const onEdge = path.getPointAtLength(edgeL);
        const back = path.getPointAtLength(Math.max(0, edgeL - 8));
        dir = norm(back.x - onEdge.x, back.y - onEdge.y);
        tip = {
          x: onEdge.x + dir.x * OVERLAP,
          y: onEdge.y + dir.y * OVERLAP,
        };
      }

      const size = 7;
      const half = 4;
      const nx = -dir.y;
      const ny = dir.x;
      const bx = tip.x - dir.x * size;
      const by = tip.y - dir.y * size;
      const pts =
        `${tip.x.toFixed(1)},${tip.y.toFixed(1)} ` +
        `${(bx + nx * half).toFixed(1)},${(by + ny * half).toFixed(1)} ` +
        `${(bx - nx * half).toFixed(1)},${(by - ny * half).toFixed(1)}`;
      const poly = el("polygon", { points: pts, class: "arrow" }) as SVGPolygonElement;
      arrowLayer.appendChild(poly);
      allArrows.push(poly);
      return poly;
    };

    const BIDIRECTIONAL = new Set(["A1|DB", "A2|DB", "A3|DB"]);

    Object.keys(edgesRef.current).forEach((key) => {
      const e = edgesRef.current[key];
      const nodesTo = NODES[e.to];
      const nodesFrom = NODES[e.from];
      e.arrows[e.to] = makeArrow(e.el, e.len, nodesTo, "to");
      if (
        directed.has(e.to + ">" + e.from) ||
        BIDIRECTIONAL.has(pairKey(e.from, e.to))
      ) {
        e.arrows[e.from] = makeArrow(e.el, e.len, nodesFrom, "from");
      }
    });
    allArrowsRef.current = allArrows;

    // 3. Pulse circle
    const pulse = el("circle", {
      r: 5.5,
      class: "pulse",
      cx: -100,
      cy: -100,
      opacity: 0,
    }) as SVGCircleElement;
    pulseRef.current = pulse;

    // 4. Nodes Group
    const nodeEls: typeof nodeElsRef.current = {};
    Object.keys(NODES).forEach((id) => {
      const n = NODES[id];
      const g = el("g", { class: "node", "data-id": id }) as SVGGElement;
      g.appendChild(
        el("rect", {
          class: "node-card",
          x: n.x,
          y: n.y,
          width: NW,
          height: NH,
          rx: 12,
        })
      );
      g.appendChild(
        el("circle", {
          cx: n.x + 30,
          cy: n.y + NH / 2,
          r: 19,
          fill: n.color,
        })
      );
      g.appendChild(
        el(
          "text",
          { class: "node-icon", x: n.x + 30, y: n.y + NH / 2 + 1 },
          n.icon
        )
      );
      g.appendChild(
        el(
          "text",
          { class: "node-title", x: n.x + 58, y: n.y + 31 },
          n.title
        )
      );
      g.appendChild(
        el("text", { class: "node-sub", x: n.x + 58, y: n.y + 50 }, n.sub)
      );
      stageRef.current!.appendChild(g);
      nodeEls[id] = g;
    });
    nodeElsRef.current = nodeEls;

    // Add pulse to stage (on top of nodes)
    stageRef.current.appendChild(pulse);

    // 5. Bubbles Layer
    const bubbleLayer = el("g", {}) as SVGGElement;
    stageRef.current.appendChild(bubbleLayer);
    bubbleLayerRef.current = bubbleLayer;

    // 6. DB Particles Group
    const dbParticlesGroup = el("g", { id: "dbParticlesGroup" }) as SVGGElement;
    stageRef.current.appendChild(dbParticlesGroup);
    dbParticlesGroupRef.current = dbParticlesGroup;

    // 7. DB Sync Console
    const pgConsoleFO = el("foreignObject", {
      id: "pgConsoleFO",
      x: 915,
      y: 390,
      width: 260,
      height: 155,
      style: "display: none;",
    }) as SVGForeignObjectElement;

    const consoleDiv = document.createElement("div");
    consoleDiv.className = "transfer-modal";
    consoleDiv.innerHTML = `
      <div class="transfer-header">
        <span class="transfer-icon">📊 ➔ 🗄️</span>
        <span class="transfer-title">Syncing Run Data...</span>
        <span class="transfer-pct" id="transferPct">0%</span>
      </div>
      <div class="transfer-progress-container">
        <div class="transfer-progress-bar" id="transferProgressBar"></div>
      </div>
      <div class="transfer-stats">
        <div class="transfer-stat">Files: <span id="transferFiles">0 / 6</span></div>
        <div class="transfer-stat">Rate: <span id="transferRate">45.8 KB/s</span></div>
        <div class="transfer-stat">Time Left: <span id="transferTimeLeft">15s</span></div>
      </div>
      <div class="transfer-log" id="transferLog">
      </div>
    `;
    pgConsoleFO.appendChild(consoleDiv);
    stageRef.current.appendChild(pgConsoleFO);
    pgConsoleFORef.current = pgConsoleFO;

    // Initial reset
    resetAnimation(false);
  }, []);

  // --- Animation control functions ---

  function clearActive() {
    Object.values(edgesRef.current).forEach((e) =>
      e.el.classList.remove("active", "flow", "call", "data", "flow-reverse")
    );
    Object.values(nodeElsRef.current).forEach((g) =>
      g.classList.remove("active", "working", "db-ingesting")
    );
    if (pulseRef.current) {
      pulseRef.current.setAttribute("opacity", "0");
    }
    allArrowsRef.current.forEach((a) => a.classList.remove("blink"));
    clearBubbles();

    if (pgConsoleFORef.current) {
      pgConsoleFORef.current.style.display = "none";
      const innerConsole = pgConsoleFORef.current.querySelector(".transfer-modal");
      if (innerConsole) innerConsole.classList.remove("show");
    }
    if (dbParticlesGroupRef.current) {
      dbParticlesGroupRef.current.innerHTML = "";
    }
  }

  function clearBubbles() {
    while (bubbleElsRef.current.length > 0) {
      const fo = bubbleElsRef.current.pop();
      if (fo && bubbleLayerRef.current) {
        bubbleLayerRef.current.removeChild(fo);
      }
    }
  }

  function addBubble(nodeId: string, text: string) {
    const n = NODES[nodeId];
    if (!n || !bubbleLayerRef.current) return;

    const top = n.y < 300;
    const W = 180;
    const foH = top ? 95 : 85;
    let bx = n.x + NW / 2 - W / 2;
    bx = Math.max(8, Math.min(bx, 1200 - W - 8));
    const by = top ? n.y - 101 : n.y + NH + 4;

    const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    fo.setAttribute("x", String(bx));
    fo.setAttribute("y", String(by));
    fo.setAttribute("width", String(W));
    fo.setAttribute("height", String(foH));

    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap " + (top ? "above" : "below");

    const b = document.createElement("div");
    b.className = "bubble " + (top ? "tail-down" : "tail-up");

    const who = document.createElement("span");
    who.className = "bubble-who";
    who.textContent = NODES[nodeId].title;

    b.appendChild(who);
    b.appendChild(document.createTextNode(text));
    wrap.appendChild(b);
    fo.appendChild(wrap);

    bubbleLayerRef.current.appendChild(fo);
    bubbleElsRef.current.push(fo);
  }

  function blinkArrow(edge: typeof edgesRef.current[string], destId: string) {
    const a = edge.arrows[destId];
    if (!a) return;
    a.classList.remove("blink");
    void a.getBBox(); // Force reflow to restart SVG animation
    a.classList.add("blink");
  }

  function travelBall(
    edge: typeof edgesRef.current[string],
    srcId: string,
    dstId: string,
    kind: "call" | "data",
    travelMs: number
  ): Promise<void> {
    return new Promise((res) => {
      const forward = edge.from === srcId;
      edge.el.classList.remove("call", "data", "flow-reverse");
      edge.el.classList.add(kind);
      if (!forward) {
        edge.el.classList.add("flow-reverse");
      }
      if (pulseRef.current) {
        pulseRef.current.setAttribute("class", "pulse " + (kind === "data" ? "data" : "call"));
        pulseRef.current.setAttribute("opacity", "1");
      }

      const t0 = performance.now();
      const tick = (now: number) => {
        let p = (now - t0) / travelMs;
        if (p > 1) p = 1;
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
        const t = forward ? eased : 1 - eased;
        const pt = edge.el.getPointAtLength(edge.len * t);
        if (pulseRef.current) {
          pulseRef.current.setAttribute("cx", String(pt.x));
          pulseRef.current.setAttribute("cy", String(pt.y));
        }
        if (p >= 1) res();
        else animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    });
  }

  function waitMs(ms: number): Promise<void> {
    return new Promise((res) => {
      const t0 = performance.now();
      const tick = (now: number) => {
        if (now - t0 >= ms) res();
        else animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    });
  }

  function addLog(i: number) {
    if (!logRef.current) return;
    const s = STEPS[i];

    logRef.current.querySelectorAll(".log-item.cur").forEach((n) => n.classList.remove("cur"));

    const item = document.createElement("div");
    item.className = "log-item cur " + s.k;
    item.innerHTML = `
      <div class="log-num">${i + 1}</div>
      <div class="log-body">
        <span class="log-route">${s.route}</span>
        ${s.m}
      </div>
    `;
    logRef.current.appendChild(item);
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }

  function markDone(id: string) {
    const node = nodeElsRef.current[id];
    if (node) node.classList.add("done");
  }

  function triggerDbIngestAnimation(currentSpeed: number): Promise<void> {
    return new Promise((resolveAnimation) => {
      const dbNode = nodeElsRef.current["DB"];
      if (dbNode) dbNode.classList.add("db-ingesting");

      if (pgConsoleFORef.current) {
        pgConsoleFORef.current.style.display = "block";
        pgConsoleFORef.current.getBoundingClientRect();
        const innerConsole = pgConsoleFORef.current.querySelector(".transfer-modal");
        if (innerConsole) innerConsole.classList.add("show");
      }

      const pctEl = document.getElementById("transferPct");
      const barEl = document.getElementById("transferProgressBar");
      const filesEl = document.getElementById("transferFiles");
      const rateEl = document.getElementById("transferRate");
      const timeLeftEl = document.getElementById("transferTimeLeft");
      const localLogEl = document.getElementById("transferLog");

      if (localLogEl) localLogEl.innerHTML = "";

      const files = [
        { name: "test_spec_discovery.json", size: "18 KB" },
        { name: "locator_heal_map.json", size: "4 KB" },
        { name: "error_screengrab_step8.png", size: "215 KB" },
        { name: "performance_benchmarks.csv", size: "12 KB" },
        { name: "playwright_spec_healed.js", size: "32 KB" },
        { name: "test_run_report.html", size: "145 KB" },
      ];

      const totalDuration = 15000 / currentSpeed;
      const startTime = performance.now();

      let lastFileIdx = -1;
      let lastRateUpdate = 0;
      let transferActive = true;

      function addConsoleLog(text: string, type = "normal") {
        if (!localLogEl) return;
        const line = document.createElement("div");
        line.className = "log-line " + type;
        line.textContent = text;
        localLogEl.appendChild(line);
        localLogEl.scrollTop = localLogEl.scrollHeight;
      }

      addConsoleLog("Initializing connection...", "active");

      const progressTick = (now: number) => {
        if (!transferActive) return;
        const elapsed = now - startTime;
        const pct = Math.min(100, (elapsed / totalDuration) * 100);

        if (pctEl) pctEl.textContent = Math.round(pct) + "%";
        if (barEl && barEl instanceof HTMLElement) barEl.style.width = pct + "%";

        const secondsLeft = Math.max(0, Math.ceil((totalDuration - elapsed) / 1000));
        if (timeLeftEl) timeLeftEl.textContent = secondsLeft + "s";

        if (now - lastRateUpdate > 1200) {
          lastRateUpdate = now;
          const rate = (30 + Math.random() * 25).toFixed(1);
          if (rateEl) rateEl.textContent = rate + " KB/s";
        }

        const fileIdx = Math.floor(pct / 16.6);
        if (fileIdx > lastFileIdx && fileIdx < 6) {
          lastFileIdx = fileIdx;
          const f = files[fileIdx];
          if (filesEl) filesEl.textContent = `${fileIdx + 1} / 6`;
          addConsoleLog(`[${Math.round(pct)}%] Sending ${f.name} (${f.size})...`, "active");

          if (localLogEl) {
            const lines = localLogEl.querySelectorAll(".log-line");
            if (lines.length > 1) {
              const prevLine = lines[lines.length - 2];
              prevLine.className = "log-line success";
              prevLine.textContent = "✓ " + prevLine.textContent?.substring(4);
            }
          }
        }

        if (pct < 100) {
          animRef.current = requestAnimationFrame(progressTick);
        } else {
          if (filesEl) filesEl.textContent = "6 / 6";
          if (timeLeftEl) timeLeftEl.textContent = "0s";

          if (localLogEl) {
            const lines = localLogEl.querySelectorAll(".log-line");
            if (lines.length > 0) {
              const last = lines[lines.length - 1] as HTMLElement;
              last.className = "log-line success";
              if (last.textContent?.startsWith("[")) {
                last.textContent = "✓ " + last.textContent.substring(6);
              }
            }
          }

          addConsoleLog("✓ DB indices rebuilt & optimized.", "success");
          addConsoleLog("Ingestion complete. Sync successful!", "finish");

          setTimeout(() => {
            if (dbNode) dbNode.classList.remove("db-ingesting");
            resolveAnimation();
          }, 1000);
        }
      };
      animRef.current = requestAnimationFrame(progressTick);

      // Spawning particle elements
      if (dbParticlesGroupRef.current) {
        dbParticlesGroupRef.current.innerHTML = "";

        const startX = 814;
        const startY = 430;
        const endX = 760;
        const endY = 466;

        const spawnInterval = 500 / currentSpeed;
        let spawnedCount = 0;
        const maxSpawns = Math.floor(totalDuration / spawnInterval) - 2;

        const fileEmojis = ["📄", "📝", "📊", "📁", "⚡", "🖼️"];

        const spawnFileIcon = () => {
          if (spawnedCount >= maxSpawns || !transferActive || !dbParticlesGroupRef.current) return;
          spawnedCount++;

          const emoji = fileEmojis[Math.floor(Math.random() * fileEmojis.length)];
          const p = document.createElementNS("http://www.w3.org/2000/svg", "text");
          p.setAttribute("x", String(startX));
          p.setAttribute("y", String(startY));
          p.setAttribute("font-size", "13px");
          p.setAttribute("text-anchor", "middle");
          p.setAttribute("dominant-baseline", "middle");
          p.setAttribute("opacity", "0.9");
          p.setAttribute(
            "style",
            `cursor: default; user-select: none; font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji';`
          );
          p.textContent = emoji;

          dbParticlesGroupRef.current.appendChild(p);

          const iconStartTime = performance.now();
          const duration = (900 + Math.random() * 400) / currentSpeed;

          const offsetX = -25 - Math.random() * 45;
          const offsetY = (Math.random() - 0.5) * 30;

          const animateIcon = (now: number) => {
            const elapsed = now - iconStartTime;
            const pct = Math.min(1, elapsed / duration);

            const eased = pct < 0.5 ? 4 * pct * pct * pct : 1 - Math.pow(-2 * pct + 2, 3) / 2; // easeInOutCubic

            const cx = startX + (endX - startX) * eased + offsetX * Math.sin(pct * Math.PI);
            const cy = startY + (endY - startY) * eased + offsetY * Math.sin(pct * Math.PI);

            const rotation = eased * 360;

            p.setAttribute("x", String(cx));
            p.setAttribute("y", String(cy));
            p.setAttribute("transform", `rotate(${rotation}, ${cx}, ${cy})`);
            p.setAttribute("opacity", String(1 - eased));

            if (pct < 1) {
              requestAnimationFrame(animateIcon);
            } else {
              p.remove();
            }
          };
          requestAnimationFrame(animateIcon);

          setTimeout(spawnFileIcon, spawnInterval);
        };

        spawnFileIcon();
      }
    });
  }

  function runStep(i: number): Promise<void> {
    return new Promise((resolve) => {
      const s = STEPS[i];
      clearActive();
      setPhaseText(PHASES[s.ph]);
      addLog(i);

      const currentSpeed = speedRef.current;
      let dur = BASE / currentSpeed;
      const V = 0.125 * currentSpeed;

      // Reveal conversation bubbles in order as step plays out
      const chat = s.chat || [];
      const shownChat = new Array(chat.length).fill(false);
      const revealChat = (elapsed: number) => {
        for (let c = 0; c < chat.length; c++) {
          if (shownChat[c]) continue;
          const at = dur * Math.min(0.5, c * 0.42);
          if (elapsed >= at) {
            shownChat[c] = true;
            addBubble(chat[c][0], chat[c][1]);
          }
        }
      };

      if (s.f === s.t) {
        // Self working step: node pulses, no traveling dot
        dur = 1600 / currentSpeed;
        const activeNode = nodeElsRef.current[s.f];
        if (activeNode) {
          activeNode.classList.add("active", "working");
        }
        const t0 = performance.now();
        const tick = (now: number) => {
          revealChat(now - t0);
          if (now - t0 >= dur) {
            if (activeNode) activeNode.classList.remove("working");
            markDone(s.f);
            resolve();
          } else {
            animRef.current = requestAnimationFrame(tick);
          }
        };
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      // Round-trip edge querying (A asks, B answers)
      if (s.roundTrip) {
        const rtEdge = edgesRef.current[pairKey(s.f, s.t)];
        const asker = s.t;
        const responder = s.f;
        rtEdge.el.classList.remove("call", "data");
        rtEdge.el.classList.add("active", "flow", "call");

        const askerNode = nodeElsRef.current[asker];
        const responderNode = nodeElsRef.current[responder];
        if (askerNode) askerNode.classList.add("active");
        if (responderNode) responderNode.classList.add("active");

        const leg = rtEdge.len / V;
        (async () => {
          if (chat[0]) addBubble(chat[0][0], chat[0][1]);
          await travelBall(rtEdge, asker, responder, "call", leg);
          blinkArrow(rtEdge, responder);
          await waitMs(200 / currentSpeed);
          if (chat[1]) addBubble(chat[1][0], chat[1][1]);
          await travelBall(rtEdge, responder, asker, "data", leg);
          blinkArrow(rtEdge, asker);
          await waitMs(300 / currentSpeed);
          markDone(asker);
          markDone(responder);
          resolve();
        })();
        return;
      }

      // Travel step along shared edge
      const edge = edgesRef.current[pairKey(s.f, s.t)];
      const forward = edge.from === s.f;
      edge.el.classList.remove("call", "data", "flow-reverse");
      edge.el.classList.add("active", "flow", s.k);
      if (!forward) {
        edge.el.classList.add("flow-reverse");
      }
      const fromNode = nodeElsRef.current[s.f];
      const toNode = nodeElsRef.current[s.t];
      if (fromNode) fromNode.classList.add("active");
      if (toNode) toNode.classList.add("active");

      if (pulseRef.current) {
        pulseRef.current.setAttribute("class", "pulse " + (s.k === "data" ? "data" : "call"));
        pulseRef.current.setAttribute("opacity", "1");
      }

      const travel = edge.len / V;
      dur = travel + 600 / currentSpeed;
      const t0 = performance.now();
      let arrived = false;

      const tick = async (now: number) => {
        revealChat(now - t0);
        let p = (now - t0) / travel;
        if (p > 1) p = 1;
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
        const t = forward ? eased : 1 - eased;
        const pt = edge.el.getPointAtLength(edge.len * t);

        if (pulseRef.current) {
          pulseRef.current.setAttribute("cx", String(pt.x));
          pulseRef.current.setAttribute("cy", String(pt.y));
        }

        if (p >= 1 && !arrived) {
          arrived = true;
          blinkArrow(edge, s.t);
          if (s.f === "A4" && s.t === "DB") {
            // Trigger DB Ingest and wait for it
            triggerDbIngestAnimation(currentSpeed);
          }
        }

        const extraWait = s.f === "A4" && s.t === "DB" ? 15000 / currentSpeed : 0;
        if (p >= 1 && now - t0 >= dur + extraWait) {
          markDone(s.f);
          markDone(s.t);
          resolve();
        } else {
          animRef.current = requestAnimationFrame(tick);
        }
      };
      animRef.current = requestAnimationFrame(tick);
    });
  }

  async function advance() {
    if (idxRef.current >= STEPS.length - 1) {
      stopPlay(true);
      return false;
    }
    idxRef.current++;
    await runStep(idxRef.current);

    if (idxRef.current >= STEPS.length - 1) {
      stopPlay(true);
      resetAnimation(true, true);
      setPhaseText("Run completed");

      if (logRef.current) {
        logRef.current.querySelectorAll(".log-item.cur").forEach((n) => n.classList.remove("cur"));

        const item = document.createElement("div");
        item.className = "log-item cur";
        item.innerHTML = `
          <div class="log-num" style="background: #22c55e;">✓</div>
          <div class="log-body">
            <span class="log-route">System</span>
            Run completed
          </div>
        `;
        logRef.current.appendChild(item);
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    }
    return true;
  }

  async function loop() {
    while (playingRef.current) {
      const more = await advance();
      if (!more) break;
    }
  }

  function startPlay() {
    if (idxRef.current >= STEPS.length - 1) {
      resetAnimation(false);
    } else if (idxRef.current === -1) {
      if (logRef.current) logRef.current.innerHTML = "";
    }
    setIsPlaying(true);
    playingRef.current = true;
    loop();
  }

  function stopPlay(finished: boolean) {
    setIsPlaying(false);
    playingRef.current = false;
    if (animRef.current) cancelAnimationFrame(animRef.current);
  }

  function resetAnimation(repaint = true, keepLogs = false) {
    stopPlay(false);
    idxRef.current = -1;
    clearActive();
    Object.values(nodeElsRef.current).forEach((g) => g.classList.remove("done"));
    if (!keepLogs && logRef.current) {
      logRef.current.innerHTML = "";
    }
    if (repaint) {
      setPhaseText("Ready");
    }
  }

  async function handleStep() {
    if (playingRef.current) return;

    const nextStep = STEPS[idxRef.current + 1];
    if (!nextStep) return;
    const targetPh = nextStep.ph;

    setIsDoneDisabled(true);

    const savedSpeed = speedRef.current;
    // Fast-forward speed
    speedRef.current = 250;

    while (idxRef.current < STEPS.length - 1) {
      const stepToRun = STEPS[idxRef.current + 1];
      if (!stepToRun || stepToRun.ph !== targetPh) {
        break;
      }
      idxRef.current++;
      await runStep(idxRef.current);
    }

    // Restore speed
    speedRef.current = savedSpeed;

    if (idxRef.current >= STEPS.length - 1) {
      stopPlay(true);
      resetAnimation(true, true);
      setPhaseText("Run completed");

      if (logRef.current) {
        logRef.current.querySelectorAll(".log-item.cur").forEach((n) => n.classList.remove("cur"));

        const item = document.createElement("div");
        item.className = "log-item cur";
        item.innerHTML = `
          <div class="log-num" style="background: #22c55e;">✓</div>
          <div class="log-body">
            <span class="log-route">System</span>
            Run completed
          </div>
        `;
        logRef.current.appendChild(item);
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    } else {
      clearActive();
      setPhaseText(PHASES[STEPS[idxRef.current].ph]);
    }

    setIsDoneDisabled(false);
  }

  function adjustSpeed(amount: number) {
    let nextSpeed = speed + amount;
    nextSpeed = parseFloat(nextSpeed.toFixed(1));
    if (nextSpeed >= 0.1 && nextSpeed <= 3.0) {
      setSpeed(nextSpeed);
    }
  }

  return (
    <div ref={containerRef} className={`demo-flow-container ${theme === "light" ? "light" : ""}`}>
      <header>
        <div>
          <h1>Test-Suite — Agent Workflow</h1>
          <p>Watch a run flow through the four agents</p>
        </div>
        <button
          onClick={toggleFullscreen}
          className="fullscreen-btn"
          aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--ink)",
            cursor: "pointer",
            padding: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            transition: "background 0.2s",
          }}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </header>

      <div className="toolbar">
        <button
          onClick={() => (isPlaying ? stopPlay(false) : startPlay())}
          className={!isPlaying ? "primary" : ""}
          disabled={isDoneDisabled}
        >
          {isPlaying ? "⏸ Pause" : idxRef.current >= STEPS.length - 1 ? "▶ Replay" : "▶ Play"}
        </button>
        <button onClick={handleStep} disabled={isPlaying || isDoneDisabled}>
          ⏭ Step
        </button>
        <button onClick={() => resetAnimation(true)} disabled={isDoneDisabled}>
          ↻ Restart
        </button>
        <span className="speed">
          Speed
          <button
            onClick={() => adjustSpeed(-0.1)}
            className="speed-btn"
            aria-label="Decrease speed"
            disabled={isDoneDisabled}
          >
            −
          </button>
          <span id="speedVal">{speed.toFixed(1)}×</span>
          <button
            onClick={() => adjustSpeed(0.1)}
            className="speed-btn"
            aria-label="Increase speed"
            disabled={isDoneDisabled}
          >
            +
          </button>
        </span>
        <span className="spacer"></span>
        <span className="phase-tag" id="phaseTag">
          {phaseText}
        </span>
      </div>

      <div className="wrap">
        <div className="stage-area">
          <svg
            ref={stageRef}
            className="stage"
            id="stage"
            viewBox="0 0 1200 600"
            preserveAspectRatio="xMidYMid meet"
            aria-label="Agent workflow diagram"
          ></svg>
        </div>
        <aside className="side">
          <h2>Activity log</h2>
          <div ref={logRef} className="log" id="log"></div>
        </aside>
      </div>

      <footer>
        <div className="legend">
          <span>
            <i className="dot" style={{ background: "var(--accent)" }}></i> control / hand-off
          </span>
          <span>
            <i className="dot" style={{ background: "#0ea5a4" }}></i> data returned
          </span>
          <span>
            <i className="dot" style={{ background: "#f59e0b" }}></i> agent working
          </span>
        </div>
        <b>Playwright</b> (the real browser) is driven in <b>two places</b> — when the Discoverer explores the site,
        and when the Tester runs the spec files and heals them. The Designer never drives the browser.
      </footer>
    </div>
  );
}
