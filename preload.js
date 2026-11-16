const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('quadro', {
  invoke: (channel, ...args) => ipcRenderer.invoke('q:' + channel, ...args),
  on: (channel, cb) => ipcRenderer.on('q:' + channel, (_e, ...args) => cb(...args)),
  pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
});
