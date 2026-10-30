import { readFileSync, existsSync } from 'node:fs';
import { openDb } from './db.js';
import { Store } from './store.js';
import { Monitor } from './monitor.js';
import { createNotifier } from './notifier.js';
import { createApi, validateTarget } from './api.js';

const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? 'netpulse.db';
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 30);
const SEED_FILE = process.env.TARGETS_FILE;

const store = new Store(openDb(DB_PATH));

// Na primeira execução, permite carregar alvos de um arquivo JSON.
if (SEED_FILE && existsSync(SEED_FILE) && store.listTargets().length === 0) {
  const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8'));
  for (const item of seed) store.createTarget(validateTarget(item));
  console.log(`${seed.length} alvo(s) carregado(s) de ${SEED_FILE}`);
}

const monitor = new Monitor({ store, notify: createNotifier({ webhookUrl: process.env.WEBHOOK_URL }) });
monitor.start();

const prune = () => {
  const removed = store.pruneOlderThan(Date.now() - RETENTION_DAYS * 86_400_000);
  if (removed > 0) console.log(`${removed} verificação(ões) antiga(s) removida(s)`);
};
prune();
setInterval(prune, 3_600_000).unref();

const server = createApi({ store, monitor });
server.listen(PORT, () => console.log(`NetPulse ouvindo na porta ${PORT}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    monitor.stop();
    server.close(() => process.exit(0));
  });
}
