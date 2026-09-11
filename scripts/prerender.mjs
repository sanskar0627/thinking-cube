// Injects the server-rendered app into dist/index.html so search engines and
// AI crawlers that don't run JavaScript still see the full page content.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ssrDir = resolve(root, 'dist-ssr');
const htmlPath = resolve(root, 'dist/index.html');

const { render } = await import(pathToFileURL(resolve(ssrDir, 'entry-server.js')).href);
const html = readFileSync(htmlPath, 'utf8');
const slot = '<div id="root"></div>';

if (!html.includes(slot)) throw new Error('prerender: <div id="root"></div> not found in dist/index.html');

writeFileSync(htmlPath, html.replace(slot, `<div id="root">${render()}</div>`));
rmSync(ssrDir, { recursive: true, force: true });
console.log('prerender: wrote dist/index.html');
