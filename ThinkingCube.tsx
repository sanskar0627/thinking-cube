

import {
  useEffect,
  useRef,
  useState,
  type CanvasHTMLAttributes,
  type CSSProperties,
  type RefObject,
} from 'react';

/* ------------------------------------------------------------------------ */
/* Public API                                                               */
/* ------------------------------------------------------------------------ */

export type CubeState =
  | 'working'
  | 'searching'
  | 'solving'
  | 'listening'
  | 'connecting'
  | 'weaving'
  | 'composing'
  | 'breathing'
  | 'shaping';

export type CubeTheme = 'auto' | 'dark' | 'light';

export interface ThinkingCubeProps
  extends Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'style'> {
  /** Which animation to show. @default 'working' */
  state?: CubeState;
  /** CSS pixels. 64 = avatar, 20 = inline; other sizes interpolate. @default 64 */
  size?: number;
  /** Animation clock multiplier. @default 1 */
  speed?: number;
  /**
   * Pin the palette. `true` = light ink (for dark backgrounds).
   * When omitted, `theme` (default `auto`) resolves from the host.
   */
  dark?: boolean;
  /** Theme mode; used when `dark` is not passed. @default 'auto' */
  theme?: CubeTheme;
  /** Freeze on the current frame and stop the rAF loop. @default false */
  paused?: boolean;
  style?: CSSProperties;
}

export const CUBE_STATES: readonly CubeState[] = [
  'working',
  'searching',
  'solving',
  'listening',
  'connecting',
  'weaving',
  'composing',
  'breathing',
  'shaping',
];

const LABELS: Record<CubeState, string> = {
  working: 'Working…',
  searching: 'Searching…',
  solving: 'Solving…',
  listening: 'Listening…',
  connecting: 'Connecting…',
  weaving: 'Weaving…',
  composing: 'Composing…',
  breathing: 'Thinking…',
  shaping: 'Shaping…',
};

/** Per-state baked clock rates (seconds → animation time). */
const BASE_SPEED: Record<CubeState, number> = {
  working: 1.6,
  searching: 1.7,
  solving: 1.5,
  listening: 1.2,
  connecting: 2.2,
  weaving: 1.4,
  composing: 1.9,
  breathing: 2.4,
  shaping: 1.9,
};

/* ------------------------------------------------------------------------ */
/* Geometry                                                                 */
/* ------------------------------------------------------------------------ */

type Vec3 = readonly [number, number, number];

const VERTS: readonly Vec3[] = [
  [-1, -1, -1], // 0
  [1, -1, -1], // 1
  [1, 1, -1], // 2
  [-1, 1, -1], // 3
  [-1, -1, 1], // 4
  [1, -1, 1], // 5
  [1, 1, 1], // 6
  [-1, 1, 1], // 7
];

/** 12 edges: 4 bottom ring, 4 top ring, 4 vertical pillars. */
const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 5],
  [5, 4],
  [4, 0], // bottom (y = -1)
  [3, 2],
  [2, 6],
  [6, 7],
  [7, 3], // top (y = +1)
  [0, 3],
  [1, 2],
  [5, 6],
  [4, 7], // pillars
];

/** Faces as [axis, sign]; axis 0 = x, 1 = y, 2 = z. */
const FACES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [2, 1],
  [2, -1],
];

/** Which faces each edge belongs to (for hidden-line fading). */
const EDGE_FACES: number[][] = EDGES.map(([ia, ib]) => {
  const a = VERTS[ia];
  const b = VERTS[ib];
  const out: number[] = [];
  FACES.forEach(([axis, sign], f) => {
    if (a[axis] === sign && b[axis] === sign) out.push(f);
  });
  return out;
});

const FOCAL = 7;
/** Cube half-edge → canvas radius. Fits the worst-case silhouette at ~88 %. */
const FIT = 0.245;

type Projected = { x: number; y: number; z: number; d: number };

type View = {
  p: (x: number, y: number, z: number) => Projected;
  /** true if the face's outward normal faces the camera */
  faceVisible: boolean[];
  edgeFront: boolean[];
};

