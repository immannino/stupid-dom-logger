// Builds dist/: a readable copy and a minified copy, each with a source map that
// marks the logger as "ignore-listed". DevTools then skips the logger's frames, so
// your console messages point at your code instead of at the console wrapper.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { minify } from 'terser';

const NAME = 'stupid-dom-logger';
const src = await readFile(`${NAME}.js`, 'utf8');
await mkdir('dist', { recursive: true });

const ignore = { ignoreList: [0], x_google_ignoreList: [0] };

// 1. Readable copy with an identity (line-for-line) source map.
const lineCount = src.split('\n').length;
const identity = ['AAAA', ...Array(lineCount - 1).fill('AACA')].join(';');
await writeFile(`dist/${NAME}.js`, `${src.replace(/\n*$/, '\n')}//# sourceMappingURL=${NAME}.js.map\n`);
await writeFile(`dist/${NAME}.js.map`, JSON.stringify({
  version: 3, file: `${NAME}.js`, sources: [`${NAME}.js`], sourcesContent: [src], names: [], mappings: identity, ...ignore
}));

// 2. Minified copy.
const out = await minify({ [`${NAME}.js`]: src }, {
  ecma: 2018,
  compress: { passes: 2 },
  mangle: true,
  format: { comments: /^!/ },
  sourceMap: { url: `${NAME}.min.js.map`, includeSources: true }
});
const map = JSON.parse(out.map);
await writeFile(`dist/${NAME}.min.js`, out.code + '\n');
await writeFile(`dist/${NAME}.min.js.map`, JSON.stringify({ ...map, ...ignore }));

const kb = (n) => (n / 1024).toFixed(1) + ' kB';
console.log(`dist/${NAME}.js      ${kb(src.length)}`);
console.log(`dist/${NAME}.min.js  ${kb(out.code.length)} (${kb(gzipSync(out.code).length)} gzipped)`);
