import http from 'node:http';
import { createRouter, HttpError } from './http.js';
import { parseHostPort } from './checks.js';

const WINDOWS = { '1h': 3_600_000, '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 };

export function createApi({ store, monitor, now = Date.now }) {
  const router = createRouter();

  router.add('GET', '/health', () => ({ body: { status: 'ok' } }));

  router.add('GET', '/targets', () => ({ body: store.listTargets() }));

  router.add('POST', '/targets', ({ body }) => {
    const input = validateTarget(body);
    const target = store.createTarget(input);
    monitor?.schedule(target);
    return { status: 201, body: target };
  });

  router.add('GET', '/targets/:id', ({ params }) => {
    const target = findTarget(store, params.id);
    return { body: { ...target, recent: store.recentChecks(target.id) } };
  });

  router.add('DELETE', '/targets/:id', ({ params }) => {
    const target = findTarget(store, params.id);
    monitor?.unschedule(target.id);
    store.deleteTarget(target.id);
    return { status: 204 };
  });

  router.add('GET', '/targets/:id/uptime', ({ params, query }) => {
    const target = findTarget(store, params.id);
    const window = query.get('window') ?? '24h';
    if (!(window in WINDOWS)) {
      throw new HttpError(400, `janela inválida. Use: ${Object.keys(WINDOWS).join(', ')}`);
    }
    const stats = store.uptime(target.id, now() - WINDOWS[window]);
    return {
      body: {
        target: target.name,
        window,
        ...stats,
        percent: stats.ratio == null ? null : Number((stats.ratio * 100).toFixed(3)),
      },
    };
  });

  return http.createServer(router.handle);
}

function findTarget(store, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id)) throw new HttpError(400, 'id inválido');
  const target = store.getTarget(id);
  if (!target) throw new HttpError(404, `alvo ${id} não encontrado`);
  return target;
}

export function validateTarget(body) {
  const { name, kind, address } = body ?? {};
  if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, '"name" é obrigatório');
  if (!['http', 'tcp'].includes(kind)) throw new HttpError(400, '"kind" deve ser "http" ou "tcp"');
  if (typeof address !== 'string') throw new HttpError(400, '"address" é obrigatório');

  if (kind === 'http') {
    let url;
    try {
      url = new URL(address);
    } catch {
      throw new HttpError(400, '"address" deve ser uma URL válida');
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, 'URL deve ser http ou https');
  } else {
    try {
      parseHostPort(address);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
  }

  const intervalS = intInRange(body.intervalS, 60, 10, 3600, 'intervalS');
  const timeoutMs = intInRange(body.timeoutMs, 5000, 500, 30_000, 'timeoutMs');
  const failThreshold = intInRange(body.failThreshold, 3, 1, 10, 'failThreshold');
  if (timeoutMs >= intervalS * 1000) {
    throw new HttpError(400, '"timeoutMs" precisa ser menor que o intervalo');
  }

  return { name: name.trim(), kind, address, intervalS, timeoutMs, failThreshold };
}

function intInRange(value, fallback, min, max, field) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `"${field}" deve ser inteiro entre ${min} e ${max}`);
  }
  return value;
}
