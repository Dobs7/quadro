// Quadro — processo principal.
// Arquitetura: a janela de vídeo hospeda o motor (mpv, processo separado); uma janela
// transparente por cima hospeda a interface. Se o motor cair, a interface continua viva
// e o motor é reiniciado no mesmo ponto do vídeo.
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { Mpv } = require('./mpv');

const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'm2ts', 'mts', '3gp', 'ogv', 'mxf', 'vob', 'divx', 'f4v', 'gif'];
const AUDIO_EXT = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aiff'];
const MEDIA_EXT = new Set([...VIDEO_EXT, ...AUDIO_EXT]);
const ASSOC_EXT = VIDEO_EXT.filter((e) => e !== 'gif');
const OBSERVE = [
  'time-pos', 'duration', 'pause', 'volume', 'mute', 'speed', 'path', 'media-title', 'filename',
  'container-fps', 'estimated-frame-number', 'estimated-frame-count', 'video-params', 'video-codec',
  'audio-codec-name', 'loop-file', 'ab-loop-a', 'ab-loop-b', 'playlist-pos', 'playlist', 'track-list',
  'osd-dimensions', 'eof-reached', 'idle-active', 'hwdec-current', 'file-size', 'file-format',
  'video-bitrate', 'video-zoom', 'video-pan-x', 'video-pan-y', 'aid', 'sid', 'seeking',
];
const isWin = process.platform === 'win32';

app.setName('Quadro');
const isSmoke = process.argv.includes('--smoke-test');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { volume: 100, autoNext: false, alwaysOnTop: false, compat: false, recent: [], resume: {} };
function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch {}
}
let saveTimer = null;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
      fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 1));
    } catch {}
  }, 300);
}

let videoWin = null, overlay = null, mpv = null;
let props = {};
let currentList = [];
let restarts = [];
let pendingSeek = null; // { path, pos, pause } aplicado quando o arquivo carregar
let quitting = false;
let watchdogFails = 0, watchdogTimer = null;
let instance = 0;

const send = (ch, ...a) => { if (overlay && !overlay.isDestroyed()) overlay.webContents.send('q:' + ch, ...a); };
const toast = (msg, kind = 'info') => send('toast', msg, kind);

function mediaArgs(argv) {
  return argv.slice(1).filter((a) => {
    if (!a || a.startsWith('-')) return false;
    try { const st = fs.statSync(a); return st.isDirectory() ? false : MEDIA_EXT.has(path.extname(a).slice(1).toLowerCase()); } catch { return false; }
  }).map((a) => path.resolve(a));
}

function mpvBin() {
  if (process.env.QUADRO_MPV) return process.env.QUADRO_MPV;
  const packed = path.join(process.resourcesPath, 'mpv', isWin ? 'mpv.exe' : 'mpv');
  if (fs.existsSync(packed)) return packed;
  return path.join(__dirname, '..', 'mpv', isWin ? 'mpv.exe' : 'mpv');
}

function shotsDir() {
  const d = path.join(app.getPath('pictures'), 'Quadro');
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
  return d;
}

async function startEngine() {
  const h = videoWin.getNativeWindowHandle();
  const wid = h.length >= 8 ? h.readBigUInt64LE(0).toString() : h.readUInt32LE(0).toString();
  const id = `quadro-mpv-${process.pid}-${++instance}`;
  const pipe = isWin ? `\\\\.\\pipe\\${id}` : path.join(os.tmpdir(), id + '.sock');
  const m = new Mpv({ bin: mpvBin(), wid, pipe });
  mpv = m;
  m.on('prop', (name, value) => {
    if (m !== mpv) return;
    props[name] = value;
    send('prop', name, value);
    if (name === 'media-title' || name === 'idle-active') updateTitle();
    if (name === 'volume' && typeof value === 'number') { settings.volume = Math.round(value); saveSettings(); }
  });
  m.on('event', (ev) => {
    if (m !== mpv) return;
    if (ev.event === 'file-loaded') onFileLoaded();
    if (ev.event === 'end-file' && ev.reason === 'error') toast('Não foi possível abrir este arquivo.', 'error');
  });
  m.on('crashed', (reason) => { if (m === mpv) onEngineCrash(reason); });
  await m.start(OBSERVE);
  const boot = {
    'keep-open': settings.autoNext ? 'yes' : 'always',
    'hr-seek': 'yes', 'hwdec': 'auto-safe', 'volume-max': 150, 'volume': settings.volume,
    'osd-level': 0, 'background': 'color', 'background-color': '#000000', 'sub-auto': 'fuzzy',
    'screenshot-format': 'png', 'screenshot-directory': shotsDir(), 'cursor-autohide': 'no',
  };
  for (const [k, v] of Object.entries(boot)) m.set(k, v).catch(() => {});
  startWatchdog();
}

