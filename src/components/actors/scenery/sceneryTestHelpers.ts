/**
 * Shared assertion for every scenery renderer test (docs/specs/WORLD_VIEW_DISTRICTS.md §4): every
 * `rect`/`polygon`/`line` edge must be horizontal, vertical, or exactly 45°, matching the factory
 * rules "Strict scope" §3 binds every family to. A `rotate(45 ...)`/`rotate(-45 ...)` group's
 * interior is the 45° grid by construction (turbine blades, dish ellipses) and is skipped — only
 * elements outside any such group are checked. `rect` is always axis-aligned and so is skipped for
 * the edge check, but included in the NaN sweep below.
 */
export function assertNinetyFortyFive(svgRoot: Element): void {
  const isInRotatedGroup = (el: Element): boolean => {
    let node: Element | null = el.parentElement;
    while (node && node !== svgRoot) {
      if (/rotate\(\s*-?45/.test(node.getAttribute('transform') ?? '')) return true;
      node = node.parentElement;
    }
    return false;
  };

  const checkEdge = (x0: number, y0: number, x1: number, y1: number): void => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const isGrid = dx === 0 || dy === 0 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.01;
    if (!isGrid) {
      throw new Error(`edge (${x0},${y0})-(${x1},${y1}) is not horizontal, vertical, or 45°`);
    }
  };

  svgRoot.querySelectorAll('polygon, line').forEach((el) => {
    if (isInRotatedGroup(el)) return;
    if (el.tagName.toLowerCase() === 'line') {
      checkEdge(
        Number(el.getAttribute('x1')), Number(el.getAttribute('y1')),
        Number(el.getAttribute('x2')), Number(el.getAttribute('y2')),
      );
      return;
    }
    const points = (el.getAttribute('points') ?? '').trim().split(/\s+/).filter(Boolean)
      .map((pair) => pair.split(',').map(Number));
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      checkEdge(x0, y0, x1, y1);
    }
  });

  svgRoot.querySelectorAll('rect, polygon, circle, ellipse, line').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes('NaN')) {
        throw new Error(`NaN attribute ${attr.name} on <${el.tagName}>`);
      }
    }
  });
}
