'use strict';
/* Úzké, bezpečné rozhraní mezi stránkou a hlavním procesem (contextIsolation). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kancelar', {
  snapshot: () => ipcRenderer.invoke('kancelar:snapshot'),
  history: (id) => ipcRenderer.invoke('kancelar:history', String(id)),
  getLayout: () => ipcRenderer.invoke('kancelar:layout:get'),
  saveLayout: (layout) => ipcRenderer.invoke('kancelar:layout:save', layout),
  resetLayout: () => ipcRenderer.invoke('kancelar:layout:reset'),
  setSetting: (key, value) => ipcRenderer.invoke('kancelar:setting', String(key), !!value),
  openDataFolder: () => ipcRenderer.invoke('kancelar:open-data'),
  editorState: (on) => ipcRenderer.send('kancelar:editor-state', !!on),
  onUpdate: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on('kancelar:update', h);
    return () => ipcRenderer.removeListener('kancelar:update', h);
  },
  onMenu: (cb) => {
    const h = (_e, cmd) => cb(String(cmd));
    ipcRenderer.on('kancelar:menu', h);
    return () => ipcRenderer.removeListener('kancelar:menu', h);
  }
});