function startWatchdog() {
  clearInterval(watchdogTimer);
  watchdogFails = 0;
  watchdogTimer = setInterval(async () => {
    if (!mpv || !mpv.ready || quitting) return;
    const m = mpv;
    try { await m.send(['get_property', 'mpv-version'], 4000); watchdogFails = 0; }
    catch (e) {
      if (m !== mpv || !m.ready) return;
      if (++watchdogFails >= 4) { watchdogFails = 0; m.kill(); } // motor travado: derruba e deixa a recuperação agir
    }
  }, 4000);
}

async function onEngineCrash(reason) {
  if (quitting) return;
  const now = Date.now();
  restarts = restarts.filter((t) => now - t < 30000);
  restarts.push(now);
  const last = { path: props['path'], pos: props['time-pos'], idx: props['playlist-pos'] };
  if (restarts.length > 3) {
    toast('O motor de vídeo falhou várias vezes seguidas. Tente outro arquivo.', 'error');
    props = {}; send('reset');
    try { await startEngine(); } catch {}
    return;
  }
  toast('O motor de vídeo foi reiniciado. Retomando de onde parou.', 'warn');
  props = {}; send('reset');
  try {
    await startEngine();
    if (currentList.length && last.path) {
      const idx = Math.max(0, currentList.indexOf(last.path));
      await playList(currentList, idx, { pos: last.pos, pause: true });
    }
  } catch (e) {
    toast('Não foi possível reiniciar o motor de vídeo: ' + e.message, 'error');
  }
}

function onFileLoaded() {
  const p = props['path'];
  if (pendingSeek && pendingSeek.pos > 0) {
    mpv.send(['seek', pendingSeek.pos, 'absolute+exact']).catch(() => {});
    if (pendingSeek.pause) mpv.set('pause', true).catch(() => {});
  }
  pendingSeek = null;
  if (p) {
    settings.recent = [{ path: p, name: path.basename(p), ts: Date.now() }, ...settings.recent.filter((r) => r.path !== p)].slice(0, 12);
    saveSettings();
    send('settings', settings);
  }
}

function updateTitle() {
  if (!videoWin || videoWin.isDestroyed()) return;
  const t = props['idle-active'] === false && props['media-title'] ? `${props['media-title']} — Quadro` : 'Quadro';
  videoWin.setTitle(t);
}

const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

async function playList(list, idx, opts = {}) {
  if (!mpv || !mpv.ready) return;
  currentList = list;
  pendingSeek = opts.pos > 1 ? { pos: opts.pos, pause: !!opts.pause } : null;
  try {
    await mpv.send(['stop']);
    for (const f of list) await mpv.send(['loadfile', f, 'append']);
    await mpv.set('pause', false);
    await mpv.set('playlist-pos', idx);
  } catch (e) { toast('Não foi possível abrir: ' + e.message, 'error'); }
}

