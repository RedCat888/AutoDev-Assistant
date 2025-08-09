const fs = require('fs');
const path = require('path');

function loadPlugins({ config }) {
  if (!config.plugins?.enable) return [];
  const dirs = (config.plugins.paths || []).map((p)=>path.resolve(process.cwd(), p));
  const loaded = [];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const entry = path.join(dir, ent.name, 'index.js');
        if (fs.existsSync(entry)) {
          try { loaded.push({ name: ent.name, mod: require(entry) }); } catch {}
        }
      }
    } catch {}
  }
  return loaded;
}

module.exports = { loadPlugins };


