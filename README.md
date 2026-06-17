# Film Look — grain argentique + remplacement de couleur précis

## Architecture en bref

```
effects.js          → fonctions PURES (aucune dépendance), travaillent sur un buffer RGBA brut
imageProcessor.js   → utilise sharp pour décoder/encoder une IMAGE et y appliquer effects.js
videoProcessor.js   → utilise ffmpeg pour extraire les frames d'une VIDEO, applique effects.js
                       sur chaque frame (via sharp), puis réassemble la vidéo + l'audio d'origine
presets.js           → couleurs nommées (rouge sanglant, bleu marine, vert olive...) et réglages de grain
test.js              → script de validation rapide (sans dépendances) pour effects.js
```

L'idée centrale : **un seul moteur d'effets, deux usages**. Le code qui ajoute le grain
et qui remplace une couleur est écrit une fois dans `effects.js`, et réutilisé à l'identique
pour une photo et pour chaque frame d'une vidéo. Tu auras donc un rendu cohérent entre
tes photos et tes vidéos avec les mêmes réglages.

## Installation

```bash
npm install sharp
```

`ffmpeg` et `ffprobe` doivent être présents sur la machine pour le traitement vidéo
(sur macOS : `brew install ffmpeg` ; sur Windows/Linux il existe des binaires statiques).
Pour les embarquer directement dans ton app Electron sans dépendre de l'install système,
regarde les packages `ffmpeg-static` et `ffprobe-static`, et remplace dans
`videoProcessor.js` :

```js
const FFMPEG_PATH = require('ffmpeg-static');
const FFPROBE_PATH = require('ffprobe-static').path;
```

## Utilisation directe (Node)

```js
const { processImage } = require('./imageProcessor');
const presets = require('./presets');

await processImage('photo.jpg', 'photo-argentique.jpg', {
  colorSwaps: [
    { target: presets.rougeSanglant, replacement: presets.bleuMarine,
      options: { hueRange: 15, feather: 8 } }
  ],
  grain: presets.grainPresets.classique35mm,
});
```

```js
const { processVideo } = require('./videoProcessor');

await processVideo('clip.mp4', 'clip-argentique.mp4', {
  colorSwaps: [{ target: presets.vertOlive, replacement: presets.bordeaux }],
  grain: presets.grainPresets.grossier16mm,
}, (progress) => console.log(progress)); // { stage: 'extraction' | 'traitement' | 'assemblage' | 'terminé', current, total }
```

## Réglage du remplacement de couleur

`replaceColorSelective` cible une **teinte** (pas juste une couleur exacte), pour que
toutes les nuances de "rouge sanglant" dans l'image soient affectées, pas un seul pixel précis :

- `hueRange` (degrés) : largeur de la plage de teinte détectée autour de la couleur cible.
- `feather` (degrés) : zone de transition douce sur les bords, pour éviter un contour dur.
- `satTolerance` / `lightTolerance` (0–1) : marge sur la saturation/luminosité acceptée.
- `preserveLuminance` (bool, défaut `true`) : garde les ombres/reflets d'origine, ne change
  que la teinte/saturation — ça évite d'aplatir le relief de l'image.

Si tu veux un ciblage plus "brut" basé sur la distance RVB plutôt que la teinte (utile pour
une chrominance très spécifique, type fond vert chroma key), c'est une variante simple à
ajouter dans `effects.js` — dis-moi si tu en as besoin.

## Brancher ça dans Electron

Le traitement (sharp + ffmpeg) doit tourner côté **main process** (accès Node complet),
pas dans le renderer. Le renderer envoie juste une requête IPC avec les chemins de fichiers
et les réglages choisis par l'utilisateur dans l'UI.

**main.js**
```js
const { ipcMain, dialog } = require('electron');
const { processImage } = require('./imageProcessor');
const { processVideo } = require('./videoProcessor');

ipcMain.handle('process-image', async (event, { inputPath, outputPath, options }) => {
  return processImage(inputPath, outputPath, options);
});

ipcMain.handle('process-video', async (event, { inputPath, outputPath, options }) => {
  return processVideo(inputPath, outputPath, options, (progress) => {
    event.sender.send('video-progress', progress); // pour une barre de progression
  });
});
```

**preload.js**
```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('filmLook', {
  processImage: (args) => ipcRenderer.invoke('process-image', args),
  processVideo: (args) => ipcRenderer.invoke('process-video', args),
  onVideoProgress: (callback) => ipcRenderer.on('video-progress', (e, p) => callback(p)),
});
```

**renderer (ton UI)**
```js
await window.filmLook.processImage({
  inputPath: '/chemin/vers/photo.jpg',
  outputPath: '/chemin/vers/sortie.jpg',
  options: {
    colorSwaps: [{ target: {r:139,g:0,b:0}, replacement: {r:0,g:0,b:128} }],
    grain: { intensity: 18, monochrome: true },
  },
});
```

## Pour aller plus loin

- **Aperçu en temps réel dans l'UI** : applique `effects.js` sur un `<canvas>` côté renderer
  (même fonctions, le buffer `ImageData.data` a exactement le même format RGBA) pour montrer
  un preview instantané avant l'export final en qualité complète côté main process.
- **Vidéo plus rapide** : l'approche "extraction frame par frame" est précise mais plus lente
  qu'un filtre ffmpeg natif. Une fois le réglage visuel validé avec ce pipeline, on peut
  porter la logique de remplacement de couleur vers un filtre `geq`/`lut3d` ffmpeg pour
  accélérer l'export final, en gardant `effects.js` pour le preview.
- **LUT 3D** : pour un vrai look "pellicule" (Kodak Portra, Fuji, etc.) au-delà du grain et
  du remplacement de couleur, les LUTs `.cube` sont l'approche standard du milieu — je peux
  t'aider à les charger/appliquer si ça t'intéresse.