async function openPaths(paths) {
  paths = (paths || []).filter(Boolean);
  if (!paths.length) return;
  let list = [], idx = 0;
  if (paths.length === 1) {
    let st = null; try { st = fs.statSync(paths[0]); } catch {}
    if (!st) return toast('Arquivo não encontrado.', 'error');
    const dir = st.isDirectory() ? paths[0] : path.dirname(paths[0]);
    let siblings = [];
    try {
      siblings = fs.readdirSync(dir).filter((f) => MEDIA_EXT.has(path.extname(f).slice(1).toLowerCase())).sort(natural).map((f) => path.join(dir, f));
    } catch {}
    if (st.isDirectory()) { list = siblings; idx = 0; }
    else {
      const i = siblings.findIndex((f) => f.toLowerCase() === paths[0].toLowerCase());
      if (i >= 0 && siblings.length <= 800) { list = siblings; idx = i; } else { list = [paths[0]]; idx = 0; }
    }
  } else list = paths.slice().sort(natural);
  if (!list.length) return toast('Nenhum vídeo encontrado nessa pasta.', 'warn');
  const resume = settings.resume[list[idx]];
  await playList(list, idx, resume ? { pos: resume } : {});
  focusUi();
}

function rememberPosition() {
  const p = props['path'], t = props['time-pos'], d = props['duration'];
  if (!p || typeof t !== 'number' || typeof d !== 'number') return;
  if (d >= 300 && t > 30 && t < d - 30) settings.resume[p] = Math.floor(t); else delete settings.resume[p];
  const keys = Object.keys(settings.resume);
  if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete settings.resume[k];
}

function syncOverlay() {
  if (!overlay || overlay.isDestroyed() || !videoWin || videoWin.isDestroyed()) return;
  overlay.setBounds(videoWin.getContentBounds());
}
function focusUi() {
  if (isSmoke) return;
  if (!videoWin || videoWin.isDestroyed()) return;
  if (videoWin.isMinimized()) videoWin.restore();
  videoWin.show();
  if (overlay && !overlay.isDestroyed()) { overlay.show(); overlay.focus(); }
}

// ---- Registro como player padrão (por usuário, sem precisar de administrador) ----
function regFile(remove) {
  const exe = process.execPath;
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const cmd = esc(`"${exe}" "%1"`);
  const C = 'HKEY_CURRENT_USER\\Software\\Classes';
  const L = ['Windows Registry Editor Version 5.00', ''];
  if (remove) {
    L.push(`[-${C}\\QuadroPlayer.Video]`, `[-${C}\\Applications\\Quadro.exe]`, '[-HKEY_CURRENT_USER\\Software\\QuadroPlayer]', '');
    L.push('[HKEY_CURRENT_USER\\Software\\RegisteredApplications]', '"QuadroPlayer"=-', '');
    for (const e of ASSOC_EXT) L.push(`[${C}\\.${e}\\OpenWithProgids]`, '"QuadroPlayer.Video"=-', '');
  } else {
    L.push(`[${C}\\QuadroPlayer.Video]`, '@="Vídeo (Quadro)"', '"FriendlyTypeName"="Vídeo (Quadro)"', '');
    L.push(`[${C}\\QuadroPlayer.Video\\DefaultIcon]`, `@="${esc(`"${exe}",0`)}"`, '');
    L.push(`[${C}\\QuadroPlayer.Video\\shell\\open]`, '"FriendlyAppName"="Quadro"', '');
    L.push(`[${C}\\QuadroPlayer.Video\\shell\\open\\command]`, `@="${cmd}"`, '');
    L.push(`[${C}\\Applications\\Quadro.exe]`, '"FriendlyAppName"="Quadro"', '');
    L.push(`[${C}\\Applications\\Quadro.exe\\shell\\open\\command]`, `@="${cmd}"`, '');
    L.push(`[${C}\\Applications\\Quadro.exe\\SupportedTypes]`, ...ASSOC_EXT.map((e) => `".${e}"=""`), '');
    for (const e of ASSOC_EXT) L.push(`[${C}\\.${e}\\OpenWithProgids]`, '"QuadroPlayer.Video"=hex(0):', '');
    L.push('[HKEY_CURRENT_USER\\Software\\QuadroPlayer\\Capabilities]', '"ApplicationName"="Quadro"',
      '"ApplicationDescription"="Player de vídeo estável, com ferramentas de revisão de motion"', '');
    L.push('[HKEY_CURRENT_USER\\Software\\QuadroPlayer\\Capabilities\\FileAssociations]', ...ASSOC_EXT.map((e) => `".${e}"="QuadroPlayer.Video"`), '');
    L.push('[HKEY_CURRENT_USER\\Software\\RegisteredApplications]', '"QuadroPlayer"="Software\\\\QuadroPlayer\\\\Capabilities"', '');
  }
  return L.join('\r\n');
}
function registerDefault(remove = false) {
  return new Promise((resolve) => {
    if (!isWin) return resolve({ ok: false, error: 'Disponível apenas no Windows.' });
    const f = path.join(app.getPath('temp'), `quadro-${remove ? 'remover' : 'registrar'}.reg`);
    try { fs.writeFileSync(f, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(regFile(remove), 'utf16le')])); }
    catch (e) { return resolve({ ok: false, error: e.message }); }
    execFile('reg.exe', ['import', f], { windowsHide: true }, (err) => {
      try { fs.unlinkSync(f); } catch {}
      if (err) return resolve({ ok: false, error: err.message });
      if (!remove) shell.openExternal('ms-settings:defaultapps?registeredAppUser=QuadroPlayer').catch(() => {});
      resolve({ ok: true });
    });
  });
}

