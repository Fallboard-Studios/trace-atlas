import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// MUST stay the first app import: it installs the Tone context for `?latency=` before any module
// constructs a Tone node (Tone creates its global context lazily on first use).
import './engine/audioContextSetup'
import App from './App.tsx'
// Self-hosted (npm @fontsource/rajdhani, not a Google Fonts CDN link) — no
// external network request at runtime. Weights 500-700 only (docs/specs/
// TYPE_SCALE.md §1.3) — 300/400 are dropped app-wide; --font-weight-regular
// (500) is the new document-wide floor. index.css's --font-sans token is the
// only consumer, applied as the chrome/structural default (large titles,
// AccordionContainer/DirectionalPanel, page shell), replacing the prior
// system-ui stack. latin/latin-ext subsets only (not the plain weight-only
// files, which also bundle Devanagari glyphs the app never uses — latin-ext
// still covers accented Latin characters at a fraction of Devanagari's
// per-weight size).
import '@fontsource/rajdhani/latin-500.css'
import '@fontsource/rajdhani/latin-ext-500.css'
import '@fontsource/rajdhani/latin-600.css'
import '@fontsource/rajdhani/latin-ext-600.css'
import '@fontsource/rajdhani/latin-700.css'
import '@fontsource/rajdhani/latin-ext-700.css'
// Self-hosted (npm @fontsource/titillium-web), same latin/latin-ext-only
// rationale as Rajdhani above. Weights 400/600/700 — Titillium Web has no
// 500; its 400 is kept as-is (not bumped) since it's a substantially
// heavier-set, more legible-at-small-sizes regular than Rajdhani's own 400
// (docs/specs/TYPE_SCALE.md §1.3). index.css's --font-controls token is the
// only consumer, applied to the 11 leaf ControlSchema primitives (sliders,
// toggle, text input, etc.) and the two smaller heading tiers.
import '@fontsource/titillium-web/latin-400.css'
import '@fontsource/titillium-web/latin-ext-400.css'
import '@fontsource/titillium-web/latin-600.css'
import '@fontsource/titillium-web/latin-ext-600.css'
import '@fontsource/titillium-web/latin-700.css'
import '@fontsource/titillium-web/latin-ext-700.css'
import './index.css'
import { setGlobalAttenuationStyleSeedOverride } from './utils/seedUtils'

// Dev-only manual audible check (LFO_INTEGRATION_PLAN.md Task 14) — not real
// UI, no component/store references it. This import exists only so the
// file's own DEV_TUNING-gated registration runs; import.meta.env.DEV makes
// the whole thing dead code Vite strips from production builds.
import './engine/lfoDebug'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Support global seed override via URL param e.g. ?seed=myspecialseed
const seedParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('seed') : null;
if (seedParam) {
  setGlobalAttenuationStyleSeedOverride(seedParam);
  // keep a console-visible message so devs know the override is active
  // (intentionally after render so it shows up when app starts in dev)
  // eslint-disable-next-line no-console
  console.info('[seedUtils] global seed override set:', seedParam);
}
