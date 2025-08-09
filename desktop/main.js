const { app, BrowserWindow, ipcMain, globalShortcut, screen, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');

let win;
let ws;
let tray;
let backendPort = 5178;
let backendStarted = false;

function readPort() {
  try {
    const p = path.join(process.cwd(), 'data', 'port');
    if (fs.existsSync(p)) {
      backendPort = Number(fs.readFileSync(p, 'utf-8').trim()) || backendPort;
    }
  } catch {}
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  
  // Create a smaller, positioned window instead of fullscreen
  win = new BrowserWindow({
    width: 420,
    height: 650,
    x: width - 440, // Position on right side
    y: height - 680, // Position near bottom
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: true,
    movable: true,
    minimizable: true,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  
  // Start with normal window (not click-through)
  win.setAlwaysOnTop(true, 'floating');
  win.setIgnoreMouseEvents(false);
  
  // Make window click-through when it loses focus
  win.on('blur', () => {
    // Optional: make semi-transparent when not focused
    win.setOpacity(0.7);
  });
  
  win.on('focus', () => {
    win.setOpacity(1.0);
  });
  
  win.loadFile(path.join(__dirname, 'ui.html'));
}

function connectWs() {
  readPort();
  const url = `ws://localhost:${backendPort}/ws`;
  try {
    ws = new WebSocket(url);
    ws.on('open', () => win.webContents.send('status', { connected: true }));
    ws.on('close', () => {
      win.webContents.send('status', { connected: false });
      setTimeout(connectWs, 1000);
    });
    ws.on('message', (data) => {
      try { win.webContents.send('ws', JSON.parse(data.toString())); } catch {}
    });
  } catch (_) {
    setTimeout(connectWs, 1000);
  }
}

async function startBackendIfNeeded() {
  if (process.env.AUTODEV_AUTOSTART !== '1') return; // disabled by default to avoid port conflicts
  if (backendStarted) return;
  try {
    const resp = await fetch(`http://localhost:${backendPort}/health`).catch(() => null);
    if (resp && resp.ok) return; // already running
  } catch {}
  const child = spawn(process.execPath, [path.join(process.cwd(), 'src', 'index.js')], {
    cwd: process.cwd(), detached: true, stdio: 'ignore', env: { ...process.env }
  });
  child.unref();
  backendStarted = true;
}

function setupTray() {
  // Create a simple icon if one doesn't exist
  const iconPath = path.join(__dirname, 'icon.png');
  if (!fs.existsSync(iconPath)) {
    // Skip tray setup if no icon available
    console.log('Tray icon not found, skipping tray setup');
    return;
  }
  
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => win.show() },
    { label: 'Hide', click: () => win.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setToolTip('AutoDev Assistant');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createWindow();
  startBackendIfNeeded();
  connectWs();
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    win.isVisible() ? win.hide() : win.show();
  });
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    win.webContents.send('hotkey', { action: 'plan' });
  });
});

app.on('window-all-closed', (e) => { e.preventDefault(); });

ipcMain.handle('api:suggest', async (_ev, body) => {
  readPort();
  const res = await fetch(`http://localhost:${backendPort}/api/suggest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return await res.json();
});

ipcMain.handle('api:plan', async () => {
  readPort();
  const res = await fetch(`http://localhost:${backendPort}/api/plan`, { method: 'POST' });
  return await res.json();
});

// Window control handlers
ipcMain.on('window:minimize', () => {
  if (win) win.minimize();
});

ipcMain.on('window:setClickThrough', (event, enabled) => {
  if (win) {
    win.setIgnoreMouseEvents(enabled);
    // Also adjust opacity for visual feedback
    win.setOpacity(enabled ? 0.3 : 1.0);
  }
});


