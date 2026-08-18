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
