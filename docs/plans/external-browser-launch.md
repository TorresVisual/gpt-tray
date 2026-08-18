# External Browser Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (default) or superpowers:subagent-driven-development if explicitly requested.

**Goal:** Replace embedded-Chromium `BrowserWindow` service launches with
spawning the user's installed browser (Chrome/Edge/Brave) in app mode, using
a dedicated app-owned `--user-data-dir` for the same per-profile isolation
guarantee the app has today, so services run in a real, fully-updated
browser engine instead of Electron's bundled one.

**Architecture:** A new `browsers.js` module handles registry-based browser
detection and spawning services as detached OS processes. `windows.js` loses
its `BrowserWindow`-based `launchService` (popup/settings windows are
unaffected). `main.js` wires a new `get-available-browsers` IPC channel and
updates `launch-service` to delegate to `browsers.js`. Settings gets a
browser-choice dropdown in the Preferences tab.

**Tech Stack:** Electron ^43.4.0 (main process, CommonJS), classic
`<script>` renderer JS — same as the rest of the project, no new
dependencies.

**Spec:** [docs/specs/external-browser-launch-design.md](../specs/external-browser-launch-design.md)

## Global Constraints

- No new npm dependencies — detection and spawning use Node's built-in
  `child_process` and `fs`, matching the existing `reg query` pattern in
  `config.js`.
- Windows-only (registry-based detection) — unchanged from the rest of the app.
- No automated test suite — every task is verified manually via `npm start`,
  per the spec's Testing Approach.
- `config.json`'s `services`/`appProfiles`/`mappings` shape is unchanged;
  only `settings` gains a new `browserId` field.
- Popup and settings windows stay Electron `BrowserWindow`s — this plan only
  changes how *service* launches work.

---

## File Structure

**New:**
- `browsers.js` — `getAvailableBrowsers()`, `resolveBrowserChoice()`,
  `launchService()`

**Modified:**
- `config.js` — default `settings` shape gains `browserId: null`
- `windows.js` — `launchService` and the `serviceWindows` registry removed
  (moved to `browsers.js`, using OS process spawn instead of `BrowserWindow`)
- `main.js` — `launch-service` handler delegates to `browsers.js`; new
  `get-available-browsers` handler
- `preload.js` — `launchService` drops its now-unused `color` parameter
  (there's no `BrowserWindow` `backgroundColor` to set anymore); new
  `getAvailableBrowsers()`
- `renderer.js` — drops passing `card.color` to `launchService`
- `settings/preferences.js` — browser-choice dropdown, loads available
  browsers via IPC, saves selection to `config.settings.browserId`
- `settings.html` — dropdown markup in the Preferences tab
- `settings.css` — minimal styling for the new dropdown
- `package.json` `build.files` — add `browsers.js`

---

### Task 1: Browser detection (`browsers.js`)

**Files:**
- Create: `browsers.js`

**Interfaces:**
- Produces: `getAvailableBrowsers(): Array<{ id: 'brave'|'chrome'|'edge', name: string, path: string }>`
- Produces: `resolveBrowserChoice(browserId: string|null, availableBrowsers: Array<{id,name,path}>): {id,name,path}|null`
  — returns the browser matching `browserId` if present in the list;
  otherwise falls back to Brave > Chrome > Edge preference order; `null` if
  none are available at all.

- [ ] **Step 1: Write `browsers.js`'s detection and resolution logic**

```javascript
const { execSync } = require('child_process');
const fs = require('fs');

const BROWSERS = [
  { id: 'brave', name: 'Brave', exe: 'brave.exe' },
  { id: 'chrome', name: 'Chrome', exe: 'chrome.exe' },
  { id: 'edge', name: 'Edge', exe: 'msedge.exe' }
];

const PREFERENCE_ORDER = ['brave', 'chrome', 'edge'];

function getAvailableBrowsers() {
  const found = [];

  for (const browser of BROWSERS) {
    try {
      const output = execSync(
        `reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${browser.exe}" /ve`,
        { encoding: 'utf-8' }
      );
      const match = output.match(/REG_SZ\s+(.+)/);
      if (match) {
        const exePath = match[1].trim();
        if (fs.existsSync(exePath)) {
          found.push({ id: browser.id, name: browser.name, path: exePath });
        }
      }
    } catch (e) {
      // Registry key missing (browser not installed) - skip
    }
  }

  return found;
}

