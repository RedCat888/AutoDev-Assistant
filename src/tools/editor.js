const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Simple file insertion utility: insert content after a given line number.
async function applyEdit({ path: filePath, lineNumber, insert }) {
  const abs = path.resolve(process.cwd(), filePath);
  const text = fs.readFileSync(abs, 'utf-8');
  const lines = text.split(/\r?\n/);
  const idx = Math.max(0, Math.min((lineNumber || 0), lines.length));
  lines.splice(idx, 0, insert);
  fs.writeFileSync(abs, lines.join('\n'), 'utf-8');
  return { ok: true };
}

module.exports = { applyEdit };

async function openAt({ path: filePath, line = 1, column = 1 }) {
  return new Promise((resolve) => {
    const abs = path.resolve(process.cwd(), filePath);
    let cmd;
    if (process.platform === 'win32') {
      cmd = `code -g "${abs}:${line}:${column}"`;
    } else if (process.platform === 'darwin') {
      cmd = `open -a "Visual Studio Code" --args -g "${abs}:${line}:${column}"`;
    } else {
      cmd = `code -g "${abs}:${line}:${column}"`;
    }
    exec(cmd, () => resolve({ ok: true }));
  });
}

module.exports.openAt = openAt;


