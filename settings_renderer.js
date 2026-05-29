let config = null;
let profiles = null;
let selectedServiceId = null;
let selectedProfileId = null;

const DEFAULT_SERVICE_IDS = ["ChatGPT", "Claude", "Gemini", "Perplexity", "GitHub Copilot", "Grok", "WolframAlpha"];
const DEFAULT_PROFILE_IDS = ["default", "work"];

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const saveStatusText = document.getElementById('save-status-text');
const statusDot = document.querySelector('.status-indicator-dot');

const mappingsListContainer = document.getElementById('mappings-list-container');
const servicesListContainer = document.getElementById('services-list-container');
const profilesListContainer = document.getElementById('profiles-list-container');

// Service Form
const serviceForm = document.getElementById('service-form');
const formTitle = document.getElementById('form-title');
const editServiceId = document.getElementById('edit-service-id');
const serviceNameInput = document.getElementById('service-name');
const serviceUrlInput = document.getElementById('service-url');
const serviceColorInput = document.getElementById('service-color');
const serviceColorHexInput = document.getElementById('service-color-hex');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const btnSaveService = document.getElementById('btn-save-service');
const btnDeleteService = document.getElementById('btn-delete-service');

// Profile Form
const profileForm = document.getElementById('profile-form');
const profileFormTitle = document.getElementById('profile-form-title');
const editProfileId = document.getElementById('edit-profile-id');
const profileIdInput = document.getElementById('profile-id');
const profileNameInput = document.getElementById('profile-name');
const btnCancelProfile = document.getElementById('btn-cancel-profile');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnDeleteProfile = document.getElementById('btn-delete-profile');

// Preferences
const startupToggle = document.getElementById('startup-toggle');
const configFilePath = document.getElementById('config-file-path');

// ── Tab Navigation ───────────────────────────────────────────────────────────

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetTab = item.getAttribute('data-tab');
    
    navItems.forEach(nav => nav.classList.remove('active'));
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    item.classList.add('active');
    document.getElementById(targetTab).classList.add('active');
  });
});

// ── Data Sync ────────────────────────────────────────────────────────────────

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

// Color picker syncing
serviceColorInput.addEventListener('input', (e) => {
  serviceColorHexInput.value = e.target.value;
});
serviceColorHexInput.addEventListener('input', (e) => {
  if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
    serviceColorInput.value = e.target.value;
  }
});

// ── Mappings View ────────────────────────────────────────────────────────────

function renderMappings() {
  mappingsListContainer.innerHTML = '';
  const services = config.services || {};
  
  const serviceIds = Object.keys(services).sort();
  
  serviceIds.forEach(svcId => {
    const svc = services[svcId];
    const mappedDirs = config.mappings[svcId] || [];
    
    const row = document.createElement('div');
    row.className = 'mapping-row';
    
    const info = document.createElement('div');
    info.className = 'mapping-service-info';
    info.innerHTML = `
      <span class="color-dot" style="background-color: ${svc.color || '#4f46e5'}"></span>
      <span class="mapping-service-name">${svcId}</span>
    `;
    row.appendChild(info);
    
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'mapping-tags-container';
    
    // Filter out invalid mapped dirs that no longer exist in profiles
    const validMappedDirs = mappedDirs.filter(dir => profiles[dir]);
    if (validMappedDirs.length !== mappedDirs.length) {
      config.mappings[svcId] = validMappedDirs;
      // We will let a single save happen later or assume it cleans up over time
    }
    
    validMappedDirs.forEach(dir => {
      const displayLabel = profiles[dir];
      const tag = document.createElement('div');
      tag.className = 'profile-tag';
      tag.innerHTML = `
        <span>${displayLabel}</span>
        <span class="profile-tag-remove" data-dir="${dir}">×</span>
      `;
      
      tag.querySelector('.profile-tag-remove').addEventListener('click', () => {
        config.mappings[svcId] = validMappedDirs.filter(d => d !== dir);
        saveChanges();
        renderMappings();
      });
      
      tagsContainer.appendChild(tag);
    });
    
    const addWrapper = document.createElement('div');
    addWrapper.className = 'btn-add-profile-wrapper';
    
    const availableDirs = Object.keys(profiles).filter(dir => !validMappedDirs.includes(dir));
    
    if (availableDirs.length > 0) {
      addWrapper.innerHTML = `
        <button class="btn-add-profile">+ Add Profile</button>
        <select class="add-profile-select">
          <option value="" disabled selected>Add Profile...</option>
          ${availableDirs.map(dir => `<option value="${dir}">${profiles[dir]} (${dir})</option>`).join('')}
        </select>
      `;
      
      const select = addWrapper.querySelector('.add-profile-select');
      select.addEventListener('change', (e) => {
        const dir = e.target.value;
        if (dir) {
          if (!config.mappings[svcId]) config.mappings[svcId] = [];
          config.mappings[svcId].push(dir);
          saveChanges();
          renderMappings();
        }
      });
    } else {
      addWrapper.innerHTML = `
        <button class="btn-add-profile" style="opacity: 0.5; cursor: not-allowed;" title="All profiles assigned" disabled>+ Add Profile</button>
      `;
    }
    
    tagsContainer.appendChild(addWrapper);
    row.appendChild(tagsContainer);
    
    mappingsListContainer.appendChild(row);
  });
}

