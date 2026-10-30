// Máquina de estados de um alvo.
//
// Um alvo só é marcado como "down" depois de N falhas seguidas
// (fail_threshold). Isso evita alerta por perda de um único pacote ou
// um timeout isolado. A volta para "up" acontece no primeiro sucesso.

export function evaluate(previous, ok, threshold) {
  const { state, failures } = previous;

  if (ok) {
    return {
      state: 'up',
      failures: 0,
      event: state === 'down' ? 'recovered' : null,
    };
  }

  const nextFailures = failures + 1;
  if (nextFailures >= threshold && state !== 'down') {
    return { state: 'down', failures: nextFailures, event: 'down' };
  }

  return { state, failures: nextFailures, event: null };
}
