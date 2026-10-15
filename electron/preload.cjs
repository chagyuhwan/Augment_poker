const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  appInfo: () => ipcRenderer.invoke('app:info'),
  steamStatus: () => ipcRenderer.invoke('steam:status'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),
  applyWindow: (mode, resolution) => ipcRenderer.invoke('window:apply', mode, resolution),
  windowState: () => ipcRenderer.invoke('window:state'),
  onWindowModeChanged: (listener) => {
    const handler = (_e, mode) => listener(mode);
    ipcRenderer.on('window:mode-changed', handler);
    return () => ipcRenderer.removeListener('window:mode-changed', handler);
  },
  walletGet: () => ipcRenderer.invoke('wallet:get'),
  walletHistory: () => ipcRenderer.invoke('wallet:history'),
  walletOp: (op) => ipcRenderer.invoke('wallet:op', op),
  openLogFolder: () => ipcRenderer.invoke('app:openLogFolder'),
  log: (level, message) => ipcRenderer.send('log:write', level, message),
  quit: () => ipcRenderer.invoke('app:quit'),
  lanLocalAddresses: () => ipcRenderer.invoke('lan:localAddresses'),
  lanStatus: () => ipcRenderer.invoke('lan:status'),
  lanHostStart: (opts) => ipcRenderer.invoke('lan:hostStart', opts),
  lanConnect: (opts) => ipcRenderer.invoke('lan:connect', opts),
  lanSend: (peerId, msg) => ipcRenderer.invoke('lan:send', peerId, msg),
  lanBroadcast: (msg, exceptPeerId) => ipcRenderer.invoke('lan:broadcast', msg, exceptPeerId),
  lanShutdown: () => ipcRenderer.invoke('lan:shutdown'),
  onLanMessage: (listener) => {
    const handler = (_e, payload) => listener(payload);
    ipcRenderer.on('lan:message', handler);
    return () => ipcRenderer.removeListener('lan:message', handler);
  },
  onLanPeer: (listener) => {
    const handler = (_e, payload) => listener(payload);
    ipcRenderer.on('lan:peer', handler);
    return () => ipcRenderer.removeListener('lan:peer', handler);
  },
});
