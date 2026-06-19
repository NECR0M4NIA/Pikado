const path = require('path');
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { applyPipeline } = require(path.join(__dirname, 'effects', 'effects.js'));

contextBridge.exposeInMainWorld('filmLook', {
  // --- fichiers ---
  selectFile: () => ipcRenderer.invoke('select-file'),

  // --- export ---
  selectExportDestination: (args) => ipcRenderer.invoke('select-export-destination', args),
  processImage: (args)  => ipcRenderer.invoke('process-image', args),
  processVideo: (args)  => ipcRenderer.invoke('process-video', args),

  // --- progression vidéo ---
  onVideoProgress: (cb) => ipcRenderer.on('video-progress', (_, p) => cb(p)),

  // --- événements menu natif -> renderer ---
  onMenuOpenFile: (cb) => ipcRenderer.on('menu-open-file', () => cb()),
  onMenuExport:   (cb) => ipcRenderer.on('menu-export',    () => cb()),

  // --- drag & drop (Electron 32+) ---
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // --- aperçu live : même pipeline que l'export, sans sharp/ffmpeg ni disque ---
  applyEffects: (data, width, height, settings) => {
    const buf = new Uint8ClampedArray(data);
    applyPipeline(buf, width, height, settings);
    return buf;
  },
});