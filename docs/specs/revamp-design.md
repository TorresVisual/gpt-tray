# LLM Switcher Revamp — Design

## Goal

Fix real performance problems, clean up the code so future work is easy, and refresh
the popup's visual style — without changing the app's core behavior (tray icon,
isolated per-profile sessions, config.json format).

Explicitly out of scope this round: new features (hotkeys, notification badges, etc.)
— revisit after this revamp lands.

## Problem

- **Performance / scroll lag:** `launch-service` in `main.js` creates a brand new
  `BrowserWindow` on every click with no tracking of what's already open. Clicking
  the same service/profile repeatedly stacks up multiple full Chromium renderers,
  all sharing Electron's single GPU process — this is what causes the reported
  "laggy scroll in ChatGPT" (background windows contending for the same GPU/compositor)
  and makes repeat launches slow (full reload instead of refocus).
- **Code architecture:** `main.js` (284 lines) and `settings_renderer.js` (438 lines)
  are each single-file monoliths mixing unrelated concerns (config I/O, window
  management, registry helpers, IPC wiring; and four independent settings tabs sharing
  global module state). This makes future changes riskier and harder to reason about.
- **Visual style:** current popup is a dark glassmorphic panel. Owner wants a
  Raycast-inspired refresh: flatter, search-first, faster-feeling.

## Phase 1 — Window & Performance Fix

Add a window registry to track already-open service windows and reuse them instead
of creating duplicates.

- A `Map` keyed by `partitionId` (i.e. the profile dir — one isolated session should
  only ever have one window open).
- `launch-service` handler:
  - If a live (non-destroyed) window exists in the registry for that partition,
    call `.show()` + `.focus()` on it and return — no new window, no reload.
  - Otherwise create the `BrowserWindow` as today, store it in the registry keyed
    by partition, and register a `closed` listener that deletes the registry entry.
- Set `backgroundColor` on new service windows (use the service's brand color) so
  there's no white flash while the page loads. Cheap, low-risk, touching this code
  anyway.

No behavior change from the user's perspective other than: clicking an already-open
service refocuses it instantly instead of duplicating it. This directly removes the
multi-renderer GPU contention causing the scroll lag, and makes repeat launches fast.

## Phase 2 — Code Architecture Cleanup

Pure restructuring, no behavior change. Splits large files along their existing
natural seams.

**`main.js` (284 lines) →**
- `config.js` — `loadConfig`/`saveConfig`, `DEFAULT_SERVICES`/`DEFAULT_PROFILES`,
  registry helpers (`getStartupStatus`/`setStartup`)
- `windows.js` — popup window, settings window, service window creation + the
  Phase 1 registry
- `main.js` — thin bootstrap only: tray, context menu, app lifecycle, IPC wiring

**`settings_renderer.js` (438 lines) →** one module per tab, since the four tabs
(Mappings / Services / Profiles / Preferences) only share `config` state and
`saveChanges`, not logic:
- `settings/store.js` — shared `config`/`profiles` state, `loadData`, `saveChanges`
- `settings/mappings.js`, `settings/services.js`, `settings/profiles.js`,
  `settings/preferences.js` — one per tab, each rendering + wiring its own DOM
- `settings_renderer.js` — imports the above, wires tab navigation only

`renderer.js` (128 lines) and `preload.js` (10 lines) stay as-is — already small
and single-purpose.

`package.json`'s `build.files` list and `index.html`/`settings.html` script tags
need updating to reference the new module files.

## Phase 3 — Visual Refresh (Popup Only)

Owner explored three initial directions (Refined Glass, Bold Color, Minimal Dense
List) and two Control-Center-inspired variants — none landed. Settled on a
Raycast-inspired direction:

- **Flat panel**, no backdrop blur — solid dark background (`#1c1c1e`-ish), single
  1px border, no glass/blur effect.
- **Search bar as the primary focal element** at the top — full-width, borderless,
  sits directly under the top edge (not a separately-boxed input).
- **Icon badges**: small solid-color rounded-square badge per card (like an app
  icon) instead of the current left-border color stripe.
- **Row styling**: compact list rows, service name + profile name inline
  (`ChatGPT` · `ChatGPT 1`), not stacked as two lines.
- **Selected/hovered row**: soft highlight using the existing indigo accent
  (`#4f46e5` at low opacity) — not a lift/shadow animation.
- **Footer bar**: thin bar at the bottom with `⚙ Settings` and `esc Close` hints,
  replacing the current header icon buttons.

Settings window (`settings.html`/`settings.css`) is a forms dashboard, not a
launcher — the Raycast treatment doesn't apply there. It gets only a light
consistency pass (matching accent color/fonts to the refreshed popup), not a
structural redesign.

This phase touches `index.html`, `index.css`, and `renderer.js` (row markup
changes to match new structure); `settings.css` gets minor variable tweaks only.

## Testing Approach

No automated test suite exists for this Electron app today, and this revamp
doesn't add one — verification is manual, via `npm start`:

- Phase 1: open the same service/profile from the popup multiple times, confirm
  only one window ever exists (check Task Manager renderer count / window focus
  behavior) and that scrolling inside a chat feels smooth with 2+ services open.
- Phase 2: app behaves identically to before the split — popup, settings, launch,
  save/load config all still work. This is a refactor; the bar is "nothing changed."
- Phase 3: visual review against the approved mockup direction, then iterate live
  based on owner feedback (explicitly deferred rather than nailed down upfront).

## Non-Goals

- New features (global hotkey, search/filter, notification badges) — owner
  explicitly deferred these to a later round.
- Settings window structural redesign.
- Automated test infrastructure.