function resolveBrowserChoice(browserId, availableBrowsers) {
  if (browserId) {
    const chosen = availableBrowsers.find(b => b.id === browserId);
    if (chosen) return chosen;
  }

  for (const id of PREFERENCE_ORDER) {
    const found = availableBrowsers.find(b => b.id === id);
    if (found) return found;
  }

  return null;
}

module.exports = { getAvailableBrowsers, resolveBrowserChoice };
```

- [ ] **Step 2: Manually verify detection**

Run: `node -e "console.log(require('./browsers').getAvailableBrowsers())"`
(this runs under plain Node, not Electron, but `child_process`/`fs` work
identically there — no Electron APIs are used in this file yet).

Expected: an array containing an entry for each Chromium-family browser
actually installed on the machine (e.g., at least Brave, given it's already
confirmed installed and in use). Confirm the printed `path` for each actually
exists (`Test-Path <path>` in PowerShell, or just eyeball it against the
known install location).

Also verify `resolveBrowserChoice`:

```
node -e "const b=require('./browsers'); const avail=b.getAvailableBrowsers(); console.log(b.resolveBrowserChoice(null, avail)); console.log(b.resolveBrowserChoice('doesnotexist', avail));"
```

Expected: both calls return the same browser (whichever is highest in the
Brave > Chrome > Edge preference order among what's actually installed),
since neither a missing choice nor an invalid one should ever return `null`
if at least one browser was detected.

- [ ] **Step 3: Commit**

```bash
git add browsers.js
git commit -m "feat: add Chromium browser detection (browsers.js)"
```

---

### Task 2: Browser choice in Settings

**Files:**
- Modify: `config.js` (default `settings` shape)
- Modify: `main.js` (new IPC handler)
- Modify: `preload.js` (expose the new IPC call)
- Modify: `settings.html` (dropdown markup)
- Modify: `settings.css` (dropdown styling)
- Modify: `settings/preferences.js` (load browsers, wire the dropdown)

**Interfaces:**
- Consumes: `browsers.getAvailableBrowsers()`, `browsers.resolveBrowserChoice()`
  from Task 1.
- Produces: IPC channel `get-available-browsers` returning
  `Array<{id,name,path}>` (same shape as `getAvailableBrowsers()`).
- Produces: `window.api.getAvailableBrowsers(): Promise<Array<{id,name,path}>>`
  on the renderer side.
- Produces: `config.settings.browserId: string|null` persisted in
  `config.json`, consumed by Task 3's launch logic.

- [ ] **Step 1: Add `browserId` to `config.js`'s default settings shape**

In `config.js`, change:

```javascript
    settings: { launchOnStartup: false }
```

to:

```javascript
    settings: { launchOnStartup: false, browserId: null }
```

- [ ] **Step 2: Add the IPC handler in `main.js`**

Add this near the other `ipcMain.handle` calls in `main.js` (after
`get-config`, alongside the others):

```javascript
ipcMain.handle('get-available-browsers', () => {
  return browsers.getAvailableBrowsers();
});
```

This requires `browsers.js` to be required at the top of `main.js`. Add,
alongside the existing `config`/`windows` requires:

```javascript
const browsers = require('./browsers');
```

- [ ] **Step 3: Expose it in `preload.js`**

Add to the `contextBridge.exposeInMainWorld('api', { ... })` object in
`preload.js`:

```javascript
  getAvailableBrowsers: () => ipcRenderer.invoke('get-available-browsers'),
```

- [ ] **Step 4: Add the dropdown markup to `settings.html`**

In `settings.html`, inside the Preferences tab's `<div class="preferences-panel">`
(currently `settings.html:152-173`), add a new `pref-item` block right after
the existing "Launch on Startup" one and before the `<hr class="pref-divider">`:

```html
          <div class="pref-item">
            <div class="pref-info">
              <span class="pref-title">Browser for Services</span>
              <span class="pref-desc">Which installed browser to open services in.</span>
            </div>
            <select id="browser-select" class="pref-select"></select>
          </div>

          <hr class="pref-divider">
