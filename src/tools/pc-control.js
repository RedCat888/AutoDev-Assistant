const { exec } = require('child_process');
const os = require('os');
const EventEmitter = require('events');

/**
 * PC Control Module
 * Provides mouse, keyboard, and application control
 * Uses native commands for now, can integrate @nut-tree/nut-js later
 */
class PCControl extends EventEmitter {
  constructor({ dryRun = false, confirmActions = false } = {}) {
    super();
    this.dryRun = dryRun;
    this.confirmActions = confirmActions;
  }

  async mouseClick(button = 'left', x = null, y = null) {
    const action = { type: 'mouse:click', button, x, y };
    this.emit('action', action);
    
    if (this.dryRun) {
      console.log('[DRY RUN] Mouse click:', action);
      return { success: true, dryRun: true };
    }

    // Platform-specific mouse control
    if (os.platform() === 'win32') {
      // Use PowerShell to simulate mouse click
      const script = x && y 
        ? `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")]
  public static extern void SetCursorPos(int x, int y);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
}
"@
[Mouse]::SetCursorPos(${x}, ${y})
[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)`
        : `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
}
"@
[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)`;
      
      return new Promise((resolve) => {
        exec(`powershell -Command "${script}"`, (err) => {
          if (err) {
            console.error('Mouse click error:', err);
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    }
    
    return { success: false, error: 'Platform not supported yet' };
  }

  async mouseMove(x, y) {
    const action = { type: 'mouse:move', x, y };
    this.emit('action', action);
    
    if (this.dryRun) {
      console.log('[DRY RUN] Mouse move:', action);
      return { success: true, dryRun: true };
    }

    if (os.platform() === 'win32') {
      const script = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")]
  public static extern void SetCursorPos(int x, int y);
}
"@
[Mouse]::SetCursorPos(${x}, ${y})`;
      
      return new Promise((resolve) => {
        exec(`powershell -Command "${script}"`, (err) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    }
    
    return { success: false, error: 'Platform not supported' };
  }

  async keyboardType(text) {
    const action = { type: 'keyboard:type', text };
    this.emit('action', action);
    
    if (this.dryRun) {
      console.log('[DRY RUN] Type text:', text);
      return { success: true, dryRun: true };
    }

    if (os.platform() === 'win32') {
      // Use SendKeys via PowerShell
      const escapedText = text.replace(/"/g, '""').replace(/'/g, "''");
      const script = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Keyboard {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${escapedText}")`;
      
      return new Promise((resolve) => {
        exec(`powershell -Command "${script}"`, (err) => {
          if (err) {
            console.error('Type error:', err);
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    }
    
    return { success: false, error: 'Platform not supported' };
  }

  async keyboardHotkey(keys) {
    const action = { type: 'keyboard:hotkey', keys };
    this.emit('action', action);
    
    if (this.dryRun) {
      console.log('[DRY RUN] Hotkey:', keys);
      return { success: true, dryRun: true };
    }

    if (os.platform() === 'win32') {
      // Convert common hotkey format to SendKeys format
      const sendKeysFormat = keys
        .replace(/ctrl\+/gi, '^')
        .replace(/alt\+/gi, '%')
        .replace(/shift\+/gi, '+')
        .replace(/enter/gi, '{ENTER}')
        .replace(/tab/gi, '{TAB}')
        .replace(/esc/gi, '{ESC}');
      
      const script = `Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${sendKeysFormat}")`;
      
      return new Promise((resolve) => {
        exec(`powershell -Command "${script}"`, (err) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    }
    
    return { success: false, error: 'Platform not supported' };
  }

  async openApplication(appName) {
    const action = { type: 'app:open', appName };
    this.emit('action', action);
    
    if (this.dryRun) {
      console.log('[DRY RUN] Open app:', appName);
      return { success: true, dryRun: true };
    }

    let command;
    if (os.platform() === 'win32') {
      // Try common app locations on Windows
      const appMap = {
        'cursor': 'Cursor',
        'vscode': 'Code',
        'chrome': 'chrome',
        'firefox': 'firefox',
        'notepad': 'notepad',
        'cmd': 'cmd',
        'powershell': 'powershell'
      };
      
      const app = appMap[appName.toLowerCase()] || appName;
      command = `start "" "${app}"`;
    } else if (os.platform() === 'darwin') {
      command = `open -a "${appName}"`;
    } else {
      command = `xdg-open "${appName}" || ${appName}`;
    }

    return new Promise((resolve) => {
      exec(command, (err) => {
        if (err) {
          console.error('Open app error:', err);
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async takeScreenshot() {
    // Delegate to vision module
    const { captureScreen } = require('./vision');
    return await captureScreen();
  }
}

// Legacy exports for backward compatibility
const pcControl = new PCControl({ dryRun: false });

module.exports = {
  PCControl,
  click: (params) => pcControl.mouseClick(params?.button, params?.x, params?.y),
  move: (params) => pcControl.mouseMove(params?.x, params?.y),
  type: (params) => pcControl.keyboardType(params?.text),
  hotkey: (params) => pcControl.keyboardHotkey(params?.keys),
  openApp: (params) => pcControl.openApplication(params?.appName)
};