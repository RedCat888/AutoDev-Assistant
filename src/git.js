const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const execp = util.promisify(exec);

async function run(cmd, cwd) {
  return execp(cmd, { cwd, windowsHide: true, shell: true });
}

async function ensureRepo(cwd) {
  try { await run('git rev-parse --is-inside-work-tree', cwd); return true; } catch { return false; }
}

async function createBranch({ cwd, prefix }) {
  const branch = `${prefix}${Date.now()}`;
  await run(`git checkout -b ${branch}`, cwd);
  return branch;
}

async function commitAll({ cwd, message }) {
  await run('git add -A', cwd);
  await run(`git commit -m "${message}"`, cwd);
}

module.exports = { ensureRepo, createBranch, commitAll };


