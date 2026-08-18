const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SERVICES, DEFAULT_PROFILES, defaultConfig, mergeWithDefaults } = require('./config-shape');

test('defaultConfig returns the default services, profiles, empty mappings, and default settings', () => {
  const config = defaultConfig();
  assert.deepEqual(config.services, DEFAULT_SERVICES);
  assert.deepEqual(config.appProfiles, DEFAULT_PROFILES);
  assert.deepEqual(config.mappings, {});
  assert.deepEqual(config.settings, { launchOnStartup: false, browserId: null });
});

test('mergeWithDefaults returns the default config when given no data', () => {
  const config = mergeWithDefaults(null);
  assert.deepEqual(config, defaultConfig());
});

test('mergeWithDefaults preserves data read from disk over the defaults', () => {
  const data = {
    services: { Custom: { url: 'https://example.com', color: '#000000' } },
    appProfiles: { default: 'Main Profile' },
    mappings: { Custom: ['default'] },
    settings: { launchOnStartup: true }
  };
  const config = mergeWithDefaults(data);
  assert.deepEqual(config.services, data.services);
  assert.deepEqual(config.mappings, data.mappings);
  // Matches existing shallow-merge behavior: a partial settings object from
  // disk replaces the default settings object entirely, it isn't deep-merged.
  assert.deepEqual(config.settings, { launchOnStartup: true });
});

test('mergeWithDefaults fills in default appProfiles when missing from disk data', () => {
  const data = { services: {}, mappings: {} };
  const config = mergeWithDefaults(data);
  assert.deepEqual(config.appProfiles, DEFAULT_PROFILES);
});
