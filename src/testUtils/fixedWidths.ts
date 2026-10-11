/**
 * Test-only helper (docs/tasks/LAYOUT_REWORK.md Task 28) — finds the fixed `width` / `min-width`
 * declarations in a set of stylesheets that are wider than a given viewport, so a CSS test can assert the
 * phone shell holds down to SHELL_MIN_WIDTH. jsdom computes no layout, so this reads the source.
 *
 * What counts as fixed: a value that evaluates to a plain length. `var()` is resolved against every custom
 * property declared in the sheets it is given; `calc()`, `min()`, `max()` and `clamp()` are evaluated.
 * Anything relative to the viewport or container (`%`, `vw`, `vh`, `dvh`) makes the result relative, and a
 * relative width bends to the viewport, so it is never flagged — `min(420px, calc(100% - 32px))` is safe.
 * What does not apply at the viewport is skipped: a rule inside `@media (min-width: N)` with N wider than the
 * viewport, and a rule whose selector names the desk shell. `max-width` is a cap, not a floor, so it is
 * never read.
 */

export interface FixedWidth {
  selector: string;
  property: 'width' | 'min-width';
  value: string;
  px: number;
}

interface Declaration {
  selector: string;
  property: string;
  value: string;
}

type Length = { px: number } | 'relative' | null;

const REM_PX = 16;
const CH_PX = 8;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Index of the `}` matching the `{` at `open`. */
function matchingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return i;
  }
  return css.length;
}

/** True when an at-rule prelude only applies from a width above the viewport. */
function mediaExcludesViewport(prelude: string, viewport: number): boolean {
  for (const match of prelude.matchAll(/min-width\s*:\s*([\d.]+)(px|em|rem)/g)) {
    const px = parseFloat(match[1]) * (match[2] === 'px' ? 1 : REM_PX);
    if (px > viewport) return true;
  }
  return false;
}

function collect(css: string, viewport: number, out: Declaration[]): void {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) {
      // Top-level declarations with no rule around them (none in practice) — nothing to read.
      return;
    }
    const prelude = css.slice(i, open).trim().replace(/^[;}\s]+/, '');
    const close = matchingBrace(css, open);
    const body = css.slice(open + 1, close);
    i = close + 1;

    if (/^@(media|supports|container|layer)\b/.test(prelude)) {
      if (prelude.startsWith('@media') && mediaExcludesViewport(prelude, viewport)) continue;
      collect(body, viewport, out);
    } else if (prelude.startsWith('@')) {
      continue; // @keyframes, @font-face: no layout of their own.
    } else {
      if (/\[data-shell\s*=\s*['"]?desk['"]?\]/.test(prelude)) continue;
      for (const declaration of body.split(';')) {
        const colon = declaration.indexOf(':');
        if (colon === -1) continue;
        out.push({
          selector: prelude.replace(/\s+/g, ' '),
          property: declaration.slice(0, colon).trim(),
          value: declaration.slice(colon + 1).trim(),
        });
      }
    }
  }
}

function resolveVars(value: string, props: Map<string, string>, depth = 0): string {
  if (depth > 10) return value;
  const next = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (whole, name: string, fallback?: string) => {
    const found = props.get(name) ?? fallback;
    return found === undefined ? whole : `(${found})`;
  });
  return next === value ? value : resolveVars(next, props, depth + 1);
}

// ----- a small length evaluator over the resolved text -----

function combine(a: Length, b: Length, op: (x: number, y: number) => number): Length {
  if (a === null || b === null) return null;
  if (a === 'relative' || b === 'relative') return 'relative';
  return { px: op(a.px, b.px) };
}

function evaluate(text: string): Length {
  let pos = 0;
  const src = text.trim();
  const peek = () => src[pos];
  const skip = () => { while (pos < src.length && /\s/.test(src[pos])) pos++; };

  function args(): Length[] {
    const list: Length[] = [];
    pos++; // (
    for (;;) {
      list.push(expr());
      skip();
      if (peek() === ',') { pos++; continue; }
      if (peek() === ')') { pos++; return list; }
      throw new Error('bad args');
    }
  }

  function factor(): Length {
    skip();
    if (peek() === '(') {
      pos++;
      const inner = expr();
      skip();
      if (peek() !== ')') throw new Error('unbalanced');
      pos++;
      return inner;
    }
    const fn = /^[a-z-]+(?=\()/.exec(src.slice(pos));
    if (fn) {
      pos += fn[0].length;
      const list = args();
      if (list.some((v) => v === null)) return null;
      if (fn[0] === 'calc') return list[0];
      const known = list.filter((v): v is { px: number } => v !== 'relative');
      const anyRelative = known.length < list.length;
      if (fn[0] === 'min') return anyRelative ? 'relative' : { px: Math.min(...known.map((v) => v.px)) };
      if (fn[0] === 'max') return anyRelative ? 'relative' : { px: Math.max(...known.map((v) => v.px)) };
      if (fn[0] === 'clamp') return anyRelative ? 'relative' : { px: Math.min(Math.max(known[1].px, known[0].px), known[2].px) };
      return null;
    }
    const num = /^(-?[\d.]+)([a-z%]*)/.exec(src.slice(pos));
    if (!num) throw new Error('not a length');
    pos += num[0].length;
    const n = parseFloat(num[1]);
    switch (num[2]) {
      case 'px': case '': return { px: n };
      case 'rem': case 'em': return { px: n * REM_PX };
      case 'ch': return { px: n * CH_PX };
      case '%': case 'vw': case 'vh': case 'dvh': case 'dvw': case 'svh': case 'lvh': return 'relative';
      default: return null;
    }
  }

  function term(): Length {
    let left = factor();
    for (;;) {
      skip();
      if (peek() === '*') { pos++; left = combine(left, factor(), (x, y) => x * y); } else if (peek() === '/') { pos++; left = combine(left, factor(), (x, y) => x / y); } else return left;
    }
  }

  function expr(): Length {
    let left = term();
    for (;;) {
      skip();
      if (peek() === '+') { pos++; left = combine(left, term(), (x, y) => x + y); } else if (peek() === '-') { pos++; left = combine(left, term(), (x, y) => x - y); } else return left;
    }
  }

  try {
    const result = expr();
    skip();
    return pos === src.length ? result : null;
  } catch {
    return null;
  }
}

/**
 * Every `width` / `min-width` in `sheets` that is a fixed length wider than `viewport` px.
 * `sheets` are the stylesheets to read; `propertySheets` are extra sheets (index.css) read only for the
 * custom properties they declare.
 */
export function findFixedWidthsOver(viewport: number, sheets: readonly string[], propertySheets: readonly string[] = []): FixedWidth[] {
  const declarations: Declaration[] = [];
  const props = new Map<string, string>();
  for (const sheet of [...sheets, ...propertySheets]) {
    const found: Declaration[] = [];
    collect(stripComments(sheet).replace(/\r\n/g, '\n'), viewport, found);
    for (const d of found) if (d.property.startsWith('--') && !props.has(d.property)) props.set(d.property, d.value);
    if (sheets.includes(sheet)) declarations.push(...found);
  }
  const wide: FixedWidth[] = [];
  for (const d of declarations) {
    if (d.property !== 'width' && d.property !== 'min-width') continue;
    const length = evaluate(resolveVars(d.value, props));
    if (length !== null && length !== 'relative' && length.px > viewport) {
      wide.push({ selector: d.selector, property: d.property, value: d.value, px: length.px });
    }
  }
  return wide;
}
