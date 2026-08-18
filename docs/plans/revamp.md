# LLM Switcher Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (default) or superpowers:subagent-driven-development if explicitly requested.

**Goal:** Fix the window-duplication bug causing scroll lag, split the two monolithic
files into focused modules, and refresh the popup's visual style to a flat,
Raycast-inspired look — with no changes to config.json format or app behavior beyond
what's described below.

**Architecture:** Electron main-process app (`main.js`) manages a tray, a
frameless popup window (`index.html`/`renderer.js`), a settings window
(`settings.html`/`settings_renderer.js`), and per-profile isolated `BrowserWindow`s
for each launched service (session partitioned by profile dir). This plan adds a
window registry to dedupe service windows, splits `main.js` and
`settings_renderer.js` along their existing responsibility seams, and reworks the
popup's markup/CSS.

**Tech Stack:** Electron ^30.5.1, plain CommonJS (main process) and classic
(non-module) `<script>` tags (renderer processes) — no bundler, no test framework.

**Spec:** [docs/specs/revamp-design.md](../specs/revamp-design.md)

## Global Constraints

- Electron version stays `^30.5.1` — do not add/bump dependencies.
- Windows-only: startup toggle uses `reg.exe` via `execSync`; nothing here changes that.
- No automated test suite exists and this plan doesn't add one — every task is
  verified manually via `npm start`, per the spec's Testing Approach section.
- `config.json` shape and the four IPC channels' contracts (`get-config`,
  `save-config`, `open-settings`, `close-popup`, `set-startup`) stay backward
  compatible — only `launch-service`'s payload gains an optional `color` field.
- No new features (hotkeys, search-provider changes, notification badges) —
  explicitly out of scope per spec Non-Goals.

---

## File Structure

**New files:**
- `config.js` — config load/save, defaults, Windows startup-registry helpers
  (extracted from `main.js`)
- `windows.js` — popup/settings window creation, service-window registry +
  launch logic (extracted from `main.js`)
- `settings/store.js` — shared `config`/`profiles` state, `loadData`, `saveChanges`
  (extracted from `settings_renderer.js`)
- `settings/mappings.js` — Mappings tab render + wiring
- `settings/services.js` — Manage Services tab render + wiring
- `settings/profiles.js` — Manage Profiles tab render + wiring
- `settings/preferences.js` — Preferences tab render + wiring

**Modified files:**
- `main.js` — loses everything moved to `config.js`/`windows.js`; ends up as tray
  setup, app lifecycle, and IPC handlers that delegate to the two new modules
- `preload.js` — `launchService` gains a third `color` parameter
- `renderer.js` — passes `card.color` through to `launchService`; markup/rendering
  changed for the visual refresh (Task 4)
- `settings_renderer.js` — loses everything moved to `settings/*.js`; ends up as
  just tab-navigation wiring + the `DOMContentLoaded` → `loadData()` call
- `settings.html` — gains five new `<script>` tags (the `settings/*.js` files) before
  the existing `settings_renderer.js` tag
- `index.html` / `index.css` — visual refresh (Task 4)
- `package.json` — `build.files` list gains the new files

No files are deleted. No changes to `config.json`'s shape or `llm_switcher.ico`.

---

### Task 1: Window registry — fix duplicate service windows (Phase 1)

**Files:**
- Modify: `main.js:196-221` (the `launch-service` IPC handler)
- Modify: `preload.js:6`
- Modify: `renderer.js:76-81` (the card click handler)

**Interfaces:**
- Produces: `launch-service` IPC payload becomes `{ profileDir, url, color }`
  (was `{ profileDir, url }`) — `color` is optional, callers should always pass
  it going forward.

This is the task that fixes the reported scroll lag: today, clicking a service
card always creates a brand-new `BrowserWindow`, even if one is already open for
that profile. Multiple live windows for the same partition compete for Electron's
single shared GPU process, which is what makes scrolling feel laggy. The fix is a
registry keyed by partition ID that reuses an existing window instead of creating
a duplicate.

- [ ] **Step 1: Add the registry and rewrite the launch handler in `main.js`**

Add this near the top of `main.js`, after the existing `let` declarations at the
top (`let tray = null; let popupWindow = null; let settingsWindow = null;`):

