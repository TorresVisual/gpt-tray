# LLM Switcher Code Quality Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (default) or superpowers:subagent-driven-development if explicitly requested.

**Goal:** Single-source the duplicated "default IDs" lists, extract the app's pure
decision logic into a dependency-free `lib/` so it can be unit-tested, add a
lightweight `node --test` suite plus ESLint/Prettier tooling, and migrate the
renderer scripts from classic `<script>`-tag globals to explicit ES modules —
all without changing app behavior.

**Architecture:** `config.js` and `browsers.js` currently mix pure decision logic
(config defaults/merging, browser-preference resolution) with Electron-specific
I/O (registry reads, `fs`, `spawn`). This plan splits each into a thin
Electron-facing wrapper plus a new `lib/*.js` module holding only the pure logic,
which is what the new `node --test` suite exercises directly. The renderer's four
settings tabs currently communicate through implicit global scope populated by
`<script>` tag load order; this plan converts them to ES modules using a small
publish/subscribe registry (`onConfigLoaded`) in `settings/store.js` so tab
modules can self-register a render callback without store.js needing to import
them back (which would create a circular import).

**Tech Stack:** Electron ^43.4.0, plain CommonJS (main process), ES modules
(renderer, after this plan), Node's built-in `node:test` runner (no new test
framework dependency), ESLint (flat config) + Prettier (new dev dependencies).

**Spec:** [docs/specs/code-quality-design.md](../specs/code-quality-design.md)

## Global Constraints

- No new features and no visible behavior change — this is a structural/tooling
  pass only.
- `config.json`'s on-disk shape stays unchanged.
- IPC channel contracts stay backward compatible — `get-config`'s response only
  gains two new read-only fields (`defaultServiceIds`, `defaultProfileIds`).
- Electron version stays `^43.4.0` — do not add/bump it.
- No bundler and no TypeScript introduced — ES modules run natively via
  `<script type="module">` in Electron's Chromium renderer.
- `node --test` is the only test tooling added — no Jest, no Electron test
  runner, no Electron-level integration/E2E coverage in this pass.
- `config.json` git-tracking, the README, and the orphaned
  `.claude/worktrees/revamp` directory are explicitly out of scope this round.

---

## File Structure

**New files:**
- `lib/browser-select.js` — pure `resolveBrowserChoice`, moved from `browsers.js`
- `lib/browser-select.test.js` — `node:test` coverage for the above
- `lib/config-shape.js` — pure `DEFAULT_SERVICES`/`DEFAULT_PROFILES`/
  `defaultConfig`/`mergeWithDefaults`, extracted from `config.js`
- `lib/config-shape.test.js` — `node:test` coverage for the above
- `eslint.config.js` — flat ESLint config (separate Node/CommonJS and
  browser/ESM rule blocks)
- `.prettierrc.json`, `.prettierignore`

**Modified files:**
- `browsers.js` — delegates browser selection to `lib/browser-select.js`
- `config.js` — delegates default/merge logic to `lib/config-shape.js`;
  `loadConfig()` gains `defaultServiceIds`/`defaultProfileIds` on its return value
- `package.json` — new devDependencies (`eslint`, `@eslint/js`, `prettier`); new
  `test`/`lint`/`format` scripts; `build.files` gains the two new `lib/*.js` files
- `renderer.js`, `index.html` — `renderer.js` becomes an ES module
- `settings/store.js`, `settings/mappings.js`, `settings/services.js`,
  `settings/profiles.js`, `settings/preferences.js`, `settings_renderer.js`,
  `settings.html` — all six JS files become ES modules wired through explicit
  `import`/`export`; `settings/services.js` and `settings/profiles.js` drop their
  hardcoded default-ID arrays in favor of `config.defaultServiceIds`/
  `config.defaultProfileIds`

No files are deleted. No changes to `config.json`'s shape, `preload.js`, or any
CSS file.

---

### Task 1: Add lint, format, and test tooling

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run lint`, `npm run format`, `npm test` scripts, usable by every
  later task.

This task only adds tooling — no application code changes. It must land first so
every subsequent task can be linted as it's written.

- [ ] **Step 1: Create `eslint.config.js`**

```javascript
const js = require('@eslint/js');

