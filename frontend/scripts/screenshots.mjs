// README pictures: real screenshots of the app, composed into marketing images (docs/readme/*.png),
// and the screens shown on the home page of the site (public/shots/*.webp, light and dark).
//
//   docker compose -p mybody365-shots -f docker-compose.local.yml up --build -d --wait   (LOCAL_PORT=4310 LOCAL_DB_PORT=5437)
//   cd frontend && node scripts/screenshots.mjs
//   docker compose -p mybody365-shots -f docker-compose.local.yml down -v
//
// A separate stack with its own empty database, so the pictures show clean demo data.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { chromium, devices } from 'playwright';

const BASE = process.env.SHOTS_URL ?? 'http://localhost:4310';
const OUT = '../docs/readme';
const RAW = 'test-results/shots';
const SITE = 'public/shots';
mkdirSync(OUT, { recursive: true });
mkdirSync(SITE, { recursive: true });
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
  // his milestones (1.8): the first two passed on the way, a reward for some
  for (const [targetKg, reward] of [[87, 'Un resto entre amis'], [85, 'De nouvelles baskets'], [82, undefined], [80, 'Un week-end à la mer']]) {
    await api(ctx, 'POST', '/api/me/milestones', { targetKg, reward });
  }
  const pending = await api(ctx, 'GET', '/api/admin/access-requests');
  const ines = pending.find((r) => r.name === 'Inès');
  if (ines) await api(ctx, 'POST', `/api/admin/access-requests/${ines.id}/approve`);

  // today's meals, from foods of his own
  const food = async (name, kcal, proteinG, carbsG, fatG, sugarsG, satFatG, saltG, fiberG, servingG) =>
    (await api(ctx, 'POST', '/api/me/foods', { name, kcal, proteinG, carbsG, fatG, sugarsG, satFatG, saltG, fiberG, servingG })).id;
  const skyr = await food('Skyr nature', 63, 11, 4, 0.2, 4, 0.1, 0.1, 0, 150);
  const oats = await food('Flocons d’avoine', 372, 13, 59, 7, 1, 1.3, 0, 10, 50);
  const banana = await food('Banane', 90, 1.1, 20, 0.3, 17, 0.1, 0, 2.6, 120);
  const chicken = await food('Blanc de poulet grillé', 165, 31, 0, 3.6, 0, 1, 0.2, 0, 150);
  const rice = await food('Riz complet cuit', 130, 2.7, 27, 1, 0.4, 0.2, 0, 1.8, 200);
  const broccoli = await food('Brocolis vapeur', 35, 2.4, 4, 0.4, 1.4, 0.1, 0, 3.3, 150);
  const apple = await food('Pomme', 52, 0.3, 12, 0.2, 9, 0, 0, 1.4, 150);
  const salmon = await food('Saumon au four', 208, 22, 0, 13, 0, 3, 0.1, 0, 150);
  const pasta = await food('Pâtes complètes cuites', 150, 5.5, 29, 0.9, 0.8, 0.2, 0, 4, 200);
  const yogurt = await food('Yaourt grec', 97, 9, 4, 5, 4, 3.3, 0.1, 0, 150);
  const almonds = await food('Amandes', 579, 21, 9, 50, 4.4, 3.8, 0, 12, 30);
  const today = day(0);
  // three weeks: some days on target, a few above (the weekend), a few below
  for (let i = 21; i >= 1; i--) {
    const dow = new Date(day(i) + 'T12:00:00').getDay();
    const f = (dow === 0 || dow === 6 ? 1.22 : 0.92) + Math.sin(i * 2.3) * 0.12;
    const g = (x) => Math.round(x * f);
    for (const [slot, foodId, grams] of [
      ['BREAKFAST', skyr, 150],
      ['BREAKFAST', oats, g(50)],
      ['BREAKFAST', banana, 120],
      ['LUNCH', i % 3 ? chicken : salmon, g(150)],
      ['LUNCH', rice, g(200)],
      ['LUNCH', broccoli, 150],
      ['DINNER', i % 2 ? salmon : chicken, g(160)],
      ['DINNER', pasta, g(230)],
      ['DINNER', yogurt, 150],
      ['SNACK', apple, 150],
      ['SNACK', almonds, g(25)],
    ]) {
      await api(ctx, 'POST', '/api/me/meals', { day: day(i), slot, foodId, grams });
    }
  }
  await api(ctx, 'PUT', '/api/me/username', { username: 'max.fit' });
  for (const [slot, foodId, grams] of [
    ['BREAKFAST', skyr, 150],
    ['BREAKFAST', oats, 50],
    ['BREAKFAST', banana, 120],
    ['LUNCH', chicken, 150],
    ['LUNCH', rice, 200],
    ['LUNCH', broccoli, 150],
    ['SNACK', apple, 150],
  ]) {
    await api(ctx, 'POST', '/api/me/meals', { day: today, slot, foodId, grams });
  }
  await api(ctx, 'POST', '/api/me/recipes', {
    name: 'Bowl poulet, riz et brocolis', type: 'LUNCH', servings: 2, visibility: 'PUBLIC',
    ingredients: [{ foodId: chicken, grams: 300 }, { foodId: rice, grams: 400 }, { foodId: broccoli, grams: 300 }],
  });

  // three friends, each with a flame of their own
  const invite = (await api(ctx, 'POST', '/api/me/friends/invite')).url;
  const token = invite.slice(invite.indexOf('#') + 1);
  const friendCtx = [];
  for (const [as, name, days, weighedToday, username] of [
    ['user', 'Léa', 34, true, 'lea.martin'],
    ['new', 'Hugo', 12, false, 'hugo.b'],
    ['new', 'Inès', 61, true, 'ines.fit'],
  ]) {
    const f = await browser.newContext(phone);
    const p = await f.newPage();
    await p.goto(BASE + '/app/login?browser=1');
    await p.goto(BASE + '/api/auth/dev-login?as=' + as);
    await api(f, 'POST', '/api/me/consent', { adult: true, health: true });
    await api(f, 'PATCH', '/api/me', { displayName: name });
    await api(f, 'PUT', '/api/me/username', { username });
    await api(f, 'PUT', '/api/me/profile', {
      sex: 'FEMALE', birthDate: '1995-05-05', heightCm: 168, activityLevel: 'LIGHT', currentWeightKg: 72, goalWeightKg: 65, weeklyRateKg: 0.5,
    });
    // down to today (the profile weighed today in at its starting 72 kg): the curve goes on to this morning
    for (let i = days; i >= 0; i--) await api(f, 'PUT', `/api/me/logs/${day(i)}`, { weightKg: Math.round((72 - (days - i) * 0.05) * 10) / 10 });
    // the onboarding weighed today in: taken back for the one who has not weighed in yet
    if (!weighedToday) await api(f, 'DELETE', `/api/me/logs/${day(0)}`);
    await api(f, 'POST', '/api/me/friends/accept', { token });
    friendCtx.push({ f, name });
  }
  // the demo journeys began with their first weigh-in, not today (a profile starts the day it is made): straight in the
  // database of this stack of its own, so that the progress shared and the curves tell weeks, not « 0 kg in 0 days »
  execSync(
    `docker exec ${process.env.SHOTS_DB ?? 'mybody365-shots-db-1'} psql -U mybody365 -d mybody365 -c "update body_profile p set start_date = l.day, start_weight_kg = l.weight_kg from (select distinct on (user_id) user_id, day, weight_kg from body_log where weight_kg is not null order by user_id, day) l where l.user_id = p.user_id"`,
    { stdio: 'inherit' },
  );
  // 1.14: what the friends show (their progress, without the kilos), Max's Bravo, and a challenge on the weigh-in
  for (const { f, name } of friendCtx) {
    if (name !== 'Hugo') await api(f, 'POST', '/api/me/posts', { kind: 'PROGRESS', weights: false });
  }
  for (const p of await api(ctx, 'GET', '/api/friends/posts')) {
    if (p.id) await api(ctx, 'PUT', `/api/friends/posts/${p.id}/cheer`);
    break;
  }
  const mine = (await api(ctx, 'GET', '/api/me/friends')).friends;
  const challenge = await api(ctx, 'POST', '/api/me/challenges', { kind: 'WEIGH', days: 7, friends: mine.map((x) => x.id) });
  for (const { f } of friendCtx) await api(f, 'POST', `/api/me/challenges/${challenge.id}/join`);
  for (const { f } of friendCtx) await f.close();
  // and Camille, who found Max by his username
  {
    const f = await browser.newContext(phone);
    const p = await f.newPage();
    await p.goto(BASE + '/app/login?browser=1');
    await p.goto(BASE + '/api/auth/dev-login?as=new');
    await api(f, 'POST', '/api/me/consent', { adult: true, health: true });
    await api(f, 'PATCH', '/api/me', { displayName: 'Camille' });
    await api(f, 'PUT', '/api/me/username', { username: 'camille.run' });
    await api(f, 'POST', '/api/me/friends/requests', { username: 'max.fit' });
    await f.close();
  }
  await ctx.close();
}

