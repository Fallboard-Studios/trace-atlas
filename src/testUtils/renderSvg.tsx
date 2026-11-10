import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Testing Library's render() into an `<svg>` container instead of its default `<div>`.
 *
 * A component whose root is SVG content (a `<g>`, a `<rect>`, a `<clipPath>`) rendered into a div is created in
 * the HTML namespace, and React warns once per tag: "<clipPath /> is using incorrect casing", "The tag <rect> is
 * unrecognized in this browser" — 252 such stderr blocks in a full run on 2026-11-10. With the container itself an
 * SVG element the tree takes the SVG namespace, and `container.firstChild` is still the component's own root, so
 * every existing query holds. Testing Library removes the container with the rest of its cleanup (it is a child of
 * document.body, like the div it would have made).
 */
export function renderSvg(ui: ReactElement, options: Omit<RenderOptions, 'container'> = {}): RenderResult {
  // Typed as render()'s own HTMLElement container so the tests' helpers that take `container: HTMLElement` keep
  // compiling; they only call Element methods (querySelector, innerHTML) on it.
  const container = document.body.appendChild(document.createElementNS(SVG_NS, 'svg')) as unknown as HTMLElement;
  return render(ui, { ...options, container });
}
