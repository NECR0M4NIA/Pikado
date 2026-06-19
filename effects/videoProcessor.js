/**
 * videoProcessor.js
 * Pipeline vidéo frame par frame avec tous les filtres Pikado + export ffmpeg avancé.
 */

const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const { applyPipeline } = require('./effects');
const { applyExtendedFilters } = require('./extraFilters');

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`${cmd} a échoué (code ${code}):\n${stderr}`));
    });
  });
}

async function probeVideo(inputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFPROBE_PATH, [
      '-v', '0',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=r_frame_rate,width,height,duration',
      '-of', 'json',
      inputPath,
    ]);
    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.on('error', reject);
    proc.on('close', () => {
      try {
        const json = JSON.parse(stdout);
        const stream = json.streams?.[0] || {};
        const [num, den] = String(stream.r_frame_rate || '30/1').split('/').map(Number);
        resolve({
          fps: den ? num / den : num || 30,
          width: stream.width || 1920,
          height: stream.height || 1080,
          duration: parseFloat(stream.duration) || 0,
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function extractFrames(inputPath, framesDir, range = {}, scale = 1) {
  await fs.mkdir(framesDir, { recursive: true });
  const args = ['-y'];
  if (range.in != null && range.in > 0) args.push('-ss', String(range.in));
  if (range.out != null && range.out > 0 && range.out > (range.in || 0)) {
    args.push('-to', String(range.out));
  }
  args.push('-i', inputPath);
  if (scale && scale !== 1) {
    args.push('-vf', `scale=iw*${scale}:ih*${scale}`);
  }
  args.push(path.join(framesDir, 'frame_%06d.png'));
  await runCommand(FFMPEG_PATH, args);
}

async function processFrame(framePath, settings) {
  const image = sharp(framePath);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  applyPipeline(data, width, height, settings);
  applyExtendedFilters(data, width, height, settings);

  await sharp(data, { raw: { width, height, channels: 4 } }).toFile(framePath);
}

async function processAllFrames(framesDir, settings, onProgress, concurrency = os.cpus().length) {
  const files = (await fs.readdir(framesDir)).filter(f => f.endsWith('.png')).sort();
  let i = 0;
  let done = 0;

  async function worker() {
    while (i < files.length) {
      const idx = i++;
      await processFrame(path.join(framesDir, files[idx]), settings);
      done++;
      onProgress({ stage: 'traitement', current: done, total: files.length });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length || 1) }, worker));
  return files.length;
}

function buildVideoCodecArgs(videoSettings = {}) {
  const vs = videoSettings;
  const args = [];

  const codecMap = {
    h264: 'libx264',
    h265: 'libx265',
    hevc: 'libx265',
    prores: 'prores_ks',
    vp9: 'libvpx-vp9',
    av1: 'libsvtav1',
  };
  const vCodec = codecMap[vs.videoCodec] || 'libx264';
  args.push('-c:v', vCodec);

  if (vs.qualityMode === 'crf' && vs.crf != null) {
    args.push('-crf', String(vs.crf));
  } else if (vs.bitrate) {
    args.push('-b:v', `${vs.bitrate}M`);
  }

  if (vs.preset && ['h264', 'h265', 'hevc'].includes(vs.videoCodec || 'h264')) {
    args.push('-preset', vs.preset);
  }

  args.push('-pix_fmt', vs.pixelFormat || 'yuv420p');

  if (vs.twoPass) args.push('-pass', '1');

  if (vs.videoCodec === 'prores') {
    const profileMap = { proxy: 0, lt: 1, standard: 2, hq: 3, '4444': 4 };
    args.push('-profile:v', String(profileMap[vs.proresProfile] || 2));
  }

  if (vs.videoCodec === 'vp9') {
    if (vs.crf != null) args.push('-crf', String(vs.crf));
    args.push('-b:v', '0');
  }

  return args;
}

function buildAudioCodecArgs(videoSettings = {}) {
  const vs = videoSettings;
  if (vs.includeAudio === false) return ['-an'];

  const audioMap = {
    copy: 'copy',
    aac: 'aac',
    mp3: 'libmp3lame',
    pcm: 'pcm_s16le',
    opus: 'libopus',
  };
  const aCodec = audioMap[vs.audioCodec] || 'aac';
  const args = ['-c:a', aCodec];
  if (aCodec !== 'copy' && vs.audioBitrate) {
    args.push('-b:a', `${vs.audioBitrate}k`);
  }
  return args;
}

async function reassembleVideo(framesDir, fps, originalInputPath, outputPath, videoSettings = {}, range = {}) {
  const outFps = videoSettings.fps && videoSettings.fps !== 'source'
    ? parseFloat(videoSettings.fps)
    : fps;

  const args = ['-y'];
  args.push('-framerate', String(outFps));
  args.push('-i', path.join(framesDir, 'frame_%06d.png'));

  if (videoSettings.includeAudio !== false) {
    if (range.in != null && range.in > 0) args.push('-ss', String(range.in));
    args.push('-i', originalInputPath);
  }

  args.push('-map', '0:v');
  if (videoSettings.includeAudio !== false) args.push('-map', '1:a?');

  args.push(...buildVideoCodecArgs(videoSettings));
  args.push(...buildAudioCodecArgs(videoSettings));
  args.push('-shortest');

  const format = path.extname(outputPath).slice(1).toLowerCase();
  if (format === 'mov') args.push('-f', 'mov');
  if (format === 'mkv') args.push('-f', 'matroska');
  if (format === 'webm') args.push('-f', 'webm');

  args.push(outputPath);
  await runCommand(FFMPEG_PATH, args);
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {object} settings  filtres complets (pipeline + extended)
 * @param {object} [videoSettings]  options d'encodage
 * @param {object} [range]  { in, out } en secondes
 * @param {function} [onProgress]
 */
async function processVideo(inputPath, outputPath, settings = {}, videoSettings = {}, range = {}, onProgress = () => {}) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pikado-video-'));
  const framesDir = path.join(workDir, 'frames');
  try {
    onProgress({ stage: 'analyse' });
    const probe = await probeVideo(inputPath);
    let fps = probe.fps;
    if (videoSettings.fps && videoSettings.fps !== 'source') {
      fps = parseFloat(videoSettings.fps);
    }

    const scaleMap = { source: 1, '4k': 3840 / probe.width, '1080p': 1920 / probe.width, '720p': 1280 / probe.width, '480p': 854 / probe.width };
    let scale = 1;
    if (videoSettings.resolution && videoSettings.resolution !== 'source') {
      scale = scaleMap[videoSettings.resolution] || 1;
      if (videoSettings.resolution === 'custom' && videoSettings.scalePercent) {
        scale = parseFloat(videoSettings.scalePercent) / 100;
      }
    }
    scale = Math.min(1, Math.max(0.1, scale));

    onProgress({ stage: 'extraction' });
    await extractFrames(inputPath, framesDir, range, scale);

    onProgress({ stage: 'traitement' });
    const total = await processAllFrames(framesDir, settings, onProgress);
    onProgress({ stage: 'traitement', current: total, total });

    onProgress({ stage: 'assemblage' });
    await reassembleVideo(framesDir, fps, inputPath, outputPath, videoSettings, range);

    onProgress({ stage: 'terminé' });
    return { outputPath, fps, frameCount: total };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

module.exports = { processVideo, probeVideo };
