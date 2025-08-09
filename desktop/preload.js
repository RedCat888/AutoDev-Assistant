const { contextBridge, ipcRenderer } = require('electron');

const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('autodev', {
  onStatus: (cb) => ipcRenderer.on('status', (_e, m) => cb(m)),
  onWs: (cb) => ipcRenderer.on('ws', (_e, m) => cb(m)),
  suggest: (body) => ipcRenderer.invoke('api:suggest', body),
  plan: () => ipcRenderer.invoke('api:plan'),
  apply: (body) => fetch('http://localhost:5178/api/preview-apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r=>r.json()),
  pause: () => fetch('http://localhost:5178/api/loop/pause').then(()=>({ok:true})),
  resume: () => fetch('http://localhost:5178/api/loop/resume').then(()=>({ok:true})),
  llmCheck: () => fetch('http://localhost:5178/api/llm/check').then(r=>r.json()),
  getBackendPort: async () => {
    try {
      const portFile = path.join(process.cwd(), 'data', 'port');
      if (fs.existsSync(portFile)) {
        return Number(fs.readFileSync(portFile, 'utf-8').trim()) || 5178;
      }
    } catch {}
    return 5178;
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  setClickThrough: (enabled) => ipcRenderer.send('window:setClickThrough', enabled)
});


