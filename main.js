const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');

const { processImage } = require('./effects/imageProcessor');
const { processVideo } = require('./effects/videoProcessor');

// formats d'image supportés à l'export
const IMAGE_FORMATS = [
  { label: 'JPEG', ext: 'jpg', mime: 'image/jpeg' },
  { label: 'PNG', ext: 'png', mime: 'image/png' },
  { label: 'WebP', ext: 'webp', mime: 'image/webp' },
  { label: 'AVIF', ext: 'avif', mime: 'image/avif' },
  { label: 'HEIF', ext: 'heif', mime: 'image/heif' },
  { label: 'TIFF', ext: 'tiff', mime: 'image/tiff' },
];

let mainWindow = null;

function buildMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Ouvrir…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu-open-file'),
        },
        { type: 'separator' },
        {
          label: 'Exporter…',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('menu-export'),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom par défaut' },
        { role: 'zoomIn', label: 'Zoom +' },
        { role: 'zoomOut', label: 'Zoom −' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 768,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1c1814',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadFile('index.html');
  buildMenu();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* ------------------------------------------------------------------ */
/* Handlers IPC                                                         */
/* ------------------------------------------------------------------ */

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Ouvrir une photo ou une vidéo',
    properties: ['openFile'],
    filters: [
      { name: 'Images & vidéos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'avif', 'heif', 'mp4', 'mov', 'mkv', 'avi', 'webm'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// Dialog d'enregistrement : l'utilisateur choisit le dossier, le nom et le format.
// Renvoie { outputPath, format } ou null si annulé.
ipcMain.handle('select-export-destination', async (event, { inputPath, defaultFormat }) => {
  const inputBase = path.basename(inputPath, path.extname(inputPath));
  const isVideo = ['.mp4', '.mov', '.mkv', '.avi', '.webm'].includes(path.extname(inputPath).toLowerCase());

  let filters;
  if (isVideo) {
    filters = [{ name: 'Vidéo MP4', extensions: ['mp4'] }];
  } else {
    filters = IMAGE_FORMATS.map(f => ({ name: f.label, extensions: [f.ext] }));
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter le rendu',
    defaultPath: path.join(path.dirname(inputPath), inputBase + '-argentique'),
    filters,
  });

  if (result.canceled || !result.filePath) return null;

  // détermine le format à partir de l'extension choisie
  const chosenExt = path.extname(result.filePath).slice(1).toLowerCase();
  const format = isVideo ? 'mp4' : (chosenExt || defaultFormat || 'jpg');

  // s'assure que l'extension est bien dans le nom de fichier
  const finalPath = result.filePath.endsWith('.' + chosenExt)
    ? result.filePath
    : result.filePath + '.' + format;

  return { outputPath: finalPath, format };
});

ipcMain.handle('process-image', async (event, { inputPath, outputPath, format, options }) => {
  return processImage(inputPath, outputPath, options, format);
});

ipcMain.handle('process-video', async (event, { inputPath, outputPath, options, videoSettings, range }) => {
  return processVideo(inputPath, outputPath, options, videoSettings || {}, range || {}, (progress) => {
    event.sender.send('video-progress', progress);
  });
});