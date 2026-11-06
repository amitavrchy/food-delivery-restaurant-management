import { expect, test } from '@playwright/test';
test('storefront discovery works with readable text and responsive layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Something delicious is nearby.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Green Fork', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search restaurants' }).fill('ember');
  await expect(page.getByRole('heading', { name: 'Ember Kitchen', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Green Fork', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search restaurants' }).fill('');
  const undersized = await page.locator('body *').evaluateAll((elements) =>
    elements
      .filter((e) => {
        const el = e as HTMLElement;
        const style = getComputedStyle(el);
        return (
          el.innerText?.trim() &&
          el.getBoundingClientRect().width > 0 &&
          style.display !== 'none' &&
          parseFloat(style.fontSize) < 14
        );
      })
      .map((e) => ({ tag: e.tagName, size: getComputedStyle(e).fontSize })),
  );
  expect(undersized).toEqual([]);
  await page.screenshot({
    path: 'artifacts/storefront-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({
    path: 'artifacts/storefront-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
test('customer can customize a meal checkout with promo and cancel with history', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: /The Green Fork/ }).click();
  await expect(page.getByRole('heading', { name: 'The Green Fork', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Smoky beef burger', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Extra cheddar').check();
  await page.getByRole('button', { name: /Add 1 ·/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Continue to checkout' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page
    .getByRole('textbox', { name: 'Delivery address', exact: true })
    .fill('House 12, Road 46, Gulshan 2, Dhaka');
  await page.getByLabel('Promo code').fill('HELLO15');
  await page.getByRole('button', { name: 'Place my order' }).click();
  await expect(page).toHaveURL(/\/orders\/.+\?placed=1/);
  await expect(page.getByText('Your delivery confirmation code')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Live restaurant and rider map' })).toBeVisible();
  await expect(page.locator('.leaflet-control-attribution')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: 'artifacts/customer-tracking-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await expect(page.getByText('Promo savings')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await page.getByLabel('A short reason').fill('Browser acceptance verification');
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.page-heading .badge')).toHaveText('Cancelled');
});
test('owner workspace pages and mobile navigation render without overflow', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Restaurant', exact: true }).click();
  await expect(page).toHaveURL('/restaurant');
  await expect(page.getByRole('heading', { name: /A good day/ })).toBeVisible();
  await expect(page.getByText('Total revenue', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'artifacts/dashboard-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  for (const [path, heading] of [
    ['menu', 'A menu worth coming back for.'],
    ['orders', 'Every order, a little care.'],
    ['tables', 'Make room for a good time.'],
    ['kitchen', 'A good rhythm in the kitchen.'],
    ['inventory', 'A well-stocked kind of day.'],
    ['staff', 'Good people. Great service.'],
    ['reports', 'A clearer picture of good business.'],
    ['settings', 'Your restaurant, your way.'],
  ]) {
    await page
      .getByRole('link', {
        name: new RegExp(
          (
            {
              menu: '^Menu$',
              orders: '^Orders$',
              tables: 'Tables & POS',
              kitchen: 'Kitchen display',
              inventory: '^Inventory$',
              staff: 'Team & shifts',
              reports: '^Reports$',
              settings: '^Settings$',
            } as Record<string, string>
          )[path],
        ),
      })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.locator('.error-box, .toast.error')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: /A good day/ })).toBeVisible();
  await expect(page.locator('.revenue-chart')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: 'artifacts/dashboard-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
test('rider and platform administrator have usable workspaces', async ({ browser }) => {
  for (const [role, path, title] of [
    ['Rider', '/rider', /Ready when you are/],
    ['Admin', '/admin', 'A little oversight. A lot of trust.'],
  ] as const) {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByRole('button', { name: role, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.locator('.error-box, .toast.error')).toHaveCount(0);
    await page.screenshot({
      path: `artifacts/${role.toLowerCase()}-desktop.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await context.close();
  }
});
test('POS can send a table round through kitchen service and settle the check', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Restaurant', exact: true }).click();
  await expect(page).toHaveURL('/restaurant');
  await page.getByRole('link', { name: 'Tables & POS', exact: true }).click();
  const available = (await (await page.request.get('/api/pos/green-fork/tables')).json()).find(
    (t: { checks: unknown[] }) => t.checks.length === 0,
  );
  expect(available).toBeTruthy();
  const tableName = new RegExp(`${available.code} ${available.seats} seats`);
  await page.getByRole('button', { name: tableName }).click();
  await page.getByRole('button', { name: 'Add Smoky beef burger', exact: true }).click();
  await page.getByRole('button', { name: /Add 1 ·/ }).click();
  await page.getByRole('button', { name: /Send to kitchen/ }).click();
  await expect(
    page.locator('.toast').filter({ hasText: 'Order sent to the kitchen.' }),
  ).toBeVisible();
  const tables = await (await page.request.get('/api/pos/green-fork/tables')).json();
  const table = tables.find((t: { code: string }) => t.code === available.code);
  const order = table.checks[0].orders[0];
  await page.getByRole('link', { name: 'Kitchen display', exact: true }).click();
  const ticket = page.locator('.ticket-card').filter({
    has: page.getByRole('heading', {
      name: `#${String(order.number).padStart(4, '0')}`,
      exact: true,
    }),
  });
  await ticket.getByRole('button', { name: 'Start cooking', exact: true }).click();
  await ticket.getByRole('button', { name: 'Mark done', exact: true }).click();
  await page.getByRole('link', { name: 'Tables & POS', exact: true }).click();
  await page.getByRole('button', { name: tableName }).click();
  await page.getByRole('button', { name: `Order #${order.number}`, exact: true }).click();
  await page.getByRole('button', { name: 'Served', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.badge')).toHaveText('Served');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Split & settle bill' }).click();
  await page.getByRole('button', { name: 'By item', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Smoky beef burger/ })
    .click();
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Make room for a good time.', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: new RegExp(`${available.code} ${available.seats} seats Available`),
    }),
  ).toBeVisible();
});
test('menu and inventory editors open accessibly and team clock actions persist', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Restaurant', exact: true }).click();
  await expect(page).toHaveURL('/restaurant');
  await page.getByRole('link', { name: 'Menu', exact: true }).click();
  await page
    .getByRole('button', { name: 'Edit options for Smoky beef burger', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByLabel('Group name')).toHaveValue('Make it yours');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: 'Inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Ingredient name')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: 'Team & shifts', exact: true }).click();
  const button = page.getByRole('button', { name: /Clock (in|out)/ });
  const original = await button.innerText();
  await button.click();
  await expect(button).not.toHaveText(original);
  await button.click();
  await expect(button).toHaveText(original);
});
test('every restaurant surface fits a small mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Restaurant', exact: true }).click();
  await expect(page).toHaveURL('/restaurant');
  for (const path of [
    '',
    'menu',
    'orders',
    'tables',
    'kitchen',
    'inventory',
    'staff',
    'reports',
    'settings',
  ]) {
    await page.goto(`/restaurant${path ? `/${path}` : ''}`);
    await expect(page.locator('.page-heading')).toBeVisible();
    await expect(page.locator('.loading')).toHaveCount(0);
    await expect(page.locator('.error-box')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Mobile overflow on ${path || 'overview'}`,
    ).toBe(true);
  }
});
