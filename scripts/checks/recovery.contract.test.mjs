import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1]).find((script) => script.includes('window.__ladBootComplete = false'));

it.each(['/', '/vlsu-pi-124-schedule/'])('recovery stays inside %s and preserves other applications', async (base) => {
  const origin = 'https://example.org';
  const removed = [];
  const unregistered = [];
  const fetched = [];
  const message = {};
  const button = { addEventListener: (_, handler) => { button.click = handler; } };
  const events = {};
  let destination;
  runInNewContext(source.replace('%BASE_URL%', base), {
    URL, AbortController,
    window: {
      location: { origin, search: '?group=abc', replace: (url) => { destination = url; } },
      addEventListener: (name, handler) => { events[name] = handler; },
      setTimeout() {}, clearTimeout() {}, caches: {}
    },
    document: {
      querySelector: (selector) => selector.startsWith('meta') ? { content: 'old' } : { querySelector: () => message, appendChild() {} },
      createElement: () => button
    },
    location: { hostname: 'localhost' },
    navigator: { serviceWorker: { register: async (url) => {
      expect(url).toBe(origin + base + 'sw.js');
      return { update: async () => {} };
    } } },
    caches: {
      keys: async () => [`lad-vlsu-scope:${encodeURIComponent(base)}:old`, 'portfolio-cache', 'lad-vlsu-v67'],
      delete: async (name) => { removed.push(name); }
    },
    fetch: async (url) => { fetched.push(String(url)); return { ok: true, text: async () => '<meta name="lad-release" content="new" />' }; }
  });
  events.unhandledrejection();
  // The click handler intentionally does not return its async recovery promise.
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(new URL(fetched[0]).pathname).toBe(base + 'index.html');
  expect(unregistered).toEqual([]);
  expect(removed).toEqual([]);
  expect(new URL(destination).pathname).toBe(base);
  expect(new URL(destination).searchParams.get('group')).toBe('abc');
  expect(new URL(destination).searchParams.get('lad-recovered')).toBe('new');
});
