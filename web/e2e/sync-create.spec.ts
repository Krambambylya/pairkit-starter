import { expect, test } from '@playwright/test';

test.describe('sync smoke', () => {
  test('creates a workspace on /sync', async ({ page }) => {
    await page.goto('/sync', { waitUntil: 'domcontentloaded' });

    const create = page.getByRole('button', { name: 'No code — create workspace' });
    await expect(create).toBeVisible({ timeout: 60_000 });
    await create.click();

    await expect(page.getByRole('heading', { name: 'Recovery key' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel(/^Code /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out on this device' })).toBeVisible();
    // Next.js dev overlay also uses role="alert"; only app errors live under main.
    await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  });
});
