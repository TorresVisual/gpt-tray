const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  launchService: (profileDir, url, color) => ipcRenderer.invoke('launch-service', { profileDir, url, color }),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  closePopup: () => ipcRenderer.invoke('close-popup'),
  setStartup: (enable) => ipcRenderer.invoke('set-startup', enable)
});
