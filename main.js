const { app, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const config = require('./config');
const windows = require('./windows');
const browsers = require('./browsers');

// Windows' native window-occlusion detection can incorrectly mark a visible,
// focused window as hidden, dropping its renderer to Idle process priority
// (confirmed via Win32_Process.Priority on this app's own windows). Disabling
// it keeps focused windows at normal scheduling priority.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-config', () => {
  const cfg = config.loadConfig();
  return { ...cfg, configPath: config.configPath };
});

ipcMain.handle('save-config', (event, newConfig) => {
  return config.saveConfig(newConfig);
});

ipcMain.handle('get-available-browsers', () => {
  return browsers.getAvailableBrowsers();
});

ipcMain.handle('launch-service', (event, { profileDir, url }) => {
  const cfg = config.loadConfig();
  return browsers.launchService(profileDir, url, cfg.settings.browserId);
});

ipcMain.handle('open-settings', () => {
  windows.openSettings();
  const popup = windows.getPopupWindow();
  if (popup) popup.hide();
});

ipcMain.handle('close-popup', () => {
  const popup = windows.getPopupWindow();
  if (popup) popup.hide();
});

ipcMain.handle('set-startup', (event, enable) => {
  return config.setStartup(enable);
});

// ── App Lifecycle ───────────────────────────────────────────────────────────

let tray = null;

const doubleInstanceLock = app.requestSingleInstanceLock();
if (!doubleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    windows.showPopup(tray ? tray.getBounds() : null);
  });

  app.whenReady().then(() => {
    const cfg = config.loadConfig();
    const hasMappings = Object.values(cfg.mappings).some(arr => arr && arr.length > 0);
    if (!hasMappings) {
      windows.openSettings();
    }

    const iconPath = path.join(__dirname, 'llm_switcher.ico');
    tray = new Tray(iconPath);
    tray.setToolTip('LLM Switcher');

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Switcher', click: () => windows.showPopup(tray.getBounds()) },
      { label: 'Settings', click: windows.openSettings },
      { type: 'separator' },
      { label: 'Exit', click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      const popup = windows.getPopupWindow();
      if (popup && popup.isVisible()) {
        popup.hide();
      } else {
        windows.showPopup(tray.getBounds());
      }
    });

    windows.createPopupWindow();
  });
}

app.on('window-all-closed', () => {
  // Do not quit when windows are closed, stay in system tray
});
