const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { createPublisher, getPlatformDefinitions } = require('./publishers/registry');
const { ensureProfile } = require('./publishers/session-store');
const { RpaService } = require('./rpa/rpa-service');
const { detectChrome } = require('./rpa/browser/chrome-detector');
const { platformDirectories } = require('./rpa/browser/profile-manager');
const { profiles, ensureFingerprint } = require('./rpa/browser/fingerprint-profiles');

const defaultState = {
  settings: { cacheRoot: '', maxConcurrentUploads: 2, browserWidth: 1280, browserHeight: 800 },
  contents: [],
  accounts: [
    { id: 'x-main', platform: 'X', name: '主账号', note: '', fingerprint: null, proxy: { enabled: false, server: '', username: '', password: '' }, status: '未连接', cacheDir: '' },
    { id: 'xhs-main', platform: '小红书', name: '主账号', note: '', proxy: { enabled: false, server: '', username: '', password: '' }, status: '未连接', cacheDir: '' },
    { id: 'douyin-main', platform: '抖音', name: '主账号', note: '', proxy: { enabled: false, server: '', username: '', password: '' }, status: '未连接', cacheDir: '' },
    { id: 'kuaishou-main', platform: '快手', name: '主账号', note: '', proxy: { enabled: false, server: '', username: '', password: '' }, status: '未连接', cacheDir: '' },
    { id: 'wechat-main', platform: '微信公众号', name: '主账号', note: '', proxy: { enabled: false, server: '', username: '', password: '' }, status: '未连接', cacheDir: '' },
    { id: 'channels-main', platform: '微信视频号', name: '主账号', note: '', proxy: { enabled: false, server: '', username: '', password: '' }, status: '未连接', cacheDir: '' },
    { id: 'xigua-main', platform: '西瓜视频', name: '主账号', note: '', proxy: { enabled: false, server: '', username: '', password: '' }, status: '未连接', cacheDir: '' },
    { id: 'bilibili-main', platform: '哔哩哔哩', name: '主账号', note: '', proxy: { enabled: false, server: '', username: '', password: '' }, status: '未连接', cacheDir: '' },
    { id: 'zhihu-main', platform: '知乎', name: '主账号', note: '', proxy: { enabled: false, server: '', username: '', password: '' }, status: '未连接', cacheDir: '' },
    { id: 'juejin-main', platform: '掘金', name: '主账号', note: '', proxy: { enabled: false, server: '', username: '', password: '' }, status: '未连接', cacheDir: '' }
  ],
  jobs: []
};

