import { useEffect, useState, type ReactNode } from 'react';
import { ThinkingCube, type CubeState } from '../ThinkingCube';

// Order matters: with row-major auto-placement over 151px rows, this
// sequence of 1- and 2-row spans tiles five rows with no leftover gaps.
const CHIP_STATES: CubeState[] = [
  'listening',
  'working',
  'searching',
  'connecting',
  'weaving',
  'breathing',
  'shaping',
];
const LARGE_CHIPS = new Set<CubeState>(['working', 'searching', 'connecting']);
const LABEL_OVERRIDES: Partial<Record<CubeState, string>> = {
  weaving: 'planning',
  breathing: 'thinking',
};
const HERO_PILLS: Array<{ state: CubeState; label: string }> = [
  { state: 'solving', label: 'Solving….' },
  { state: 'composing', label: 'Thinking….' },
];

/** The playground draws the chosen size larger so the motion is easy to read. */
const STAGE_ZOOM = 2.5;

/** Playground buttons use the same names and order as the preview above. */
const PLAYGROUND_STATES: Array<{ state: CubeState; label: string }> = [
  { state: 'solving', label: 'Solving' },
  { state: 'composing', label: 'Thinking' },
  { state: 'listening', label: 'Agent listening' },
  { state: 'working', label: 'Working' },
  { state: 'searching', label: 'Searching' },
  { state: 'connecting', label: 'Connecting' },
  { state: 'weaving', label: 'Agent planning' },
  { state: 'breathing', label: 'Agent thinking' },
  { state: 'shaping', label: 'Agent shaping' },
];

const INSTALL = 'npm install thinking-cube';
const INSTALL_SHORT = 'npm i thinking-cube';
const USAGE = `import { ThinkingCube } from 'thinking-cube';

<ThinkingCube state="searching" size={64} />
<ThinkingCube state="working" size={20} />   // inline, next to text`;

type PropRow = { name: string; type: string[]; def: string; desc: string };
const PROPS: PropRow[] = [
  {
    name: 'state',
    type: ['working', 'searching', 'solving', 'listening', 'connecting', 'weaving', 'composing', 'breathing', 'shaping'],
    def: "'working'",
    desc: 'Which animation to show.',
  },
  { name: 'size', type: ['number'], def: '64', desc: 'CSS pixels. 64 for avatars, 20 inline; other sizes interpolate.' },
  { name: 'speed', type: ['number'], def: '1', desc: 'Animation clock multiplier.' },
  { name: 'dark', type: ['boolean'], def: '—', desc: 'Force light ink (`true`) or dark ink (`false`). Omit to auto-detect.' },
  { name: 'theme', type: ['auto', 'dark', 'light'], def: "'auto'", desc: 'Used when `dark` is not passed. Reads `data-theme`, `.dark` or `prefers-color-scheme`.' },
  { name: 'paused', type: ['boolean'], def: 'false', desc: 'Freeze the current frame and stop the animation loop.' },
];

function Shimmer({ text }: { text: string }) {
  return (
    <span className="shimmer" data-text={text}>
      {text}
    </span>
  );
}

/** Minimal TSX/shell highlighter — enough for the snippets on this page. */
const TOKEN =
  /(\/\/[^\n]*)|('[^'\n]*'|"[^"\n]*")|\b(import|from|export|const|return)\b|(<\/?[A-Z][\w]*|\/?>)|([a-zA-Z-]+)(?==)|(\b\d+(?:\.\d+)?\b)|(^\$ )|([{}=])/gm;

