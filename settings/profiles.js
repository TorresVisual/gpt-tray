import { config, profiles, saveChanges, loadData, onConfigLoaded } from './store.js';

let selectedProfileId = null;

const profilesListContainer = document.getElementById('profiles-list-container');
const profileForm = document.getElementById('profile-form');
const profileFormTitle = document.getElementById('profile-form-title');
const editProfileId = document.getElementById('edit-profile-id');
const profileIdInput = document.getElementById('profile-id');
const profileNameInput = document.getElementById('profile-name');
const btnCancelProfile = document.getElementById('btn-cancel-profile');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnDeleteProfile = document.getElementById('btn-delete-profile');

export function renderProfiles() {
  profilesListContainer.innerHTML = '';
  const profileIds = Object.keys(profiles).sort();

  profileIds.forEach((profId) => {
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
  profileIdInput.disabled = true;
  profileNameInput.value = profName;

  btnCancelProfile.classList.remove('hidden');
  btnSaveProfile.textContent = 'Update Profile';

  if (!config.defaultProfileIds.includes(profId)) {
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
  items.forEach((item) => item.classList.remove('selected'));
}

btnCancelProfile.addEventListener('click', resetProfileForm);

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = editProfileId.value;
  const rawNewId = profileIdInput.value.trim().toLowerCase();
  const name = profileNameInput.value.trim();

  if (id) {
    config.appProfiles[id] = name;
  } else {
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

  if (
    confirm(
      `Are you sure you want to delete the profile "${profiles[id]}"?\nAll existing mappings to this profile will be removed.`
    )
  ) {
    delete config.appProfiles[id];

    for (const svcId of Object.keys(config.mappings)) {
      config.mappings[svcId] = config.mappings[svcId].filter((mappedId) => mappedId !== id);
    }

    await saveChanges();
    await loadData();
    resetProfileForm();
  }
});

onConfigLoaded(renderProfiles);