// ── screens of the app ───────────────────────────────────────────────────────
const raw = {};
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ ...phone, colorScheme: scheme });
  // the pictures show the app itself: the notifications card is put off (as after "later")
  await ctx.addInitScript(() => localStorage.setItem('mb-push-later', String(Date.now() + 1e10)));
  const page = await ctx.newPage();
  await asInProduction(page);
  await page.goto(BASE + '/app/login?browser=1', { waitUntil: 'networkidle' });
  raw[`login-${scheme}`] = await shot(page, `login-${scheme}`);
  await page.unroute('**/api/auth/providers');
  await page.goto(BASE + '/api/auth/dev-login?as=admin', { waitUntil: 'networkidle' });
  await page.goto(BASE + '/app', { waitUntil: 'networkidle' });
  raw[`today-${scheme}`] = await shot(page, `today-${scheme}`);
  await page.goto(BASE + '/app/meals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  raw[`meals-${scheme}`] = await shot(page, `meals-${scheme}`);
  await page.getByRole('button', { name: /Aujourd’hui/ }).click();
  await page.waitForTimeout(900);
  raw[`calendar-${scheme}`] = await shot(page, `calendar-${scheme}`);
  await page.goto(BASE + '/app/meals/stats', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  raw[`stats-${scheme}`] = await shot(page, `stats-${scheme}`);
  await page.evaluate(() => window.scrollTo(0, 820));
  await page.waitForTimeout(900);
  raw[`stats2-${scheme}`] = await shot(page, `stats2-${scheme}`);
  await page.goto(BASE + '/app/meals/recipes', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Communauté' }).click();
  await page.waitForTimeout(900);
  raw[`recipes-${scheme}`] = await shot(page, `recipes-${scheme}`);
  await page.goto(BASE + '/app/friends', { waitUntil: 'networkidle' });
  raw[`friends-${scheme}`] = await shot(page, `friends-${scheme}`);
  // 1.14: the friends and their flames, the news of the friends (their progress and the Bravo), then the challenge
  await page.locator('h2.section-title', { hasText: /^Amis$/ }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -90));
  raw[`friends-list-${scheme}`] = await shot(page, `friends-list-${scheme}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('heading', { name: 'Nouvelles de tes amis' }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -90));
  raw[`friends-posts-${scheme}`] = await shot(page, `friends-posts-${scheme}`);
  await page.goto(BASE + '/app/challenges', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  raw[`challenges-${scheme}`] = await shot(page, `challenges-${scheme}`);
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
  // the activity in two questions (1.7): the day, then the sessions
  await page.getByRole('radio', { name: /Debout/ }).click();
  raw['setup-light'] = await shot(page, 'setup-light');
  await ctx.close();
}

// ── the public site ──────────────────────────────────────────────────────────
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ ...phone, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  raw[`site-top-${scheme}`] = await shot(page, `site-top-${scheme}`);
  // 1.14: the friends section
  await page.locator('#amis .friends-copy .h2').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -90));
  raw[`site-friends-${scheme}`] = await shot(page, `site-friends-${scheme}`);
  await page.locator('#amis .scene').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -60));
  raw[`site-friends2-${scheme}`] = await shot(page, `site-friends2-${scheme}`);
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

// the home page of the site: the screens alone, 600 px wide, WebP (the browser does the encoding)
async function toWebp(key, name) {
  const page = await browser.newPage();
  const data = await page.evaluate(async (src) => {
    const im = new Image();
    im.src = src;
    await im.decode();
    const w = 600;
    const h = Math.round((im.height * w) / im.width);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, 0, 0, w, h);
    return c.toDataURL('image/webp', 0.8);
  }, img(key));
  await page.close();
  writeFileSync(`${SITE}/${name}.webp`, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`${SITE}/${name}.webp`);
}
for (const scheme of ['light', 'dark']) {
  for (const k of ['today', 'meals', 'calendar', 'stats', 'progress', 'friends']) await toWebp(`${k}-${scheme}`, `${k}-${scheme}`);
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

// the picture shown when the site is shared (og:image): the banner, 1200 × 630
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const src = `data:image/png;base64,${readFileSync(`${OUT}/banner.png`).toString('base64')}`;
  await page.setContent(`<html><body style="margin:0;background:#0a0a0c"><img src="${src}" style="width:1200px;height:630px;object-fit:cover"></body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'public/og.png' });
  await page.close();
  console.log('public/og.png');
}

