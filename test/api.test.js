import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { Store } from '../src/store.js';
import { createApi } from '../src/api.js';

let server;
let base;
let store;
const NOW = 10_000_000;

before(async () => {
  store = new Store(openDb());
  server = createApi({ store, now: () => NOW });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('cria e lista alvos', async () => {
  const res = await post('/targets', { name: 'Portal', kind: 'http', address: 'https://example.com' });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.interval_s, 60);

  const list = await (await fetch(`${base}/targets`)).json();
  assert.ok(list.some((t) => t.id === created.id));
});

test('valida entrada', async () => {
  const cases = [
    [{ kind: 'http', address: 'https://x.com' }, /name/],
    [{ name: 'a', kind: 'icmp', address: '1.1.1.1' }, /kind/],
    [{ name: 'a', kind: 'http', address: 'ftp://x' }, /http ou https/],
    [{ name: 'a', kind: 'tcp', address: '10.0.0.1' }, /host:porta/],
    [{ name: 'a', kind: 'tcp', address: '10.0.0.1:22', intervalS: 10, timeoutMs: 10_000 }, /menor que o intervalo/],
  ];
  for (const [body, message] of cases) {
    const res = await post('/targets', body);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, message);
  }
});

test('rejeita JSON malformado', async () => {
  const res = await fetch(`${base}/targets`, { method: 'POST', body: '{nope' });
  assert.equal(res.status, 400);
});

test('calcula uptime na janela pedida', async () => {
  const t = store.createTarget({ name: 'Firewall', kind: 'tcp', address: '10.0.0.254:443' });
  store.recordCheck(t.id, { checkedAt: NOW - 1000, ok: true, latencyMs: 10 });
  store.recordCheck(t.id, { checkedAt: NOW - 2000, ok: true, latencyMs: 20 });
  store.recordCheck(t.id, { checkedAt: NOW - 3000, ok: false });
  store.recordCheck(t.id, { checkedAt: NOW - 3000, ok: true, latencyMs: 30 });
  // Fora da janela de 1h, não deve contar.
  store.recordCheck(t.id, { checkedAt: NOW - 7_200_000, ok: false });

  const body = await (await fetch(`${base}/targets/${t.id}/uptime?window=1h`)).json();
  assert.equal(body.total, 4);
  assert.equal(body.percent, 75);
  assert.equal(body.avgLatencyMs, 20);
});

test('janela inválida e alvo inexistente', async () => {
  assert.equal((await fetch(`${base}/targets/1/uptime?window=2h`)).status, 400);
  assert.equal((await fetch(`${base}/targets/9999`)).status, 404);
  assert.equal((await fetch(`${base}/targets/abc`)).status, 400);
});

test('remove alvo', async () => {
  const t = store.createTarget({ name: 'temp', kind: 'tcp', address: '10.0.0.9:22' });
  const res = await fetch(`${base}/targets/${t.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
  assert.equal(store.getTarget(t.id), null);
});
