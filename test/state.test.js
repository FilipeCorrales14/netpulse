import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/state.js';

test('só marca down depois de atingir o limite de falhas', () => {
  let s = { state: 'up', failures: 0 };
  s = evaluate(s, false, 3);
  assert.deepEqual(s, { state: 'up', failures: 1, event: null });
  s = evaluate(s, false, 3);
  assert.equal(s.event, null);
  s = evaluate(s, false, 3);
  assert.deepEqual(s, { state: 'down', failures: 3, event: 'down' });
});

test('não repete o alerta enquanto continua fora', () => {
  const s = evaluate({ state: 'down', failures: 3 }, false, 3);
  assert.equal(s.state, 'down');
  assert.equal(s.event, null);
});

test('um sucesso no meio zera o contador', () => {
  let s = { state: 'up', failures: 0 };
  s = evaluate(s, false, 3);
  s = evaluate(s, false, 3);
  s = evaluate(s, true, 3);
  assert.equal(s.failures, 0);
  s = evaluate(s, false, 3);
  assert.equal(s.state, 'up');
});

test('emite recovered ao voltar de down', () => {
  const s = evaluate({ state: 'down', failures: 5 }, true, 3);
  assert.deepEqual(s, { state: 'up', failures: 0, event: 'recovered' });
});

test('estado unknown vira up sem evento', () => {
  const s = evaluate({ state: 'unknown', failures: 0 }, true, 3);
  assert.equal(s.event, null);
});