```javascript
const serviceWindows = new Map(); // partitionId -> BrowserWindow
```

Replace the entire `launch-service` handler (currently `main.js:196-221`) with:

```javascript
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
```

- [ ] **Step 2: Pass the service's brand color through the IPC bridge**

In `preload.js`, change:

```javascript
launchService: (profileDir, url) => ipcRenderer.invoke('launch-service', { profileDir, url }),
```

to:

```javascript
launchService: (profileDir, url, color) => ipcRenderer.invoke('launch-service', { profileDir, url, color }),
```

In `renderer.js`, change the card click handler (currently lines 76-81):

```javascript
    cardEl.addEventListener('click', async () => {
      // Hide popup first to give responsive feedback
      await window.api.closePopup();
      // Launch service
      await window.api.launchService(card.profileDir, card.url);
    });
```

to:

```javascript
    cardEl.addEventListener('click', async () => {
      // Hide popup first to give responsive feedback
      await window.api.closePopup();
      // Launch service
      await window.api.launchService(card.profileDir, card.url, card.color);
    });
```

- [ ] **Step 3: Manually verify the fix**

Run `npm start`. Then:
1. Click the tray icon, click the same service card (e.g. "ChatGPT 1") three times
   in a row (clicking again after the popup closes each time). Confirm only **one**
   `LLM Switcher` service window ever appears — later clicks bring the existing
   window to the front instead of opening a new one.
2. Open Task Manager → Details tab, filter for `LLM Switcher.exe` / `electron.exe`
   processes. Confirm the process/renderer count doesn't grow when repeating step 1.
3. Open two different services (e.g. ChatGPT and Claude) at once, then scroll a long
   chat in one of them. Confirm scrolling feels smooth (this was the original
   complaint).
4. Close a service window, then click its card again — confirm a fresh window opens
   (the registry entry was correctly cleared on `closed`).

Expected: all four checks pass. If a window fails to refocus, check that
`existing.isDestroyed()` isn't wrongly reporting `true` for a hidden-but-open window.

- [ ] **Step 4: Commit**

```bash
git add main.js preload.js renderer.js
git commit -m "fix: reuse existing service window instead of duplicating on repeat launch"
```

---

### Task 2: Split `main.js` into `config.js` + `windows.js` (Phase 2a)

**Files:**
- Create: `config.js`
- Create: `windows.js`
- Modify: `main.js` (rewritten to a thin bootstrap)
- Modify: `package.json:39-49` (`build.files`)

**Interfaces:**
- Produces (`config.js`): `module.exports = { configPath, loadConfig, saveConfig, setStartup }`
- Produces (`windows.js`): `module.exports = { createPopupWindow, getPopupWindow, showPopup, openSettings, launchService }`
  - `launchService(profileDir, url, color)` returns `{ success: true }` or
    `{ success: false, error: string }` — same contract Task 1 established.
  - `showPopup(trayBounds)` — `trayBounds` may be `null`.
  - `openSettings()` takes no arguments; internally re-sends `config-reloaded` to
    the popup on close, same as before.

This is a pure refactor — behavior must be identical to Task 1's result afterward.
No new logic, just relocation.

- [ ] **Step 1: Create `config.js`**

```javascript
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

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

module.exports = { configPath, loadConfig, saveConfig, setStartup };
```

- [ ] **Step 2: Create `windows.js`**

```javascript
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
```

- [ ] **Step 3: Rewrite `main.js`**

Replace the entire file with:

```javascript
const { app, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const config = require('./config');
const windows = require('./windows');

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-config', () => {
  const cfg = config.loadConfig();
  return { ...cfg, configPath: config.configPath };
});

ipcMain.handle('save-config', (event, newConfig) => {
  return config.saveConfig(newConfig);
});

ipcMain.handle('launch-service', (event, { profileDir, url, color }) => {
  return windows.launchService(profileDir, url, color);
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
```

- [ ] **Step 4: Update `package.json`'s `build.files` list**

In `package.json`, change the `build.files` array (currently lines 39-49) to add
`config.js` and `windows.js`:

```json
    "files": [
      "main.js",
      "config.js",
      "windows.js",
      "preload.js",
      "index.html",
      "index.css",
      "renderer.js",
      "settings.html",
      "settings.css",
      "settings_renderer.js",
      "llm_switcher.ico"
    ]
```

