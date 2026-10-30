import net from 'node:net';
import { performance } from 'node:perf_hooks';

// Cada check devolve sempre o mesmo formato, mesmo em caso de erro,
// para o monitor não precisar tratar exceções.

export async function httpCheck(url, timeoutMs) {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Descarta o corpo para liberar a conexão.
    await res.body?.cancel();
    const latencyMs = Math.round(performance.now() - start);
    if (res.status >= 400) {
      return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    }
    return { ok: true, latencyMs, error: null };
  } catch (err) {
    const error = err.name === 'TimeoutError' ? `timeout após ${timeoutMs} ms` : describe(err);
    return { ok: false, latencyMs: null, error };
  }
}

export function tcpCheck(address, timeoutMs) {
  const { host, port } = parseHostPort(address);
  const start = performance.now();

  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      finish({ ok: true, latencyMs: Math.round(performance.now() - start), error: null });
    });
    socket.once('timeout', () => finish({ ok: false, latencyMs: null, error: `timeout após ${timeoutMs} ms` }));
    socket.once('error', (err) => finish({ ok: false, latencyMs: null, error: describe(err) }));
  });
}

export function parseHostPort(address) {
  // Aceita "host:porta" e "[ipv6]:porta".
  const match = /^\[?([^\]]+?)\]?:(\d{1,5})$/.exec(address);
  if (!match) throw new Error(`endereço TCP inválido: "${address}" (use host:porta)`);
  const port = Number(match[2]);
  if (port < 1 || port > 65535) throw new Error(`porta fora do intervalo: ${port}`);
  return { host: match[1], port };
}

export function runCheck(target) {
  if (target.kind === 'http') return httpCheck(target.address, target.timeout_ms);
  if (target.kind === 'tcp') return tcpCheck(target.address, target.timeout_ms);
  return Promise.resolve({ ok: false, latencyMs: null, error: `tipo desconhecido: ${target.kind}` });
}

function describe(err) {
  const cause = err.cause ?? err;
  return cause.code ? `${cause.code}` : cause.message;
}
