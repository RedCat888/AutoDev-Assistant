const fs = require('fs');
const path = require('path');

async function read(filePath) {
  const p = path.resolve(process.cwd(), filePath);
  return fs.readFileSync(p, 'utf-8');
}

async function write(filePath, content) {
  const p = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
  return { ok: true, path: p };
}

module.exports = { read, write };