- [ ] **Step 5: Manually verify no behavior changed**

Run `npm start`. Confirm, in order:
1. Tray icon appears; left-click opens the popup positioned near the tray.
2. Popup shows your existing configured services/profiles (reads `config.json`
   correctly — proves `config.js` wiring works).
3. Click a service card — it launches (proves `windows.js` wiring works) and, per
   Task 1's fix, re-focuses on a second click instead of duplicating.
4. Right-click tray → Settings opens the settings window; change something (e.g.
   toggle "Launch on startup") and confirm "All changes saved" appears and
   `config.json` on disk actually changes.
5. Close and restart the app (`npm start` again) — confirm settings persisted.

Expected: identical behavior to before this task; this is a refactor, not a
feature change.

- [ ] **Step 6: Commit**

```bash
git add main.js config.js windows.js package.json
git commit -m "refactor: split main.js into config.js and windows.js"
```

---

### Task 3: Split `settings_renderer.js` into per-tab modules (Phase 2b)

**Files:**
- Create: `settings/store.js`
- Create: `settings/mappings.js`
- Create: `settings/services.js`
- Create: `settings/profiles.js`
- Create: `settings/preferences.js`
- Modify: `settings_renderer.js` (rewritten to nav wiring only)
- Modify: `settings.html:178` (add script tags)
- Modify: `package.json:39-49` (`build.files`)

**Interfaces:**
- Produces (`settings/store.js`, global scope — classic scripts share one lexical
  environment across `<script>` tags loaded in the same document, in load order):
  `config`, `profiles` (mutable `let` bindings), `saveStatusText`, `statusDot`
  (DOM refs), `async function loadData()`, `async function saveChanges()`.
- Consumes (each tab file): `config`, `profiles`, `saveChanges` from `store.js` —
  must load *after* `store.js` in `settings.html`.
- Produces (each tab file): `function renderMappings()`, `function renderServices()`,
  `function renderProfiles()`, `function renderPreferences()` respectively — these
  are called by `loadData()` in `store.js`, so all four must be defined (i.e. all
  five new script tags present) before `DOMContentLoaded` fires.

This is a pure refactor along the app's existing tab boundaries — no behavior
change. Because these are classic (non-module) scripts, `let`/`const`/`function`
declarations at a file's top level are visible to every script tag loaded after
it in the same HTML document, so splitting the file this way requires no `export`/
`import` or bundler — just correct `<script>` tag order in `settings.html`.

- [ ] **Step 1: Create `settings/store.js`**

```javascript
let config = null;
let profiles = null;

const saveStatusText = document.getElementById('save-status-text');
const statusDot = document.querySelector('.status-indicator-dot');

async function loadData() {
  config = await window.api.getConfig();
  profiles = config.appProfiles || {};

  renderMappings();
  renderServices();
  renderProfiles();
  renderPreferences();
}

async function saveChanges() {
  statusDot.classList.add('saving');
  saveStatusText.textContent = 'Saving changes...';

  const success = await window.api.saveConfig(config);

  statusDot.classList.remove('saving');
  if (success) {
    saveStatusText.textContent = 'All changes saved';
  } else {
    saveStatusText.textContent = 'Error saving changes!';
    statusDot.style.backgroundColor = '#ef4444';
    statusDot.style.boxShadow = '0 0 8px #ef4444';
  }
}
```

- [ ] **Step 2: Create `settings/mappings.js`**

