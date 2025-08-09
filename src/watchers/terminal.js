const fs = require('fs');
const path = require('path');

function createTerminalWatcher({ config, onEvent }) {
  const files = (config.terminal?.watchPaths || []).map((p) => path.resolve(process.cwd(), p));
  const patterns = (config.terminal?.errorPatterns || []).map((p) => new RegExp(p, 'i'));
  const pos = new Map();

  function scan(file) {
    try {
      const stat = fs.statSync(file);
      const last = pos.get(file) || 0;
      const start = Math.max(0, stat.size - (config.terminal?.maxReadBytes || 32768));
      const fd = fs.openSync(file, 'r');
      const len = stat.size - start;
      const buf = Buffer.alloc(Math.max(0, len));
      fs.readSync(fd, buf, 0, len, start);
      fs.closeSync(fd);
      pos.set(file, stat.size);
      const text = buf.toString('utf-8');
      const lines = text.split(/\r?\n/).slice(-200);
      for (const line of lines) {
        if (patterns.some((re) => re.test(line))) {
          onEvent?.({ type: 'terminal:error', file, line });
        }
      }
    } catch {}
  }

  const interval = setInterval(() => files.forEach(scan), 2000);
  return () => clearInterval(interval);
}

module.exports = { createTerminalWatcher };