function Highlight({ code }: { code: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of code.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(code.slice(last, i));
    const cls = m[1]
      ? 'tok-com'
      : m[2]
        ? 'tok-str'
        : m[3]
          ? 'tok-kw'
          : m[4]
            ? 'tok-tag'
            : m[5]
              ? 'tok-attr'
              : m[6]
                ? 'tok-num'
                : m[7]
                  ? 'tok-prompt'
                  : 'tok-punc';
    out.push(
      <span key={key++} className={cls}>
        {m[0]}
      </span>,
    );
    last = i + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return <>{out}</>;
}

function CodeWindow({ title, code, copyText }: { title: string; code: string; copyText?: string }) {
  return (
    <div className="code-window">
      <div className="code-bar">
        <span className="code-title">{title}</span>
        <CopyButton text={copyText ?? code} />
      </div>
      <pre className="code-body">
        <code>
          <Highlight code={code} />
        </code>
      </pre>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
  };

  return (
    <button
      type="button"
      className="copy-btn"
      data-copied={copied}
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy code'}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.8" />
          <path d="M10.5 3.2V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.2" />
        </svg>
      )}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

/** Renders `backticked` words in a description as inline code. */
function inlineCode(text: string) {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith('`') ? (
      <code key={i} className="api-inline">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

/** Logo geometry (public/images/logo.svg) without the tile: [x, y, r, opacity]. */
const MARK_DOTS: Array<[number, number, number, number]> = [
  [256, 98, 16.875, 1], [210.4, 124.3, 14.175, 1], [164.8, 150.7, 14.175, 1], [119.2, 177, 16.875, 1],
  [301.6, 124.3, 14.175, 1], [256, 150.7, 14.175, 1], [210.4, 177, 14.175, 1], [164.8, 203.3, 14.175, 1],
  [347.2, 150.7, 14.175, 1], [301.6, 177, 14.175, 1], [256, 203.3, 14.175, 1], [210.4, 229.7, 14.175, 1],
  [392.8, 177, 16.875, 1], [347.2, 203.3, 14.175, 1], [301.6, 229.7, 14.175, 1], [119.2, 229.7, 14.175, .56],
  [119.2, 282.3, 14.175, .56], [119.2, 335, 16.875, .56], [164.8, 256, 14.175, .56], [164.8, 308.7, 14.175, .56],
  [164.8, 361.3, 14.175, .56], [210.4, 282.3, 14.175, .56], [210.4, 335, 14.175, .56], [210.4, 387.7, 14.175, .56],
  [256, 308.7, 14.175, .56], [256, 361.3, 14.175, .56], [256, 414, 16.875, .56], [301.6, 282.3, 14.175, .26],
  [301.6, 335, 14.175, .26], [301.6, 387.7, 14.175, .26], [347.2, 256, 14.175, .26], [347.2, 308.7, 14.175, .26],
  [347.2, 361.3, 14.175, .26], [392.8, 229.7, 14.175, .26], [392.8, 282.3, 14.175, .26], [392.8, 335, 16.875, .26],
];

/** The logo drawn in currentColor, so it takes the page's ink in both themes. */
function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="84 84 344 344"
      aria-hidden="true"
    >
      <mask id="tc-core">
        <rect x="0" y="0" width="512" height="512" fill="#fff" />
        <circle cx="256" cy="256" r="38" fill="#000" />
      </mask>
      <g fill="currentColor" mask="url(#tc-core)">
        <path
          d="M256 98 392.83 177v158L256 414 119.17 335V177ZM256 256l136.83-79M256 256 119.17 177M256 256v158"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.22}
          strokeWidth={5}
          strokeLinejoin="round"
        />
        {MARK_DOTS.map(([x, y, r, o], i) => (
          <circle key={i} cx={x} cy={y} r={r} fillOpacity={o} />
        ))}
      </g>
      <circle cx="256" cy="256" r="20" fill="currentColor" />
    </svg>
  );
}

