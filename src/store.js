// Acesso ao banco. Mantido separado da API e do monitor para que os dois
// possam ser testados sem depender um do outro.

export class Store {
  constructor(db) {
    this.db = db;
    this.stmts = {
      insertTarget: db.prepare(`
        INSERT INTO targets (name, kind, address, interval_s, timeout_ms, fail_threshold)
        VALUES (?, ?, ?, ?, ?, ?)`),
      getTarget: db.prepare('SELECT * FROM targets WHERE id = ?'),
      listTargets: db.prepare('SELECT * FROM targets ORDER BY id'),
      deleteTarget: db.prepare('DELETE FROM targets WHERE id = ?'),
      setState: db.prepare('UPDATE targets SET state = ? WHERE id = ?'),
      insertCheck: db.prepare(`
        INSERT INTO checks (target_id, checked_at, ok, latency_ms, error)
        VALUES (?, ?, ?, ?, ?)`),
      uptime: db.prepare(`
        SELECT COUNT(*)             AS total,
               COALESCE(SUM(ok), 0) AS ok,
               AVG(CASE WHEN ok = 1 THEN latency_ms END) AS avg_latency
          FROM checks
         WHERE target_id = ? AND checked_at >= ?`),
      recent: db.prepare(`
        SELECT checked_at, ok, latency_ms, error
          FROM checks
         WHERE target_id = ?
         ORDER BY checked_at DESC
         LIMIT ?`),
      prune: db.prepare('DELETE FROM checks WHERE checked_at < ?'),
    };
  }

  createTarget({ name, kind, address, intervalS = 60, timeoutMs = 5000, failThreshold = 3 }) {
    const { lastInsertRowid } = this.stmts.insertTarget.run(
      name, kind, address, intervalS, timeoutMs, failThreshold,
    );
    return this.getTarget(Number(lastInsertRowid));
  }

  getTarget(id) {
    return this.stmts.getTarget.get(id) ?? null;
  }

  listTargets() {
    return this.stmts.listTargets.all();
  }

  deleteTarget(id) {
    return this.stmts.deleteTarget.run(id).changes > 0;
  }

  setState(id, state) {
    this.stmts.setState.run(state, id);
  }

  recordCheck(targetId, { checkedAt = Date.now(), ok, latencyMs = null, error = null }) {
    this.stmts.insertCheck.run(targetId, checkedAt, ok ? 1 : 0, latencyMs, error);
  }

  uptime(targetId, sinceMs) {
    const row = this.stmts.uptime.get(targetId, sinceMs);
    const total = Number(row.total);
    const ok = Number(row.ok);
    return {
      total,
      ok,
      ratio: total === 0 ? null : ok / total,
      avgLatencyMs: row.avg_latency == null ? null : Math.round(row.avg_latency),
    };
  }

  recentChecks(targetId, limit = 20) {
    return this.stmts.recent.all(targetId, limit);
  }

  pruneOlderThan(timestampMs) {
    return this.stmts.prune.run(timestampMs).changes;
  }
}
