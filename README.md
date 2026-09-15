<div align="center">

# Thinking Cube

**Wireframe-cube loading indicators for AI interfaces.**<br>
Nine hand-tuned states. One canvas. Zero dependencies.

[![npm version](https://img.shields.io/npm/v/thinking-cube?style=flat&colorA=18181b&colorB=18181b&label=npm)](https://www.npmjs.com/package/thinking-cube)
[![bundle size](https://img.shields.io/bundlephobia/minzip/thinking-cube?style=flat&colorA=18181b&colorB=18181b&label=min%2Bgzip)](https://bundlephobia.com/package/thinking-cube)
[![dependencies](https://img.shields.io/badge/dependencies-0-18181b?style=flat&colorA=18181b)](https://www.npmjs.com/package/thinking-cube?activeTab=dependencies)
[![license](https://img.shields.io/npm/l/thinking-cube?style=flat&colorA=18181b&colorB=18181b)](https://github.com/sanskar0627/thinking-cube/blob/main/LICENSE)

**[Live demo](https://cube.sanskarshukla.com)** · [npm](https://www.npmjs.com/package/thinking-cube) · [GitHub](https://github.com/sanskar0627/thinking-cube) · [States](#states) · [API](#api)

<br>

<a href="https://cube.sanskarshukla.com">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/sanskar0627/thinking-cube/main/media/preview-dark.png">
  <img alt="The nine Thinking Cube states: solving, thinking, listening, working, searching, connecting, planning, breathing and shaping" src="https://raw.githubusercontent.com/sanskar0627/thinking-cube/main/media/preview-light.png" width="100%">
</picture>
</a>

<sub>Every state is live and tweakable in the <a href="https://cube.sanskarshukla.com">playground</a>.</sub>

</div>

<br>

## Why

AI products spend a lot of time waiting. A spinner only says "loading". Thinking Cube shows *what kind* of thinking is happening: searching, planning, solving, listening. Each state has its own motion, so the indicator carries meaning, not just time.

It is the cube companion to [thinking-orbs](https://libraries.dev/orbs). Same props, same monochrome dotted language, a different shape. If you already use orbs, switching to a cube is a one-line change.

- **Zero runtime dependencies.** No Three.js, no WebGL. A plain 2D canvas and a small projection engine, about 7 kB gzipped.
- **Built for two sizes.** Tuned by hand at `64` (avatar) and `20` (inline next to text). Anything in between interpolates.
- **Looks right everywhere.** Crisp on Retina screens and follows your light or dark theme automatically.
- **Polite by default.** Pauses off-screen and in background tabs, and respects reduced motion.

## Quick start

```bash
npm install thinking-cube
```

```tsx
import { ThinkingCube } from 'thinking-cube';

export function AgentStatus() {
  return (
    <div className="status">
      <ThinkingCube state="searching" size={20} />
      <span>Searching the docs…</span>
    </div>
  );
}
```

That's it. No provider, no CSS import, no config.

**Works with** React 18 and 19, Vite, Next.js, Remix and any other React setup. TypeScript types are included.

**Next.js App Router:** the package ships with `"use client"` built in, so you can import it straight into a Server Component.

**Prefer no dependency at all?** Thinking Cube is a single file. Copy [`ThinkingCube.tsx`](https://github.com/sanskar0627/thinking-cube/blob/main/ThinkingCube.tsx) into your project and import it locally.

## States

| State | What it shows | Good for |
| --- | --- | --- |
| `working` | A fast turn while particles race along every edge. | General background work |
| `searching` | A scan plane sweeps left and right through a cube built from dots. | Search, retrieval, browsing |
| `solving` | Slabs twist in quarter turns like a Rubik's cube, scramble, then click back to solved. | Reasoning, math, code |
| `listening` | A slow, two-tempo wave rolls through the dot cube, waiting for input. | Voice input, idle agent |
| `connecting` | Light travels along all twelve edges in both directions. | Network calls, tools, APIs |
| `weaving` | A route planner. A path picks its way node to node toward the far corner, then commits. | Planning, multi-step tasks |
| `composing` | Bands of dots undulate around the faces like lines on a score. | Writing, generating text |
| `breathing` | The cube expands and contracts on a calm sine wave. | Thinking, waiting |
| `shaping` | Edges draw in one by one, the faces fill, then everything dissolves and starts again. | Building, designing, rendering |

## Recipes

**Inline, next to a status line**

```tsx
<ThinkingCube state="weaving" size={20} />
```

**As an agent avatar**

```tsx
<ThinkingCube state="composing" size={64} />
```

**Follow your agent's real status**

```tsx
const state = isSearching ? 'searching' : isPlanning ? 'weaving' : 'breathing';

<ThinkingCube state={state} size={20} paused={isDone} />
```

Switching `state` keeps the animation clock running, and `paused` freezes the current frame, so a finished task can simply stop in place.

## API

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `state` | `CubeState` | `'working'` | Which animation to show. One of the nine states above. |
| `size` | `number` | `64` | Size in CSS pixels. The canvas renders at device pixel ratio for sharp edges. |
| `speed` | `number` | `1` | Animation clock multiplier. |
| `dark` | `boolean` | | Force light ink (`true`) or dark ink (`false`). Omit it to auto-detect. |
| `theme` | `'auto' \| 'dark' \| 'light'` | `'auto'` | Used when `dark` is not passed. Reads `data-theme` or a `.dark` class on any ancestor, then `prefers-color-scheme`. |
| `paused` | `boolean` | `false` | Freeze the current frame and stop the animation loop. |

Any other canvas attributes (`className`, `style`, `aria-label`…) pass straight through.

Also exported: `CUBE_STATES` (the list of states), the `CubeState`, `CubeTheme` and `ThinkingCubeProps` types, and `renderCubeFrame(ctx, state, size, t, dark)` if you want to draw a frame yourself.

## Accessibility and performance

- Renders as `role="img"` with a readable label per state (for example "Searching…"). Override it with `aria-label`.
- With `prefers-reduced-motion`, it draws a single still frame instead of animating.
- One `requestAnimationFrame` loop per cube. It stops completely when paused, unmounted, scrolled off-screen, or in a hidden tab.
- The animation clock survives prop changes, so toggling `paused`, `speed` or the theme never jumps the motion back to the start.

## How it works

The cube is drawn on a 2D canvas with a small hand-written projection. The camera sits at a fixed three-quarter view and only turns around the vertical axis, so the cube always reads as a cube: vertical edges stay vertical and opposite edges stay close to parallel. Back edges fade by face visibility, dots are depth-sorted, and size and brightness carry the sense of depth.

## Run the demo locally

```bash
git clone https://github.com/sanskar0627/thinking-cube.git
cd thinking-cube
npm install
npm run dev
```

| Path | What it is |
| --- | --- |
| `ThinkingCube.tsx` | The component and its animation engine. The only file you need. |
| `src/` | The demo site: preview grid, install docs and playground. |

Issues and ideas are welcome on [GitHub](https://github.com/sanskar0627/thinking-cube/issues).

## Credits

Inspired by [thinking-orbs](https://libraries.dev/orbs) by [Jakub Antalik](https://libraries.dev). Thinking Cube keeps its API and visual language, and the Rubik solve cycle and lattice motion are adapted from its MIT-licensed engine.

## License

[MIT](https://github.com/sanskar0627/thinking-cube/blob/main/LICENSE) © [Sanskar Shukla](https://sanskarshukla.com)
