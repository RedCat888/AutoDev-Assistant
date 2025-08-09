const path = require('path');
const fs = require('fs');

class MemoryStore {
  constructor({ file = path.join(process.cwd(), 'data', 'memory.json') } = {}) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.data = { events: [], kv: {} };
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf-8');
        const parsed = JSON.parse(raw || '{}');
        this.data.events = Array.isArray(parsed.events) ? parsed.events : [];
        this.data.kv = parsed.kv && typeof parsed.kv === 'object' ? parsed.kv : {};
      }
    } catch (_) {
      // ignore corrupt file; start fresh
    }
  }

  async persist() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (_) {}
  }

  async appendEvent(event) {
    this.data.events.push({ ts: Date.now(), ...event });
    await this.persist();
  }

  async set(key, value) {
    this.data.kv[key] = value;
    await this.persist();
  }

  async get(key, fallback = null) {
    return this.data.kv[key] ?? fallback;
  }
}

module.exports = { MemoryStore };


