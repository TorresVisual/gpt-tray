const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const appDir = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const configPath = path.join(appDir, 'config.json');

const DEFAULT_SERVICES = {
  "ChatGPT": { "url": "https://chat.openai.com/", "color": "#10a37f" },
  "Claude": { "url": "https://claude.ai/", "color": "#da7756" },
  "Gemini": { "url": "https://gemini.google.com/", "color": "#4285f4" },
  "Perplexity": { "url": "https://www.perplexity.ai/", "color": "#20b2aa" },
  "GitHub Copilot": { "url": "https://github.com/copilot", "color": "#7c3aed" },
  "Grok": { "url": "https://grok.com/", "color": "#9ca3af" },
  "WolframAlpha": { "url": "https://www.wolframalpha.com/", "color": "#cc2200" }
};

const DEFAULT_PROFILES = {
  "default": "Main Profile",
  "work": "Work Profile"
};

function getStartupStatus() {
  try {
    const output = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v LLMSwitcher', { encoding: 'utf-8' });
    return output.includes('LLMSwitcher');
  } catch (e) {
    return false;
  }
}

function setStartup(enable) {
  const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  try {
    if (enable) {
      const appPath = app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${__dirname}"`;
      execSync(`reg add "${runKey}" /v LLMSwitcher /t REG_SZ /d "${appPath}" /f`);
    } else {
      execSync(`reg delete "${runKey}" /v LLMSwitcher /f`);
    }
    return true;
  } catch (e) {
    console.error('Failed to set startup registry key:', e);
    return false;
  }
}

function loadConfig() {
  let config = {
    services: { ...DEFAULT_SERVICES },
    appProfiles: { ...DEFAULT_PROFILES },
    mappings: {},
    settings: { launchOnStartup: false, browserId: null }
  };

  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      // If updating from old chrome version, add default appProfiles
      if (!data.appProfiles) {
        data.appProfiles = { ...DEFAULT_PROFILES };
      }

      config = { ...config, ...data };
    } catch (e) {
      console.error('Error reading config file:', e);
    }
  } else {
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing default config file:', e);
    }
  }

  config.settings.launchOnStartup = getStartupStatus();
  return config;
}

function saveConfig(newConfig) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    setStartup(newConfig.settings.launchOnStartup);
    return true;
  } catch (e) {
    console.error('Error saving config file:', e);
    return false;
  }
}

module.exports = { configPath, loadConfig, saveConfig, setStartup };