module.exports = [
  {
    ignores: ['build/**', 'dist/**', 'node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['main.js', 'config.js', 'windows.js', 'browsers.js', 'preload.js', 'lib/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly'
      }
    }
  },
  {
    files: ['renderer.js', 'settings_renderer.js', 'settings/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        confirm: 'readonly'
      }
    }
  }
];
```

- [ ] **Step 2: Create `.prettierrc.json`**

```json
{
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "none"
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
build/
dist/
node_modules/
```

- [ ] **Step 4: Add devDependencies and scripts to `package.json`**

In `package.json`, change the `"scripts"` block (currently lines 6-10) to:

```json
  "scripts": {
    "start": "electron .",
    "build": "electron-packager . \"LLM Switcher\" --platform=win32 --arch=x64 --icon=llm_switcher.ico --out=dist --overwrite",
    "dist": "npm run build",
    "test": "node --test",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
```

And change the `"devDependencies"` block (currently lines 20-24) to:

```json
  "devDependencies": {
    "@eslint/js": "^9.19.0",
    "electron": "^43.4.0",
    "electron-builder": "^24.13.3",
    "electron-packager": "^17.1.2",
    "eslint": "^9.19.0",
    "prettier": "^3.4.2"
  },
```

- [ ] **Step 5: Install and verify**

Run: `npm install`
Expected: installs `@eslint/js`, `eslint`, `prettier` with no errors.

Run: `npm run lint`
Expected: exits with no errors on the existing codebase. If it reports errors,
fix them minimally (e.g. unused variables) without changing behavior — do not
reformat unrelated code.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.js .prettierrc.json .prettierignore package.json package-lock.json
git commit -m "chore: add ESLint, Prettier, and node:test tooling"
```

---

### Task 2: Extract `lib/browser-select.js` with tests

**Files:**
- Create: `lib/browser-select.js`
- Create: `lib/browser-select.test.js`

**Interfaces:**
- Produces: `module.exports = { PREFERENCE_ORDER, resolveBrowserChoice }` —
  `resolveBrowserChoice(browserId, availableBrowsers)` returns the matching
  browser object `{ id, name, path }` from `availableBrowsers`, or `null` if none
  match. Consumed by Task 3.

This is a pure move: `resolveBrowserChoice` already has no side effects in
`browsers.js` today, it just lives in a file that also `require`s `electron` at
load time, which makes the whole file unloadable outside a running Electron
process. Moving it to a dependency-free file makes it directly testable.

- [ ] **Step 1: Write the failing test**

Create `lib/browser-select.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBrowserChoice } = require('./browser-select');

test('resolveBrowserChoice returns the explicitly requested browser when available', () => {
  const available = [
    { id: 'chrome', name: 'Chrome', path: 'C:\\chrome.exe' },
    { id: 'edge', name: 'Edge', path: 'C:\\edge.exe' }
  ];
  const result = resolveBrowserChoice('edge', available);
  assert.deepEqual(result, { id: 'edge', name: 'Edge', path: 'C:\\edge.exe' });
});

test('resolveBrowserChoice falls back to preference order when the requested browser is unavailable', () => {
  const available = [
    { id: 'chrome', name: 'Chrome', path: 'C:\\chrome.exe' },
    { id: 'edge', name: 'Edge', path: 'C:\\edge.exe' }
  ];
  const result = resolveBrowserChoice('brave', available);
  assert.deepEqual(result, { id: 'chrome', name: 'Chrome', path: 'C:\\chrome.exe' });
});

test('resolveBrowserChoice prefers brave over chrome and edge when no browserId is given', () => {
  const available = [
    { id: 'edge', name: 'Edge', path: 'C:\\edge.exe' },
    { id: 'brave', name: 'Brave', path: 'C:\\brave.exe' },
    { id: 'chrome', name: 'Chrome', path: 'C:\\chrome.exe' }
  ];
  const result = resolveBrowserChoice(null, available);
  assert.deepEqual(result, { id: 'brave', name: 'Brave', path: 'C:\\brave.exe' });
});

test('resolveBrowserChoice returns null when no browsers are available', () => {
  const result = resolveBrowserChoice(null, []);
  assert.equal(result, null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test lib/browser-select.test.js`
Expected: FAIL — `Cannot find module './browser-select'`.

- [ ] **Step 3: Create `lib/browser-select.js`**

```javascript
const PREFERENCE_ORDER = ['brave', 'chrome', 'edge'];

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

module.exports = { PREFERENCE_ORDER, resolveBrowserChoice };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test lib/browser-select.test.js`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/browser-select.js lib/browser-select.test.js
git commit -m "test: extract resolveBrowserChoice into lib/browser-select.js"
```

---

### Task 3: Wire `browsers.js` to use `lib/browser-select.js`

**Files:**
- Modify: `browsers.js` (entire file)
- Modify: `package.json:39-57` (`build.files`)

**Interfaces:**
- Consumes: `resolveBrowserChoice` from `lib/browser-select.js` (Task 2).
- Produces: `browsers.js`'s public exports (`getAvailableBrowsers`,
  `resolveBrowserChoice`, `launchService`) stay identical — `main.js` and
  `settings/preferences.js` (via IPC) need no changes.

- [ ] **Step 1: Rewrite `browsers.js`**

Replace the entire file with:

```javascript
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');
const { resolveBrowserChoice } = require('./lib/browser-select');

const BROWSERS = [
  { id: 'brave', name: 'Brave', exe: 'brave.exe' },
  { id: 'chrome', name: 'Chrome', exe: 'chrome.exe' },
  { id: 'edge', name: 'Edge', exe: 'msedge.exe' }
];

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

module.exports = { getAvailableBrowsers, resolveBrowserChoice, launchService };
```

- [ ] **Step 2: Update `package.json`'s `build.files` list**

In `package.json`, change the `"files"` array under `"build"` to add
`lib/browser-select.js` right after `"browsers.js"`:

```json
    "files": [
      "main.js",
      "config.js",
      "windows.js",
      "browsers.js",
      "lib/browser-select.js",
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

- [ ] **Step 3: Verify nothing broke**

Run: `node --test` (all lib tests still pass)
Run: `npm run lint` (no new errors)
Run: `npm start`, then:
1. Open the popup, click a service card — confirm it launches in your configured
   browser exactly as before.
2. Open Settings → Preferences, confirm the browser dropdown still lists your
   installed browsers and the selection still saves.

Expected: identical behavior to before this task.

- [ ] **Step 4: Commit**

```bash
git add browsers.js package.json
git commit -m "refactor: wire browsers.js to lib/browser-select.js"
```

---

### Task 4: Extract `lib/config-shape.js` with tests

**Files:**
- Create: `lib/config-shape.js`
- Create: `lib/config-shape.test.js`

**Interfaces:**
- Produces: `module.exports = { DEFAULT_SERVICES, DEFAULT_PROFILES, defaultConfig,
  mergeWithDefaults }`.
  - `defaultConfig()` returns `{ services: {...DEFAULT_SERVICES}, appProfiles:
    {...DEFAULT_PROFILES}, mappings: {}, settings: { launchOnStartup: false,
    browserId: null } }`.
  - `mergeWithDefaults(data)` returns `defaultConfig()` when `data` is falsy;
    otherwise fills in `data.appProfiles` from `DEFAULT_PROFILES` if missing,
    then returns `{ ...defaultConfig(), ...data }` (a shallow merge — matches
    `config.js`'s existing behavior exactly, including that a partial
    `data.settings` replaces the default `settings` object wholesale rather than
    being deep-merged with it).
  - Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `lib/config-shape.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SERVICES, DEFAULT_PROFILES, defaultConfig, mergeWithDefaults } = require('./config-shape');

test('defaultConfig returns the default services, profiles, empty mappings, and default settings', () => {
  const config = defaultConfig();
  assert.deepEqual(config.services, DEFAULT_SERVICES);
  assert.deepEqual(config.appProfiles, DEFAULT_PROFILES);
  assert.deepEqual(config.mappings, {});
  assert.deepEqual(config.settings, { launchOnStartup: false, browserId: null });
});

test('mergeWithDefaults returns the default config when given no data', () => {
  const config = mergeWithDefaults(null);
  assert.deepEqual(config, defaultConfig());
});

test('mergeWithDefaults preserves data read from disk over the defaults', () => {
  const data = {
    services: { Custom: { url: 'https://example.com', color: '#000000' } },
    appProfiles: { default: 'Main Profile' },
    mappings: { Custom: ['default'] },
    settings: { launchOnStartup: true }
  };
  const config = mergeWithDefaults(data);
  assert.deepEqual(config.services, data.services);
  assert.deepEqual(config.mappings, data.mappings);
  // Matches existing shallow-merge behavior: a partial settings object from
  // disk replaces the default settings object entirely, it isn't deep-merged.
  assert.deepEqual(config.settings, { launchOnStartup: true });
});

test('mergeWithDefaults fills in default appProfiles when missing from disk data', () => {
  const data = { services: {}, mappings: {} };
  const config = mergeWithDefaults(data);
  assert.deepEqual(config.appProfiles, DEFAULT_PROFILES);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test lib/config-shape.test.js`
Expected: FAIL — `Cannot find module './config-shape'`.

- [ ] **Step 3: Create `lib/config-shape.js`**

```javascript
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

function defaultConfig() {
  return {
    services: { ...DEFAULT_SERVICES },
    appProfiles: { ...DEFAULT_PROFILES },
    mappings: {},
    settings: { launchOnStartup: false, browserId: null }
  };
}

function mergeWithDefaults(data) {
  if (!data) {
    return defaultConfig();
  }

  if (!data.appProfiles) {
    data.appProfiles = { ...DEFAULT_PROFILES };
  }

  return { ...defaultConfig(), ...data };
}

module.exports = { DEFAULT_SERVICES, DEFAULT_PROFILES, defaultConfig, mergeWithDefaults };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test lib/config-shape.test.js`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/config-shape.js lib/config-shape.test.js
git commit -m "test: extract config defaults/merge logic into lib/config-shape.js"
```

---

### Task 5: Wire `config.js` to use `lib/config-shape.js` and expose default IDs

**Files:**
- Modify: `config.js` (entire file)
- Modify: `package.json:39-58` (`build.files`)

**Interfaces:**
- Consumes: `DEFAULT_SERVICES`, `DEFAULT_PROFILES`, `defaultConfig`,
  `mergeWithDefaults` from `lib/config-shape.js` (Task 4).
- Produces: `loadConfig()`'s return value gains two new fields —
  `defaultServiceIds: string[]` and `defaultProfileIds: string[]` — read by
  `settings/services.js` and `settings/profiles.js` in Task 7. All other exports
  (`configPath`, `loadConfig`, `saveConfig`, `setStartup`) keep the same shape.

- [ ] **Step 1: Rewrite `config.js`**

Replace the entire file with:

```javascript
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { DEFAULT_SERVICES, DEFAULT_PROFILES, defaultConfig, mergeWithDefaults } = require('./lib/config-shape');

const appDir = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const configPath = path.join(appDir, 'config.json');

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
  let config;

  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config = mergeWithDefaults(data);
    } catch (e) {
      console.error('Error reading config file:', e);
      config = defaultConfig();
    }
  } else {
    config = defaultConfig();
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing default config file:', e);
    }
  }

  config.settings.launchOnStartup = getStartupStatus();
  config.defaultServiceIds = Object.keys(DEFAULT_SERVICES);
  config.defaultProfileIds = Object.keys(DEFAULT_PROFILES);
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

