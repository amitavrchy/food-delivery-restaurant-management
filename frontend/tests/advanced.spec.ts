import { expect, test } from '@playwright/test';
test('enterprise workspaces load real records and remain readable on mobile', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Restaurant', exact: true }).click();
  await expect(page).toHaveURL('/restaurant');
  for (const route of [
    'control',
    'branches',
    'hospitality',
    'procurement',
    'workforce',
    'marketing',
    'insights',
    'dispatch',
    'support',
  ]) {
    await page.goto(`/restaurant/${route}`);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.loading-state')).toHaveCount(0);
    await expect(page.locator('.error-box, .toast.error')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    expect(
      await page.locator('main *').evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            const el = node as HTMLElement;
            return (
              el.innerText?.trim() &&
              el.getBoundingClientRect().width > 0 &&
              parseFloat(getComputedStyle(el).fontSize) < 14
            );
          })
          .map((el) => el.tagName),
      ),
    ).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.goto('/restaurant/hospitality');
  await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
  await expect(page.locator('.floor-editor')).toBeVisible();
  await page.screenshot({
    path: 'artifacts/advanced-floor-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.goto('/restaurant/insights');
  await page.screenshot({
    path: 'artifacts/advanced-insights-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
});
test('customer account can save and remove a private delivery address', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/account?tab=addresses');
  await expect(page.locator('h1')).toBeVisible();
  await page.getByRole('button', { name: 'Save address', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Label').fill('Browser acceptance');
  await dialog
    .getByLabel('Complete address', { exact: true })
    .fill('House 12, Road 46, Gulshan, Dhaka');
  await dialog.getByLabel('Contact number').fill('01700000001');
  await dialog.getByRole('button', { name: 'Save address', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const card = page.locator('article').filter({ hasText: 'Browser acceptance' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Delete Browser acceptance address' }).click();
  await expect(card).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'artifacts/account-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
