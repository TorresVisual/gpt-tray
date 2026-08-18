const startupToggle = document.getElementById('startup-toggle');
const configFilePath = document.getElementById('config-file-path');

function renderPreferences() {
  if (!config) return;

  startupToggle.checked = config.settings.launchOnStartup || false;
  configFilePath.textContent = config.configPath || 'Unknown';
}

startupToggle.addEventListener('change', (e) => {
  config.settings.launchOnStartup = e.target.checked;
  saveChanges();
});