// ---- Janelas ----
function createWindows() {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);
  videoWin = new BrowserWindow({
    width: 1280, height: 780, minWidth: 720, minHeight: 440, show: false, backgroundColor: '#000000',
    title: 'Quadro', autoHideMenuBar: true, alwaysOnTop: !!settings.alwaysOnTop,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  videoWin.loadURL('data:text/html,<html style="background:%23000"></html>');
  overlay = new BrowserWindow({
    parent: videoWin, frame: false, transparent: true, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false, show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  overlay.loadFile(path.join(__dirname, 'ui', 'index.html'));
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.webContents.on('will-navigate', (e) => e.preventDefault());

  for (const ev of ['move', 'resize', 'maximize', 'unmaximize', 'restore', 'show', 'enter-full-screen', 'leave-full-screen'])
    videoWin.on(ev, () => { syncOverlay(); if (ev.endsWith('full-screen')) { setTimeout(syncOverlay, 150); send('fullscreen', videoWin.isFullScreen()); } });
  videoWin.on('focus', () => { if (overlay && !overlay.isDestroyed() && overlay.isVisible()) overlay.focus(); });
  videoWin.on('close', () => { quitting = true; rememberPosition(); try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 1)); } catch {} });
  videoWin.on('closed', () => { videoWin = null; shutdown(); });
  overlay.on('close', (e) => { if (!quitting && videoWin && !videoWin.isDestroyed()) { e.preventDefault(); videoWin.close(); } });

  videoWin.once('ready-to-show', async () => {
    if (!isSmoke) { videoWin.show(); syncOverlay(); overlay.show(); overlay.focus(); }
    try { await startEngine(); } catch (e) { toast('Motor de vídeo não iniciou: ' + e.message, 'error'); return; }
    if (isSmoke) { await runReleaseSmoke(); return; }
    const files = mediaArgs(process.argv);
    if (files.length) openPaths(files);
  });
}

async function shutdown() {
  quitting = true;
  clearInterval(watchdogTimer);
  if (mpv) await mpv.stop();
  app.quit();
}

