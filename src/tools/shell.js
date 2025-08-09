const { exec: execCb } = require('child_process');
const util = require('util');
const execPromise = util.promisify(execCb);

async function exec(command, { cwd } = {}) {
  const { stdout, stderr } = await execPromise(command, { cwd, windowsHide: true, shell: true });
  return { stdout, stderr, exitCode: 0 };
}

module.exports = { exec };