Note: this rewrite preserves the original's exact fallback behavior on a JSON
parse error — `config` falls back to `defaultConfig()` (equivalent to the
original's untouched initial default object) rather than any partial/corrupt
data.

- [ ] **Step 2: Update `package.json`'s `build.files` list**

Add `lib/config-shape.js` right after `lib/browser-select.js`:

```json
    "files": [
      "main.js",
      "config.js",
      "windows.js",
      "browsers.js",
      "lib/browser-select.js",
      "lib/config-shape.js",
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

- [ ] **Step 3: Verify nothing broke**

Run: `node --test` (all lib tests still pass)
Run: `npm run lint` (no new errors)
Run: `npm start`, then:
1. Popup opens and shows your existing configured services/profiles (proves
   `loadConfig()` still reads `config.json` correctly).
2. Open Settings, confirm all four tabs still show your existing data.
3. Toggle "Launch on startup", confirm it saves and the registry key changes
   (`reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v LLMSwitcher`).
4. Close and reopen the app, confirm settings persisted.

Expected: identical behavior to before this task.

- [ ] **Step 4: Commit**

```bash
git add config.js package.json
git commit -m "refactor: wire config.js to lib/config-shape.js, expose default IDs"
```

---

### Task 6: Migrate `renderer.js` to an ES module

**Files:**
- Modify: `renderer.js` (entire file — syntax only, no logic changes)
- Modify: `index.html:24`

**Interfaces:**
- No exports needed — `renderer.js` is self-contained and has no other renderer
  file depending on it. This task exists to validate that `<script type="module">`
  works correctly in this Electron version before the larger settings migration
  in Task 7.

- [ ] **Step 1: Change `index.html`'s script tag**

In `index.html`, change line 24 from:

```html
  <script src="renderer.js"></script>
```

to:

```html
  <script type="module" src="renderer.js"></script>
```

- [ ] **Step 2: Re-save `renderer.js` as a module**

`renderer.js`'s content needs no logic changes — it has no cross-file
dependencies today. Confirm the file still reads exactly as follows (no edit
needed if it already matches; this step exists to make explicit that the file is
now parsed as an ES module, which is stricter about top-level `this`/duplicate
declarations, neither of which this file has):

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
      await window.api.launchService(card.profileDir, card.url);
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

- [ ] **Step 3: Verify the popup still works as a module script**

Run: `npm start`, then:
1. Click the tray icon — popup opens and shows your configured services.
2. Type in the search box — results filter live.
3. Click a service card — it launches and the popup closes.
4. Press Escape with the search box empty — popup closes. Press Escape with text
   in the search box — search clears instead of closing.
5. Click "⚙ Settings" — Settings window opens.

Expected: identical behavior to before this task. If the popup fails to load
(blank window, DevTools console shows a module-loading error), open the popup's
DevTools (`Ctrl+Shift+I` while it's focused, or temporarily add
`popupWindow.webContents.openDevTools()` in `windows.js`) to diagnose before
proceeding to Task 7 — this would indicate `type="module"` needs a different
loading strategy in this Electron version.

- [ ] **Step 4: Commit**

```bash
git add renderer.js index.html
git commit -m "refactor: migrate renderer.js to an ES module"
```

---

### Task 7: Migrate settings renderer scripts to ES modules

**Files:**
- Modify: `settings/store.js` (entire file)
- Modify: `settings/mappings.js` (entire file)
- Modify: `settings/services.js` (entire file)
- Modify: `settings/profiles.js` (entire file)
- Modify: `settings/preferences.js` (entire file)
- Modify: `settings_renderer.js` (entire file)
- Modify: `settings.html:186-191`

**Interfaces:**
- Produces (`settings/store.js`): `export let config`, `export let profiles`
  (live bindings — ES modules propagate reassignment of an exported `let` to
  every importer automatically, so mutating `config.services[...]` or
  reassigning `config = await window.api.getConfig()` inside `store.js` is
  visible to every module that imported `config`, exactly like the shared
  global worked before); `export function onConfigLoaded(callback)` registers a
  callback to run after every `loadData()`; `export async function loadData()`;
  `export async function saveChanges()`.
- Consumes (each tab file): `config`, `profiles`, `saveChanges`,
  `onConfigLoaded`, `loadData` from `./store.js` as needed — each tab module
  calls `onConfigLoaded(renderX)` once at its own top level to register itself,
  instead of `store.js` calling `renderMappings()`/`renderServices()`/
  `renderProfiles()`/`renderPreferences()` by name (which would require
  `store.js` to import the tab files, creating a circular import since the tab
  files also import from `store.js`).
- Produces (each tab file): `export function renderMappings()`,
  `export function renderServices()`, `export function renderProfiles()`,
  `export function renderPreferences()` respectively.
- `settings/services.js` and `settings/profiles.js` read `config.defaultServiceIds`
  / `config.defaultProfileIds` (added to `config.js`'s response in Task 5)
  instead of local hardcoded `DEFAULT_SERVICE_IDS`/`DEFAULT_PROFILE_IDS` arrays.

This is one task, not six, because the pieces can't be verified independently —
a module can't be consumed by a classic `<script>`, so `store.js` and every tab
file must convert together with `settings.html`'s script tags before the
Settings window works again.

- [ ] **Step 1: Rewrite `settings/store.js`**

```javascript
export let config = null;
export let profiles = null;

const saveStatusText = document.getElementById('save-status-text');
const statusDot = document.querySelector('.status-indicator-dot');
const configListeners = [];

export function onConfigLoaded(callback) {
  configListeners.push(callback);
}

export async function loadData() {
  config = await window.api.getConfig();
  profiles = config.appProfiles || {};
  configListeners.forEach(callback => callback());
}

export async function saveChanges() {
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

- [ ] **Step 2: Rewrite `settings/mappings.js`**

```javascript
import { config, profiles, saveChanges, onConfigLoaded } from './store.js';

const mappingsListContainer = document.getElementById('mappings-list-container');

export function renderMappings() {
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

onConfigLoaded(renderMappings);
```

- [ ] **Step 3: Rewrite `settings/services.js`**

```javascript
import { config, saveChanges, loadData, onConfigLoaded } from './store.js';

let selectedServiceId = null;

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

export function renderServices() {
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

  if (!config.defaultServiceIds.includes(svcId)) {
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

onConfigLoaded(renderServices);
```

- [ ] **Step 4: Rewrite `settings/profiles.js`**

```javascript
import { config, profiles, saveChanges, loadData, onConfigLoaded } from './store.js';

let selectedProfileId = null;

const profilesListContainer = document.getElementById('profiles-list-container');
const profileForm = document.getElementById('profile-form');
const profileFormTitle = document.getElementById('profile-form-title');
const editProfileId = document.getElementById('edit-profile-id');
const profileIdInput = document.getElementById('profile-id');
const profileNameInput = document.getElementById('profile-name');
const btnCancelProfile = document.getElementById('btn-cancel-profile');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnDeleteProfile = document.getElementById('btn-delete-profile');

export function renderProfiles() {
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

  if (!config.defaultProfileIds.includes(profId)) {
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

onConfigLoaded(renderProfiles);
```

- [ ] **Step 5: Rewrite `settings/preferences.js`**

```javascript
import { config, saveChanges, onConfigLoaded } from './store.js';

const startupToggle = document.getElementById('startup-toggle');
const configFilePath = document.getElementById('config-file-path');
const browserSelect = document.getElementById('browser-select');

export async function renderPreferences() {
  if (!config) return;

  startupToggle.checked = config.settings.launchOnStartup || false;
  configFilePath.textContent = config.configPath || 'Unknown';

  const availableBrowsers = await window.api.getAvailableBrowsers();
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

onConfigLoaded(renderPreferences);
```

- [ ] **Step 6: Rewrite `settings_renderer.js`**

```javascript
import { loadData } from './store.js';
import './mappings.js';
import './services.js';
import './profiles.js';
import './preferences.js';

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

Note: `settings_renderer.js` imports the four tab files only for their
side effects (DOM event wiring and `onConfigLoaded` self-registration) — none of
their exports are used directly here, which is why those four imports have no
`{ ... }` clause.

- [ ] **Step 7: Update `settings.html`'s script tags**

In `settings.html`, replace the six script tags (currently lines 186-191) with a
single module entry point:

```html
  <script type="module" src="settings_renderer.js"></script>
```

- [ ] **Step 8: Verify every tab still works**

Run: `npm run lint` (no new errors)
Run: `npm start`, open Settings (tray → right-click → Settings), then for each tab:
1. **Mappings** — existing service→profile mappings render; add a profile to a
   service via the dropdown, confirm it saves ("All changes saved") and appears
   as a tag; remove it with the × button.
2. **Manage Services** — click an existing default service (e.g. "ChatGPT"),
   confirm the edit form populates and the Delete button is hidden (protected,
   via `config.defaultServiceIds`); click a custom service if you have one and
   confirm Delete is visible; change a color and save; confirm "Add New Service"
   resets the form.
3. **Manage Profiles** — same check: select a default profile ("default" or
   "work") and confirm Delete is hidden; select/add/edit a custom profile and
   confirm Delete is visible; save; add-new-resets-form.
4. **Preferences** — toggle "Launch on startup" and confirm the registry key
   changes; change the browser selection and confirm it saves; confirm the
   config path shown matches the real `config.json` location.
5. Close Settings, reopen the popup, confirm it still shows the correct
   mappings (proves `config-reloaded` still fires correctly end-to-end).

Expected: identical behavior to before this task, plus default-service/profile
protection now driven by `config.defaultServiceIds`/`config.defaultProfileIds`
instead of the old hardcoded arrays.

- [ ] **Step 9: Commit**

```bash
git add settings/store.js settings/mappings.js settings/services.js settings/profiles.js settings/preferences.js settings_renderer.js settings.html
git commit -m "refactor: migrate settings renderer to ES modules, dedupe default IDs"
```

---

## Post-Plan Notes

- `config.json` git-tracking, the stale README, and the orphaned
  `.claude/worktrees/revamp` directory remain open items from a deferred repo
  hygiene pass — not addressed here per the design's Non-Goals.
- This plan intentionally stops short of an Electron-level integration test
  harness; `lib/browser-select.js` and `lib/config-shape.js` are the only
  automated coverage added. Everything else keeps relying on the manual
  `npm start` verification convention already used throughout this project.
