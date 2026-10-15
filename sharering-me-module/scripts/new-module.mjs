#!/usr/bin/env node
// Scaffolds a ShareRing Me Module from ../assets/template.
//
//   node new-module.mjs --dir ./my-module --name "My Module" [options]
//
// Options:
//   --short <name>            short_name for the launcher tile (<= 12 chars). Default: derived from --name.
//   --slug <slug>             package / router name, lowercase a-z0-9-. Default: derived from --name.
//   --domain <host>           production host (the module must live at the ROOT of its own host).
//                             Default: <slug>.example.com
//   --short-description <s>   <= 80 chars, shown in the dApp listing.
//   --description <s>         longer listing blurb.
//   --headline "<a>|<b>"      hero line; <b> is the accent phrase. Default: "Your identity.|Your call."
//   --port <n>                backend port. Default: first free port from 8791
//   --no-ledger               drop the ShareLedger write/read kit (ledger.ts, proto.ts, anchor page).
//   --install                 run npm install afterwards.
//   --icons                   render icons with the module name (needs --install; uses Playwright).
//   --force                   allow a non-empty target directory.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };

const name = opt('name');
const dir = opt('dir');
if (!name || !dir) {
  console.error('usage: node new-module.mjs --dir <path> --name "<Module Name>" [--short X] [--slug x] [--domain host] [--short-description s] [--description s] [--headline "a|b"] [--port n] [--no-ledger] [--install] [--icons]');
  process.exit(1);
}
const slug = opt('slug', name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
// The launcher tile label: the whole name if it fits in 12, else its first word (never a squashed "LoyaltyStamp").
const short = opt('short', name.length <= 12 ? name : (name.split(/\s+/)[0].slice(0, 12)));
const domain = opt('domain', `${slug}.example.com`).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const shortDesc = opt('short-description', `${name}, inside ShareRing Me.`);
const desc = opt('description', shortDesc);
const [headA, headB] = opt('headline', 'Your identity.|Your call.').split('|');
// Backend port: --port, else the first free one from 8791 (other local modules often hold 8791).
const free = (p) => new Promise((r) => { const srv = createServer().once('error', () => r(false)).listen(p, () => srv.close(() => r(true))); });
let port = opt('port');
if (!port) { let p = 8791; while (p < 8891 && !(await free(p))) p++; port = String(p); }

const warnings = [];
if (name.length > 30) warnings.push(`name is ${name.length} chars; the dApp listing truncates past 30`);
if (short.length > 12) warnings.push(`short_name "${short}" is ${short.length} chars; keep it <= 12`);
if (shortDesc.length > 80) warnings.push(`short_description is ${shortDesc.length} chars; keep it <= 80`);
if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`bad slug "${slug}"`);

const target = resolve(dir);
if (existsSync(target) && readdirSync(target).length && !flag('force')) {
  console.error(`${target} is not empty (use --force to scaffold into it anyway)`);
  process.exit(1);
}
const template = fileURLToPath(new URL('../assets/template/', import.meta.url));
mkdirSync(target, { recursive: true });
cpSync(template, target, { recursive: true });

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const REPL = {
  __MODULE_NAME__: name, __SHORT_NAME__: short, __SLUG__: slug, __DOMAIN__: domain, __PORT__: port,
  __SHORT_DESCRIPTION__: shortDesc, __DESCRIPTION__: desc, __HEADLINE_A__: headA, __HEADLINE_B__: headB ?? '',
};
const TEXT = /\.(ts|tsx|mjs|js|json|html|css|md|sh|yaml|yml)$|Dockerfile|\.gitignore|\.dockerignore/;
function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!TEXT.test(f)) continue;
    let s = readFileSync(p, 'utf8');
    for (const [k, v] of Object.entries(REPL)) s = s.split(k).join(p.endsWith('.json') ? esc(v) : v);
    writeFileSync(p, s);
  }
}
walk(target);

if (flag('no-ledger')) {
  for (const f of ['src/lib/ledger.ts', 'src/lib/merkle.ts', 'src/lib/proto.ts', 'src/lib/bytes.ts', 'src/anchor.ts', 'anchor.html']) rmSync(join(target, f), { force: true });
  const vc = join(target, 'vite.config.ts');
  writeFileSync(vc, readFileSync(vc, 'utf8')
    .replace("    // The module, plus the V1 anchor page used to write to ShareLedger (see src/lib/ledger.ts).\n    rollupOptions: { input: { index: 'index.html', anchor: 'anchor.html' } },\n", ''));
}

if (flag('install')) execSync('npm install', { cwd: target, stdio: 'inherit' });
if (flag('icons')) execSync('node scripts/make-icons.mjs', { cwd: target, stdio: 'inherit' });

console.log(`\nScaffolded ${name} (${slug}) in ${target}`);
console.log(`  manifest start_url: https://${domain}/   backend port: ${port}   ledger kit: ${flag('no-ledger') ? 'no' : 'yes'}`);
for (const w of warnings) console.log(`  warning: ${w}`);
console.log(`\nNext:\n  cd ${dir}${flag('install') ? '' : ' && npm install'}\n  npm run dev:server & npm run dev     # http://localhost:5173 (mock bridge)\n  npm run typecheck && npm run layout`);
