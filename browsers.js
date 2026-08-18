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
    } catch {
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
