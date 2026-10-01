const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 402, height: 874 }, acceptDownloads: true });
    await context.addInitScript(() => {
      localStorage.setItem('lad.selected-group.v2', JSON.stringify({ id: 'qa', nrec: 'qa', name: 'QA', instituteId: 'qa', instituteName: 'QA', instituteShortName: 'QA', visualKey: 'iite' }));
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.QA_URL || 'http://127.0.0.1:5173/');
    await page.locator('.bottom-nav').getByRole('button', { name: 'Настройки' }).click();
    const note = { id: 'transfer-fixture', text: 'Тест переноса', title: 'Тест переноса', space: 'Монтаж QA', kind: 'note', status: 'open', pinned: false, confidence: 1, classificationSource: 'local', createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z', contentHtml: '<p><strong>Тест переноса</strong></p>' };
    const folder = { id: 'qa-folder', name: 'Монтаж QA', color: '#123456', system: false, createdAt: note.createdAt };
    const archive = { app: 'lad', version: 6, exportedAt: note.createdAt, notes: [note], folders: [folder] };
    await page.getByLabel('Импортировать резервную копию записей').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) });
    await page.getByRole('status').filter({ hasText: 'Добавлено или обновлено записей: 1' }).waitFor();
    await page.reload();
    await page.locator('.bottom-nav').getByRole('button', { name: 'Настройки' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.equal(exported.notes.length, 1);
    assert.equal(exported.notes[0].contentHtml, note.contentHtml);
    assert.equal(exported.folders.find((item) => item.name === folder.name).color, folder.color);
    assert.equal(exported.version, 6);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ imported: 1, afterReload: exported.notes.length, folders: exported.folders.length, richTextPreserved: true, errors }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
