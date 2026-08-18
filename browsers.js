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
