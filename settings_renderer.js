import { loadData } from './settings/store.js';
import './settings/mappings.js';
import './settings/services.js';
import './settings/profiles.js';
import './settings/preferences.js';

const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    const targetTab = item.getAttribute('data-tab');

    navItems.forEach((nav) => nav.classList.remove('active'));
    tabContents.forEach((tab) => tab.classList.remove('active'));

    item.classList.add('active');
    document.getElementById(targetTab).classList.add('active');
  });
});

document.addEventListener('DOMContentLoaded', loadData);
