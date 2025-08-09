const { exec } = require('child_process');

async function openUrl(url) {
  // Only open if it's a valid URL and not a test/example
  if (!url || url.includes('example.com') || url === 'undefined') {
    console.log('Blocked invalid URL:', url);
    return { ok: false, blocked: true };
  }
  
  return new Promise((resolve) => {
    let cmd;
    if (process.platform === 'win32') {
      cmd = `start "" "${url}"`;
    } else if (process.platform === 'darwin') {
      cmd = `open "${url}"`;
    } else {
      cmd = `xdg-open "${url}"`;
    }
    exec(cmd, (err) => {
      if (err) console.error('Browser open error:', err);
      resolve({ ok: !err });
    });
  });
}

module.exports = { open: openUrl };


