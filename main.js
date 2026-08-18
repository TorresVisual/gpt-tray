const { app, BrowserWindow, Tray, Menu, ipcMain, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

let tray = null;
let popupWindow = null;
let settingsWindow = null;
const serviceWindows = new Map(); // partitionId -> BrowserWindow

// Determine config path (portable style, next to executable/script)
const appDir = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const configPath = path.join(appDir, 'config.json');

const DEFAULT_SERVICES = {
  "ChatGPT": { "url": "https://chat.openai.com/", "color": "#10a37f" },
  "Claude": { "url": "https://claude.ai/", "color": "#da7756" },
  "Gemini": { "url": "https://gemini.google.com/", "color": "#4285f4" },
  "Perplexity": { "url": "https://www.perplexity.ai/", "color": "#20b2aa" },
  "GitHub Copilot": { "url": "https://github.com/copilot", "color": "#7c3aed" },
  "Grok": { "url": "https://grok.com/", "color": "#9ca3af" },
  "WolframAlpha": { "url": "https://www.wolframalpha.com/", "color": "#cc2200" }
};

const DEFAULT_PROFILES = {
  "default": "Main Profile",
  "work": "Work Profile"
};

// ── Registry Helpers ─────────────────────────────────────────────────────────

function getStartupStatus() {
  try {
    const output = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v LLMSwitcher', { encoding: 'utf-8' });
    return output.includes('LLMSwitcher');
  } catch (e) {
    return false;
  }
}

function setStartup(enable) {
  const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  try {
    if (enable) {
      const appPath = app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${__dirname}"`;
      execSync(`reg add "${runKey}" /v LLMSwitcher /t REG_SZ /d "${appPath}" /f`);
    } else {
      execSync(`reg delete "${runKey}" /v LLMSwitcher /f`);
    }
    return true;
  } catch (e) {
    console.error('Failed to set startup registry key:', e);
    return false;
  }
}

// ── Config Management ────────────────────────────────────────────────────────

function loadConfig() {
  let config = {
    services: { ...DEFAULT_SERVICES },
    appProfiles: { ...DEFAULT_PROFILES },
    mappings: {},
    settings: { launchOnStartup: false }
  };

  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      // If updating from old chrome version, add default appProfiles
      if (!data.appProfiles) {
        data.appProfiles = { ...DEFAULT_PROFILES };
      }
      
      config = { ...config, ...data };
    } catch (e) {
      console.error('Error reading config file:', e);
    }
  } else {
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing default config file:', e);
    }
  }

  config.settings.launchOnStartup = getStartupStatus();
  return config;
}

function saveConfig(newConfig) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    setStartup(newConfig.settings.launchOnStartup);
    return true;
  } catch (e) {
    console.error('Error saving config file:', e);
    return false;
  }
}

// ── Window Management ────────────────────────────────────────────────────────

function createPopupWindow() {
  popupWindow = new BrowserWindow({
    width: 280,
    height: 380,
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  popupWindow.loadFile('index.html');

  popupWindow.on('blur', () => {
    popupWindow.hide();
  });
}

function showPopup(trayBounds) {
  if (!popupWindow) createPopupWindow();
  popupWindow.webContents.send('config-reloaded');

  const { width: winWidth, height: winHeight } = popupWindow.getBounds();
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const screenBounds = display.bounds;

  let x = cursorPoint.x - Math.floor(winWidth / 2);
  let y = cursorPoint.y - winHeight - 10;

  if (trayBounds) {
    x = trayBounds.x + Math.floor(trayBounds.width / 2) - Math.floor(winWidth / 2);
    if (trayBounds.y > screenBounds.height / 2) {
      y = trayBounds.y - winHeight - 8;
    } else {
      y = trayBounds.y + trayBounds.height + 8;
    }
  }

  x = Math.max(screenBounds.x, Math.min(x, screenBounds.x + screenBounds.width - winWidth));
  y = Math.max(screenBounds.y, Math.min(y, screenBounds.y + screenBounds.height - winHeight));

  popupWindow.setPosition(x, y);
  popupWindow.show();
  popupWindow.focus();
}

function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 650,
    height: 580,
    title: 'LLM Switcher Settings',
    resizable: true,
    icon: path.join(__dirname, 'llm_switcher.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile('settings.html');
  settingsWindow.setMenu(null);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    if (popupWindow) popupWindow.webContents.send('config-reloaded');
  });
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-config', () => {
  const config = loadConfig();
  return { ...config, configPath };
});

ipcMain.handle('save-config', (event, config) => {
  return saveConfig(config);
});

// Launch internal browser window with isolated session
ipcMain.handle('launch-service', (event, { profileDir, url, color }) => {
  const partitionId = 'persist:' + profileDir;

  const existing = serviceWindows.get(partitionId);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { success: true };
  }

  try {
    const serviceWin = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'LLM Switcher',
      icon: path.join(__dirname, 'llm_switcher.ico'),
      backgroundColor: color || '#111114',
      webPreferences: {
        partition: partitionId,
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    serviceWin.setMenu(null);
    serviceWin.loadURL(url);

    serviceWindows.set(partitionId, serviceWin);
    serviceWin.on('closed', () => {
      serviceWindows.delete(partitionId);
    });

    return { success: true };
  } catch (e) {
    console.error('Launch Error:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-settings', () => {
  openSettings();
  if (popupWindow) popupWindow.hide();
});

ipcMain.handle('close-popup', () => {
  if (popupWindow) popupWindow.hide();
});

ipcMain.handle('set-startup', (event, enable) => {
  return setStartup(enable);
});

// ── App Lifecycle ───────────────────────────────────────────────────────────

const doubleInstanceLock = app.requestSingleInstanceLock();
if (!doubleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showPopup(tray ? tray.getBounds() : null);
  });

  app.whenReady().then(() => {
    const config = loadConfig();
    const hasMappings = Object.values(config.mappings).some(arr => arr && arr.length > 0);
    if (!hasMappings) {
      openSettings();
    }

    const iconPath = path.join(__dirname, 'llm_switcher.ico');
    tray = new Tray(iconPath);
    tray.setToolTip('LLM Switcher');

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Switcher', click: () => showPopup(tray.getBounds()) },
      { label: 'Settings', click: openSettings },
      { type: 'separator' },
      { label: 'Exit', click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (popupWindow && popupWindow.isVisible()) {
        popupWindow.hide();
      } else {
        showPopup(tray.getBounds());
      }
    });

    createPopupWindow();
  });
}

app.on('window-all-closed', () => {
  // Do not quit when windows are closed, stay in system tray
});
