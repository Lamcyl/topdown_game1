// Packs the production build into one self-contained HTML fragment (no external files),
// for hosting as a single page such as a claude.ai artifact. Run after `vite build`.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const src = html.match(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/)[1];
const js = readFileSync(`dist/${src}`, 'utf8').replace(/<\/script/g, '<\\/script');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];

const out = [
  title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  style,
  body.trim(),
  `<script type="module">\n${js}\n</script>`,
  '',
].join('\n');
writeFileSync('dist/benchmark-single.html', out);
console.log(`dist/benchmark-single.html (${(out.length / 1024).toFixed(0)} kB)`);
