'use strict';
const { app, BrowserWindow, Menu, ipcMain, shell, session, dialog } = require('electron');
const path = require('path');
const { Store } = require('./store');
const { createServer } = require('./server');
const { createDemo } = require('./demo');
const { createOllama } = require('./integrations/ollama');
const { createClaude } = require('./integrations/claude');
const { validateLayout } = require('./layout-validate');

const APP_TITLE = 'Kancelář agentů';
const DATA_DIR_NAME = 'Kancelar Agentu';

app.setName(APP_TITLE);
// ~/Library/Application Support/Kancelar Agentu (na macOS)
const dataDir = process.env.KANCELAR_DATA_DIR || path.join(app.getPath('appData'), DATA_DIR_NAME);
app.setPath('userData', dataDir);
// Mezipaměti Chromia odděleně od našich dat (state.json, history.jsonl …).
app.setPath('sessionData', path.join(dataDir, 'Chromium'));
// Sandbox pro všechny renderery. (--no-sandbox jen pro testy v kontejneru pod rootem.)
if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let store = null;
let server = null;
let demo = null;
let ollama = null;
let claude = null;
let editorOn = false;

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');

function isLocalUrl(url) {
  if (url.startsWith('devtools://') || url.startsWith('chrome-extension://')) return !app.isPackaged;
  if (!url.startsWith('file://')) return false;
  try {
    const p = path.resolve(decodeURIComponent(new URL(url).pathname)).normalize('NFC');
    const root = path.resolve(RENDERER_DIR).normalize('NFC');
    return p.startsWith(root + path.sep);
  } catch (_) {
    return false;
  }
}

