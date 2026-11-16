// Renders the app icons from the logo mark (run: npm run icons). Output in public/.
import { writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const FLAME =
  'M21.2 27.1a2.2 2.2 0 0 0 2.2-2.2c0-1.2-.44-1.76-.88-2.64-.94-1.88-.2-3.56 1.76-5.28.44 2.2 1.76 4.3 3.52 5.72 1.76 1.4 2.64 3.08 2.64 4.84a6.16 6.16 0 1 1-12.32 0c0-1.02.38-2.02.88-2.64a2.2 2.2 0 0 0 2.2 2.2z';

/** @param {{ rounded: boolean, scale: number }} o  scale: size of the mark inside the square (1 = edge to edge) */
function svg({ rounded, scale }) {
  const pad = (48 - 48 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="g" x1="8" y1="40" x2="40" y2="8" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff3d1f"/><stop offset=".5" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ffc23d"/>
    </linearGradient>
    <radialGradient id="glow" cx="24" cy="26" r="20" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff6a1f" stop-opacity=".28"/><stop offset="1" stop-color="#ff6a1f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="48" height="48" ${rounded ? 'rx="14"' : ''} fill="#0d0d10"/>
  <g transform="translate(${pad} ${pad}) scale(${scale})">
    <circle cx="24" cy="24" r="20" fill="url(#glow)"/>
    <circle cx="24" cy="24" r="15" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="4.5"/>
    <circle cx="24" cy="24" r="15" fill="none" stroke="url(#g)" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="84 94.25" transform="rotate(-90 24 24)"/>
    <path fill="url(#g)" d="${FLAME}"/>
  </g>
</svg>`;
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/favicon.svg', svg({ rounded: true, scale: 1 }));
const png = (s, size, file) => sharp(Buffer.from(s), { density: 1200 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file);

await Promise.all([
  png(svg({ rounded: false, scale: 1 }), 192, 'public/icons/icon-192.png'),
  png(svg({ rounded: false, scale: 1 }), 512, 'public/icons/icon-512.png'),
  // maskable: the mark stays inside the 80 % safe zone whatever mask the launcher applies
  png(svg({ rounded: false, scale: 0.72 }), 512, 'public/icons/maskable-512.png'),
  // iOS rounds the corners itself: a full square, no transparency
  png(svg({ rounded: false, scale: 0.86 }), 180, 'public/icons/apple-touch-icon.png'),
  png(svg({ rounded: true, scale: 1 }), 32, 'public/icons/favicon-32.png'),
]);
console.log('icons written');
