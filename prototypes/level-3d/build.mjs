// Inlines the puzzle level (../springs-puzzle/logic.js) and view.js into one self-contained page: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const page = readFileSync(new URL('./page.html', import.meta.url), 'utf8')
  .replace('/*LOGIC*/', () => readFileSync(new URL('../springs-puzzle/logic.js', import.meta.url), 'utf8'))
  .replace('/*VIEW*/', () => readFileSync(new URL('./view.js', import.meta.url), 'utf8'));
writeFileSync(new URL('./level-3d.html', import.meta.url), page);
console.log('level-3d.html', Math.round(page.length / 1024) + ' kB');
