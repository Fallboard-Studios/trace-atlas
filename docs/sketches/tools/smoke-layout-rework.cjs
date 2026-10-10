// Headless smoke test for docs/sketches/layout-rework.html (the tabbed layout sketch). Run from the repo root:
//   node docs/sketches/tools/smoke-layout-rework.cjs   (.cjs: the package is "type": "module")
// It builds a tiny DOM from the page's own markup (querySelector returns ONE element, like a browser), runs every tab
// at its defaults, then every option flip and radio value, and fails on NaN / undefined / empty frames. Keep it in step
// with the page when adding tabs or options (the stub only understands the selectors the page uses). Not a Vitest file
// on purpose (no .test. in the name): it is a sketch tool, not app coverage.

// Headless smoke test for the tabbed layout-rework sketch. Builds a tiny DOM from the page's own markup
// (sections, option buttons, frame containers), with querySelector returning ONE element and querySelectorAll a list.
const fs = require('fs');
const html = fs.readFileSync('docs/sketches/layout-rework.html', 'utf8');
const src = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

const mkEl = (attrs = {}) => ({
  ...attrs, dataset: attrs.dataset || {}, _cls: new Set(attrs.cls || []), innerHTML: '',
  get classList() { const s = this._cls; return { contains: (c) => s.has(c), toggle(c, f) { if (f === undefined) f = !s.has(c); f ? s.add(c) : s.delete(c); return f; }, add: (c) => s.add(c), remove: (c) => s.delete(c) }; },
  addEventListener() {}, closest(sel) { if (sel === '.page') return this.page; return this; },
});
const byId = {}, pages = [], tabs = [];
// ids of frame containers
for (const m of html.matchAll(/id="([a-z0-9-]+)"/g)) byId[m[1]] = mkEl({ id: m[1] });
// tab buttons
for (const m of html.matchAll(/<button data-tab="([a-z]+)"( class="on")?>/g)) tabs.push(mkEl({ dataset: { tab: m[1] }, cls: m[2] ? ['on'] : [] }));
// pages with their option buttons
const secRe = /<section class="page( on)?" data-page="([a-z]+)">([\s\S]*?)<\/section>/g;
for (const m of html.matchAll(secRe)) {
  const page = mkEl({ dataset: { page: m[2] }, cls: m[1] ? ['on'] : [] }); page.opts = []; page.radios = [];
  for (const b of m[3].matchAll(/<button data-opt="([a-z]+)"( class="on")?>/g)) { const el = mkEl({ dataset: { opt: b[1] }, cls: b[2] ? ['on'] : [] }); el.page = page; page.opts.push(el); }
  for (const b of m[3].matchAll(/<button data-radio="([a-z]+)" data-val="([^"]+)"( class="on")?>/g)) { const el = mkEl({ dataset: { radio: b[1], val: b[2] }, cls: b[3] ? ['on'] : [] }); el.page = page; page.radios.push(el); }
  pages.push(page);
}
const body = mkEl({});
function qsa(sel) {
  let m;
  if (sel === '.page') return pages;
  if (sel === '.tabbar [data-tab]') return tabs;
  if ((m = sel.match(/^\.page\[data-page="([a-z]+)"\] \[data-opt="([a-z]+)"\]$/))) { const p = pages.find((x) => x.dataset.page === m[1]); return p ? p.opts.filter((o) => o.dataset.opt === m[2]) : []; }
  if ((m = sel.match(/^\.page\[data-page="([a-z]+)"\] \[data-radio="([a-z]+)"\](\.on)?$/))) { const p = pages.find((x) => x.dataset.page === m[1]); let r = p ? p.radios.filter((o) => o.dataset.radio === m[2]) : []; if (m[3]) r = r.filter((o) => o.classList.contains('on')); return r; }
  if ((m = sel.match(/^#([a-z0-9-]+)$/))) return byId[m[1]] ? [byId[m[1]]] : [];
  throw new Error('stub: unsupported selector ' + sel);
}
global.document = { querySelector: (s) => qsa(s)[0] ?? null, querySelectorAll: (s) => qsa(s), addEventListener() {}, body };
global.window = { addEventListener() {}, scrollTo() {} };
global.location = { hash: '' };
global.history = { replaceState(_, __, h) { global.location.hash = h; } };

const fn = new Function(src + `
;return { RENDER, showPage, opt, rad, pages: ${JSON.stringify(pages.map((p) => p.dataset.page))} };`);
const api = fn();
let bad = 0; const check = (label, ids) => { for (const id of ids) { const h = byId[id].innerHTML; const ok = h.length > 500 && !/NaN|undefined/.test(h); if (!ok) { bad++; console.log('BAD', label, id, h.length, (h.match(/NaN|undefined/g) || []).slice(0, 2)); } } };

// every tab at its defaults
for (const p of api.pages) { api.showPage(p); }
check('main', ['main-deck', 'main-fleet', 'main-robot', 'main-roster', 'main-company', 'main-settings', 'main-phones', 'main-m6']);
check('nav', ['nav-crop', 'nav-phone']); check('off', ['off-desk', 'off-phone']); check('deck', ['deck-desk', 'deck-phone']);
check('fleet', ['fleet-desk', 'fleet-phone']); check('robot', ['robot-desk', 'robot-phone']); check('roster', ['roster-desk', 'roster-phone']); check('company', ['company-desk', 'company-phone']); check('settings', ['settings-desk', 'settings-phone']);
console.log('all tabs rendered at defaults; initial page =', pages.find((p) => p.classList.contains('on')).dataset.page);

// every radio value and every option flip, per page
const setRadio = (page, group, val) => { for (const r of pages.find((p) => p.dataset.page === page).radios) if (r.dataset.radio === group) r.classList.toggle('on', r.dataset.val === val); };
const flip = (page, key) => { const o = pages.find((p) => p.dataset.page === page).opts.find((x) => x.dataset.opt === key); o.classList.toggle('on'); };
for (const b of ['deck', 'fleet', 'probes', 'companies', 'settings']) { setRadio('nav', 'branch', b); api.RENDER.nav(); check('nav/' + b, ['nav-crop', 'nav-phone']); const h = byId['nav-crop'].innerHTML; console.log('nav', b.padEnd(10), 'rail pops', (h.match(/cab pop/g) || []).length, 'list rows', (h.match(/class="cab /g) || []).length, 'wide', /rail wide/.test(h), 'kids', (h.match(/class="kids"/g)||[]).length, 'drawer closed', /drawer closed/.test(h)); }
for (const k of ['expanded', 'hover', 'sheet']) { flip('nav', k); api.RENDER.nav(); check('nav flip ' + k, ['nav-crop', 'nav-phone']); flip('nav', k); }
for (const s of ['0', '1', '2', '3', '4']) { setRadio('fleet', 'sec', s); api.RENDER.fleet(); check('fleet sec ' + s, ['fleet-desk', 'fleet-phone']); }
for (const k of ['intro', 'help', 'links']) { flip('fleet', k); api.RENDER.fleet(); check('fleet flip ' + k, ['fleet-desk']); flip('fleet', k); }
// Lane titles (2026-10-09): full name + letter on desktop, letter form on the phone; link rows full on desktop, letters on the phone.
setRadio('fleet', 'sec', '1'); api.RENDER.fleet(); console.log('lane titles: desk', /Core LFO \(LFO A\)/.test(byId['fleet-desk'].innerHTML), '| phone short', /LFO A</.test(byId['fleet-phone'].innerHTML) && !/Core LFO/.test(byId['fleet-phone'].innerHTML));
setRadio('fleet', 'sec', '2'); api.RENDER.fleet(); console.log('link rows:   desk full', /Accent LFO \(C\)<\/span>/.test(byId['fleet-desk'].innerHTML), '| phone letters', !/Accent LFO/.test(byId['fleet-phone'].innerHTML) && /class="cab pop">C<\/span>/.test(byId['fleet-phone'].innerHTML));
for (const s of ['0', '1', '2', '3']) { setRadio('robot', 'sec', s); api.RENDER.robot(); check('robot sec ' + s, ['robot-desk', 'robot-phone']); }
for (const k of ['band', 'help', 'links']) { flip('robot', k); api.RENDER.robot(); check('robot flip ' + k, ['robot-desk', 'robot-phone']); flip('robot', k); }
for (const s of ['0', '1', '2']) { setRadio('settings', 'sec', s); api.RENDER.settings(); check('settings sec ' + s, ['settings-desk', 'settings-phone']); }
// Company detail (2026-10-09): the robot screen with a company column; the All form drops colour + CRUD; roster headers lost their cabs.
for (const s of ['0', '1', '2', '3']) { setRadio('company', 'sec', s); api.RENDER.company(); check('company sec ' + s, ['company-desk', 'company-phone']); }
for (const k of ['all', 'help', 'links']) { flip('company', k); api.RENDER.company(); check('company flip ' + k, ['company-desk', 'company-phone']); flip('company', k); }
{ api.RENDER.company(); const d = byId['company-desk'].innerHTML; console.log('company:  members', (d.match(/class="mem"/g) || []).length, '| Rename', /Rename<\/span>/.test(d), '| rail pops', (d.match(/cab pop/g) || []).length, '| same tabs as robot', /Levels<\/span>/.test(d) && /Source<\/span>/.test(d)); }
{ flip('company', 'all'); api.RENDER.company(); const d = byId['company-desk'].innerHTML, p = byId['company-phone'].innerHTML; console.log('all form: members', (d.match(/class="mem"/g) || []).length, '| Rename', /Rename<\/span>/.test(d), '| phone Rename', /Rename<\/span>/.test(p), '| All Probes popped in rail', /class="cab pop" style="--ac:[^"]*">All Probes/.test(d)); flip('company', 'all'); }
api.RENDER.roster(); console.log('roster headers: Edit group', /Edit group/.test(byId['roster-desk'].innerHTML), '| Rename', /Rename<\/span>/.test(byId['roster-desk'].innerHTML));
for (const k of ['intro', 'freelance', 'six', 'hover', 'chip', 'move', 'pchip', 'sheet']) { flip('roster', k); api.RENDER.roster(); check('roster flip ' + k, ['roster-desk', 'roster-phone']); flip('roster', k); }
for (const l of ['rows', 'grid']) { setRadio('roster', 'layout', l); api.RENDER.roster(); check('roster layout ' + l, ['roster-desk', 'roster-phone']); } setRadio('roster', 'layout', 'rows');
// Freelance must render (2026-10-09): rows per group by default, every group head incl. Freelance, 12 member rows; six companies = 7 groups.
const rosterLog = (label) => { api.RENDER.roster(); const d = byId['roster-desk'].innerHTML, p = byId['roster-phone'].innerHTML; const pop = (d.match(/<div class="movepop">[\s\S]*?<\/span><\/span><\/div>/) || [''])[0]; console.log(label, 'rows layout', /class="roster[^"]* rows"/.test(d), '| groups', (d.match(/class="ghead"/g) || []).length, 'Freelance', /Freelance<\/span>/.test(d), '| members', (d.match(/class="tile row/g) || []).length, '| move options', (pop.match(/class="cab (pop|frame)"/g) || []).length, '| phone groups', (p.match(/class="ghead"/g) || []).length, 'scrolls', /overflow-y:auto/.test(p)); };
rosterLog('roster 3 cos:'); flip('roster', 'six'); rosterLog('roster 6 cos:'); flip('roster', 'six');
console.log('roster removed: Filter cab', /Filter: /.test(byId['roster-desk'].innerHTML), '| cols layout', /roster\.cols|data-val="cols"/.test(html));
// Reassignment (2026-10-09): one Move chip per tile, the panel under Tidal Wisp with the 4-option company radio, the phone sheet stacked.
{ api.RENDER.roster(); const d = byId['roster-desk'].innerHTML, p = byId['roster-phone'].innerHTML; const pop = (d.match(/<div class="movepop">[\s\S]*?<\/span><\/span><\/div>/) || [''])[0]; console.log('roster move: chips', (d.match(/class="mv"/g) || []).length, '| panel options', (pop.match(/class="cab (pop|frame)"/g) || []).length, 'popped', /Rust Syndicate<\/span>/.test(pop) && (pop.match(/cab pop/g) || []).length === 1, '| phone chips', (p.match(/class="mv"/g) || []).length, 'sheet stacked', /msheet[\s\S]*radio stack/.test(p)); }
for (const sl of ['none','robot','company','both']) { setRadio('deck','sel',sl); api.RENDER.deck(); check('deck sel '+sl, ['deck-desk','deck-phone']); const h = byId['deck-desk'].innerHTML; console.log('deck sel', sl.padEnd(8), 'sel lines', (h.match(/line sel/g)||[]).length, 'halos', (h.match(/stroke-dasharray="10 8"/g)||[]).length, 'robot text box', h.includes('Salvage · Emitting</div>')); }
for (const k of ['halo', 'hover', 'dim', 'fly']) { flip('deck', k); api.RENDER.deck(); check('deck flip ' + k, ['deck-desk', 'deck-phone']); flip('deck', k); }
flip('off', 'world'); api.RENDER.off(); check('off no world', ['off-desk', 'off-phone']); flip('off', 'world');
for (const th of ['calm','classic','active']) { setRadio('off','theme',th); api.RENDER.off(); check('off theme '+th, ['off-desk','off-phone']); const h = byId['off-desk'].innerHTML; console.log('off theme', th.padEnd(8), 'pickers', (h.match(/class="radio"/g)||[]).length, 'popped', (h.match(/cab pop/g)||[]).length, 'mono sel', (h.match(/cab sel/g)||[]).length, 'readout', /class="readout"/.test(h)); }
// Power-off amendment (2026-10-09): nothing pops on the splash; one monochrome .sel per row; the Theme row only behind its option.
flip('off','themerow'); api.RENDER.off(); check('off theme row', ['off-desk','off-phone']); console.log('theme row on: pickers', (byId['off-desk'].innerHTML.match(/class="radio"/g)||[]).length, 'popped', (byId['off-desk'].innerHTML.match(/cab pop/g)||[]).length, 'mono sel', (byId['off-desk'].innerHTML.match(/cab sel/g)||[]).length); flip('off','themerow');
for (const pr of ['Kryndara','Dusk Run','Night, all freelance']) { setRadio('off','preset',pr); api.RENDER.off(); check('off preset '+pr, ['off-desk','off-phone']); }
flip('off','saves'); api.RENDER.off(); check('off no saves', ['off-desk','off-phone']); console.log('no saves: divider present', /class="divider"/.test(byId['off-desk'].innerHTML), '| transmission boxes', (byId['off-desk'].innerHTML.match(/class="cab (pop|frame)" style="--ac:#c46a7e/g)||[]).length); flip('off','saves');
flip('off','splash'); api.RENDER.off(); check('off no splash', ['off-desk','off-phone']); console.log('splash off: pickers', (byId['off-desk'].innerHTML.match(/class="radio"/g)||[]).length);
console.log('bad =', bad);
