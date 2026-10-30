import { runCheck } from './checks.js';
import { evaluate } from './state.js';

export class Monitor {
  constructor({ store, notify, check = runCheck, now = Date.now }) {
    this.store = store;
    this.notify = notify;
    this.check = check;
    this.now = now;
    this.timers = new Map();
    this.inFlight = new Set();
    // Contador de falhas fica em memória: depois de um restart o alvo
    // começa do zero, o que é aceitável para o objetivo do projeto.
    this.failures = new Map();
  }

  start() {
    for (const target of this.store.listTargets()) this.schedule(target);
  }

  stop() {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }

  schedule(target) {
    this.unschedule(target.id);
    const timer = setInterval(() => this.runOnce(target.id), target.interval_s * 1000);
    timer.unref();
    this.timers.set(target.id, timer);
    // Primeira verificação imediata, sem esperar o intervalo.
    this.runOnce(target.id);
  }

  unschedule(targetId) {
    clearInterval(this.timers.get(targetId));
    this.timers.delete(targetId);
    this.failures.delete(targetId);
  }

  async runOnce(targetId) {
    // Se a verificação anterior ainda não terminou (ex.: timeout longo),
    // pula esta rodada em vez de empilhar conexões.
    if (this.inFlight.has(targetId)) return null;

    const target = this.store.getTarget(targetId);
    if (!target) {
      this.unschedule(targetId);
      return null;
    }

    this.inFlight.add(targetId);
    try {
      const result = await this.check(target);
      const at = this.now();
      this.store.recordCheck(target.id, { checkedAt: at, ...result });

      const next = evaluate(
        { state: target.state, failures: this.failures.get(target.id) ?? 0 },
        result.ok,
        target.fail_threshold,
      );
      this.failures.set(target.id, next.failures);
      if (next.state !== target.state) this.store.setState(target.id, next.state);
      if (next.event) await this.notify({ type: next.event, target, error: result.error, at });

      return { ...result, state: next.state, event: next.event };
    } finally {
      this.inFlight.delete(targetId);
    }
  }
}
