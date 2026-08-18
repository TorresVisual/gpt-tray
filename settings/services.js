import { config, saveChanges, loadData, onConfigLoaded } from './store.js';

let selectedServiceId = null;

const servicesListContainer = document.getElementById('services-list-container');
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

export function renderServices() {
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

  if (!config.defaultServiceIds.includes(svcId)) {
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

serviceColorInput.addEventListener('input', (e) => {
  serviceColorHexInput.value = e.target.value;
});
serviceColorHexInput.addEventListener('input', (e) => {
  if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
    serviceColorInput.value = e.target.value;
  }
});

onConfigLoaded(renderServices);