let statePath;
const loginWindows = new Map();
function readState() {
  let next;
  try { next = { ...structuredClone(defaultState), ...JSON.parse(fs.readFileSync(statePath, 'utf8')) }; } catch { next = structuredClone(defaultState); }
  next.accounts = (next.accounts || []).map(account => { ensureFingerprint(account); return account; });
  next.settings = { maxConcurrentUploads: 2, browserWidth: 1280, browserHeight: 800, ...(next.settings || {}) };
  return next;
}
function writeState(next) {
  state = next;
  if (rpaService) {
    rpaService.state = state;
    rpaService.profiles.state = state;
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  return state;
}
let state;
let rpaService;
let mainWindow;
let isQuitting = false;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f5f7f8',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow = win;
  win.webContents.on('did-fail-load', (_, code, description, url) => console.error('Renderer failed to load', code, description, url));
  win.webContents.on('console-message', (_, level, message, line, sourceId) => { if (level >= 2) console.error(`Renderer ${sourceId}:${line}`, message); });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  statePath = path.join(app.getPath('userData'), 'autopost-state.json');
  state = readState();
  rpaService = new RpaService({ app, state });
  rpaService.on('log', (entry) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('rpa:log', entry); });
  rpaService.on('publish-confirmation', (entry) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('rpa:publish-confirmation', entry); });
  ipcMain.handle('state:get', () => state);
  ipcMain.handle('state:save', (_, next) => writeState(next));
  ipcMain.handle('browser:info', () => detectChrome());
  ipcMain.handle('fingerprint:profiles', () => profiles);
  ipcMain.handle('settings:set-cache-root', (_, cacheRoot) => { state.settings.cacheRoot = cacheRoot || ''; writeState(state); return state.settings; });
  ipcMain.handle('account:add', (_, { platform, name, note = '', proxy = {} }) => {
    const slug = `${platform}-${String(name).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-') || 'account'}-${Date.now()}`;
    const account = { id: slug, platform, name: String(name).trim(), note: String(note).trim(), fingerprint: null, proxy: { enabled: Boolean(proxy.enabled), server: proxy.server || '', username: proxy.username || '', password: proxy.password || '' }, status: '未连接', cacheDir: '' };
    ensureFingerprint(account);
    const root = state.settings.cacheRoot || path.join(app.getPath('userData'), 'profiles');
    account.cacheDir = path.join(root, platformDirectories[platform] || 'other', slug);
    fs.mkdirSync(account.cacheDir, { recursive: true, mode: 0o700 });
    state.accounts.push(account); writeState(state); return account;
  });
  ipcMain.handle('account:update', async (_, { accountId, platform, name, note = '', proxy = {} }) => {
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) throw new Error(`找不到账号: ${accountId}`);
    const normalizedName = String(name || '').trim();
    if (!normalizedName) throw new Error('账号名称不能为空');
    if (state.accounts.some((item) => item.id !== accountId && item.platform === platform && item.name.trim().toLowerCase() === normalizedName.toLowerCase())) throw new Error('同一平台下账号名称不能重复');
    const oldCacheDir = account.cacheDir;
    await rpaService.close(accountId);
    const slug = `${platform}-${normalizedName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-') || 'account'}-${account.id}`;
    const root = path.resolve(state.settings.cacheRoot || path.join(app.getPath('userData'), 'profiles'));
    const nextCacheDir = oldCacheDir ? path.join(path.dirname(oldCacheDir), slug) : path.join(root, platformDirectories[platform] || 'other', slug);
    if (oldCacheDir && path.resolve(oldCacheDir) !== path.resolve(nextCacheDir) && fs.existsSync(oldCacheDir)) {
      if (fs.existsSync(nextCacheDir)) throw new Error('目标缓存目录已存在，请先处理同名缓存目录');
      fs.renameSync(oldCacheDir, nextCacheDir);
    }
    fs.mkdirSync(nextCacheDir, { recursive: true, mode: 0o700 });
    account.platform = platform;
    account.name = normalizedName;
    account.note = String(note || '').trim();
    account.proxy = { enabled: Boolean(proxy.enabled), server: proxy.server || '', username: proxy.username || '', password: proxy.password || '' };
    account.cacheDir = nextCacheDir;
    account.status = '未连接';
    account.debugPort = undefined;
    writeState(state);
    return account;
  });
  ipcMain.handle('account:delete', async (_, accountId) => {
    const index = state.accounts.findIndex(item => item.id === accountId);
    if (index < 0) throw new Error(`找不到账号: ${accountId}`);
    const account = state.accounts[index];
    await rpaService.close(accountId);
    const root = path.resolve(state.settings.cacheRoot || path.join(app.getPath('userData'), 'profiles'));
    const cacheDir = path.resolve(account.cacheDir || path.join(root, platformDirectories[account.platform] || 'other', account.id));
    const isOwnedCache = cacheDir && cacheDir !== root && (cacheDir.startsWith(`${root}${path.sep}`) || path.basename(cacheDir) === account.id);
    if (isOwnedCache && fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true });
    state.accounts.splice(index, 1);
    state.jobs = (state.jobs || []).map(job => ({ ...job, targets: (job.targets || []).filter(target => target.accountId !== accountId) })).filter(job => job.targets.length > 0);
    state.contents = (state.contents || []).map(content => ({ ...content, targets: (content.targets || []).filter(target => target.accountId !== accountId) })).filter(content => content.targets.length > 0);
    writeState(state);
    return { accountId, cacheDir, deleted: true };
  });
  ipcMain.handle('account:open-cache', async (_, accountId) => {
    const account = state.accounts.find(item => item.id === accountId);
    if (!account) throw new Error(`找不到账号: ${accountId}`);
    const root = state.settings.cacheRoot || path.join(app.getPath('userData'), 'profiles');
    account.cacheDir = account.cacheDir || path.join(root, platformDirectories[account.platform] || 'other', account.id);
    fs.mkdirSync(account.cacheDir, { recursive: true, mode: 0o700 });
    state.activeAccountId = account.id; writeState(state); await shell.openPath(account.cacheDir); return account;
  });
  ipcMain.handle('account:login', async (_, accountId) => {
    const account = state.accounts.find(item => item.id === accountId);
    if (!account) throw new Error(`找不到账号: ${accountId}`);
    const result = await rpaService.openLogin(account);
    state.activeAccountId = account.id; writeState(state);
    return { id: account.id, ...result };
  });
  ipcMain.handle('account:check-login', async (_, accountId) => {
    const account = state.accounts.find(item => item.id === accountId);
    if (!account) throw new Error(`找不到账号: ${accountId}`);
    const result = await rpaService.checkLogin(account);
    account.status = result.status;
    rpaService.log('accounts', account, `登录检测：${result.status}（Cookie=${result.cookieMatch ? '有' : '无'}，页面=${result.selectorMatch ? '有' : '无'}，接口=${result.endpointMatch ? '通过' : '未通过'}）`);
    writeState(state);
    return result;
  });
  ipcMain.handle('account:rpa-login', async (_, accountId) => {
    const account = state.accounts.find(item => item.id === accountId);
    if (!account) throw new Error(`找不到账号: ${accountId}`);
    rpaService.log('accounts', account, '开始等待登录状态同步');
    const result = await rpaService.waitForLogin(account, 180000, (message) => rpaService.log('accounts', account, message));
    rpaService.log('accounts', account, '登录状态检测成功');
    account.status = result.status; writeState(state);
    return { status: account.status, ...result };
  });
  ipcMain.handle('dialog:choose-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('dialog:choose-files', async (_, options = {}) => {
    const properties = ['openFile'];
    if (options.multiple) properties.push('multiSelections');
    const result = await dialog.showOpenDialog({ properties, filters: options.filters || [] });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('account:set-cache-dir', (_, { accountId, cacheDir }) => {
    const account = state.accounts.find(item => item.id === accountId);
    if (!account) throw new Error(`找不到账号: ${accountId}`);
    if (cacheDir && state.accounts.some(item => item.id !== accountId && item.cacheDir === cacheDir)) {
      throw new Error('这个缓存目录已经被其它平台或账号使用，请选择独立目录');
    }
    account.cacheDir = cacheDir || '';
    writeState(state);
    return account;
  });
  ipcMain.handle('publishers:list', () => getPlatformDefinitions());
  ipcMain.handle('job:delete', (_, jobId) => {
    const before = state.jobs.length;
    state.jobs = state.jobs.filter(job => job.id !== jobId);
    state.contents = state.contents.filter(content => content.id !== jobId);
    writeState(state);
    return { deleted: before !== state.jobs.length, jobId };
  });
  ipcMain.handle('publisher:prepare', async (_, { platform, accountId, type, payload }) => {
    const account = state.accounts.find(item => item.id === accountId && item.platform === platform);
    if (!account) throw new Error(`找不到 ${platform} 的账号 ${accountId}`);
    const publisher = createPublisher({ platform, account, userDataPath: app.getPath('userData') });
    const definition = getPlatformDefinitions()[platform];
    if (!definition.modes.includes(type)) throw new Error(`${platform} 暂不支持${type === 'video' ? '视频' : '文章'}发布`);
    const normalized = publisher.normalizePayload(payload);
    if (type === 'video') normalized.file = publisher.validateVideo(payload.file);
    if (type === 'article' && payload.images?.length) normalized.images = publisher.validateImages(payload.images);
    const profileDir = ensureProfile(app.getPath('userData'), definition.key, account.id, account.cacheDir);
    return { platform, accountId, type, profileDir, payload: normalized, sessionReady: await publisher.checkSession() };
  });
  ipcMain.handle('publisher:publish-job', async (_, jobId) => {
    const job = state.jobs.find(item => item.id === jobId);
    if (!job) throw new Error(`找不到发布任务: ${jobId}`);
    job.status = 'publishing'; writeState(state);
    const results = await rpaService.publishJob(job);
    job.results = results;
    job.status = results.length > 0 && results.every(result => result.success) ? 'published' : results.some(result => result.success) ? 'partial' : 'failed';
    job.publishedAt = job.status === 'published' ? new Date().toISOString() : job.publishedAt;
    writeState(state);
    return { jobId, status: job.status, results };
  });
  ipcMain.handle('publisher:confirm', (_, { batchId, actions }) => rpaService.resolvePublishConfirmation(batchId, actions));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', async (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  try { await rpaService?.closeAll(); } finally { app.quit(); }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