```javascript
const mappingsListContainer = document.getElementById('mappings-list-container');

function renderMappings() {
  mappingsListContainer.innerHTML = '';
  const services = config.services || {};

  const serviceIds = Object.keys(services).sort();

  serviceIds.forEach(svcId => {
    const svc = services[svcId];
    const mappedDirs = config.mappings[svcId] || [];

    const row = document.createElement('div');
    row.className = 'mapping-row';

    const info = document.createElement('div');
    info.className = 'mapping-service-info';
    info.innerHTML = `
      <span class="color-dot" style="background-color: ${svc.color || '#4f46e5'}"></span>
      <span class="mapping-service-name">${svcId}</span>
    `;
    row.appendChild(info);

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'mapping-tags-container';

    const validMappedDirs = mappedDirs.filter(dir => profiles[dir]);
    if (validMappedDirs.length !== mappedDirs.length) {
      config.mappings[svcId] = validMappedDirs;
    }

    validMappedDirs.forEach(dir => {
      const displayLabel = profiles[dir];
      const tag = document.createElement('div');
      tag.className = 'profile-tag';
      tag.innerHTML = `
        <span>${displayLabel}</span>
        <span class="profile-tag-remove" data-dir="${dir}">×</span>
      `;

      tag.querySelector('.profile-tag-remove').addEventListener('click', () => {
        config.mappings[svcId] = validMappedDirs.filter(d => d !== dir);
        saveChanges();
        renderMappings();
      });

      tagsContainer.appendChild(tag);
    });

    const addWrapper = document.createElement('div');
    addWrapper.className = 'btn-add-profile-wrapper';

    const availableDirs = Object.keys(profiles).filter(dir => !validMappedDirs.includes(dir));

    if (availableDirs.length > 0) {
      addWrapper.innerHTML = `
        <button class="btn-add-profile">+ Add Profile</button>
        <select class="add-profile-select">
          <option value="" disabled selected>Add Profile...</option>
          ${availableDirs.map(dir => `<option value="${dir}">${profiles[dir]} (${dir})</option>`).join('')}
        </select>
      `;

      const select = addWrapper.querySelector('.add-profile-select');
      select.addEventListener('change', (e) => {
        const dir = e.target.value;
        if (dir) {
          if (!config.mappings[svcId]) config.mappings[svcId] = [];
          config.mappings[svcId].push(dir);
          saveChanges();
          renderMappings();
        }
      });
    } else {
      addWrapper.innerHTML = `
        <button class="btn-add-profile" style="opacity: 0.5; cursor: not-allowed;" title="All profiles assigned" disabled>+ Add Profile</button>
      `;
    }

    tagsContainer.appendChild(addWrapper);
    row.appendChild(tagsContainer);

    mappingsListContainer.appendChild(row);
  });
}
```

- [ ] **Step 3: Create `settings/services.js`**