```

(This replaces the single `<hr class="pref-divider">` that currently sits
between "Launch on Startup" and the "Configuration File" section — there
should still be exactly one `<hr>` there afterward, now following the new
browser picker instead of directly following the startup toggle.)

- [ ] **Step 5: Style the dropdown in `settings.css`**

Add near the existing `.form-group input` rules in `settings.css`:

```css
.pref-select {
  padding: 8px 10px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  cursor: pointer;
}

.pref-select:focus {
  border-color: var(--accent-hover);
}
```

- [ ] **Step 6: Wire it up in `settings/preferences.js`**

Replace the entire file with:

```javascript
const startupToggle = document.getElementById('startup-toggle');
const configFilePath = document.getElementById('config-file-path');
const browserSelect = document.getElementById('browser-select');

let availableBrowsers = [];

async function renderPreferences() {
  if (!config) return;

  startupToggle.checked = config.settings.launchOnStartup || false;
  configFilePath.textContent = config.configPath || 'Unknown';

  availableBrowsers = await window.api.getAvailableBrowsers();
  browserSelect.innerHTML = '';

  if (availableBrowsers.length === 0) {
    browserSelect.innerHTML = '<option value="">No supported browser found</option>';
    browserSelect.disabled = true;
    return;
  }

  browserSelect.disabled = false;
  availableBrowsers.forEach(browser => {
    const option = document.createElement('option');
    option.value = browser.id;
    option.textContent = browser.name;
    browserSelect.appendChild(option);
  });

  const hasCurrentChoice = availableBrowsers.some(b => b.id === config.settings.browserId);
  browserSelect.value = hasCurrentChoice ? config.settings.browserId : availableBrowsers[0].id;
}

startupToggle.addEventListener('change', (e) => {
  config.settings.launchOnStartup = e.target.checked;
  saveChanges();
});