await compose(
  'app',
  1600,
  1000,
  `<div class="canvas" style="width:1600px;height:1000px;gap:44px;align-items:flex-start;padding-top:80px">
    ${[
      ['today-dark', 'Aujourd’hui', 'La flamme et ta journée'],
      ['meals-light', 'Repas', 'Calendrier, calories, macros'],
      ['friends-dark', 'Amis', 'Demandes, flammes, coups de pouce'],
      ['progress-light', 'Progrès', 'Courbe, tendance, prévision'],
    ]
      .map(([k, t, s]) => `<div style="width:320px"><div class="phone"><img src="${img(k)}"></div><div class="cap">${t}<small>${s}</small></div></div>`)
      .join('')}
  </div>`,
);

// 1.14: the friends, put forward
await compose(
  'friends',
  1600,
  1000,
  `<div class="canvas" style="width:1600px;height:1000px;gap:44px;align-items:flex-start;padding-top:80px">
    ${[
      ['friends-list-light', 'Tes amis', 'Leurs flammes, un coup de pouce en un tap'],
      ['friends-posts-dark', 'Leurs nouvelles', 'Leur avancée, sans les kilos, et tes Bravo'],
      ['challenges-light', 'Les défis', 'Pesée, eau, repas ou photo : le classement se remplit tout seul'],
      ['site-friends2-dark', 'Plus facile à plusieurs', 'Trouve-les par nom d’utilisateur, lien ou QR code'],
    ]
      .map(([k, t, s]) => `<div style="width:320px"><div class="phone"><img src="${img(k)}"></div><div class="cap">${t}<small>${s}</small></div></div>`)
      .join('')}
  </div>`,
);

await compose(
  'meals',
  1600,
  1000,
  `<div class="canvas" style="width:1600px;height:1000px;gap:44px;align-items:flex-start;padding-top:80px">
    ${[
      ['calendar-dark', 'Le calendrier', 'Chaque jour : dans l’objectif, au-dessus, en dessous'],
      ['stats-light', 'Les statistiques', 'Moyenne, bilan du mois, calories jour par jour'],
      ['stats2-dark', 'Les conseils', 'Ce que tu manges le plus, par repas, note santé'],
      ['recipes-light', 'Les recettes', 'Les tiennes, celles des amis, la communauté'],
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