```javascript
let selectedServiceId = null;
const DEFAULT_SERVICE_IDS = ["ChatGPT", "Claude", "Gemini", "Perplexity", "GitHub Copilot", "Grok", "WolframAlpha"];

const servicesListContainer = document.getElementById('services-list-container');
const serviceForm = document.getElementById('service-form');
const formTitle = document.getElementById('form-title');
const editServiceId = document.getElementById('edit-service-id');
const serviceNameInput = document.getElementById('service-name');
const serviceUrlInput = document.getElementById('service-url');
const serviceColorInput = document.getElementById('service-color');
const serviceColorHexInput = document.getElementById('service-color-hex');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const btnSaveService = document.getElementById('btn-save-service');
const btnDeleteService = document.getElementById('btn-delete-service');

function renderServices() {
  servicesListContainer.innerHTML = '';
  const services = config.services || {};

  const serviceIds = Object.keys(services).sort();

  serviceIds.forEach(svcId => {
    const svc = services[svcId];

    const item = document.createElement('div');
    item.className = 'service-list-item';
    if (selectedServiceId === svcId) {
      item.classList.add('selected');
    }

    item.innerHTML = `
      <div class="service-item-info">
        <span class="color-dot" style="background-color: ${svc.color || '#4f46e5'}"></span>
        <div class="service-item-meta">
          <span class="service-item-name">${svcId}</span>
          <span class="service-item-url">${svc.url}</span>
        </div>
      </div>
      <span class="edit-indicator">Edit</span>
    `;

    item.addEventListener('click', () => selectService(svcId));
    servicesListContainer.appendChild(item);
  });
}

function selectService(svcId) {
  selectedServiceId = svcId;
  const svc = config.services[svcId];

  const items = servicesListContainer.querySelectorAll('.service-list-item');
  items.forEach((item, index) => {
    const listSvcId = Object.keys(config.services).sort()[index];
    if (listSvcId === svcId) item.classList.add('selected');
    else item.classList.remove('selected');
  });

  formTitle.textContent = `Edit Service: ${svcId}`;
  editServiceId.value = svcId;
  serviceNameInput.value = svcId;
  serviceNameInput.disabled = true;
  serviceUrlInput.value = svc.url;
  serviceColorInput.value = svc.color || '#4f46e5';
  serviceColorHexInput.value = svc.color || '#4f46e5';

  btnCancelEdit.classList.remove('hidden');
  btnSaveService.textContent = 'Update Service';

  if (!DEFAULT_SERVICE_IDS.includes(svcId)) {
    btnDeleteService.classList.remove('hidden');
  } else {
    btnDeleteService.classList.add('hidden');
  }
}

function resetServiceForm() {
  selectedServiceId = null;
  formTitle.textContent = 'Add New Service';
  editServiceId.value = '';
  serviceNameInput.value = '';
  serviceNameInput.disabled = false;
  serviceUrlInput.value = '';
  serviceColorInput.value = '#4f46e5';
  serviceColorHexInput.value = '#4f46e5';

  btnCancelEdit.classList.add('hidden');
  btnSaveService.textContent = 'Add Service';
  btnDeleteService.classList.add('hidden');

  const items = servicesListContainer.querySelectorAll('.service-list-item');
  items.forEach(item => item.classList.remove('selected'));
}

btnCancelEdit.addEventListener('click', resetServiceForm);

serviceForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = editServiceId.value;
  const name = serviceNameInput.value.trim();
  const url = serviceUrlInput.value.trim();
  const color = serviceColorHexInput.value;

  if (id) {
    config.services[id] = { url, color };
  } else {
    if (config.services[name]) {
      alert(`A service named "${name}" already exists!`);
      return;
    }
    config.services[name] = { url, color };
    config.mappings[name] = [];
  }

  await saveChanges();
  await loadData();
  resetServiceForm();
});

btnDeleteService.addEventListener('click', async () => {
  const id = editServiceId.value;
  if (!id) return;

  if (confirm(`Are you sure you want to delete the service "${id}" and all its mappings?`)) {
    delete config.services[id];
    delete config.mappings[id];
    await saveChanges();
    await loadData();
    resetServiceForm();
  }
});

serviceColorInput.addEventListener('input', (e) => {
  serviceColorHexInput.value = e.target.value;
});
serviceColorHexInput.addEventListener('input', (e) => {
  if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
    serviceColorInput.value = e.target.value;
  }
});
```

- [ ] **Step 4: Create `settings/profiles.js`**

