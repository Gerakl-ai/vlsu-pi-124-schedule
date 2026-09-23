const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
  try {
    const page = await browser.newPage({ viewport: { width: 402, height: 874 }, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('lad.selected-group.v2', JSON.stringify({ id: 'qa', nrec: 'qa', name: 'QA', instituteId: 'qa', instituteName: 'QA', instituteShortName: 'QA', visualKey: 'iite' }));
      localStorage.setItem('lad.schedule.v2:qa', JSON.stringify({ groupNrec: 'qa', currentInfo: { currentLesson: '', currentWeekType: 1, name: 'QA', semester: 1 }, allLessons: [], fetchedAt: '2026-09-08T09:00:00Z', source: 'static-snapshot' }));
    });
    let requests = 0;
    let fail = false;
    await page.route('**/data/status.json', async (route) => {
      requests += 1;
      if (fail) return route.fulfill({ status: 503, body: 'Unavailable' });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ json: { startedAt: '2026-09-23T09:00:00Z', finishedAt: '2026-09-23T09:15:00Z', institutes: 14, groupsInCatalog: 966, scheduleAttempted: 966, scheduleOk: 0, scheduleFailed: 966, failures: [], provenance: { repository: 'example/repo', commit: 'abc', commitUrl: 'https://github.com/example/repo/commit/abc', runUrl: 'https://github.com/example/repo/actions/runs/123' } } });
    });
    await page.goto(process.env.QA_URL || 'http://127.0.0.1:5182/', { waitUntil: 'domcontentloaded' });
    await page.locator('.bottom-nav').getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.locator('.provenance-toggle').click();
    await page.getByRole('link', { name: 'Журнал последнего обхода', exact: true }).waitFor();
    await page.getByText('Происхождение этого снимка не зафиксировано.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Код сборщика этого снимка', exact: true }).count(), 0);
    await page.waitForTimeout(500);
    assert.equal(requests, 1);
    await page.locator('.provenance-toggle').click();
    fail = true;
    await page.locator('.provenance-toggle').click();
    await page.getByText('Не удалось загрузить отчёт об обходе.', { exact: false }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(requests, 2);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ scheduleProvenanceNotForged: true, singleRequestPerOpen: true, noErrorRetryLoop: true, errors }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
