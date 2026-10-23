import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
const pane = readFileSync('test/fixtures/panes/codex-exec-approval.txt', 'utf8');
const projectId = '11111111-1111-4111-8111-111111111111';
const projectBId = '33333333-3333-4333-8333-333333333333';
async function openProject(page: Page) {
 await page.goto('/');
 await expect(page.locator('.project-card')).toHaveCount(2);
 await page.locator('.project-card').filter({ has: page.getByRole('heading', { name: 'agent-helm', exact: true }) }).click();
 await expect(page.locator('main[data-tab]')).toBeVisible();
}
const control = 'http://127.0.0.1:8793';
async function update(request: APIRequestContext, body: object) { expect((await request.post(control, { data: body })).ok()).toBe(true); }
async function openTask(page: Page) {
 if (await page.getByRole('button', { name: 'タスク', exact: true }).isVisible()) await page.getByRole('button', { name: 'タスク', exact: true }).click();
 await page.getByRole('button', { name: /Build foundation/ }).last().click();
 return page.getByRole('dialog', { name: 'Build foundation', exact: true });
}
test.beforeEach(async ({ request }) => { await update(request, { reset: true, pane }); });
test('shows status, attention and detail without horizontal overflow', async ({ page, request }, testInfo) => {
 await openProject(page);
 await expect(page.getByRole('heading', { name: 'Agent Helm', exact: true })).toBeVisible();
 await expect(page.getByRole('region', { name: '要対応', exact: true })).toContainText('Build foundation');
 const detail = await openTask(page);
 await expect(detail.getByText('Foundation task')).toBeVisible();
 await expect(detail.getByRole('button', { name: /\[1\] Yes, proceed/ })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await detail.getByRole('button', { name: '閉じる' }).click();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: testInfo.outputPath('board-light.png'), fullPage: true });
 await page.emulateMedia({ colorScheme: 'dark' });
 await page.screenshot({ path: testInfo.outputPath('board-dark.png'), fullPage: true });
 await update(request, { offline: true });
 await expect(page.locator('header').getByRole('alert')).toBeVisible({ timeout: 10000 });
});
test('sends literal Japanese multiline instructions to isolated tmux', async ({ page }) => {
 await openProject(page);
 if (await page.getByRole('button', { name: 'コンソール', exact: true }).isVisible()) await page.getByRole('button', { name: 'コンソール', exact: true }).click();
 await page.getByRole('textbox', { name: '指示', exact: true }).fill('日本語の指示\n次の行 $HOME `literal`');
 await page.getByRole('button', { name: '指示を送信', exact: true }).click();
 await expect(page.getByRole('region', { name: 'Orchestrator コンソール', exact: true }).getByRole('status').last()).toContainText('ペインに入力しました');
 await expect(page.getByRole('region', { name: 'Orchestrator コンソール', exact: true }).locator('pre').first()).toContainText('次の行 $HOME `literal`');
});
test('confirms once and sends exactly one allowed key on rapid clicks', async ({ page, request }) => {
 await openProject(page); const detail = await openTask(page);
 await detail.getByRole('button', { name: /\[1\] Yes, proceed/ }).click();
 const confirm = page.getByRole('dialog', { name: 'キー送信の確認', exact: true });
 await confirm.getByRole('button', { name: '送信', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
 await expect(confirm).toBeHidden();
 await expect.poll(async () => (await (await request.get(control)).json()).length).toBe(1);
 const sent = (await (await request.get(control)).json())[0];
 expect(sent.body).toEqual({ key: '1' });
 expect(sent.path).toContain(`/api/projects/${projectId}/tasks/`);
});
test('rejects stale confirmation without sending a key', async ({ page, request }) => {
 await openProject(page); const detail = await openTask(page);
 await detail.getByRole('button', { name: /\[1\] Yes, proceed/ }).click();
 await update(request, { pane: pane.replace('$ pnpm test', '$ pnpm build') });
 await page.getByRole('dialog', { name: 'キー送信の確認', exact: true }).getByRole('button', { name: '送信', exact: true }).click();
 await expect(detail.getByRole('status')).toContainText('変');
 expect(await (await request.get(control)).json()).toEqual([]);
});

test('returns to the list and selects the other project with the same task ID', async ({ page }) => {
 await openProject(page);
 await page.getByRole('link', { name: '← プロジェクト一覧' }).click();
 await expect(page.locator('.project-card')).toHaveCount(2);
 await page.locator('.project-card').filter({ hasText: 'agtx-playground' }).click();
 await expect(page.locator('header .brand')).toContainText('agtx-playground');
 if (await page.getByRole('button', { name: 'タスク', exact: true }).isVisible()) await page.getByRole('button', { name: 'タスク', exact: true }).click();
 await expect(page.getByRole('button', { name: /Playground task/ }).last()).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('dismisses a confirmation when switching projects without sending', async ({ page, request }) => {
 await openProject(page); const detail = await openTask(page);
 await detail.getByRole('button', { name: /\[1\] Yes, proceed/ }).click();
 await expect(page.getByRole('dialog', { name: 'キー送信の確認', exact: true })).toContainText('送信先プロジェクト: agent-helm');
 await page.evaluate(id => { location.hash = `#/p/${id}`; }, projectBId);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await (await request.get(control)).json()).toEqual([]);
});

test('shows project cards and approval counts in light and dark themes without overflow', async ({ page }, testInfo) => {
 await page.goto('/#/');
 await expect(page.locator('.project-card')).toHaveCount(2);
 await expect(page.locator('.project-card').first()).toContainText('承認: 1');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: testInfo.outputPath('projects-light.png'), fullPage: true });
 await page.emulateMedia({ colorScheme: 'dark' });
 await page.screenshot({ path: testInfo.outputPath('projects-dark.png'), fullPage: true });
});