```javascript
let selectedProfileId = null;
const DEFAULT_PROFILE_IDS = ["default", "work"];

const profilesListContainer = document.getElementById('profiles-list-container');
const profileForm = document.getElementById('profile-form');
const profileFormTitle = document.getElementById('profile-form-title');
const editProfileId = document.getElementById('edit-profile-id');
const profileIdInput = document.getElementById('profile-id');
const profileNameInput = document.getElementById('profile-name');
const btnCancelProfile = document.getElementById('btn-cancel-profile');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnDeleteProfile = document.getElementById('btn-delete-profile');

function renderProfiles() {
  profilesListContainer.innerHTML = '';
  const profileIds = Object.keys(profiles).sort();

  profileIds.forEach(profId => {
    const profName = profiles[profId];

    const item = document.createElement('div');
    item.className = 'service-list-item';
    if (selectedProfileId === profId) {
      item.classList.add('selected');
    }

    item.innerHTML = `
      <div class="service-item-info">
        <div class="service-item-meta">
          <span class="service-item-name">${profName}</span>
          <span class="service-item-url">ID: ${profId}</span>
        </div>
      </div>
      <span class="edit-indicator">Edit</span>
    `;

    item.addEventListener('click', () => selectProfile(profId));
    profilesListContainer.appendChild(item);
  });
}

function selectProfile(profId) {
  selectedProfileId = profId;
  const profName = profiles[profId];

  const items = profilesListContainer.querySelectorAll('.service-list-item');
  items.forEach((item, index) => {
    const listProfId = Object.keys(profiles).sort()[index];
    if (listProfId === profId) item.classList.add('selected');
    else item.classList.remove('selected');
  });

  profileFormTitle.textContent = `Edit Profile: ${profName}`;
  editProfileId.value = profId;
  profileIdInput.value = profId;
  profileIdInput.disabled = true;
  profileNameInput.value = profName;

  btnCancelProfile.classList.remove('hidden');
  btnSaveProfile.textContent = 'Update Profile';

  if (!DEFAULT_PROFILE_IDS.includes(profId)) {
    btnDeleteProfile.classList.remove('hidden');
  } else {
    btnDeleteProfile.classList.add('hidden');
  }
}

function resetProfileForm() {
  selectedProfileId = null;
  profileFormTitle.textContent = 'Add New Profile';
  editProfileId.value = '';
  profileIdInput.value = '';
  profileIdInput.disabled = false;
  profileNameInput.value = '';

  btnCancelProfile.classList.add('hidden');
  btnSaveProfile.textContent = 'Add Profile';
  btnDeleteProfile.classList.add('hidden');

  const items = profilesListContainer.querySelectorAll('.service-list-item');
  items.forEach(item => item.classList.remove('selected'));
}

btnCancelProfile.addEventListener('click', resetProfileForm);

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = editProfileId.value;
  const rawNewId = profileIdInput.value.trim().toLowerCase();
  const name = profileNameInput.value.trim();

  if (id) {
    config.appProfiles[id] = name;
  } else {
    if (config.appProfiles[rawNewId]) {
      alert(`A profile with ID "${rawNewId}" already exists!`);
      return;
    }
    config.appProfiles[rawNewId] = name;
  }

  await saveChanges();
  await loadData();
  resetProfileForm();
});

btnDeleteProfile.addEventListener('click', async () => {
  const id = editProfileId.value;
  if (!id) return;

  if (confirm(`Are you sure you want to delete the profile "${profiles[id]}"?\nAll existing mappings to this profile will be removed.`)) {
    delete config.appProfiles[id];

    for (const svcId of Object.keys(config.mappings)) {
      config.mappings[svcId] = config.mappings[svcId].filter(mappedId => mappedId !== id);
    }

    await saveChanges();
    await loadData();
    resetProfileForm();
  }
});
```

- [ ] **Step 5: Create `settings/preferences.js`**

```javascript
const startupToggle = document.getElementById('startup-toggle');
const configFilePath = document.getElementById('config-file-path');

function renderPreferences() {
  if (!config) return;

  startupToggle.checked = config.settings.launchOnStartup || false;
  configFilePath.textContent = config.configPath || 'Unknown';
}

startupToggle.addEventListener('change', (e) => {
  config.settings.launchOnStartup = e.target.checked;
  saveChanges();
});
```

- [ ] **Step 6: Rewrite `settings_renderer.js`**

Replace the entire file with:

```javascript
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetTab = item.getAttribute('data-tab');

    navItems.forEach(nav => nav.classList.remove('active'));
    tabContents.forEach(tab => tab.classList.remove('active'));

    item.classList.add('active');
    document.getElementById(targetTab).classList.add('active');
  });
});

document.addEventListener('DOMContentLoaded', loadData);
```

- [ ] **Step 7: Update `settings.html`'s script tags**

In `settings.html`, replace the single script tag near the end of `<body>`
(currently line 178, `<script src="settings_renderer.js"></script>`) with, in
this exact order:

```html
  <script src="settings/store.js"></script>
  <script src="settings/mappings.js"></script>
  <script src="settings/services.js"></script>
  <script src="settings/profiles.js"></script>
  <script src="settings/preferences.js"></script>
  <script src="settings_renderer.js"></script>
```

- [ ] **Step 8: Update `package.json`'s `build.files` list**

Add the five new files (keep `settings_renderer.js` where it is):

```json
    "files": [
      "main.js",
      "config.js",
      "windows.js",
      "preload.js",
      "index.html",
      "index.css",
      "renderer.js",
      "settings.html",
      "settings.css",
      "settings/store.js",
      "settings/mappings.js",
      "settings/services.js",
      "settings/profiles.js",
      "settings/preferences.js",
      "settings_renderer.js",
      "llm_switcher.ico"
    ]
```

- [ ] **Step 9: Manually verify no behavior changed**

