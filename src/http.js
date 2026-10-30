// Roteador mínimo sobre node:http. Para quatro ou cinco rotas não vale
// trazer um framework inteiro.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    const keys = [];
    const source = pattern.replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    routes.push({ method, regex: new RegExp(`^${source}/?$`), keys, handler });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      const route = routes.find((r) => r.method === req.method && r.regex.test(url.pathname));
      if (!route) throw new HttpError(404, 'rota não encontrada');

      const values = route.regex.exec(url.pathname).slice(1);
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(values[i])]));
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : undefined;

      const result = await route.handler({ params, query: url.searchParams, body });
      send(res, result?.status ?? 200, result?.body ?? null);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      send(res, status, { error: status === 500 ? 'erro interno' : err.message });
    }
  }

  return { add, handle };
}

function send(res, status, body) {
  if (status === 204) {
    res.writeHead(204).end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const MAX_BODY = 64 * 1024;

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'corpo da requisição muito grande');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}
