// Inlines logic.js and ui.js into one self-contained page: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const page = readFileSync(new URL('./page.html', import.meta.url), 'utf8')
  .replace('/*LOGIC*/', () => readFileSync(new URL('./logic.js', import.meta.url), 'utf8'))
  .replace('/*UI*/', () => readFileSync(new URL('./ui.js', import.meta.url), 'utf8'));
writeFileSync(new URL('./springs-puzzle.html', import.meta.url), page);
console.log('springs-puzzle.html', Math.round(page.length / 1024) + ' kB');
