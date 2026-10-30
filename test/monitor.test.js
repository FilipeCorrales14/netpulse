import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { Store } from '../src/store.js';
import { Monitor } from '../src/monitor.js';

function setup(results) {
  const store = new Store(openDb());
  const target = store.createTarget({ name: 'switch-core', kind: 'tcp', address: '10.0.0.1:22', failThreshold: 2 });
  const events = [];
  let clock = 1_000;
  const monitor = new Monitor({
    store,
    notify: async (e) => events.push(e.type),
    check: async () => results.shift(),
    now: () => (clock += 1000),
  });
  return { store, target, monitor, events };
}

const OK = { ok: true, latencyMs: 3, error: null };
const FAIL = { ok: false, latencyMs: null, error: 'ECONNREFUSED' };

test('grava cada verificação e muda o estado no banco', async () => {
  const { store, target, monitor, events } = setup([OK, FAIL, FAIL, OK]);

  await monitor.runOnce(target.id);
  assert.equal(store.getTarget(target.id).state, 'up');

  await monitor.runOnce(target.id);
  await monitor.runOnce(target.id);
  assert.equal(store.getTarget(target.id).state, 'down');

  await monitor.runOnce(target.id);
  assert.equal(store.getTarget(target.id).state, 'up');

  assert.deepEqual(events, ['down', 'recovered']);
  assert.equal(store.uptime(target.id, 0).total, 4);
  assert.equal(store.uptime(target.id, 0).ok, 2);
});

test('não roda duas verificações simultâneas do mesmo alvo', async () => {
  const store = new Store(openDb());
  const target = store.createTarget({ name: 'lento', kind: 'tcp', address: '10.0.0.2:80' });
  let calls = 0;
  const monitor = new Monitor({
    store,
    notify: async () => {},
    check: () => {
      calls += 1;
      return new Promise((r) => setTimeout(() => r(OK), 50));
    },
  });

  await Promise.all([monitor.runOnce(target.id), monitor.runOnce(target.id)]);
  assert.equal(calls, 1);
});

test('alvo removido para de ser verificado', async () => {
  const { store, target, monitor } = setup([OK]);
  store.deleteTarget(target.id);
  const result = await monitor.runOnce(target.id);
  assert.equal(result, null);
});
