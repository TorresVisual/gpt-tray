# LLM Switcher

A standalone Windows system tray application that manages isolated workspaces for all your AI/LLM services in one click.

![tray icon](https://img.shields.io/badge/platform-Windows-blue) ![node](https://img.shields.io/badge/node.js-v22%2B-green) ![electron](https://img.shields.io/badge/electron-v30%2B-blue)

## What it does

Left-click the tray icon to open a beautiful, glassmorphic popup switcher. Each card represents a service and an isolated workspace (Profile). Click a card to instantly launch that service in a dedicated native window. 

**No Chrome Required:**
Unlike previous versions, LLM Switcher no longer relies on external browsers. It acts as its own workspace, giving you completely isolated login sessions (Profiles) that keep your work, personal, and alternate accounts flawlessly separated without cluttering your main browser.

Supports predefined links for: **ChatGPT**, **Claude**, **Gemini**, **Perplexity**, **GitHub Copilot**, **Grok**, **WolframAlpha** — plus unlimited custom services.

## Setup & Development

**1. Install dependencies**

```bash
npm install
```

**2. Run the app**

```bash
npm start
```

On first run, the Settings dashboard will automatically open so you can configure your first workspaces.

## Usage

| Action | Result |
|---|---|
| Left-click tray icon | Open/close the switcher popup |
| Click a service card | Launch the service in an isolated app window |
| Right-click tray icon | Open context menu (Settings / Exit) |
| Click ⚙ Settings in popup | Open the global Settings dashboard |
| Esc or outside click | Close the popup panel |

## Managing Configuration

All configuration happens directly within the native Settings UI:
- **Profile Mappings:** Map specific profiles to services.
- **Manage Services:** Add custom endpoints or update brand colors.
- **Manage Profiles:** Create and delete isolated cookie/login sessions.
- **Preferences:** Toggle automatic startup on Windows boot.

Your settings are safely stored in `config.json` next to the executable.

## Build Executable

To compile a standalone portable `.exe`:

```bash
npm run dist
```

Output: `dist/LLM Switcher-win32-x64/LLM Switcher.exe` — a portable Electron application. 
