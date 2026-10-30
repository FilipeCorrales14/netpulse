export function createNotifier({ webhookUrl, logger = console } = {}) {
  return async function notify(event) {
    const line = formatEvent(event);
    logger.log(line);

    if (!webhookUrl) return;
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // "text" é o campo aceito por Slack, Mattermost e Discord (via /slack).
        body: JSON.stringify({ text: line, ...event }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) logger.error(`webhook respondeu HTTP ${res.status}`);
    } catch (err) {
      logger.error(`falha ao enviar webhook: ${err.message}`);
    }
  };
}

export function formatEvent({ type, target, error, at }) {
  const when = new Date(at).toISOString();
  if (type === 'down') {
    return `[${when}] FORA DO AR: ${target.name} (${target.address}) - ${error ?? 'sem detalhe'}`;
  }
  return `[${when}] RECUPERADO: ${target.name} (${target.address})`;
}
