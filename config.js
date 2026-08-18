const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { DEFAULT_SERVICES, DEFAULT_PROFILES, defaultConfig, mergeWithDefaults } = require('./lib/config-shape');

const appDir = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const configPath = path.join(appDir, 'config.json');

function getStartupStatus() {
  try {
    const output = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v LLMSwitcher', { encoding: 'utf-8' });
    return output.includes('LLMSwitcher');
  } catch {
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
  let config;

  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config = mergeWithDefaults(data);
    } catch (e) {
      console.error('Error reading config file:', e);
      config = defaultConfig();
    }
  } else {
    config = defaultConfig();
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing default config file:', e);
    }
  }

  config.settings.launchOnStartup = getStartupStatus();
  config.defaultServiceIds = Object.keys(DEFAULT_SERVICES);
  config.defaultProfileIds = Object.keys(DEFAULT_PROFILES);
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