// ── Manage Services View ───────────────────────────────────────────────────────

function renderServices() {
  servicesListContainer.innerHTML = '';
  const services = config.services || {};
  
  const serviceIds = Object.keys(services).sort();
  
  serviceIds.forEach(svcId => {
    const svc = services[svcId];
    
    const item = document.createElement('div');
    item.className = 'service-list-item';
    if (selectedServiceId === svcId) {
      item.classList.add('selected');
    }
    
    item.innerHTML = `
      <div class="service-item-info">
        <span class="color-dot" style="background-color: ${svc.color || '#4f46e5'}"></span>
        <div class="service-item-meta">
          <span class="service-item-name">${svcId}</span>
          <span class="service-item-url">${svc.url}</span>
        </div>
      </div>
      <span class="edit-indicator">Edit</span>
    `;
    
    item.addEventListener('click', () => selectService(svcId));
    servicesListContainer.appendChild(item);
  });
}

function selectService(svcId) {
  selectedServiceId = svcId;
  const svc = config.services[svcId];
  
  const items = servicesListContainer.querySelectorAll('.service-list-item');
  items.forEach((item, index) => {
    const listSvcId = Object.keys(config.services).sort()[index];
    if (listSvcId === svcId) item.classList.add('selected');
    else item.classList.remove('selected');
  });
  
  formTitle.textContent = `Edit Service: ${svcId}`;
  editServiceId.value = svcId;
  serviceNameInput.value = svcId;
  serviceNameInput.disabled = true;
  serviceUrlInput.value = svc.url;
  serviceColorInput.value = svc.color || '#4f46e5';
  serviceColorHexInput.value = svc.color || '#4f46e5';
  
  btnCancelEdit.classList.remove('hidden');
  btnSaveService.textContent = 'Update Service';
  
  if (!DEFAULT_SERVICE_IDS.includes(svcId)) {
    btnDeleteService.classList.remove('hidden');
  } else {
    btnDeleteService.classList.add('hidden');
  }
}

function resetServiceForm() {
  selectedServiceId = null;
  formTitle.textContent = 'Add New Service';
  editServiceId.value = '';
  serviceNameInput.value = '';
  serviceNameInput.disabled = false;
  serviceUrlInput.value = '';
  serviceColorInput.value = '#4f46e5';
  serviceColorHexInput.value = '#4f46e5';
  
  btnCancelEdit.classList.add('hidden');
  btnSaveService.textContent = 'Add Service';
  btnDeleteService.classList.add('hidden');
  
  const items = servicesListContainer.querySelectorAll('.service-list-item');
  items.forEach(item => item.classList.remove('selected'));
}

btnCancelEdit.addEventListener('click', resetServiceForm);

serviceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = editServiceId.value;
  const name = serviceNameInput.value.trim();
  const url = serviceUrlInput.value.trim();
  const color = serviceColorHexInput.value;
  
  if (id) {
    config.services[id] = { url, color };
  } else {
    if (config.services[name]) {
      alert(`A service named "${name}" already exists!`);
      return;
    }
    config.services[name] = { url, color };
    config.mappings[name] = [];
  }
  
  await saveChanges();
  await loadData();
  resetServiceForm();
});