browserSelect.addEventListener('change', (e) => {
  config.settings.browserId = e.target.value;
  saveChanges();
});
```

Note: `renderPreferences` is now `async` (it awaits the IPC call). It's
called from `settings/store.js`'s `loadData()` as `renderPreferences();`
without an `await` — that's fine, it's fire-and-forget the same way the
other three render functions already are; no change needed in `store.js`.

- [ ] **Step 7: Manually verify**

Run `npm start`, open Settings → Preferences tab. Confirm:
1. The "Browser for Services" dropdown appears, populated with whichever
   Chromium browsers are actually installed (per Task 1's manual check).
2. Selecting a different browser shows "All changes saved" (the existing
   save-status indicator) and the choice persists after closing and
   reopening Settings.
3. Check `config.json` on disk — confirm `settings.browserId` reflects the
   selection.

- [ ] **Step 8: Commit**

```bash
git add config.js main.js preload.js settings.html settings.css settings/preferences.js
git commit -m "feat: add browser choice to Preferences settings tab"
```

---

### Task 3: Launch services via spawned browser process

**Files:**
- Modify: `browsers.js` (add `launchService`)
- Modify: `main.js` (`launch-service` handler delegates to `browsers.js`)
- Modify: `windows.js` (remove `launchService` and the service-window registry)
- Modify: `preload.js` (drop the now-unused `color` parameter)
- Modify: `renderer.js` (stop passing `card.color`)
- Modify: `package.json` (`build.files`)

**Interfaces:**
- Produces: `browsers.launchService(profileDir: string, url: string, browserId: string|null): { success: boolean, fallback?: boolean, error?: string }`
- Consumes: `browsers.getAvailableBrowsers()` and `browsers.resolveBrowserChoice()`
  from Task 1.

This is the task that actually replaces the embedded-Chromium window with a
real spawned browser process.

- [ ] **Step 1: Add `launchService` to `browsers.js`**

Add these requires to the top of `browsers.js`:

```javascript
const path = require('path');
const { spawn } = require('child_process');
const { app, shell } = require('electron');
```

Add this function, and add it to the `module.exports`:

```javascript
function launchService(profileDir, url, browserId) {
  const availableBrowsers = getAvailableBrowsers();
  const browser = resolveBrowserChoice(browserId, availableBrowsers);

  if (!browser) {
    shell.openExternal(url);
    return { success: true, fallback: true };
  }

  const userDataDir = path.join(app.getPath('userData'), 'browser-profiles');
  const args = [
    `--app=${url}`,
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileDir}`
  ];

  try {
    const child = spawn(browser.path, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return { success: true };
  } catch (e) {
    console.error('Launch Error:', e);
    return { success: false, error: e.message };
  }
}
```

```javascript
module.exports = { getAvailableBrowsers, resolveBrowserChoice, launchService };
```

- [ ] **Step 2: Update the `launch-service` handler in `main.js`**

Replace:

```javascript
ipcMain.handle('launch-service', (event, { profileDir, url, color }) => {
  return windows.launchService(profileDir, url, color);
});
```

with:

```javascript
ipcMain.handle('launch-service', (event, { profileDir, url }) => {
  const cfg = config.loadConfig();
  return browsers.launchService(profileDir, url, cfg.settings.browserId);
});
```

- [ ] **Step 3: Remove `launchService` and the service-window registry from `windows.js`**

Delete the `serviceWindows` map declaration, the `launchService` function,
and its export, from `windows.js`. After this change, `windows.js` should
export only `{ createPopupWindow, getPopupWindow, showPopup, openSettings }`.

- [ ] **Step 4: Simplify `preload.js`**

Change:

```javascript
  launchService: (profileDir, url, color) => ipcRenderer.invoke('launch-service', { profileDir, url, color }),
```

to:

```javascript
  launchService: (profileDir, url) => ipcRenderer.invoke('launch-service', { profileDir, url }),
```

- [ ] **Step 5: Simplify `renderer.js`**

Change the card click handler:

```javascript
    cardEl.addEventListener('click', async () => {
      // Hide popup first to give responsive feedback
      await window.api.closePopup();
      // Launch service
      await window.api.launchService(card.profileDir, card.url, card.color);
    });
```

to:

```javascript
    cardEl.addEventListener('click', async () => {
      // Hide popup first to give responsive feedback
      await window.api.closePopup();
      // Launch service
      await window.api.launchService(card.profileDir, card.url);
    });
```

- [ ] **Step 6: Update `package.json`'s `build.files`**

Add `"browsers.js"` to the `files` array (alongside `config.js`/`windows.js`).

- [ ] **Step 7: Manually verify end-to-end**

Run `npm start`. Then:
1. Click a service card. Confirm it opens in the browser chosen in
   Preferences, in app mode (no tabs, no address bar — just the page,
   like a dedicated window).
2. Confirm it's a *fresh* login (no cookies carried over from your real
   browser profile) — this confirms real isolation via the dedicated
   `--user-data-dir`, not accidentally reusing your personal browser profile.
3. Log in, close that window, click the same card again — confirm the login
   persisted (the isolated profile folder under
   `%APPDATA%\llm-switcher\browser-profiles\<profileDir>\` is being reused,
   not recreated).
4. Click the same card twice in a row without closing the window in between
   — check whether a duplicate window opens or the existing one is focused
   (per the spec, this relies on the browser's own single-instance-per-profile
   behavior; document whichever way it actually behaves).
5. Scroll a real conversation in the launched window — confirm it feels as
   smooth as the already-known-good Brave baseline (this is the actual
   success criterion for the whole effort).
6. In Settings → Preferences, temporarily note your current browser
   selection, then test the "no browser" fallback: rename that browser's
   `.exe` (or pick a machine state where none are detected, if feasible) and
   confirm launching a service opens the system default browser instead of
   erroring. Restore the renamed file afterward.

- [ ] **Step 8: Commit**

```bash
git add browsers.js main.js windows.js preload.js renderer.js package.json
git commit -m "feat: launch services via spawned browser process instead of embedded BrowserWindow"
```

---

## Post-Plan Notes

- Existing logins from the embedded-Electron era do not carry over — this
  was confirmed acceptable during brainstorming. Each profile needs a
  one-time re-login after this change lands.
- If step 7.4's manual check finds the browser's single-instance behavior
  doesn't reliably focus an already-open window, that's an accepted v1
  limitation per the spec's Non-Goals (no OS-level window-focusing was
  planned) rather than a blocker — file it as a known follow-up if it comes
  up rather than scope-creeping this plan.
