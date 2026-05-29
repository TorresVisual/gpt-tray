let appConfig = null;
let appProfiles = null;

const cardsList = document.getElementById('cards-list');
const searchInput = document.getElementById('search-input');
const settingsBtn = document.getElementById('settings-btn');

async function loadData() {
  try {
    appConfig = await window.api.getConfig();
    appProfiles = appConfig.appProfiles || {};
    renderCards();
  } catch (err) {
    cardsList.innerHTML = `<div class="no-results">Error loading configurations: ${err.message}</div>`;
  }
}

function renderCards() {
  if (!appConfig || !appProfiles) return;

  cardsList.innerHTML = '';
  const searchVal = searchInput.value.toLowerCase().trim();
  let hasVisibleCards = false;

  const services = appConfig.services || {};
  const mappings = appConfig.mappings || {};

  // Generate flat list of cards
  const cardsToRender = [];

  for (const [svcName, dirs] of Object.entries(mappings)) {
    if (!dirs || !Array.isArray(dirs) || dirs.length === 0) continue;
    const svcMeta = services[svcName];
    if (!svcMeta) continue; // Unrecognized service

    for (const dir of dirs) {
      const profileName = appProfiles[dir] || dir;
      
      // Filter logic
      if (searchVal) {
        const matchesSvc = svcName.toLowerCase().includes(searchVal);
        const matchesProf = profileName.toLowerCase().includes(searchVal);
        if (!matchesSvc && !matchesProf) continue;
      }

      cardsToRender.push({
        svcName,
        profileDir: dir,
        profileName,
        url: svcMeta.url,
        color: svcMeta.color || '#4f46e5'
      });
    }
  }

  if (cardsToRender.length === 0) {
    cardsList.innerHTML = `<div class="no-results">${searchVal ? 'No matches found.' : 'No services configured. Go to settings to set them up!'}</div>`;
    return;
  }

  // Render cards
  cardsToRender.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'service-card';
    cardEl.style.setProperty('--svc-color', card.color);
    
    cardEl.innerHTML = `
      <div class="card-info">
        <span class="service-name">${card.svcName}</span>
        <span class="profile-name">${card.profileName}</span>
      </div>
      <span class="card-arrow">›</span>
    `;

    cardEl.addEventListener('click', async () => {
      // Hide popup first to give responsive feedback
      await window.api.closePopup();
      // Launch service
      await window.api.launchService(card.profileDir, card.url);
    });

    cardsList.appendChild(cardEl);
  });
}

// Search filtering
searchInput.addEventListener('input', renderCards);

// Clear search on Escape key
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (searchInput.value) {
      searchInput.value = '';
      renderCards();
      e.stopPropagation(); // prevent window from closing if search is cleared
    }
  }
});

// Settings button
settingsBtn.addEventListener('click', () => {
  window.api.openSettings();
});

// Load on start
document.addEventListener('DOMContentLoaded', loadData);

// Automatically refresh configuration when popup gains focus
window.addEventListener('focus', () => {
  loadData();
  // Clear search on open to show full list
  if (searchInput.value) {
    searchInput.value = '';
  }
  searchInput.focus();
});