function makeView(
  elev: number,
  yaw: number,
  size: number,
  scale: number,
): View {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * FIT * scale;
  const se = Math.sin(elev);
  const ce = Math.cos(elev);
  const sy = Math.sin(yaw);
  const cyw = Math.cos(yaw);

  const rot = (x: number, y: number, z: number): [number, number, number] => {
    const x1 = x * cyw + z * sy;
    const z1 = -x * sy + z * cyw;
    const y1 = y * ce - z1 * se;
    const z2 = y * se + z1 * ce;
    return [x1, y1, z2];
  };

  const p = (x: number, y: number, z: number): Projected => {
    const [x1, y1, z2] = rot(x, y, z);
    const d = FOCAL / (FOCAL + z2);
    return { x: cx + x1 * r * d, y: cy - y1 * r * d, z: z2, d };
  };

  const faceVisible = FACES.map(([axis, sign]) => {
    const n: [number, number, number] = [0, 0, 0];
    n[axis] = sign;
    const [, , nz] = rot(n[0], n[1], n[2]);
    return nz < 0; // negative z = toward the camera
  });

  const edgeFront = EDGE_FACES.map((faces) => faces.some((f) => faceVisible[f]));

  return { p, faceVisible, edgeFront };
}

function facePoint(f: number, u: number, v: number): Vec3 {
  const [axis, sign] = FACES[f];
  const p: [number, number, number] = [0, 0, 0];
  p[axis] = sign;
  if (axis === 0) {
    p[1] = u;
    p[2] = v;
  } else if (axis === 1) {
    p[0] = u;
    p[2] = v;
  } else {
    p[0] = u;
    p[1] = v;
  }
  return p;
}

/** Push a point on a sphere-ish path out to the cube surface. */
function toSurface(x: number, y: number, z: number): Vec3 {
  const m = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) || 1;
  return [x / m, y / m, z / m];
}

