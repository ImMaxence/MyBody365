// 1.19: the icons of the app's shortcuts (a long press on its icon, Android): a meal, a weigh-in, the photo of the day, drawn
// like the app icon (dark square, the flame's gradient) with the app's own line icons. Run: node scripts/shortcut-icons.mjs
import sharp from 'sharp';

const ICONS = {
  meal: ['M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'],
  weigh: ['M15 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z', 'M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z'],
  photo: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z', 'M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
};

function svg(paths) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff3d1f"/><stop offset=".5" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ffc23d"/>
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="28" fill="#0d0d10"/>
  <g transform="translate(24 24) scale(2)" fill="none" stroke="url(#g)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${paths.map((d) => `<path d="${d}"/>`).join('')}
  </g>
</svg>`;
}

for (const [name, paths] of Object.entries(ICONS)) {
  await sharp(Buffer.from(svg(paths))).resize(96, 96).png().toFile(`public/icons/shortcut-${name}.png`);
  console.log('public/icons/shortcut-' + name + '.png');
}
