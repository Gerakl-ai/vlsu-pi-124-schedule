const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
  const url = process.env.QA_URL || 'http://127.0.0.1:5182/';
  const errors = [];
  const event = { id: 'qa-event', title: 'Репетиция', start: '2026-10-12T18:30:00+03:00', end: '2026-10-12T20:00:00+03:00', location: 'Зал 2', description: 'Прогон' };
  async function openSettings(seedEvents) {
    const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((events) => {
      localStorage.setItem('lad.selected-group.v2', JSON.stringify({ id: 'qa', nrec: 'qa', name: 'QA', instituteId: 'qa', instituteName: 'QA', instituteShortName: 'QA', visualKey: 'iite' }));
      if (events && !localStorage.getItem('lad.personal-events.v1')) localStorage.setItem('lad.personal-events.v1', JSON.stringify(events));
      if (events) localStorage.setItem('lad.notes.fallback', JSON.stringify([{ id: 'qa-note', title: 'Проверка записи', text: 'Проверка записи', kind: 'note', space: 'Входящие', confidence: 1, status: 'open', pinned: false, createdAt: '2026-09-23T09:00:00Z', updatedAt: '2026-09-23T09:00:00Z', classificationSource: 'local' }]));
    }, seedEvents);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('.bottom-nav').getByRole('button', { name: 'Настройки', exact: true }).click();
    return page;
  }
  try {
    const source = await openSettings([event]);
    const download = source.waitForEvent('download');
    await source.getByRole('button', { name: 'Экспорт', exact: true }).click();
    const stream = await (await download).createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const archive = JSON.parse(buffer.toString('utf8'));
    assert.equal(archive.version, 7);
    assert.equal(archive.notes[0].id, 'qa-note');
    assert.deepEqual(archive.events, [event]);
    const target = await openSettings(null);
    const upload = async (data) => {
      await target.getByLabel('Импортировать резервную копию записей').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: data });
      await target.waitForFunction(() => [...document.querySelectorAll('.backup-notice')].some((node) => node.textContent.includes('Событий добавлено:')));
    };
    await upload(buffer);
    const restoredNote = await target.evaluate(() => new Promise((resolve, reject) => {
      const opening = indexedDB.open('lad-personal', 2);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const transaction = db.transaction('notes', 'readonly');
        const request = transaction.objectStore('notes').get('qa-note');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      };
    }));
    assert.equal(restoredNote.text, 'Проверка записи');
    assert.deepEqual(await target.evaluate(() => JSON.parse(localStorage.getItem('lad.personal-events.v1'))), [event]);
    await upload(buffer);
    assert.equal(await target.evaluate(() => JSON.parse(localStorage.getItem('lad.personal-events.v1')).length), 1);
    const conflict = Buffer.from(JSON.stringify({ ...archive, events: [{ ...event, location: 'Зал 3' }] }));
    await upload(conflict);
    await target.waitForFunction(() => JSON.parse(localStorage.getItem('lad.personal-events.v1')).length === 2);
    await upload(conflict);
    assert.equal(await target.evaluate(() => JSON.parse(localStorage.getItem('lad.personal-events.v1')).length), 2);
    await target.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await target.evaluate(() => JSON.parse(localStorage.getItem('lad.personal-events.v1')).length), 2);
    await target.locator('.bottom-nav').getByRole('button', { name: 'Настройки', exact: true }).click();
    await target.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'lad.personal-events.v1') throw new DOMException('Full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await target.getByLabel('Импортировать резервную копию записей').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...archive, events: [{ ...event, id: 'new', title: 'Не сохранится' }] })) });
    await target.getByText('Импорт не завершён:', { exact: false }).waitFor();
    assert.equal(await target.evaluate(() => JSON.parse(localStorage.getItem('lad.personal-events.v1')).length), 2);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ exportVersion: 7, cleanProfileImport: true, conflictPreserved: true, repeatIdempotent: true, reload: true, quotaFailureReported: true, errors }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