function hardenSession() {
  const ses = session.defaultSession;
  // Povolené jsou jen lokální soubory aplikace – žádné http(s), ws ani jiné vzdálené zdroje.
  ses.webRequest.onBeforeRequest((details, cb) => {
    const ok = isLocalUrl(details.url) || details.url.startsWith('data:');
    if (!ok) console.warn('Zablokováno:', details.url);
    cb({ cancel: !ok });
  });
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setSpellCheckerEnabled && ses.setSpellCheckerEnabled(false);
}

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (ev, url) => { if (!isLocalUrl(url)) ev.preventDefault(); });
  contents.on('will-redirect', (ev) => ev.preventDefault());
  contents.on('will-attach-webview', (ev) => ev.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

function snapshot() {
  return {
    agents: store.list(),
    settings: Object.assign({}, store.settings),
    port: server ? server.port : null,
    dataDir
  };
}

function broadcast() {
  if (win && !win.isDestroyed()) win.webContents.send('kancelar:update', snapshot());
}

function applySettings() {
  const s = store.settings;
  s.demo ? demo.start() : demo.stop();
  s.ollama ? ollama.start() : ollama.stop();
  s.claude ? claude.start() : claude.stop();
  buildMenu();
}

function openDataFolder() {
  return shell.openPath(dataDir);
}

function sendMenu(cmd) {
  if (win && !win.isDestroyed()) win.webContents.send('kancelar:menu', cmd);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const s = store ? store.settings : {};
  const template = [
    ...(isMac ? [{
      label: APP_TITLE,
      submenu: [
        { role: 'about', label: 'O aplikaci ' + APP_TITLE },
        { type: 'separator' },
        { role: 'hide', label: 'Skrýt ' + APP_TITLE },
        { role: 'hideOthers', label: 'Skrýt ostatní' },
        { role: 'unhide', label: 'Zobrazit vše' },
        { type: 'separator' },
        { role: 'quit', label: 'Ukončit ' + APP_TITLE }
      ]
    }] : []),
    {
      label: 'Soubor',
      submenu: [
        { label: 'Otevřít složku s daty', accelerator: 'CmdOrCtrl+Shift+O', click: openDataFolder },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Zavřít okno' } : { role: 'quit', label: 'Ukončit' }
      ]
    },
    {
      label: 'Úpravy',
      submenu: [
        { role: 'undo', label: 'Zpět' },
        { role: 'redo', label: 'Znovu' },
        { type: 'separator' },
        { role: 'cut', label: 'Vyjmout' },
        { role: 'copy', label: 'Kopírovat' },
        { role: 'paste', label: 'Vložit' },
        { role: 'selectAll', label: 'Vybrat vše' }
      ]
    },
    {
      label: 'Kancelář',
      submenu: [
        { label: 'Upravit rozložení', type: 'checkbox', checked: editorOn, accelerator: 'CmdOrCtrl+E', click: () => sendMenu('toggle-editor') },
        { label: 'Obnovit výchozí rozložení', click: () => sendMenu('reset-layout') },
        { type: 'separator' },
        { label: 'Demo režim', type: 'checkbox', checked: !!s.demo, click: (i) => { store.setSetting('demo', i.checked); } },
        { label: 'Sledovat Ollamu', type: 'checkbox', checked: !!s.ollama, click: (i) => { store.setSetting('ollama', i.checked); } },
        { label: 'Sledovat Claude Code', type: 'checkbox', checked: !!s.claude, click: (i) => { store.setSetting('claude', i.checked); } }
      ]
    },
    {
      label: 'Zobrazení',
      submenu: [
        ...(!app.isPackaged ? [
          { role: 'reload', label: 'Znovu načíst' },
          { role: 'toggleDevTools', label: 'Nástroje pro vývojáře' },
          { type: 'separator' }
        ] : []),
        { role: 'togglefullscreen', label: 'Celá obrazovka' }
      ]
    },
    {
      label: 'Okno',
      submenu: [
        { role: 'minimize', label: 'Minimalizovat' },
        { role: 'zoom', label: 'Přiblížit' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front', label: 'Vše do popředí' }] : [])
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    title: APP_TITLE,
    backgroundColor: '#15171d',
    show: false,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(RENDERER_DIR, 'index.html'));
  win.on('closed', () => { win = null; });
}

function registerIpc() {
  ipcMain.handle('kancelar:snapshot', () => snapshot());
  ipcMain.handle('kancelar:history', (_e, id) => (typeof id === 'string' ? store.getHistory(id, 60) : []));
  ipcMain.handle('kancelar:layout:get', () => store.loadLayout());
  ipcMain.handle('kancelar:layout:save', (_e, layout) => {
    const clean = validateLayout(layout);
    if (!clean) return { ok: false, error: 'Neplatné rozložení.' };
    store.saveLayout(clean);
    return { ok: true };
  });
  ipcMain.handle('kancelar:layout:reset', () => { store.resetLayout(); return { ok: true }; });
  ipcMain.handle('kancelar:setting', (_e, key, value) => ({ ok: store.setSetting(String(key), !!value) }));
  ipcMain.handle('kancelar:open-data', () => openDataFolder());
  ipcMain.on('kancelar:editor-state', (_e, on) => { editorOn = !!on; buildMenu(); });
}

app.whenReady().then(async () => {
  hardenSession();
  store = new Store(dataDir);
  demo = createDemo(store);
  ollama = createOllama(store);
  claude = createClaude(store);
  registerIpc();
  buildMenu();

  server = createServer(store);
  try {
    const port = await server.listen(parseInt(process.env.KANCELAR_PORT || '', 10) || undefined);
    store.writeServerInfo({ host: '127.0.0.1', port, pid: process.pid, startedAt: new Date().toISOString() });
    console.log(`API běží na http://127.0.0.1:${port}`);
  } catch (err) {
    dialog.showErrorBox(APP_TITLE, 'Lokální server se nepodařilo spustit: ' + err.message);
  }

  let pending = null;
  store.on('change', () => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; broadcast(); }, 50);
  });
  store.on('settings', () => { applySettings(); broadcast(); });
  applySettings();

  if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
    try { app.dock.setIcon(path.join(__dirname, '..', '..', 'build', 'icon.png')); } catch (_) { /* nic */ }
  }
  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (store) { store.flush(); store.clearServerInfo(); }
  if (server) server.close();
});
