#!/usr/bin/env node
// tools/sync.mjs — makes the copy of the Sound Lab's engine and sounds that a game carries, and checks the games' copies.
//
//   node tools/sync.mjs <project> <where>    write <project>'s copy to the file <where> (or to <where>/patch.js if a folder)
//   node tools/sync.mjs --check              for each game on this machine: is its copy what this would write? if not, what differs
//
// A game's copy is ONE file, the one it imports today, with the same exports as the lab's patch.js: the engine exactly as
// engine.js has it, then PATCH_PRESETS holding that project's sounds (sounds/<project>.js) and the shared ones it plays
// (sounds/shared.js, by name in SHARED_FOR). Its first line says it was made here, at which commit, and not to edit it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

const LAB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HOME = os.homedir();

// where each project's sounds are written, and the name the file exports them under
const SOUNDS = {
  rmrf: 'RMRF_PATCHES', mathwood: 'MATHWOOD_PATCHES', 'pi-nebula': 'PI_NEBULA_PATCHES', shared: 'SHARED_PATCHES',
};
// The shared sounds (SYNTH, DEMO) each game plays, by name. None today: RMRF's and Mathwood's copies carry the six of
// them, but nothing in either game plays one (2026-11-24, read through each game's code).
const SHARED_FOR = { rmrf: [], mathwood: [], 'pi-nebula': [] };
// The games' copies on this machine (paths from the home folder), for --check. Pi Nebula keeps its sounds in a second
// file today (patchesIn); once it takes the synced file, that file reads them from it.
const COPIES = {
  rmrf: [{ file: 'rmrf/js/patch.js' }, { file: 'rmrf/vehicle-designer/js/patch.js' }],
  mathwood: [{ file: 'math-games/mathwood-valley/src/audio/patch.js' }],
  'pi-nebula': [{ file: 'math-games/pi-nebula/src/audio/patch.js', patchesIn: { file: 'math-games/pi-nebula/src/music/patches.js', name: 'TECHNO_PATCHES' } }],
};

const read = (f) => fs.readFileSync(path.join(LAB, f), 'utf8');

// ── the source text of one exported object literal's entries ──────────────────────────────────────────────────────
// Walks the literal (strings, comments, brackets) and returns each top-level entry's [start, end) and key, so a
// project's file can be copied as written, comments and all.
function entriesOf(src, decl) {
  const start = src.indexOf(decl);
  if (start < 0) throw new Error('not found: ' + decl);
  let i = start + decl.length, depth = 1, cur = null;
  const entries = [];
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) i = src.length; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const s0 = i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++;
      if (depth === 1 && !cur) cur = { key: src.slice(s0 + 1, i - 1), s: s0 };
      continue;
    }
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) {
      if (--depth === 0) { if (cur) { cur.e = i; entries.push(cur); } return { bodyStart: start + decl.length, end: i, entries }; }
    } else if (c === ',' && depth === 1 && cur) { cur.e = i + 1; entries.push(cur); cur = null; }
    i++;
  }
  throw new Error('unterminated: ' + decl);
}