Run `npm start`, open Settings (tray → right-click → Settings), then for each tab:
1. **Mappings** — confirm existing service→profile mappings render; add a profile
   to a service via the dropdown, confirm it saves (status text shows "All changes
   saved") and appears as a tag; remove it with the × button.
2. **Manage Services** — click an existing service, confirm the edit form
   populates; change its color and save; confirm "Add New Service" resets the form.
3. **Manage Profiles** — same check: select, edit, save, and add-new-resets-form.
4. **Preferences** — toggle "Launch on startup" and confirm the registry key
   actually changes (`reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v LLMSwitcher`
   in a terminal should reflect the toggle state); confirm the config path shown
   matches the real `config.json` location.
5. Close Settings, reopen the popup, confirm it still shows the correct
   mappings (proves `config-reloaded` still fires correctly).

Expected: identical behavior to before this task.

- [ ] **Step 10: Commit**

```bash
git add settings_renderer.js settings/store.js settings/mappings.js settings/services.js settings/profiles.js settings/preferences.js settings.html package.json
git commit -m "refactor: split settings_renderer.js into one module per tab"
```

---

### Task 4: Popup visual refresh — Raycast-style flat design (Phase 3)

**Files:**
- Modify: `index.html` (remove header, add footer bar)
- Modify: `index.css` (flat panel, new row/footer styles)
- Modify: `renderer.js` (new card markup, remove close-button wiring)

**Interfaces:**
- No IPC/data-shape changes. `card.color` (already passed to `launchService` since
  Task 1) is now also used for the new icon-badge background via the existing
  `--svc-color` CSS custom property.

This implements the approved Raycast-inspired direction: flat panel (no blur),
search bar as the top focal element, small solid-color icon badges instead of a
left-border stripe, a soft indigo highlight on hover, and a footer bar with
Settings/Esc hints replacing the header's icon buttons. The explicit close button
is dropped — closing already works via Escape (renderer.js) and on-blur
(main.js/windows.js), both unchanged by this task.

- [ ] **Step 1: Rewrite `index.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>LLM Switcher</title>
  <link rel="stylesheet" href="index.css">
</head>
<body>
  <div class="app-container">
    <div class="search-bar-container">
      <input type="text" id="search-input" placeholder="Search services or profiles..." autocomplete="off">
    </div>

    <main class="cards-container" id="cards-list">
      <div class="loading">Loading services...</div>
    </main>

    <footer class="footer-bar">
      <span class="footer-hint footer-action" id="btn-settings">⚙ Settings</span>
      <span class="footer-hint">esc Close</span>
    </footer>
  </div>

  <script src="renderer.js"></script>
</body>
</html>
```

- [ ] **Step 2: Rewrite `index.css`**

```css
:root {
  --bg-color: #1c1c1e;
  --border-color: rgba(255, 255, 255, 0.08);
  --text-primary: #ededf5;
  --text-secondary: #8e8ea6;
  --text-muted: #5e5e7a;
  --accent-color: #4f46e5;
  --accent-highlight: rgba(79, 70, 229, 0.15);
  --panel-radius: 12px;
  --card-radius: 8px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
  background: transparent;
  color: var(--text-primary);
  overflow: hidden;
  user-select: none;
}

.app-container {
  width: 280px;
  height: 380px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--panel-radius);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.search-bar-container {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

#search-input {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

#search-input::placeholder {
  color: var(--text-muted);
}

/* Cards Area */
.cards-container {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cards-container::-webkit-scrollbar {
  width: 5px;
}

.cards-container::-webkit-scrollbar-track {
  background: transparent;
}

.cards-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.cards-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Loading & Empty States */
.loading, .no-results {
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 30px 10px;
}

/* Service Rows */
.service-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--card-radius);
  cursor: pointer;
}

.service-card:hover {
  background: var(--accent-highlight);
}

.card-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--svc-color, var(--accent-color));
  flex-shrink: 0;
}

.card-info {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex: 1;
  overflow: hidden;
}

.service-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-name {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-name::before {
  content: "· ";
}

/* Footer */
.footer-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

.footer-hint {
  font-size: 10px;
  color: var(--text-muted);
}

.footer-action {
  cursor: pointer;
}

.footer-action:hover {
  color: var(--text-primary);
}
```

- [ ] **Step 3: Update `renderer.js`**

Replace the entire file with:

```javascript
let appConfig = null;
let appProfiles = null;

const cardsList = document.getElementById('cards-list');
const searchInput = document.getElementById('search-input');
const btnSettings = document.getElementById('btn-settings');

async function loadData() {
  try {
    appConfig = await window.api.getConfig();
    appProfiles = appConfig.appProfiles || {};
    renderCards();
  } catch (err) {
    cardsList.innerHTML = `<div class="no-results">Error loading configurations: ${err.message}</div>`;
  }
}

function renderCards() {
  if (!appConfig || !appProfiles) return;

  cardsList.innerHTML = '';
  const searchVal = searchInput.value.toLowerCase().trim();

  const services = appConfig.services || {};
  const mappings = appConfig.mappings || {};

  const cardsToRender = [];

  for (const [svcName, dirs] of Object.entries(mappings)) {
    if (!dirs || !Array.isArray(dirs) || dirs.length === 0) continue;
    const svcMeta = services[svcName];
    if (!svcMeta) continue;

    for (const dir of dirs) {
      const profileName = appProfiles[dir] || dir;

      if (searchVal) {
        const matchesSvc = svcName.toLowerCase().includes(searchVal);
        const matchesProf = profileName.toLowerCase().includes(searchVal);
        if (!matchesSvc && !matchesProf) continue;
      }

      cardsToRender.push({
        svcName,
        profileDir: dir,
        profileName,
        url: svcMeta.url,
        color: svcMeta.color || '#4f46e5'
      });
    }
  }

  if (cardsToRender.length === 0) {
    cardsList.innerHTML = `<div class="no-results">${searchVal ? 'No matches found.' : 'No services configured. Go to settings to set them up!'}</div>`;
    return;
  }

  cardsToRender.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'service-card';
    cardEl.style.setProperty('--svc-color', card.color);

    cardEl.innerHTML = `
      <div class="card-icon"></div>
      <div class="card-info">
        <span class="service-name">${card.svcName}</span>
        <span class="profile-name">${card.profileName}</span>
      </div>
    `;

    cardEl.addEventListener('click', async () => {
      await window.api.closePopup();
      await window.api.launchService(card.profileDir, card.url, card.color);
    });

    cardsList.appendChild(cardEl);
  });
}

searchInput.addEventListener('input', renderCards);

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (searchInput.value) {
      searchInput.value = '';
      renderCards();
      e.stopPropagation();
    }
  }
});

btnSettings.addEventListener('click', () => {
  window.api.openSettings();
});

document.body.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !searchInput.value) {
    window.api.closePopup();
  }
});

document.addEventListener('DOMContentLoaded', loadData);

window.addEventListener('focus', () => {
  loadData();
  if (searchInput.value) {
    searchInput.value = '';
  }
  searchInput.focus();
});
```

- [ ] **Step 4: Manually verify the visual refresh**

Run `npm start`, click the tray icon, and confirm:
1. The popup shows a flat panel — no blur/transparency haze, a thin 1px border,
   solid background.
2. The search input sits directly under the top edge with no separate boxed
   appearance.
3. Each row shows a small solid-color square icon on the left and
   `ServiceName · ProfileName` inline.
4. Hovering a row shows a soft indigo highlight (no lift/shadow animation).
5. The footer shows "⚙ Settings" (clickable, opens Settings) and "esc Close"
   (hint text only).
6. Escape still closes the popup when the search box is empty; clicking outside
   the popup (blur) still closes it.
7. Settings window still opens correctly and is visually unchanged (per spec,
   Settings gets no structural changes — and its `--accent-color`/font-family in
   `settings.css` already match the popup's, so no further consistency work is
   needed here).

Expected: matches the approved Raycast-style mockup direction; all existing
interactions (search, escape, blur-close, settings) still work.

- [ ] **Step 5: Commit**

```bash
git add index.html index.css renderer.js
git commit -m "feat: Raycast-inspired flat visual refresh for popup"
```

---

## Post-Plan Notes

- Settings window (`settings.html`/`settings.css`) intentionally receives no
  visual changes in this plan — its `--accent-color` (`#4f46e5`) and font-family
  already match the refreshed popup, so the spec's "light consistency pass" turned
  out to require zero additional changes once Task 4 was implemented as designed.
- New features (global hotkey, search-provider changes, notification badges) are
  explicitly deferred — see spec Non-Goals.
