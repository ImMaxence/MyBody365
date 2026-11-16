// Trims the display font to what the design uses (run: npm run fonts). Output in public/fonts/.
// Archivo is only used for titles and big numbers: weight 600-900, width 100-125 %. Limiting the two
// variation axes and keeping the latin characters cuts the file to a fraction of the full one.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import subsetFont from 'subset-font';

const LATIN = [[0x20, 0x7e], [0xa0, 0xff], [0x131, 0x131], [0x152, 0x153], [0x2bb, 0x2bc], [0x2c6, 0x2c6], [0x2da, 0x2da],
  [0x2dc, 0x2dc], [0x2000, 0x206f], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2191, 0x2191], [0x2193, 0x2193], [0x2212, 0x2212]];
const text = LATIN.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i))).join('');

mkdirSync('public/fonts', { recursive: true });
const source = readFileSync('node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2');
const out = await subsetFont(source, text, {
  targetFormat: 'woff2',
  variationAxes: { wght: { min: 600, max: 900 }, wdth: { min: 100, max: 125 } },
});
writeFileSync('public/fonts/archivo-display.woff2', out);
console.log(`archivo-display.woff2: ${source.length} → ${out.length} bytes`);
