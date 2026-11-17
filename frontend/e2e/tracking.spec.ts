import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, openApp, tab, watchErrors } from './helpers';

test.describe('tracking', () => {
  test('a new account: consents, profile, plan, then day 1 of the streak', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await page.goto('/api/auth/dev-login?as=new');

    // consents
    await page.getByRole('checkbox', { name: /18 ans/ }).check();
    await page.getByRole('checkbox', { name: /données de santé/ }).check();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // about you: a birth date under 18 is refused
    await expect(page.getByRole('heading', { name: 'Parle-nous de toi' })).toBeVisible();
    await page.getByRole('radio', { name: 'Homme' }).click();
    const next = page.getByRole('button', { name: 'Continuer' });
    await page.getByLabel('Date de naissance').fill(`${new Date().getFullYear() - 10}-01-01`);
    await expect(next).toBeDisabled();
    await page.getByLabel('Date de naissance').fill('1992-03-08');
    await next.click();

    // starting point: height 182 cm, 88.4 kg (typed and with the steppers)
    await expect(page.getByRole('heading', { name: 'Ton point de départ' })).toBeVisible();
    const height = page.getByLabel('Taille');
    await height.fill('182');
    await height.press('Tab');
    const weight = page.getByLabel('Poids aujourd’hui');
    await weight.fill('88');
    await weight.press('Tab');
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Plus 100 grammes' }).click();
    await expect(weight).toHaveValue('88,4');
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Continuer' }).click();

    // goal: proposed 5 kg lower, pace and activity
    await expect(page.getByRole('heading', { name: 'Ton objectif' })).toBeVisible();
    await expect(page.getByLabel('Poids visé')).toHaveValue('83,5');
    // a wished date two weeks away: too fast to be safe, the app says from when it is possible
    await page.getByRole('radio', { name: /Ou choisis une date d’arrivée/ }).click();
    const soon = new Date();
    soon.setDate(soon.getDate() + 14);
    await page.getByLabel('Date souhaitée').fill(soon.toISOString().slice(0, 10));
    await expect(page.getByText(/Trop rapide pour rester en bonne santé/)).toBeVisible();
    await page.getByRole('radio', { name: /Soutenu/ }).click();
    await page.getByRole('radio', { name: /Modérée/ }).click();
    await expect(page.getByText(/Arrivée estimée/)).toBeVisible();
    await page.getByRole('button', { name: 'Voir mon plan' }).click();

    // the plan computed by the server
    await expect(page.getByRole('heading', { name: 'Ton plan est prêt' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Prévision mois par mois' })).toBeVisible();
    await expect(page.getByText('Objectif calorique')).toBeVisible();
    await expect(page.getByText(/4,9 kg/)).toBeVisible();
    await page.getByRole('button', { name: /C’est parti/ }).click();

    // Today: the onboarding weigh-in validated day 1
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('.streak .big')).toContainText('1');
    await expect(page.getByText('Journée validée, à demain')).toBeVisible();
    await expect(page.getByRole('button', { name: /Pesée du jour/ })).toContainText('88,4 kg');
    await expect(page.getByText(/kcal par jour/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test('weigh-in, progress curve and goal', async ({ page }) => {
    await openApp(page);
    await page.goto('/api/auth/dev-login?as=new');
    const { completeOnboarding } = await import('./helpers');
    await completeOnboarding(page);

    // today's weigh-in, edited with a measurement
    await page.getByRole('button', { name: /Pesée du jour/ }).click();
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('heading', { name: 'Pesée du jour' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Moins 100 grammes' }).click();
    await sheet.getByRole('button', { name: 'Moins 100 grammes' }).click();
    await sheet.getByRole('button', { name: /Ajouter des mensurations/ }).click();
    await sheet.getByLabel('Tour de taille (cm)').fill('84,5');
    await sheet.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Pesée enregistrée')).toBeVisible();
    await expect(page.getByRole('button', { name: /Pesée du jour/ })).toContainText('74,8 kg');

    // the progress tab: curve, figures, history
    await tab(page, 'Progrès').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Progrès');
    await expect(page.getByRole('img', { name: 'Courbe de poids' })).toBeVisible();
    await expect(page.locator('.stat', { hasText: 'Départ' })).toContainText('75');
    await expect(page.locator('.stat', { hasText: 'Variation' })).toContainText('−0,2');
    const row = page.locator('.list-item').first();
    await expect(row).toContainText('74,8 kg');
    await expect(row).toContainText('Mensurations (1)');
    await page.getByRole('button', { name: '3 mois' }).click();
    await expect(page.getByRole('img', { name: 'Courbe de poids' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // the BMI (74.8 kg at 1.70 m): its band on the tile, and a sheet that explains it
    const bmi = page.getByRole('button', { name: /IMC 25,9, Surpoids/ });
    await expect(bmi).toContainText('Surpoids');
    await bmi.click();
    const bmiSheet = page.getByRole('dialog', { name: 'Ton IMC' });
    await expect(bmiSheet).toContainText('la corpulence normale va de 53,5 à');
    await expect(bmiSheet).toContainText('Prochain palier : sous 25 (Corpulence normale)');
    // beyond the BMI: the waist measured at the weigh-in (84.5 cm at 1.70 m) is healthy, so it is muscle
    await expect(bmiSheet).toContainText('Tour de taille 84,5 cm, soit 0,49 de ta taille');
    await expect(bmiSheet).toContainText('c’est sûrement du muscle');
    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);
    await bmiSheet.getByRole('button', { name: 'Fermer' }).click();

    // the calorie target, in plain words
    await tab(page, 'Repas').click();
    await expect(page.getByText(/kcal par jour pour perdre .* kg par semaine/)).toBeVisible();
    await expect(page.getByText(/baisse d’environ \d+ kcal par kilo perdu/)).toBeVisible();

    // my goal, from the profile
    await tab(page, 'Profil').click();
    await page.getByRole('link', { name: /Mon objectif/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon objectif');
    await page.getByRole('radio', { name: /Doux/ }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Objectif mis à jour')).toBeVisible();
    await expect(page).toHaveURL(/\/app\/account$/);
    await expect(page.getByRole('link', { name: /Mon objectif/ })).toContainText('0,25 kg / semaine');
  });

  test('a goal under a healthy weight is refused', async ({ page }) => {
    await openApp(page);
    await page.goto('/api/auth/dev-login?as=new');
    const { completeOnboarding } = await import('./helpers');
    await completeOnboarding(page);
    const res = await page.request.put('/api/me/profile', {
      data: { sex: 'FEMALE', birthDate: '1995-06-15', heightCm: 170, activityLevel: 'LIGHT', currentWeightKg: 75, goalWeightKg: 45, weeklyRateKg: 0.5 },
      headers: { 'X-XSRF-TOKEN': (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).message).toBe('goal_too_low');
  });
});
