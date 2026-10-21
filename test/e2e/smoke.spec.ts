import { expect, test } from '@playwright/test';
test('shows all shell regions',async ({ page }) => {
 await page.goto('/');
 await expect(page.getByRole('heading',{ name: 'Agent Helm', exact: true })).toBeVisible();
 for (const name of ['要対応','Orchestrator コンソール','タスク一覧','タスク詳細','承認']) await expect(page.getByRole('region',{ name, exact: true })).toBeVisible();
 await expect(page.getByText('agent-helm · agtx 未接続')).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