// ---- IPC com a interface ----
function wireIpc() {
  const h = (ch, fn) => ipcMain.handle('q:' + ch, (_e, ...a) => fn(...a));
  h('init', () => ({ props, settings, fullscreen: videoWin ? videoWin.isFullScreen() : false, version: app.getVersion(), isWin }));
  h('cmd', async (...args) => { try { return await mpv.send(args); } catch { return null; } });
  h('set', async (name, value) => { try { await mpv.set(name, value); return true; } catch { return false; } });
  h('open-dialog', async () => {
    const r = await dialog.showOpenDialog(videoWin, {
      title: 'Abrir vídeo', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Vídeo e áudio', extensions: [...MEDIA_EXT] }, { name: 'Todos os arquivos', extensions: ['*'] }],
    });
    if (!r.canceled) await openPaths(r.filePaths);
    focusUi();
  });
  h('open-paths', (paths) => openPaths(paths));
  h('fullscreen', (v) => { const on = v === undefined ? !videoWin.isFullScreen() : !!v; videoWin.setFullScreen(on); });
  h('setting', (key, value) => {
    settings[key] = value; saveSettings();
    if (key === 'autoNext' && mpv) mpv.set('keep-open', value ? 'yes' : 'always').catch(() => {});
    if (key === 'alwaysOnTop') videoWin.setAlwaysOnTop(!!value);
    return settings;
  });
  h('clear-recent', () => { settings.recent = []; saveSettings(); return settings; });
  h('screenshot', async () => {
    const base = (props['filename'] || 'quadro').replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*]/g, '_');
    const fr = props['estimated-frame-number'];
    let file = path.join(shotsDir(), `${base}_${typeof fr === 'number' ? 'f' + String(fr).padStart(5, '0') : Date.now()}.png`);
    if (fs.existsSync(file)) file = file.replace(/\.png$/, `_${Date.now()}.png`);
    try { await mpv.send(['screenshot-to-file', file, 'video']); return file; } catch { return null; }
  });
  h('reveal', (p) => { if (p && fs.existsSync(p)) shell.showItemInFolder(p); else shell.openPath(shotsDir()); });
  h('register-default', () => registerDefault(false));
  h('unregister-default', () => registerDefault(true));
  h('quit', () => videoWin && videoWin.close());
}

// ---- Inicialização ----
loadSettings();
// A aceleração gráfica da interface cobre o vídeo do motor no Windows (confirmado em teste real);
// a interface é leve e roda sem ela. O vídeo continua acelerado pela placa, dentro do motor.
app.disableHardwareAcceleration();
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e, argv) => { const files = mediaArgs(argv); if (files.length) openPaths(files); focusUi(); });
  app.whenReady().then(() => { wireIpc(); createWindows(); });
  app.on('window-all-closed', () => app.quit());
}

async function runReleaseSmoke() {
  const output = process.env.QUADRO_SMOKE_OUTPUT;
  try {
    const assert = require('node:assert/strict');
    assert(output, 'Destino de teste ausente');
    assert.equal(settings.recent.length, 0);
    assert.equal(Object.keys(settings.resume).length, 0);
    fs.mkdirSync(output, {recursive:true});
    const input = process.env.QUADRO_SMOKE_INPUT;
    assert(input && fs.existsSync(input), 'Vídeo sintético ausente');
    await mpv.send(['loadfile', input]);
    const until = Date.now() + 15000;
    let duration = 0;
    while (Date.now() < until) {
      duration = await mpv.get('duration').catch(()=>0);
      if (duration > 0) break;
      await new Promise(r=>setTimeout(r,100));
    }
    assert(duration > 0, 'O motor não carregou o vídeo');
    await mpv.set('pause', true);
    await mpv.send(['seek', 0.5, 'absolute+exact']);
    const screenshot = path.join(output, 'quadro-sintetico.png');
    await mpv.send(['screenshot-to-file', screenshot, 'video']);
    assert(fs.statSync(screenshot).size > 1000);
    const ui = await overlay.webContents.executeJavaScript('({title:document.title,bridge:!!window.quadro,body:document.body.innerText.length})');
    assert(ui.bridge && ui.body > 20);
    fs.writeFileSync(path.join(output, 'primeira-execucao.json'), JSON.stringify({passed:true,initialRecentCount:0,initialResumeCount:0,duration,ui},null,2));
    await mpv.stop(); app.exit(0);
  } catch(error) {
    if(output) fs.writeFileSync(path.join(output, 'erro.txt'), String(error.stack || error));
    if(mpv) await mpv.stop(); app.exit(1);
  }
}
