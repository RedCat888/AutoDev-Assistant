class AgentLoop {
  constructor({ orchestrator, memory, intervalMs = 8000 }) {
    this.orchestrator = orchestrator;
    this.memory = memory;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.paused = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      if (this.paused) return;
      const context = { recentTodos: (await this.memory.get('recentTodos', [])).slice(0, 10) };
      try { await this.orchestrator.cycle(context); } catch {}
    }, this.intervalMs);
  }

  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
}

module.exports = { AgentLoop };


