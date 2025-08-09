const path = require('path');

function isPathAllowed(targetPath, allowlist = ['sample_workspace', 'plugins', 'data']) {
  const abs = path.resolve(process.cwd(), targetPath);
  const base = process.cwd();
  if (!abs.startsWith(base)) return false;
  return allowlist.some((p) => abs.startsWith(path.join(base, p)));
}

module.exports = { isPathAllowed };


