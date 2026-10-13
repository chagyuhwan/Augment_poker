const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  steamInfo: () => ipcRenderer.invoke('steam:info'),
  unlockAchievement: (id) => ipcRenderer.invoke('steam:unlockAchievement', id),
  loadSave: () => ipcRenderer.invoke('save:load'),
  writeSave: (data) => ipcRenderer.invoke('save:write', data),
  setFullscreen: (value) => ipcRenderer.invoke('window:setFullscreen', value),
  isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
  onFullscreenChanged: (cb) => {
    const listener = (_e, value) => cb(value);
    ipcRenderer.on('fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('fullscreen-changed', listener);
  },
  quit: () => ipcRenderer.invoke('app:quit'),
});
