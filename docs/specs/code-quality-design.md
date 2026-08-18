# LLM Switcher Code Quality Pass — Design

## Goal

Improve code structure and developer-facing quality without changing app behavior:
single-source the "default IDs" lists that have drifted into duplication, make the
core decision logic unit-testable, add a lightweight test suite, add lint/format
tooling, and migrate renderer scripts from classic `<script>`-tag globals to
explicit ES modules.

Explicitly out of scope this round (deferred, not rejected): stopping git tracking
of `config.json`, refreshing the stale README, and cleaning up the orphaned
`.claude/worktrees/revamp` directory / local `build/`/`dist/` clutter.

## Problem

- **Duplicated defaults:** `config.js` defines `DEFAULT_SERVICES`/`DEFAULT_PROFILES`
  as the source of truth, but `settings/services.js` and `settings/profiles.js`
  each hardcode their own `DEFAULT_SERVICE_IDS`/`DEFAULT_PROFILE_IDS` arrays to
  decide which entries are protected from deletion. These can silently drift out
  of sync.
- **Untestable core logic:** `config.js` and `browsers.js` both call
  `require('electron')` at module load. That throws immediately outside a running
  Electron process, so neither file can be exercised by a plain Node test runner
  today — there is no automated test coverage anywhere in the app.
- **No lint/format tooling:** nothing catches style drift or common bugs
  automatically; no `.eslintrc`/Prettier config exists.
- **Renderer globals via script-tag order:** `renderer.js` and every file under
  `settings/` are classic (non-module) scripts that share state through implicit
  global scope and rely on `<script>` tag order in `index.html`/`settings.html`.
  This works but is fragile to extend and obscures actual dependencies between
  files.

## Approach

Pull the pure decision logic (browser-selection preference order, config
defaults + merge logic) out of `config.js`/`browsers.js` into a new `lib/`
directory with zero Electron/Node-native dependencies. `config.js` and
`browsers.js` become thin wrappers: they keep all the Electron-specific I/O
(registry reads via `execSync`, `fs` calls, `spawn`/`BrowserWindow`) and delegate
shape/selection decisions to `lib/`.

This solves two problems at once:
- `lib/` becomes the single source of truth for default IDs, which `loadConfig()`
  can expose over the existing `get-config` IPC channel for the renderer to
  consume instead of hardcoding its own copies.
- `lib/` has no Electron dependency, so it's directly testable with Node's
  built-in test runner — no new test framework dependency needed.

## Components

- **`lib/browser-select.js`** (new) — `resolveBrowserChoice(browserId,
  availableBrowsers)`, moved verbatim from `browsers.js`. Already pure and
  stateless; just relocated.
- **`lib/config-shape.js`** (new) — `DEFAULT_SERVICES`, `DEFAULT_PROFILES`, and a
  new `mergeWithDefaults(data)` function extracted from `config.js`'s
  `loadConfig()` (the "fill in missing `appProfiles`, spread defaults onto raw
  disk data" logic). Pure, no `fs`/`electron`.
- **`config.js`** — keeps `loadConfig`/`saveConfig`/`setStartup` (the Electron/fs/
  registry I/O), delegates shape logic to `lib/config-shape.js`. `loadConfig()`'s
  return value gains two new fields: `defaultServiceIds: Object.keys(DEFAULT_SERVICES)`
  and `defaultProfileIds: Object.keys(DEFAULT_PROFILES)`.
- **`browsers.js`** — keeps `getAvailableBrowsers`/`launchService` (registry/spawn
  I/O), delegates selection logic to `lib/browser-select.js`.
- **`settings/services.js`, `settings/profiles.js`** — drop their local hardcoded
  `DEFAULT_SERVICE_IDS`/`DEFAULT_PROFILE_IDS` arrays; read
  `config.defaultServiceIds`/`config.defaultProfileIds` from the shared store
  instead.
- **Renderer scripts** (`renderer.js`, `settings_renderer.js`, all of
  `settings/*.js`) — converted to ES modules with explicit `import`/`export`,
  loaded via `<script type="module">` in `index.html`/`settings.html`.
  `settings/store.js` exports `config`/`profiles` accessors plus `saveChanges`/
  `loadData`; each tab module imports what it needs instead of relying on global
  scope populated by script-tag load order.
- **Test suite** — `node --test` (Node's built-in runner, zero new runtime
  dependency) covering `lib/browser-select.js` and `lib/config-shape.js`.
  `package.json` gains a `"test": "node --test"` script.
- **Lint/format** — `eslint.config.js` (flat config) with two blocks: Node/
  CommonJS globals for `main.js`/`config.js`/`windows.js`/`browsers.js`/`lib/*`,
  browser/ESM globals for `renderer.js`/`settings/*.js`. Prettier for formatting.
  `package.json` gains `"lint"` and `"format"` scripts.

## Data Flow & Error Handling

No IPC channel contracts change shape except `get-config`'s response gaining two
new read-only array fields (`defaultServiceIds`, `defaultProfileIds`). No change
to `config.json`'s on-disk format. The `resolveBrowserChoice`/`mergeWithDefaults`
extraction is a pure relocation — same logic, same behavior. Error handling
(try/catch around registry/fs/spawn calls) stays entirely in the Electron-facing
wrapper files, since that's where the actual I/O risk lives; the extracted pure
functions in `lib/` have nothing to fail on and need no error handling of their
own.

Because ES-module imports across `file://`-loaded renderer pages can occasionally
hit Electron-version-specific quirks, the implementation plan converts
`renderer.js` first in isolation and verifies the popup still loads before
converting the four `settings/*.js` tab files — cheap early validation of the
riskiest part of this design.

## Testing Approach

`node --test` covers the two new `lib/` modules directly (pure functions, no
mocking needed): `resolveBrowserChoice`'s preference-order and explicit-choice
behavior, and `mergeWithDefaults`'s defaults-filling behavior on various partial
inputs. Everything else — window management, IPC wiring, the renderer UI itself —
stays manually verified via `npm start`, consistent with the existing project
convention. This pass does not add an Electron-level integration test harness;
that remains out of scope.

## Non-Goals

- Untracking `config.json` from git, refreshing the README, or removing the
  orphaned worktree/build clutter — deferred to a future hygiene pass.
- Any change to `config.json`'s shape, IPC channel names, or app-visible behavior.
- Adding a bundler or TypeScript — ES modules are used as-is via native browser
  support in Electron's renderer, no build step introduced.
- Broader Electron integration/E2E test coverage beyond the two new `lib/`
  modules.