function commit() {
  try {
    const sha = execFileSync('git', ['-C', LAB, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['-C', LAB, 'status', '--porcelain', '--', 'engine.js', 'sounds'], { encoding: 'utf8' }).trim();
    return dirty ? sha + ' plus changes not yet committed' : sha;
  } catch { return 'unknown (not a git checkout)'; }
}

// ── what a project's copy is ──────────────────────────────────────────────────────────────────────────────────────
export function build(project) {
  if (!SOUNDS[project] || project === 'shared') throw new Error(`no such game project: ${project} (one of: ${Object.keys(SHARED_FOR).join(', ')})`);
  const engine = read('engine.js');
  const src = read(`sounds/${project}.js`);
  const own = entriesOf(src, `export const ${SOUNDS[project]} = {`);
  let body = src.slice(own.bodyStart, own.end).replace(/\s+$/, '');
  const wanted = SHARED_FOR[project] || [];
  if (wanted.length) {
    const sh = read('sounds/shared.js'), se = entriesOf(sh, `export const ${SOUNDS.shared} = {`);
    for (const name of wanted) {
      const e = se.entries.find((x) => x.key === name);
      if (!e) throw new Error(`SHARED_FOR.${project}: no shared sound '${name}'`);
      body += `\n  // (from sounds/shared.js)\n  ` + sh.slice(e.s, e.e);
    }
  }
  const head = `// MADE BY THE SOUND LAB, do not edit it here: tools/sync.mjs ${project}, from the Sound Lab at commit ${commit()}. ` +
    `Change the engine (engine.js) or a sound (sounds/${project}.js) there and sync again.\n`;
  return head + engine +
    `\n// ════════════════════════════════════════════════════════════════════════════════\n` +
    `//  ${project}'s sounds (the Sound Lab's sounds/${project}.js)\n` +
    `// ════════════════════════════════════════════════════════════════════════════════\n` +
    `export const PATCH_PRESETS = {${body}\n};\n`;
}

// ── checking a copy ───────────────────────────────────────────────────────────────────────────────────────────────
const asModule = (text) => import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
const isComment = (l) => { const t = l.trim(); return t === '' || t.startsWith('//'); };
// lines only in a / only in b (a longest-common-subsequence diff; the engine is a few hundred lines)
function lineDiff(a, b) {
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) out.push({ side: '+', line: b[j], at: j + 1 }), j++;
    else out.push({ side: '-', line: a[i], at: i + 1 }), i++;
  }
  return out;
}
const engineOf = (text) => {
  let t = text.slice(0, text.indexOf('export const PATCH_PRESETS'));
  if (t.startsWith('// MADE BY THE SOUND LAB')) t = t.slice(t.indexOf('\n') + 1);
  // the copy's own banner over its sounds is not engine
  return t.replace(/\n(\/\/ ═+\n\/\/ [^\n]*\n(\/\/[^\n]*\n)*?\/\/ ═+\n)?\s*$/, '\n');
};
const strip = (p) => { const { project, ...rest } = p; return rest; };
function patchDiff(a, b) {   // a few words on how patch a (the game's) differs from b (the lab's)
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'nodes' || k === 'cables' || k === 'project') continue;
    if (!isDeepStrictEqual(a[k], b[k])) out.push(`${k} ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
  }
  const na = new Map((a.nodes || []).map((n) => [n.id, n])), nb = new Map((b.nodes || []).map((n) => [n.id, n]));
  for (const [id, n] of nb) {
    const o = na.get(id);
    if (!o) { out.push(`node '${id}' added`); continue; }
    for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) if (!isDeepStrictEqual(o[k], n[k])) out.push(`'${id}'.${k} ${JSON.stringify(o[k]) ?? '-'} -> ${JSON.stringify(n[k]) ?? '-'}`);
  }
  for (const id of na.keys()) if (!nb.has(id)) out.push(`node '${id}' removed`);
  if (!isDeepStrictEqual(a.cables, b.cables)) out.push(`cables differ (${(a.cables || []).length} -> ${(b.cables || []).length})`);
  return out;
}

async function check() {
  let differ = 0;
  for (const [project, copies] of Object.entries(COPIES)) {
    const want = build(project), W = await asModule(want);
    for (const c of copies) {
      const file = path.join(HOME, c.file);
      console.log(`\n${project}: ~/${c.file}`);
      if (!fs.existsSync(file)) { console.log('  not on this machine'); continue; }
      const have = fs.readFileSync(file, 'utf8');
      const madeAt = have.startsWith('// MADE BY THE SOUND LAB') ? (have.match(/at commit ([^.]*)\./) || [])[1] : null;
      const body = (t) => t.slice(t.startsWith('// MADE BY THE SOUND LAB') ? t.indexOf('\n') + 1 : 0);
      if (body(have) === body(want)) { console.log(`  the same as the Sound Lab would write (made at commit ${madeAt})`); continue; }
      differ++;
      console.log(madeAt ? `  made at commit ${madeAt}, and differs from what the Sound Lab would write now:` : '  not made by this script (a hand-made copy), and differs:');
      // engine
      const d = lineDiff(engineOf(have).split('\n'), engineOf(want).split('\n'));
      const code = d.filter((x) => !isComment(x.line)), notes = d.length - code.length;
      if (!d.length) console.log('  engine: the same');
      else {
        console.log(`  engine: ${code.length} code line(s) differ, and ${notes} comment or blank line(s)`);
        for (const x of code.slice(0, 12)) console.log(`    ${x.side === '-' ? 'the game has' : 'the lab has '}  ${x.line.trim().slice(0, 110)}`);
        if (code.length > 12) console.log(`    ... and ${code.length - 12} more`);
      }
      // exports
      const H = await asModule(have);
      const gone = Object.keys(H).filter((k) => !(k in W)), added = Object.keys(W).filter((k) => !(k in H));
      if (gone.length) console.log(`  exports the game has and the synced copy would not: ${gone.join(', ')}`);
      if (added.length) console.log(`  exports the synced copy adds: ${added.join(', ')}`);
      // patches
      let hp = { ...(H.PATCH_PRESETS || {}) };
      if (c.patchesIn) {
        const P = await asModule(fs.readFileSync(path.join(HOME, c.patchesIn.file), 'utf8'));
        hp = { ...hp, ...P[c.patchesIn.name] };
        console.log(`  (its sounds are read from ~/${c.patchesIn.file}, ${c.patchesIn.name})`);
      }
      const wp = W.PATCH_PRESETS;
      const missing = [], changed = [], tagOnly = [], extra = [];
      for (const k of Object.keys(wp)) {
        if (!hp[k]) missing.push(k);
        else if (!isDeepStrictEqual(strip(hp[k]), strip(wp[k]))) changed.push(k);
        else if (hp[k].project !== wp[k].project) tagOnly.push(k);
      }
      for (const k of Object.keys(hp)) if (!wp[k]) extra.push(k);
      const same = Object.keys(wp).length - missing.length - changed.length - tagOnly.length;
      console.log(`  sounds: ${same} the same, ${tagOnly.length} the same but for the project tag, ${changed.length} changed, ` +
        `${missing.length} missing from the game, ${extra.length} the game has that the lab's ${project} sounds do not`);
      for (const k of changed) { const pd = patchDiff(hp[k], wp[k]); console.log(`    changed: ${k}: ${pd.slice(0, 4).join('; ')}${pd.length > 4 ? `; and ${pd.length - 4} more` : ''}`); }
      if (missing.length) console.log(`    missing from the game: ${missing.join(', ')}`);
      if (extra.length) console.log(`    only in the game (a synced copy drops them): ${extra.join(', ')}`);
    }
  }
  console.log(differ ? `\n${differ} cop${differ === 1 ? 'y differs' : 'ies differ'} from what the Sound Lab would write.` : '\nEvery copy is what the Sound Lab would write.');
  return differ;
}

// ── command line ──────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [a, b] = process.argv.slice(2);
  if (a === '--check') process.exitCode = (await check()) ? 1 : 0;
  else if (a && b) {
    let where = path.resolve(b);
    if (fs.existsSync(where) && fs.statSync(where).isDirectory()) where = path.join(where, 'patch.js');
    const text = build(a);
    fs.writeFileSync(where, text);
    const n = Object.keys((await asModule(text)).PATCH_PRESETS).length;
    console.log(`wrote ${where}: the engine and ${n} of ${a}'s sounds`);
  } else {
    console.log('node tools/sync.mjs <project> <where>   (project: ' + Object.keys(SHARED_FOR).join(', ') + ')\nnode tools/sync.mjs --check');
    process.exitCode = 2;
  }
}
