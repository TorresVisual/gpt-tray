let config = null;
let profiles = null;

const saveStatusText = document.getElementById('save-status-text');
const statusDot = document.querySelector('.status-indicator-dot');

async function loadData() {
  config = await window.api.getConfig();
  profiles = config.appProfiles || {};

  renderMappings();
  renderServices();
  renderProfiles();
  renderPreferences();
}

async function saveChanges() {
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
