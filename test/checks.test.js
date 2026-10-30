import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { httpCheck, tcpCheck, parseHostPort } from '../src/checks.js';

let server;
let base;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/slow') {
      setTimeout(() => res.end('ok'), 500);
      return;
    }
    res.statusCode = req.url === '/broken' ? 503 : 200;
    res.end('ok');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('http: 200 é sucesso e mede latência', async () => {
  const r = await httpCheck(`${base}/`, 2000);
  assert.equal(r.ok, true);
  assert.equal(typeof r.latencyMs, 'number');
});

test('http: status 5xx é falha', async () => {
  const r = await httpCheck(`${base}/broken`, 2000);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'HTTP 503');
});

test('http: respeita o timeout', async () => {
  const r = await httpCheck(`${base}/slow`, 100);
  assert.equal(r.ok, false);
  assert.match(r.error, /timeout/);
});

test('tcp: porta aberta', async () => {
  const r = await tcpCheck(`127.0.0.1:${server.address().port}`, 1000);
  assert.equal(r.ok, true);
});

test('tcp: porta fechada retorna ECONNREFUSED', async () => {
  // Abre e fecha um servidor para obter uma porta que sabidamente está livre.
  const tmp = net.createServer();
  await new Promise((r) => tmp.listen(0, '127.0.0.1', r));
  const { port } = tmp.address();
  await new Promise((r) => tmp.close(r));

  const r = await tcpCheck(`127.0.0.1:${port}`, 1000);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'ECONNREFUSED');
});

test('parseHostPort aceita IPv4, nome e IPv6', () => {
  assert.deepEqual(parseHostPort('10.0.0.1:22'), { host: '10.0.0.1', port: 22 });
  assert.deepEqual(parseHostPort('db.local:5432'), { host: 'db.local', port: 5432 });
  assert.deepEqual(parseHostPort('[::1]:8080'), { host: '::1', port: 8080 });
  assert.throws(() => parseHostPort('semporta'));
  assert.throws(() => parseHostPort('host:70000'));
});