btnDeleteService.addEventListener('click', async () => {
  const id = editServiceId.value;
  if (!id) return;
  
  if (confirm(`Are you sure you want to delete the service "${id}" and all its mappings?`)) {
    delete config.services[id];
    delete config.mappings[id];
    await saveChanges();
    await loadData();
    resetServiceForm();
  }
});

// ── Manage Profiles View ───────────────────────────────────────────────────────

function renderProfiles() {
  profilesListContainer.innerHTML = '';
  const profileIds = Object.keys(profiles).sort();
  
  profileIds.forEach(profId => {
    const profName = profiles[profId];
    
    const item = document.createElement('div');
    item.className = 'service-list-item';
    if (selectedProfileId === profId) {
      item.classList.add('selected');
    }
    
    item.innerHTML = `
      <div class="service-item-info">
        <div class="service-item-meta">
          <span class="service-item-name">${profName}</span>
          <span class="service-item-url">ID: ${profId}</span>
        </div>
      </div>
      <span class="edit-indicator">Edit</span>
    `;
    
    item.addEventListener('click', () => selectProfile(profId));
    profilesListContainer.appendChild(item);
  });
}

function selectProfile(profId) {
  selectedProfileId = profId;
  const profName = profiles[profId];
  
  const items = profilesListContainer.querySelectorAll('.service-list-item');
  items.forEach((item, index) => {
    const listProfId = Object.keys(profiles).sort()[index];
    if (listProfId === profId) item.classList.add('selected');
    else item.classList.remove('selected');
  });
  
  profileFormTitle.textContent = `Edit Profile: ${profName}`;
  editProfileId.value = profId;
  profileIdInput.value = profId;
  profileIdInput.disabled = true; // Immutable ID
  profileNameInput.value = profName;
  
  btnCancelProfile.classList.remove('hidden');
  btnSaveProfile.textContent = 'Update Profile';
  
  if (!DEFAULT_PROFILE_IDS.includes(profId)) {
    btnDeleteProfile.classList.remove('hidden');
  } else {
    btnDeleteProfile.classList.add('hidden');
  }
}

function resetProfileForm() {
  selectedProfileId = null;
  profileFormTitle.textContent = 'Add New Profile';
  editProfileId.value = '';
  profileIdInput.value = '';
  profileIdInput.disabled = false;
  profileNameInput.value = '';
  
  btnCancelProfile.classList.add('hidden');
  btnSaveProfile.textContent = 'Add Profile';
  btnDeleteProfile.classList.add('hidden');
  
  const items = profilesListContainer.querySelectorAll('.service-list-item');
  items.forEach(item => item.classList.remove('selected'));
}

btnCancelProfile.addEventListener('click', resetProfileForm);

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = editProfileId.value;
  const rawNewId = profileIdInput.value.trim().toLowerCase();
  const name = profileNameInput.value.trim();
  
  if (id) {
    // Edit mode
    config.appProfiles[id] = name;
  } else {
    // Create mode
    if (config.appProfiles[rawNewId]) {
      alert(`A profile with ID "${rawNewId}" already exists!`);
      return;
    }
    config.appProfiles[rawNewId] = name;
  }
  
  await saveChanges();
  await loadData();
  resetProfileForm();
});

btnDeleteProfile.addEventListener('click', async () => {
  const id = editProfileId.value;
  if (!id) return;
  
  if (confirm(`Are you sure you want to delete the profile "${profiles[id]}"?\nAll existing mappings to this profile will be removed.`)) {
    delete config.appProfiles[id];
    
    // Cleanup mappings
    for (const svcId of Object.keys(config.mappings)) {
      config.mappings[svcId] = config.mappings[svcId].filter(mappedId => mappedId !== id);
    }
    
    await saveChanges();
    await loadData();
    resetProfileForm();
  }
});


// ── Preferences View ─────────────────────────────────────────────────────────

function renderPreferences() {
  if (!config) return;
  
  startupToggle.checked = config.settings.launchOnStartup || false;
  configFilePath.textContent = config.configPath || 'Unknown';
}

startupToggle.addEventListener('change', (e) => {
  config.settings.launchOnStartup = e.target.checked;
  saveChanges();
});

// ── Load Init ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadData);
