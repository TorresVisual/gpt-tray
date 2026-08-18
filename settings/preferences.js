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
  availableBrowsers.forEach((browser) => {
    const option = document.createElement('option');
    option.value = browser.id;
    option.textContent = browser.name;
    browserSelect.appendChild(option);
  });

  const hasCurrentChoice = availableBrowsers.some((b) => b.id === config.settings.browserId);
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
