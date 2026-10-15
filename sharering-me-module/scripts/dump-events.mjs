#!/usr/bin/env node
// Prints the bridge event catalogue from an INSTALLED @sharering/me-module-sdk as Markdown, so the
// reference can be refreshed when the SDK changes:
//   node dump-events.mjs [path/to/module] > references/sdk-catalogue.md
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const dir = resolve(process.argv[2] ?? '.');
const m = await import(pathToFileURL(`${dir}/node_modules/@sharering/me-module-sdk/dist/catalog.mjs`).href);
const wrapper = (t) => t.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const j = (v) => (v === undefined ? '' : JSON.stringify(v));
let out = `# SDK event catalogue (generated from @sharering/me-module-sdk)\n\nWrapper = camelCase of the event (\`COMMON_APP_INFO\` -> \`commonAppInfo()\`, \`NAVIGATE_TO\` -> \`navigateTo()\`).\nFire-and-forget events resolve immediately with no reply.\n`;
const byCat = {};
for (const [k, v] of Object.entries(m.EVENT_DOCS)) (byCat[v.category] ??= []).push([k, v]);
for (const [cat, list] of Object.entries(byCat)) {
  out += `\n## ${cat}\n${m.CATEGORY_BLURB[cat] ?? ''}\n`;
  for (const [k, v] of list) {
    out += `\n### ${k}${v.fireAndForget ? ' (fire-and-forget)' : ''}\n\`${wrapper(k)}()\`: ${v.summary}\n`;
    if (v.exampleRequest !== undefined) out += `- request: \`${j(v.exampleRequest)}\`\n`;
    if (v.exampleResponse !== undefined) out += `- response: \`${j(v.exampleResponse)}\`\n`;
    for (const n of v.notes ?? []) out += `- ${n}\n`;
  }
}
process.stdout.write(out);