/** Deduped dot grid covering all six faces — the cube "built from dots". */
const GRID_CACHE = new Map<number, Vec3[]>();
function surfaceGrid(g: number): Vec3[] {
  const hit = GRID_CACHE.get(g);
  if (hit) return hit;
  const seen = new Set<string>();
  const pts: Vec3[] = [];
  for (let f = 0; f < FACES.length; f++) {
    for (let i = 0; i <= g; i++) {
      for (let j = 0; j <= g; j++) {
        const p = facePoint(f, (i / g) * 2 - 1, (j / g) * 2 - 1);
        const key = `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pts.push(p);
      }
    }
  }
  GRID_CACHE.set(g, pts);
  return pts;
}

/* --- Rubik machinery (ported from thinking-orbs' lattice engine) -------- */
/* Rapid eased slab turns scramble the cube, then replay in reverse so     */
/* everything clicks back to solved, rests, repeats.                       */

type Move = { axis: 0 | 1 | 2; lo: number; ang: number };

function makeMoves(count: number): Move[] {
  const moves: Move[] = [];
  for (let i = 0; i < count; i++) {
    const axis = Math.min(2, Math.floor(hash(i, 2.3) * 3)) as 0 | 1 | 2;
    const lo = -1.0 + 0.5 * Math.min(3, Math.floor(hash(i, 5.9) * 4));
    const dir = hash(i, 7.7) < 0.5 ? 1 : -1;
    moves.push({ axis, lo, ang: (dir * Math.PI) / 2 });
  }
  return moves;
}

function solveCycle(time: number, count: number, slotDur: number, rest: number) {
  const cyc = 2 * count * slotDur + rest;
  const tc = time % cyc;
  const amount = new Array<number>(count).fill(0);
  let active = -1;
  if (tc < 2 * count * slotDur) {
    const slot = Math.floor(tc / slotDur);
    const p = (tc - slot * slotDur) / slotDur;
    const cl = Math.min(1, p / 0.7);
    const ep = 1 - (1 - cl) ** 3; // machine ease-out
    if (slot < count) {
      for (let i = 0; i < slot; i++) amount[i] = 1;
      amount[slot] = ep;
      active = slot;
    } else {
      const u = 2 * count - 1 - slot;
      for (let i = 0; i < u; i++) amount[i] = 1;
      amount[u] = 1 - ep;
      active = u;
    }
  }
  return { amount, active };
}

function applyMoves(
  pt: Vec3,
  moves: Move[],
  sc: { amount: number[]; active: number },
): [number, number, number, boolean] {
  let [x, y, z] = pt;
  let inActive = false;
  for (let i = 0; i < moves.length; i++) {
    if (sc.amount[i] <= 0) continue;
    const mv = moves[i];
    const raw = mv.axis === 0 ? x : mv.axis === 1 ? y : z;
    const c = Math.min(raw, 0.999); // a +1 coordinate belongs to the top slab
    if (c < mv.lo || c >= mv.lo + 0.5) continue;
    if (i === sc.active) inActive = true;
    const a = mv.ang * sc.amount[i];
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    if (mv.axis === 0) {
      const y2 = y * ca - z * sa;
      z = y * sa + z * ca;
      y = y2;
    } else if (mv.axis === 1) {
      const x2 = x * ca + z * sa;
      z = -x * sa + z * ca;
      x = x2;
    } else {
      const x2 = x * ca - y * sa;
      y = x * sa + y * ca;
      x = x2;
    }
  }
  return [x, y, z, inActive];
}

/* ------------------------------------------------------------------------ */
/* Primitives                                                               */
/* ------------------------------------------------------------------------ */

type Dot = { x: number; y: number; z: number; r: number; a: number };
type Seg = { x1: number; y1: number; x2: number; y2: number; w: number; a: number };
type Frame = { dots: Dot[]; segs: Seg[] };

/** Size-dependent tuning. 64 and 20 are hand-tuned; others interpolate. */
type Tune = {
  /** density multiplier for dot counts */
  n: number;
  /** base dot radius, px */
  dot: number;
  /** base line width, px */
  line: number;
  /** ink for hidden edges, relative to front */
  hidden: number;
};

function resolveTune(size: number): Tune {
  const t = clamp01((size - 20) / 44);
  return {
    n: lerp(0.4, 1, t),
    dot: lerp(0.62, 1.05, t) * (size > 64 ? size / 64 : 1),
    line: lerp(0.7, 1.0, t) * (size > 64 ? Math.sqrt(size / 64) : 1),
    hidden: lerp(0.18, 0.3, t),
  };
}

function clamp01(n: number) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function fract(n: number) {
  return n - Math.floor(n);
}
function hash(i: number, j: number) {
  const t = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return t - Math.floor(t);
}
function smooth(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}
/** 0 = far, 1 = near. */
function near(z: number) {
  return clamp01((1.9 - z) / 3.8);
}

class Sink {
  dots: Dot[] = [];
  segs: Seg[] = [];
  constructor(
    readonly view: View,
    readonly tune: Tune,
  ) {}

  dot(x: number, y: number, z: number, r: number, a: number) {
    if (a < 0.015) return;
    const p = this.view.p(x, y, z);
    const k = near(p.z);
    this.dots.push({
      x: p.x,
      y: p.y,
      z: p.z,
      r: r * this.tune.dot * (0.78 + 0.32 * k),
      a: a * (0.5 + 0.5 * k),
    });
  }

  line(a: Vec3, b: Vec3, w: number, alpha: number) {
    if (alpha < 0.015) return;
    const p = this.view.p(a[0], a[1], a[2]);
    const q = this.view.p(b[0], b[1], b[2]);
    this.segs.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, w: w * this.tune.line, a: alpha });
  }

  /** Dots evenly spaced along a segment (endpoints excluded). */
  dotsAlong(a: Vec3, b: Vec3, count: number, r: number, alpha: number) {
    const n = Math.max(1, Math.round(count * this.tune.n));
    for (let i = 1; i < n; i++) {
      const u = i / n;
      this.dot(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u), r, alpha);
    }
  }

  /**
   * The cube itself: 12 crisp edges (hidden ones faded), 8 vertex dots and a
   * dotted rhythm along each edge. `ink` scales everything.
   */
  frame(ink: number, edgeDots = 5, lineW = 1, vertexR = 1.5) {
    const { edgeFront } = this.view;
    for (let e = 0; e < EDGES.length; e++) {
      const [ia, ib] = EDGES[e];
      const front = edgeFront[e];
      const k = front ? 1 : this.tune.hidden;
      this.line(VERTS[ia], VERTS[ib], lineW, 0.62 * ink * k);
      this.dotsAlong(VERTS[ia], VERTS[ib], edgeDots, 0.62, 0.55 * ink * k);
    }
    for (let v = 0; v < 8; v++) {
      const p = VERTS[v];
      this.dot(p[0], p[1], p[2], vertexR, 0.95 * ink);
    }
  }

  /** Dot grid on one face (interior points only). */
  faceGrid(f: number, cells: number, r: number, alpha: number, fn?: (u: number, v: number) => number) {
    const g = Math.max(2, Math.round(cells * Math.sqrt(this.tune.n)));
    for (let i = 1; i < g; i++) {
      for (let j = 1; j < g; j++) {
        const u = (i / g) * 2 - 1;
        const v = (j / g) * 2 - 1;
        const k = fn ? fn(u, v) : 1;
        if (k <= 0) continue;
        const p = facePoint(f, u, v);
        this.dot(p[0], p[1], p[2], r * (0.6 + 0.4 * k), alpha * k);
      }
    }
  }

  frameOut(): Frame {
    this.dots.sort((a, b) => b.z - a.z); // far first
    return { dots: this.dots, segs: this.segs };
  }
}

function paint(ctx: CanvasRenderingContext2D, frame: Frame, dark: boolean) {
  const ink = dark ? '255,255,255' : '17,17,17';
  const { segs, dots } = frame;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    ctx.strokeStyle = `rgba(${ink},${s.a})`;
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i];
    ctx.fillStyle = `rgba(${ink},${d.a})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ------------------------------------------------------------------------ */
/* States                                                                   */
/* ------------------------------------------------------------------------ */

const ELEV = 0.5; // ~29° elevation: classic three-quarter product view
type Draw = (size: number, t: number, tune: Tune) => Frame;

/** Fast multi-axis spin with a jittering particle stream on every edge. */
const drawWorking: Draw = (size, t, tune) => {
  const s = new Sink(makeView(ELEV + 0.07 * Math.sin(t * 0.9), t * 1.25, size, 1), tune);
  s.frame(0.55, 4, 1, 1.3);
  const per = Math.max(1, Math.round(3 * tune.n));
  for (let e = 0; e < EDGES.length; e++) {
    const [ia, ib] = EDGES[e];
    const a = VERTS[ia];
    const b = VERTS[ib];
    const dir = hash(e, 3.1) > 0.5 ? 1 : -1;
    const spd = 0.5 + 0.6 * hash(e, 8.9);
    for (let k = 0; k < per; k++) {
      const u = fract(t * spd * dir + k / per + hash(e, 1.7));
      const j = 0.05;
      const jx = (hash(e + k, 2.2) - 0.5) * j * Math.sin(t * 17 + e);
      const jy = (hash(e + k, 4.4) - 0.5) * j * Math.cos(t * 15 + e);
      const jz = (hash(e + k, 6.6) - 0.5) * j * Math.sin(t * 13 + k);
      s.dot(
        lerp(a[0], b[0], u) + jx,
        lerp(a[1], b[1], u) + jy,
        lerp(a[2], b[2], u) + jz,
        1.15 + 0.3 * Math.sin(t * 9 + e + k),
        0.95,
      );
    }
  }
  return s.frameOut();
};

/** A scan plane sweeps left ↔ right through the dot-built cube. */
const drawSearching: Draw = (size, t, tune) => {
  const s = new Sink(makeView(ELEV, 0.6 + t * 0.16, size, 1), tune);
  const g = Math.max(4, Math.round(3 + 4 * Math.sqrt(tune.n)));
  const scanX = Math.sin(t * 0.85) * 0.85;
  for (const p of surfaceGrid(g)) {
    const d = p[0] - scanX;
    const boost = Math.exp(-(d * d) / 0.05);
    // un-scanned dots stay faint so the moving plane reads clearly
    s.dot(p[0], p[1], p[2], 0.62 + 1.05 * boost, 0.3 + 0.7 * boost);
  }
  // whisper of an outline so the silhouette holds at 20 px
  const lw = 0.8;
  for (let e = 0; e < EDGES.length; e++) {
    const [ia, ib] = EDGES[e];
    s.line(VERTS[ia], VERTS[ib], lw, s.view.edgeFront[e] ? 0.14 : 0.05);
  }
  return s.frameOut();
};

/** Rubik-style solving: slabs of the dot cube twist in quarter turns —
 *  scramble, then replay in reverse so everything clicks back solved. */
const MOVE_COUNT = 9;
const RUBIK_MOVES = makeMoves(MOVE_COUNT);
const drawSolving: Draw = (size, t, tune) => {
  const s = new Sink(makeView(ELEV + 0.08 * Math.sin(t * 0.5), 0.55 + t * 0.3, size, 0.96), tune);
  const g = Math.max(4, Math.round(3 + 4 * Math.sqrt(tune.n)));
  const sc = solveCycle(t, MOVE_COUNT, 0.5, 1.4);
  for (const p of surfaceGrid(g)) {
    const [x, y, z, active] = applyMoves(p, RUBIK_MOVES, sc);
    // the slab being turned inks brighter and a touch bigger — the "hand"
    s.dot(x, y, z, 0.78 + (active ? 0.5 : 0), active ? 1 : 0.62);
  }
  return s.frameOut();
};

/** A waveform rolls through the dot cube's bands — waiting for input. */
const drawListening: Draw = (size, t, tune) => {
  const s = new Sink(makeView(ELEV, 0.62 + t * 0.12, size, 1), tune);
  const g = Math.max(4, Math.round(3 + 4 * Math.sqrt(tune.n)));
  for (const p of surfaceGrid(g)) {
    // two waves, different tempi — organic, never quite repeating
    const w = 0.62 * Math.sin(t * 2.1 - p[1] * 2.4) + 0.38 * Math.sin(t * 1.27 + p[1] * 3.8);
    const k = 0.94 + 0.065 * w;
    const crest = Math.max(0, w);
    s.dot(p[0] * k, p[1] * k, p[2] * k, 0.68 * (1 + 0.45 * crest), 0.42 + 0.5 * crest);
  }
  return s.frameOut();
};

/** Light travels along the 12 edges; edges brighten as it passes. */
const drawConnecting: Draw = (size, t, tune) => {
  const s = new Sink(makeView(ELEV, t * 0.22, size, 1), tune);
  const { edgeFront } = s.view;

  for (let e = 0; e < EDGES.length; e++) {
    const [ia, ib] = EDGES[e];
    const a = VERTS[ia];
    const b = VERTS[ib];
    const k = edgeFront[e] ? 1 : tune.hidden;
    const glow = 0.5 + 0.5 * Math.sin(t * 1.5 - e * 0.52);
    s.line(a, b, 1, (0.35 + 0.55 * glow) * k);
    s.dotsAlong(a, b, 6, 0.6, (0.35 + 0.4 * glow) * k);

    // one packet per edge, direction alternates so traffic feels two-way
    const dir = e % 2 === 0 ? 1 : -1;
    const u = fract(t * 0.55 * dir + e * 0.083);
    s.dot(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u), 1.5, 1 * Math.max(k, 0.45));
  }
  for (let v = 0; v < 8; v++) {
    const p = VERTS[v];
    s.dot(p[0], p[1], p[2], 1.5 + 0.4 * Math.sin(t * 3 + v), 0.95);
  }
  return s.frameOut();
};

/* --- Agent planning: a route planner inside the cube --------------------- */
/* A lattice of candidate nodes fills the volume. From a start corner a      */
/* head walks node to node toward the opposite (goal) corner, mostly taking   */
/* steps that close the distance but sometimes detouring. At every node it    */
/* briefly flicks faint stubs toward the options it didn't take. On arrival   */
/* a pulse commits the route, it fades, and a fresh plan starts.              */

type Cell = readonly [number, number, number];
const PLAN_CACHE = new Map<string, Cell[]>();

function planRoute(k: number, n: number): Cell[] {
  const key = `${k}:${n}`;
  const hit = PLAN_CACHE.get(key);
  if (hit) return hit;
  const m = n - 1;
  const c = Math.floor(hash(k, 4.1) * 8);
  const start: Cell = [c & 1 ? m : 0, c & 2 ? m : 0, c & 4 ? m : 0];
  const goal: Cell = [m - start[0], m - start[1], m - start[2]];
  const dist = (p: Cell) =>
    Math.abs(p[0] - goal[0]) + Math.abs(p[1] - goal[1]) + Math.abs(p[2] - goal[2]);
  const seen = new Set<string>([start.join()]);
  const path: Cell[] = [start];
  const maxSteps = n >= 4 ? 15 : 9;
  for (let step = 0; step < maxSteps; step++) {
    const cur = path[path.length - 1];
    if (dist(cur) === 0) break;
    const opts: Array<{ p: Cell; w: number }> = [];
    for (let ax = 0; ax < 3; ax++) {
      for (const d of [-1, 1]) {
        const q: [number, number, number] = [cur[0], cur[1], cur[2]];
        q[ax] += d;
        if (q[ax] < 0 || q[ax] > m || seen.has(q.join())) continue;
        opts.push({ p: q, w: dist(q) < dist(cur) ? 3 : 0.7 });
      }
    }
    if (!opts.length) break;
    let total = 0;
    for (const o of opts) total += o.w;
    let r = hash(k * 31 + step, 9.7) * total;
    let pick = opts[opts.length - 1].p;
    for (const o of opts) {
      r -= o.w;
      if (r <= 0) {
        pick = o.p;
        break;
      }
    }
    seen.add(pick.join());
    path.push(pick);
  }
  if (PLAN_CACHE.size > 64) PLAN_CACHE.clear();
  PLAN_CACHE.set(key, path);
  return path;
}

const drawWeaving: Draw = (size, t, tune) => {
  const s = new Sink(makeView(ELEV, 0.7 + t * 0.2, size, 0.98), tune);
  const n = size >= 40 ? 4 : 3;
  const m = n - 1;
  const w = (i: number) => -1 + (2 * i) / m;
  const pos = (c: Cell): Vec3 => [w(c[0]), w(c[1]), w(c[2])];

  const CYCLE = 6.2;
  const k = Math.floor(t / CYCLE);
  const u = fract(t / CYCLE);
  const route = planRoute(k, n);
  const segs = route.length - 1;

  const DRAW_END = 0.7;
  const HOLD_END = 0.84;
  const fadeOut = u < HOLD_END ? 1 : 1 - smooth((u - HOLD_END) / (1 - HOLD_END));
  const fadeIn = smooth(u / 0.06);
  const vis = fadeIn * fadeOut;

  // the volume: faint outline + faint candidate nodes
  s.frame(0.22, 0, 0.9, 0.8);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let l = 0; l < n; l++) {
        s.dot(w(i), w(j), w(l), 0.55, 0.2);
      }

  // progress along the route (eased per segment so the head "decides" at nodes)
  const prog = clamp01(u / DRAW_END) * segs;
  const seg = Math.min(segs - 1, Math.floor(prog));
  const local = u >= DRAW_END ? 1 : smooth(prog - seg);
  const done = u >= DRAW_END ? segs : seg;

  // goal: a soft pulsing target at the far corner
  const goal = pos(route[route.length - 1]);
  const gp = 0.5 + 0.5 * Math.sin(t * 3.2);
  s.dot(goal[0], goal[1], goal[2], 1.5 + 0.9 * gp, (0.35 + 0.35 * gp) * vis);

  // committed segments
  const commit = u > DRAW_END && u < HOLD_END ? (u - DRAW_END) / (HOLD_END - DRAW_END) : -1;
  for (let i = 0; i < done; i++) {
    const a = pos(route[i]);
    const b = pos(route[i + 1]);
    // after arrival a bright pulse runs start → goal along the route
    const pulse = commit < 0 ? 0 : Math.exp(-Math.pow((commit * (segs + 2) - 1 - i) * 1.1, 2));
    s.line(a, b, 1.15, (0.62 + 0.38 * pulse) * vis);
    s.dot(a[0], a[1], a[2], 1.05 + 0.5 * pulse, (0.85 + 0.15 * pulse) * vis);
  }

  if (u < DRAW_END && segs > 0) {
    const a = pos(route[seg]);
    const b = pos(route[seg + 1]);
    const head: Vec3 = [lerp(a[0], b[0], local), lerp(a[1], b[1], local), lerp(a[2], b[2], local)];
    s.line(a, head, 1.15, 0.8 * vis);
    s.dot(a[0], a[1], a[2], 1.05, 0.9 * vis);

    // options considered at this node: faint stubs that retract as it commits
    const here = route[seg];
    const next = route[seg + 1];
    const visited = new Set(route.slice(0, seg + 2).map((c) => c.join()));
    const think = 1 - smooth((prog - seg) * 2.2);
    if (think > 0.02) {
      for (let ax = 0; ax < 3; ax++) {
        for (const d of [-1, 1]) {
          const q: [number, number, number] = [here[0], here[1], here[2]];
          q[ax] += d;
          if (q[ax] < 0 || q[ax] > m || visited.has(q.join())) continue;
          if (q[0] === next[0] && q[1] === next[1] && q[2] === next[2]) continue;
          const qp = pos(q);
          const reach = 0.5 * think;
          const tip: Vec3 = [lerp(a[0], qp[0], reach), lerp(a[1], qp[1], reach), lerp(a[2], qp[2], reach)];
          s.line(a, tip, 0.8, 0.4 * think * vis);
          s.dot(tip[0], tip[1], tip[2], 0.75, 0.55 * think * vis);
        }
      }
    }

    // the planner's head
    s.dot(head[0], head[1], head[2], 3.4, 0.14 * vis);
    s.dot(head[0], head[1], head[2], 1.9, 1 * vis);
  } else if (segs > 0) {
    s.dot(goal[0], goal[1], goal[2], 1.9, 1 * vis);
  }

  // start marker
  const st = pos(route[0]);
  s.dot(st[0], st[1], st[2], 1.5, 0.95 * vis);
  return s.frameOut();
};

/** Horizontal bands undulate around the faces like a written score. */
const drawComposing: Draw = (size, t, tune) => {
  const s = new Sink(makeView(ELEV, 0.5 + t * 0.12, size, 1), tune);
  s.frame(0.42, 3, 1, 1.2);
  const lanes = tune.n > 0.7 ? 5 : 3;
  const per = Math.max(20, Math.round(56 * tune.n));
  for (let l = 0; l < lanes; l++) {
    const c = (l - (lanes - 1) / 2) / ((lanes - 1) / 2);
    const y0 = c * 0.7;
    let prev: Vec3 | null = null;
    for (let i = 0; i <= per; i++) {
      const a = (i / per) * Math.PI * 2;
      const wob = 0.11 * Math.sin(a * 3 - t * 1.6 + l * 0.5) + 0.05 * Math.sin(a * 5 + t);
      const pt = toSurface(Math.cos(a), y0 + wob, Math.sin(a));
      const ink = 0.85 - 0.3 * Math.abs(c);
      if (prev) s.line(prev, pt, 0.7, 0.32 * ink);
      if (i % 2 === 0) s.dot(pt[0], pt[1], pt[2], 0.62, 0.8 * ink);
      prev = pt;
    }
  }
  return s.frameOut();
};

/** Smooth sine-wave scale in and out. */
const drawBreathing: Draw = (size, t, tune) => {
  const breath = 0.5 + 0.5 * Math.sin(t * 0.9);
  const s = new Sink(makeView(ELEV, 0.55 + t * 0.09, size, 0.9 + 0.13 * breath), tune);
  s.frame(0.55 + 0.35 * breath, 7, 1, 1.2 + 0.7 * breath);
  return s.frameOut();
};

/** Edges draw in one by one → faces fill → everything dissolves; repeat. */
const drawShaping: Draw = (size, t, tune) => {
  const s = new Sink(makeView(ELEV, 0.6 + t * 0.1, size, 1), tune);
  const cycle = 6;
  const u = fract(t / cycle);
  // phases: 0 → 0.4 draw edges, 0.4 → 0.7 fill faces, 0.7 → 1 dissolve
  const drawP = clamp01(u / 0.4);
  const fillP = clamp01((u - 0.4) / 0.3);
  const dissP = clamp01((u - 0.7) / 0.3);
  const keep = 1 - smooth(dissP);

  s.frame(0.12 * keep, 0, 1, 0.8); // faint ghost so the volume is always implied
  const { edgeFront } = s.view;

  // edges appear in order: bottom ring, pillars, top ring
  const order = [0, 1, 2, 3, 8, 9, 10, 11, 4, 5, 6, 7];
  for (let i = 0; i < order.length; i++) {
    const e = order[i];
    const local = clamp01(drawP * order.length - i);
    if (local <= 0) continue;
    const [ia, ib] = EDGES[e];
    const a = VERTS[ia];
    const b = VERTS[ib];
    const end: Vec3 = [lerp(a[0], b[0], local), lerp(a[1], b[1], local), lerp(a[2], b[2], local)];
    const k = edgeFront[e] ? 1 : tune.hidden;
    s.line(a, end, 1, 0.75 * k * keep);
    s.dotsAlong(a, end, Math.round(5 * local), 0.62, 0.6 * k * keep);
    s.dot(end[0], end[1], end[2], 1.4, 0.95 * Math.max(k, 0.5) * keep);
    if (local >= 1) s.dot(a[0], a[1], a[2], 1.3, 0.9 * keep);
  }

  if (fillP > 0) {
    const faces = Math.min(6, Math.floor(fillP * 6.999));
    for (let f = 0; f < FACES.length; f++) {
      const local = clamp01(fillP * 6 - f);
      if (local <= 0) continue;
      s.faceGrid(f, 5, 0.7, 0.6 * keep, (uu) => (uu + 1) / 2 <= local ? 1 : 0);
    }
    void faces;
  }
  return s.frameOut();
};

const DRAW: Record<CubeState, Draw> = {
  working: drawWorking,
  searching: drawSearching,
  solving: drawSolving,
  listening: drawListening,
  connecting: drawConnecting,
  weaving: drawWeaving,
  composing: drawComposing,
  breathing: drawBreathing,
  shaping: drawShaping,
};

/**
 * Render one frame of a state onto a 2D context that has already been scaled
 * for device pixels. Exported so tests / other renderers can drive the engine
 * without React.
 */
export function renderCubeFrame(
  ctx: CanvasRenderingContext2D,
  state: CubeState,
  size: number,
  t: number,
  dark: boolean,
) {
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  paint(ctx, DRAW[state](size, t, resolveTune(size)), dark);
}

/* ------------------------------------------------------------------------ */
/* Theme + motion hooks                                                     */
/* ------------------------------------------------------------------------ */

function ancestorTheme(el: HTMLElement | null): boolean | null {
  let node: HTMLElement | null = el;
  while (node) {
    const data = node.getAttribute('data-theme');
    if (data === 'dark') return true;
    if (data === 'light') return false;
    if (node.classList.contains('dark')) return true;
    if (node.classList.contains('light')) return false;
    node = node.parentElement;
  }
  return null;
}

function osDark() {
  return typeof matchMedia === 'undefined' || matchMedia('(prefers-color-scheme: dark)').matches;
}

function useResolvedDark(
  theme: CubeTheme,
  darkProp: boolean | undefined,
  ref: RefObject<HTMLCanvasElement | null>,
) {
  const [dark, setDark] = useState(() =>
    typeof darkProp === 'boolean' ? darkProp : theme !== 'light',
  );

  useEffect(() => {
    if (typeof darkProp === 'boolean') {
      setDark(darkProp);
      return;
    }
    if (theme === 'dark') {
      setDark(true);
      return;
    }
    if (theme === 'light') {
      setDark(false);
      return;
    }
    const sync = () => setDark(ancestorTheme(ref.current) ?? osDark());
    sync();
    const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
    mq?.addEventListener('change', sync);
    let mo: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined' && ref.current) {
      mo = new MutationObserver(sync);
      mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme'],
        subtree: true,
      });
    }
    return () => {
      mq?.removeEventListener('change', sync);
      mo?.disconnect();
    };
  }, [theme, darkProp, ref]);

  return dark;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function normalizeState(state: string | undefined): CubeState {
  return CUBE_STATES.includes(state as CubeState) ? (state as CubeState) : 'working';
}

