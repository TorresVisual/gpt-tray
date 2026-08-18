import { config, profiles, saveChanges, onConfigLoaded } from './store.js';

const mappingsListContainer = document.getElementById('mappings-list-container');

export function renderMappings() {
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

    const validMappedDirs = mappedDirs.filter(dir => profiles[dir]);
    if (validMappedDirs.length !== mappedDirs.length) {
      config.mappings[svcId] = validMappedDirs;
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

onConfigLoaded(renderMappings);
