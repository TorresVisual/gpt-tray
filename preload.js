const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  launchService: (profileDir, url) => ipcRenderer.invoke('launch-service', { profileDir, url }),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  closePopup: () => ipcRenderer.invoke('close-popup'),
  setStartup: (enable) => ipcRenderer.invoke('set-startup', enable)
});
