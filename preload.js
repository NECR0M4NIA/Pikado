const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('filmLook', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  processImage: (args) => ipcRenderer.invoke('process-image', args),
  processVideo: (args) => ipcRenderer.invoke('process-video', args),
  onVideoProgress: (callback) => ipcRenderer.on('video-progress', (event, progress) => callback(progress)),
  // Electron 32+ : .path n'existe plus sur les objets File du drag&drop,
  // il faut passer par webUtils côté preload pour récupérer le chemin réel.
  getPathForFile: (file) => webUtils.getPathForFile(file),
});