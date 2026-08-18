const DEFAULT_SERVICES = {
  ChatGPT: { url: 'https://chat.openai.com/', color: '#10a37f' },
  Claude: { url: 'https://claude.ai/', color: '#da7756' },
  Gemini: { url: 'https://gemini.google.com/', color: '#4285f4' },
  Perplexity: { url: 'https://www.perplexity.ai/', color: '#20b2aa' },
  'GitHub Copilot': { url: 'https://github.com/copilot', color: '#7c3aed' },
  Grok: { url: 'https://grok.com/', color: '#9ca3af' },
  WolframAlpha: { url: 'https://www.wolframalpha.com/', color: '#cc2200' }
};

const DEFAULT_PROFILES = {
  default: 'Main Profile',
  work: 'Work Profile'
};

function defaultConfig() {
  return {
    services: { ...DEFAULT_SERVICES },
    appProfiles: { ...DEFAULT_PROFILES },
    mappings: {},
    settings: { launchOnStartup: false, browserId: null }
  };
}

function mergeWithDefaults(data) {
  if (!data) {
    return defaultConfig();
  }

  if (!data.appProfiles) {
    data.appProfiles = { ...DEFAULT_PROFILES };
  }

  return { ...defaultConfig(), ...data };
}

module.exports = { DEFAULT_SERVICES, DEFAULT_PROFILES, defaultConfig, mergeWithDefaults };