export default function App() {
  const [dark, setDark] = useState(true);
  const [tab, setTab] = useState<'preview' | 'install'>('preview');
  const [state, setState] = useState<CubeState>('searching');
  const [size, setSize] = useState<64 | 20>(64);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(100); // percent, 25..300

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const mul = speed / 100;
  const snippet = `<ThinkingCube\n  state="${state}"\n  size={${size}}${
    speed !== 100 ? `\n  speed={${mul}}` : ''
  }${paused ? '\n  paused' : ''}\n/>`;

  return (
    <main className="page">
      <nav className="topbar" aria-label="Site">
        <a className="brand" href="#top" aria-label="Thinking Cube, back to top">
          <BrandMark size={26} />
          <span className="brand-name">thinking-cube</span>
        </a>
        <div className="topnav">
          <a href="https://github.com/sanskar0627/thinking-cube" target="_blank" rel="noreferrer">
            GitHub<span className="topnav-arrow" aria-hidden="true">↗</span>
          </a>
          <a href="#playground">Playground</a>
          <a href="#docs" onClick={() => setTab('install')}>
            <span className="nav-long">Install &amp; Usage</span>
            <span className="nav-short">Docs</span>
          </a>
          <button
            className="theme-icon"
            type="button"
            onClick={() => setDark((d) => !d)}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M13.2 9.6A5.5 5.5 0 0 1 6.4 2.8a5.5 5.5 0 1 0 6.8 6.8Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="3" />
                <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      <header className="hero" id="top">
        <div className="hero-copy">
          <h1 className="display">Thinking Cube</h1>
          <p className="hero-tag">Loaders that show their work.</p>
          <p className="hero-lede">
            Nine hand-tuned states for searching, solving, planning and listening. One React
            component, one canvas, zero dependencies.
          </p>
          <div className="hero-cta">
            <div className="install-pill">
              <code>
                <span className="tok-prompt">$ </span>
                {INSTALL_SHORT}
              </code>
              <CopyButton text={INSTALL_SHORT} />
            </div>
            <span className="hero-meta">~7 kB · MIT · React 18+</span>
          </div>
        </div>

      </header>

      <div className="tabs" id="docs" role="tablist" aria-label="Sections">
        <button
          className="tab"
          role="tab"
          aria-selected={tab === 'preview'}
          onClick={() => setTab('preview')}
        >
          Preview
        </button>
        <button
          className="tab"
          role="tab"
          aria-selected={tab === 'install'}
          onClick={() => setTab('install')}
        >
          Install &amp; Usage
        </button>
      </div>

      {tab === 'preview' ? (
        <section className="examples" aria-label="Component demonstrations">
          {/* Two hero pill mocks, side by side */}
          <div className="hero-grid">
            {HERO_PILLS.map(({ state: st, label }) => (
              <div className="hero-box" key={st}>
                <div className="pill-lg">
                  <ThinkingCube state={st} size={68} />
                  <Shimmer text={label} />
                </div>
              </div>
            ))}
          </div>
          {/* Row-span grid: 151px auto-rows tile with no gaps */}
          <div className="chip-grid">
            {CHIP_STATES.map((st) => {
              const large = LARGE_CHIPS.has(st);
              const copy = LABEL_OVERRIDES[st] ?? st;
              const label = large ? `${cap(copy)}….` : `Agent ${copy}…`;
              return (
                <div className={`hero-box${large ? ' tall' : ''}`} key={st}>
                  {large ? (
                    <div className="pill-lg">
                      <ThinkingCube state={st} size={68} />
                      <Shimmer text={label} />
                    </div>
                  ) : (
                    <div className="pill-sm">
                      <ThinkingCube state={st} size={32} />
                      <Shimmer text={label} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <>
          <section className="doc-section" aria-labelledby="doc-install">
            <header className="doc-head">
              <h2 id="doc-install" className="doc-title">Installation</h2>
              <p className="doc-sub">One package. React 18+ is the only peer, nothing else ships.</p>
            </header>
            <CodeWindow title="Terminal" code={`$ ${INSTALL}`} copyText={INSTALL} />
          </section>

          <section className="doc-section" aria-labelledby="doc-usage">
            <header className="doc-head">
              <h2 id="doc-usage" className="doc-title">Usage</h2>
              <p className="doc-sub">Drop it next to any status text. 64 px for avatars, 20 px inline.</p>
            </header>
            <CodeWindow title="App.tsx" code={USAGE} />
          </section>

          <section className="doc-section" aria-labelledby="doc-props">
            <header className="doc-head">
              <h2 id="doc-props" className="doc-title">Props</h2>
              <p className="doc-sub">Every prop is optional, fully typed, with sensible defaults.</p>
            </header>
            <div className="api-wrap">
              <table className="api">
                <thead>
                  <tr>
                    <th scope="col">Prop</th>
                    <th scope="col">Description</th>
                    <th scope="col">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {PROPS.map((p) => (
                    <tr key={p.name}>
                      <td>
                        <code className="api-name">{p.name}</code>
                      </td>
                      <td>
                        <p className="api-desc">{inlineCode(p.desc)}</p>
                        <p className="api-type">
                          {p.type.length > 1 ? p.type.map((v) => `'${v}'`).join(' | ') : p.type[0]}
                        </p>
                      </td>
                      <td className="api-def">{p.def}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="section" id="playground" aria-label="Playground">
        <h2 className="section-title">Playground</h2>
        <div className="playground">
          <div className="stage">
            <ThinkingCube state={state} size={size * STAGE_ZOOM} speed={mul} paused={paused} />
            <button className="stage-btn" type="button" onClick={() => setPaused((p) => !p)}>
              {paused ? 'Play' : 'Pause'}
            </button>
          </div>
          <div className="panel">
            <div>
              <div className="field-label">State</div>
              <div className="chips">
                {PLAYGROUND_STATES.map(({ state: s, label }) => (
                  <button
                    key={s}
                    className="chip"
                    aria-pressed={s === state}
                    onClick={() => setState(s)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="field-label">Size</div>
              <div className="chips">
                <button className="chip" aria-pressed={size === 64} onClick={() => setSize(64)}>
                  64px
                </button>
                <button className="chip" aria-pressed={size === 20} onClick={() => setSize(20)}>
                  20px
                </button>
              </div>
            </div>
            <div>
              <div className="field-label">Speed</div>
              <div className="range-wrap">
                <input
                  className="range"
                  type="range"
                  min={25}
                  max={300}
                  step={5}
                  value={speed}
                  aria-label="Speed"
                  style={{ ['--fill' as string]: `${((speed - 25) / 275) * 100}%` }}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                />
                <span className="range-value">{(speed / 100).toFixed(2)}×</span>
              </div>
            </div>
            <div className="snippet">
              <pre>
                <code>
                  <Highlight code={snippet} />
                </code>
              </pre>
              <CopyButton text={snippet} />
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-main">
          <div className="footer-cta">
            <h2>Ready when your agent is.</h2>
            <p>One import, nine states, zero dependencies.</p>
            <div className="install-pill">
              <code>
                <span className="tok-prompt">$ </span>
                {INSTALL_SHORT}
              </code>
              <CopyButton text={INSTALL_SHORT} />
            </div>
          </div>

          <nav className="footer-cols" aria-label="Footer">
            <div className="footer-col">
              <h3>Project</h3>
              <a href="#playground">Playground</a>
              <a href="#docs" onClick={() => setTab('install')}>
                Install &amp; Usage
              </a>
              <a href="https://github.com/sanskar0627/thinking-cube" target="_blank" rel="noreferrer">
                Source<span aria-hidden="true">↗</span>
              </a>
              <a href="https://www.npmjs.com/package/thinking-cube" target="_blank" rel="noreferrer">
                npm<span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="footer-col">
              <h3>Author</h3>
              <a href="https://sanskarshukla.com" target="_blank" rel="noreferrer">
                Portfolio<span aria-hidden="true">↗</span>
              </a>
              <a href="https://x.com/sanskar0627" target="_blank" rel="noreferrer">
                X<span aria-hidden="true">↗</span>
              </a>
              <a href="https://github.com/sanskar0627" target="_blank" rel="noreferrer">
                GitHub<span aria-hidden="true">↗</span>
              </a>
            </div>
          </nav>
        </div>

        <div className="footer-meta">
          <span>
            © 2026{' '}
            <a href="https://sanskarshukla.com" target="_blank" rel="noreferrer">
              Sanskar Shukla
            </a>{' '}
            · MIT License
          </span>
          <span>
            Inspired by{' '}
            <a href="https://libraries.dev/orbs" target="_blank" rel="noreferrer">
              thinking-orbs
            </a>
          </span>
          <a className="footer-top-link" href="#top">
            Back to top <span aria-hidden="true">↑</span>
          </a>
        </div>

        <p className="footer-wordmark" aria-hidden="true">
          Thinking Cube
        </p>
      </footer>
    </main>
  );
}
