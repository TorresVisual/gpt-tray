# External Browser Launch — Design

## Goal

Replace embedded-Chromium (`BrowserWindow`) service windows with launching the
user's actual installed browser (Chrome, Edge, or Brave) in app mode, keeping
the same per-profile isolation guarantee via a dedicated, app-owned
`--user-data-dir`.

## Motivation

Investigation into persistent scroll lag in service windows (see
`docs/specs/revamp-design.md`'s "Known Limitation" section) found: GPU
compositing was confirmed active, a real Windows renderer-priority bug was
found and fixed, Electron was upgraded from 30.5.1 to 43.4.0 — and scroll lag
persisted through all of it, even on a brand-new empty ChatGPT conversation.
Meanwhile, Brave (a fully up-to-date, independently-maintained browser)
renders the identical site smoothly on the identical hardware. Rather than
continue chasing Electron/Chromium-embedding-specific quirks, this replaces
the embedded engine with the browser already proven to work well.

## Scope

Replaces `launchService` in `windows.js`. Does not change the popup or
settings windows (they stay Electron `BrowserWindow`s — they're lightweight
custom UI, not the problem). Does not change `config.json`'s `services`,
`appProfiles`, or `mappings` shape.

## Browser Detection

Scoped to Chromium-family browsers (only these support `--app=` mode):
Chrome, Edge, Brave. Detected via the Windows registry `App Paths` key,
consistent with the existing `reg query` pattern already used for the
startup-on-boot toggle (`config.js`'s `getStartupStatus`):

```
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\brave.exe
```

Each key's default value is the full path to the executable. A browser is
"available" if its key exists and `fs.existsSync()` confirms the path is
real. Detection runs on demand (when Settings' Preferences tab loads, and
once at app startup to validate the configured choice still exists) — not
cached indefinitely, since a browser could be installed/removed between runs.

## Service Launch

New `browsers.js` module replaces the `BrowserWindow`-creation part of
`windows.js`'s `launchService`:

```javascript
function launchService(profileDir, url, browserPath) {
  const userDataDir = path.join(app.getPath('userData'), 'browser-profiles');
  const args = [
    `--app=${url}`,
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileDir}`,
  ];
  spawn(browserPath, args, { detached: true, stdio: 'ignore' }).unref();
}
```

- `userDataDir` is a folder under this app's own userData
  (`%APPDATA%\llm-switcher\browser-profiles\`) — entirely separate from the
  user's real Chrome/Brave/Edge profiles. `--profile-directory=<profileDir>`
  (e.g. `chatgpt 1`) creates/reuses a subfolder there per profile, giving the
  same "isolated cookie jar per profile" guarantee the app has today.
- `detached: true` + `.unref()` so the spawned browser process's lifetime is
  independent of the Electron app (matches today's behavior: closing the
  Electron tray app doesn't close already-open service windows).
- Repeat launches of the same profile+URL rely on Chrome-family browsers'
  existing per-profile single-instance behavior to focus the already-open
  window rather than opening a duplicate — this needs empirical verification
  during implementation (test: launch same profile twice, confirm one window).
  If it doesn't reliably focus, the fallback is accepting a second window
  opens (no worse than the pre-Task-1 behavior) rather than adding OS-level
  window-focusing complexity for a v1.
- **Existing logins do not carry over.** Electron's session-partition cookie
  storage and a real browser's profile storage are different, incompatible
  formats; there is no practical migration path. Users re-log into each
  service once after switching. (Confirmed acceptable — see brainstorming
  conversation.)

### No supported browser installed

Fall back to `shell.openExternal(url)` — opens in the system default browser
with no app-mode chrome and no isolation (best effort), rather than failing
the launch outright.

## Settings: Browser Choice

New "Browser" control in the Preferences tab (`settings/preferences.js`),
populated via a new `get-available-browsers` IPC call returning
`[{ id: 'chrome'|'edge'|'brave', name: string, path: string }]` for whichever
are detected. Selection is stored in `config.json`'s existing `settings`
object as `settings.browserId`. If the previously-chosen browser is no longer
detected at startup (uninstalled), fall back to the first available one and
surface that change the next time Settings opens.

If **no** browser is chosen yet (first run) and exactly one is detected,
auto-select it. If multiple are detected and none chosen, default to Brave >
Chrome > Edge (in that order) rather than blocking on user input — this can
be changed anytime in Preferences.

## File Structure

**New:**
- `browsers.js` — registry-based detection (`getAvailableBrowsers()`) +
  `launchService(profileDir, url, browserPath)` (spawn logic)

**Modified:**
- `windows.js` — `launchService` removed (moves to `browsers.js`); popup/
  settings window management unchanged
- `main.js` — `launch-service` IPC handler delegates to `browsers.js`;
  new `get-available-browsers` IPC handler
- `preload.js` — expose `getAvailableBrowsers()`
- `config.js` — `settings.browserId` added to default config shape
- `settings/preferences.js` — browser picker dropdown, wired to the new IPC
  call and `config.settings.browserId`
- `settings.html` — add the picker's markup
- `package.json` `build.files` — add `browsers.js`

## Testing Approach

No automated test suite (unchanged project constraint) — manual verification
via `npm start`:
- Confirm each installed browser (whatever the owner actually has) is
  detected correctly and appears in the Preferences dropdown.
- Launch a service, confirm it opens in the chosen browser in app mode (no
  tabs/address bar) with a fresh, isolated profile (no existing cookies from
  the owner's real browser profile).
- Launch the same profile twice, confirm single-instance-per-profile focusing
  behavior (or document if it doesn't and a second window opens instead).
- Temporarily rename/hide a browser executable to test the "no supported
  browser" fallback path.
- Confirm scroll performance in the launched browser window matches the
  owner's already-confirmed-smooth Brave experience (this is the actual
  success criterion motivating this whole change).

## Non-Goals

- Migrating existing Electron-partition login sessions into the new browser
  profiles.
- Supporting non-Chromium browsers (Firefox, Safari) — no equivalent app-mode
  mechanism.
- Per-service browser choice (one browser choice applies to all services).
- OS-level window-focusing beyond what Chrome's own single-instance-per-profile
  behavior provides natively.