/* ------------------------------------------------------------------------ */
/* Component                                                                */
/* ------------------------------------------------------------------------ */

export function ThinkingCube({
  state = 'working',
  size = 64,
  speed = 1,
  dark: darkProp,
  theme = 'auto',
  paused = false,
  style,
  'aria-label': ariaLabel,
  ...rest
}: ThinkingCubeProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const resolvedState = normalizeState(state);
  const cssSize = Math.max(8, size);
  const dark = useResolvedDark(theme, darkProp, ref);
  const reduced = useReducedMotion();

  // Animation clock survives prop changes (pause/resume, speed, theme) so the
  // cube never jumps back to t = 0.
  const clock = useRef({ t: 0, last: 0 });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const dpr = Math.min(3, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const rate = BASE_SPEED[resolvedState] * speed;
    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderCubeFrame(ctx, resolvedState, cssSize, t, dark);
    };

    if (reduced) {
      draw(0.9);
      return;
    }

    draw(clock.current.t);
    if (paused) return;

    let raf = 0;
    let running = false;
    let visible = true;

    const loop = (now: number) => {
      const c = clock.current;
      const dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 0;
      c.last = now;
      c.t += dt * rate;
      draw(c.t);
      if (running) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      clock.current.last = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            if (visible && document.visibilityState !== 'hidden') start();
            else stop();
          })
        : null;
    io?.observe(canvas);
    const onVis = () => {
      if (document.visibilityState === 'hidden') stop();
      else if (visible) start();
    };
    document.addEventListener('visibilitychange', onVis);
    if (!io) start();

    return () => {
      stop();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [resolvedState, cssSize, dark, speed, paused, reduced]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={ariaLabel ?? LABELS[resolvedState]}
      data-state={resolvedState}
      width={cssSize}
      height={cssSize}
      style={{ width: cssSize, height: cssSize, display: 'block', ...style }}
      {...rest}
    />
  );
}

export default ThinkingCube;
