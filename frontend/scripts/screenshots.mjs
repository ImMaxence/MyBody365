// README pictures: real screenshots of the app, composed into marketing images (docs/readme/*.png).
//
//   docker compose -p mybody365-shots -f docker-compose.local.yml up --build -d --wait   (LOCAL_PORT=4310 LOCAL_DB_PORT=5437)
//   cd frontend && node scripts/screenshots.mjs
//   docker compose -p mybody365-shots -f docker-compose.local.yml down -v
//
// A separate stack with its own empty database, so the pictures show clean demo data.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = process.env.SHOTS_URL ?? 'http://localhost:4310';
const OUT = '../docs/readme';
const RAW = 'test-results/shots';
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

const browser = await chromium.launch();
// the whole screen of an iPhone 15 (Playwright's device profile leaves room for the browser bars)
const phone = { ...devices['iPhone 15'], viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'fr-FR' };

/** as in production: the Google button is there, the local sign-in shortcut is not */
async function asInProduction(page) {
  await page.route('**/api/auth/providers', (route) => route.fulfill({ json: { google: true, passkey: true, devLogin: false } }));
}

async function xsrf(ctx) {
  return (await ctx.cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
}

async function api(ctx, method, url, data) {
  const res = await ctx.request.fetch(BASE + url, { method, data, headers: { 'X-XSRF-TOKEN': await xsrf(ctx) } });
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${await res.text()}`);
  return res.status() === 204 || res.status() === 202 ? null : res.json();
}

async function shot(page, name, { full = false } = {}) {
  await page.waitForTimeout(700);
  const file = `${RAW}/${name}.png`;
  await page.screenshot({ path: file, fullPage: full });
  return file;
}

// ── demo data ────────────────────────────────────────────────────────────────
const seed = await browser.newContext(phone);
const seedPage = await seed.newPage();
await seedPage.goto(BASE + '/api/auth/me');
for (const r of [
  { email: 'camille@example.com', name: 'Camille', message: 'Coucou ! C’est Camille, la coloc de Léa 👋', kind: 'NEW_ACCESS' },
  { email: 'hugo@example.com', name: 'Hugo', message: 'Je reprends le sport en janvier, je veux en être', kind: 'NEW_ACCESS' },
  { email: 'ines@example.com', name: 'Inès', kind: 'NEW_ACCESS' },
]) {
  await api(seed, 'POST', '/api/access-requests', r);
}
// the regular demo account, onboarded
await seedPage.goto(BASE + '/app/login?browser=1');
await seedPage.goto(BASE + '/api/auth/dev-login?as=user');
await api(seed, 'POST', '/api/me/consent', { adult: true, health: true });
await seed.close();

// the admin ("Max") with a profile and 45 days of weigh-ins: a real curve and a 46-day streak
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(BASE + '/app/login?browser=1');
  await page.goto(BASE + '/api/auth/dev-login?as=admin');
  await api(ctx, 'POST', '/api/me/consent', { adult: true, health: true });
  await api(ctx, 'PATCH', '/api/me', { displayName: 'Max' });
  await api(ctx, 'PUT', '/api/me/profile', {
    sex: 'MALE', birthDate: '1993-02-11', heightCm: 181, activityLevel: 'MODERATE',
    currentWeightKg: 88.6, goalWeightKg: 78, weeklyRateKg: 0.5,
  });
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  for (let i = 45; i >= 0; i--) {
    // a steady 0.65 kg a week with the daily noise of real scales
    const noise = Math.sin(i * 1.7) * 0.35 + Math.cos(i * 0.6) * 0.15;
    const kg = Math.round((88.6 - 0.093 * (45 - i) + noise) * 10) / 10;
    await api(ctx, 'PUT', `/api/me/logs/${day(i)}`, { weightKg: kg, waistCm: i % 7 === 0 ? 96 - (45 - i) * 0.1 : null });
  }
  const pending = await api(ctx, 'GET', '/api/admin/access-requests');
  const ines = pending.find((r) => r.name === 'Inès');
  if (ines) await api(ctx, 'POST', `/api/admin/access-requests/${ines.id}/approve`);
  await ctx.close();
}

// ── screens of the app ───────────────────────────────────────────────────────
const raw = {};
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ ...phone, colorScheme: scheme });
  const page = await ctx.newPage();
  await asInProduction(page);
  await page.goto(BASE + '/app/login?browser=1', { waitUntil: 'networkidle' });
  raw[`login-${scheme}`] = await shot(page, `login-${scheme}`);
  await page.unroute('**/api/auth/providers');
  await page.goto(BASE + '/api/auth/dev-login?as=admin', { waitUntil: 'networkidle' });
  await page.goto(BASE + '/app', { waitUntil: 'networkidle' });
  raw[`today-${scheme}`] = await shot(page, `today-${scheme}`);
  await page.goto(BASE + '/app/progress', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  raw[`progress-${scheme}`] = await shot(page, `progress-${scheme}`);
  await page.goto(BASE + '/app/account', { waitUntil: 'networkidle' });
  raw[`account-${scheme}`] = await shot(page, `account-${scheme}`);
  await page.goto(BASE + '/app/admin/users', { waitUntil: 'networkidle' });
  raw[`admin-${scheme}`] = await shot(page, `admin-${scheme}`);
  await page.goto(BASE + '/app/admin/requests', { waitUntil: 'networkidle' });
  raw[`requests-${scheme}`] = await shot(page, `requests-${scheme}`);
  await ctx.close();
}

// the onboarding of a new account, on the goal step
{
  const ctx = await browser.newContext({ ...phone, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/app/login?browser=1');
  await page.goto(BASE + '/api/auth/dev-login?as=new', { waitUntil: 'networkidle' });
  await page.getByRole('checkbox', { name: /18 ans/ }).check();
  await page.getByRole('checkbox', { name: /données de santé/ }).check();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: 'Femme' }).click();
  await page.getByLabel('Date de naissance').fill('1996-04-12');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Poids aujourd’hui').fill('78,4');
  await page.getByLabel('Poids aujourd’hui').press('Tab');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: /Modérée/ }).click();
  raw['setup-light'] = await shot(page, 'setup-light');
  await ctx.close();
}

// ── the public site ──────────────────────────────────────────────────────────
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ ...phone, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  raw[`site-top-${scheme}`] = await shot(page, `site-top-${scheme}`);
  for (const day of ['7', '30', '90', '365']) {
    await page.locator('.stop .m-num', { hasText: new RegExp(`^${day}$`) }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -80));
    raw[`site-${day}-${scheme}`] = await shot(page, `site-${day}-${scheme}`);
  }
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: 'dark', locale: 'fr-FR' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  raw['desktop-top'] = await shot(page, 'desktop-top');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.45));
  raw['desktop-mid'] = await shot(page, 'desktop-mid');
  await ctx.close();
}

// ── composition ──────────────────────────────────────────────────────────────
const img = (key) => `data:image/png;base64,${readFileSync(raw[key]).toString('base64')}`;
const font = (file) => `data:font/woff2;base64,${readFileSync(file).toString('base64')}`;
const css = `
  @font-face { font-family: Archivo; src: url(${font('public/fonts/archivo-display.woff2')}); font-weight: 600 900; font-stretch: 100% 125%; }
  @font-face { font-family: Inter; src: url(${font('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}); font-weight: 100 900; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Inter, sans-serif; color: #f6f3ee; background: #0a0a0c; }
  .canvas { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;
    background:
      radial-gradient(40% 60% at 75% 30%, rgba(255,106,31,.28), transparent 70%),
      radial-gradient(30% 50% at 15% 85%, rgba(255,194,61,.12), transparent 70%),
      radial-gradient(circle, rgba(255,255,255,.07) 0 1.4px, transparent 1.8px) 0 0 / 26px 26px,
      #0a0a0c; }
  .phone { flex: none; padding: 11px; border-radius: 56px; background: #000;
    box-shadow: 0 0 0 1.5px rgba(255,255,255,.14), 0 0 0 7px #1c1c20, 0 40px 90px -20px rgba(0,0,0,.9), 0 30px 80px -30px rgba(255,106,31,.35); }
  .phone img { display: block; width: 100%; border-radius: 46px; }
  .title { font-family: Archivo; font-stretch: 120%; font-weight: 800; letter-spacing: -0.04em; line-height: .92; }
  .flame { background: linear-gradient(135deg,#ff3d1f,#ff7a1a 48%,#ffc23d); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .eyebrow { font-size: 15px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #8f8a82; }
  .cap { margin-top: 26px; text-align: center; font-weight: 650; font-size: 22px; }
  .cap small { display: block; margin-top: 4px; font-weight: 450; font-size: 16px; color: #b3afa7; }
  .browser { border-radius: 18px; overflow: hidden; background: #141417; box-shadow: 0 0 0 1px rgba(255,255,255,.1), 0 50px 120px -30px rgba(0,0,0,.9); }
  .browser .bar { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 16px; background: #1b1b1f; }
  .browser .bar i { width: 12px; height: 12px; border-radius: 50%; background: #3a3a40; }
  .browser .bar span { margin-left: 18px; padding: 6px 14px; border-radius: 8px; background: #0f0f12; color: #b3afa7; font-size: 13px; }
  .browser img { display: block; width: 100%; }
`;
const logo = readFileSync('public/favicon.svg', 'utf8');

async function compose(name, width, height, body) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.close();
  console.log(`${OUT}/${name}.png`);
}

await compose(
  'banner',
  1600,
  820,
  `<div class="canvas" style="width:1600px;height:820px;justify-content:space-between;padding:0 110px">
    <div style="max-width:620px">
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:46px"><div style="width:72px;height:72px">${logo}</div>
        <div class="title" style="font-size:38px">MyBody<span class="flame">365</span></div></div>
      <div class="eyebrow" style="margin-bottom:22px">Transformation physique · Sur invitation</div>
      <div class="title" style="font-size:92px">Un an pour<br><span class="flame">changer de corps</span></div>
      <p style="margin-top:30px;font-size:24px;line-height:1.5;color:#b3afa7">Pesée, photo du jour, repas, flamme quotidienne et prévision de ton objectif. Une app à installer, privée par défaut.</p>
    </div>
    <div style="position:relative;width:640px;height:820px">
      <div class="phone" style="position:absolute;width:300px;left:0;top:150px;transform:rotate(-7deg)"><img src="${img('progress-dark')}"></div>
      <div class="phone" style="position:absolute;width:320px;left:250px;top:80px;transform:rotate(4deg);z-index:2"><img src="${img('today-dark')}"></div>
    </div>
  </div>`,
);

await compose(
  'app',
  1600,
  1000,
  `<div class="canvas" style="width:1600px;height:1000px;gap:44px;align-items:flex-start;padding-top:80px">
    ${[
      ['setup-light', 'Ton objectif', 'Poids visé, rythme, activité'],
      ['today-dark', 'Aujourd’hui', 'La flamme et la pesée'],
      ['progress-light', 'Progrès', 'Courbe, tendance, prévision'],
      ['requests-dark', 'Administration', 'Demandes, liens, journal'],
    ]
      .map(([k, t, s]) => `<div style="width:320px"><div class="phone"><img src="${img(k)}"></div><div class="cap">${t}<small>${s}</small></div></div>`)
      .join('')}
  </div>`,
);

await compose(
  'site',
  1600,
  1000,
  `<div class="canvas" style="width:1600px;height:1000px">
    <div class="browser" style="position:absolute;left:90px;top:90px;width:1120px"><div class="bar"><i></i><i></i><i></i><span>mybody365.mbonnici.fr</span></div><img src="${img('desktop-top')}"></div>
    <div class="phone" style="position:absolute;right:110px;top:150px;width:300px;transform:rotate(3deg)"><img src="${img('site-30-light')}"></div>
  </div>`,
);

await compose(
  'journey',
  1600,
  960,
  `<div class="canvas" style="width:1600px;height:960px;gap:48px">
    ${['site-top-light', 'site-30-dark', 'site-365-light']
      .map((k, i) => `<div class="phone" style="width:330px;transform:translateY(${i === 1 ? -30 : 20}px)"><img src="${img(k)}"></div>`)
      .join('')}
  </div>`,
);

await browser.close();
writeFileSync(`${RAW}/.done`, new Date().toISOString());
