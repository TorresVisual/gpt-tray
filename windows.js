const { BrowserWindow, screen } = require('electron');
const path = require('path');

let popupWindow = null;
let settingsWindow = null;
const serviceWindows = new Map(); // partitionId -> BrowserWindow

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

  return popupWindow;
}

function getPopupWindow() {
  return popupWindow;
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

function launchService(profileDir, url, color) {
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
}

module.exports = {
  createPopupWindow,
  getPopupWindow,
  showPopup,
  openSettings,
  launchService
};
