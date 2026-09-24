const { RpaError } = require('./errors');
const { detectChrome } = require('./browser/chrome-detector');
const { ProfileManager } = require('./browser/profile-manager');
const { BrowserSession } = require('./browser/browser-session');
const { getPlatformFlow } = require('./platforms/flow-registry');
const { publishOnPlatform, getPublishUrl } = require('./platforms/publisher-flows');
const { EventEmitter } = require('events');

class RpaService extends EventEmitter {
  constructor({ app, state }) { super(); this.app = app; this.state = state; this.profiles = new ProfileManager({ app, state }); this.sessions = new Map(); this.pendingConfirmations = new Map(); this.confirmationBatch = null; this.confirmationBatchCount = 0; }
  log(scope, account, message) { this.emit('log', { scope, accountId: account?.id, platform: account?.platform, accountName: account?.name, message, time: new Date().toLocaleString('zh-CN', { hour12: false }) }); }
  beginPublishConfirmationBatch(expected) {
    this.confirmationBatchCount = 1;
    this.confirmationBatch = { batchId: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, expected, entries: new Map(), resolvers: new Map(), emitted: false };
  }
  requestPublishConfirmation(account, job, expected = 1) {
    if (!this.confirmationBatch) { this.confirmationBatchCount += 1; this.confirmationBatch = { batchId: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, expected: this.confirmationBatchCount === 1 ? expected : 1, entries: new Map(), resolvers: new Map(), emitted: false }; }
    const batch = this.confirmationBatch;
    const confirmationId = `${account.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    batch.entries.set(confirmationId, { confirmationId, accountId: account.id, platform: account.platform, accountName: account.name, title: job.title || '', type: job.type });
    const promise = new Promise((resolve) => batch.resolvers.set(confirmationId, resolve));
    if (!batch.emitted && batch.entries.size >= batch.expected) {
      batch.emitted = true;
      this.emit('publish-confirmation', { batchId: batch.batchId, entries: [...batch.entries.values()] });
    }
    return promise;
  }
  skipPublishConfirmation(accountId) {
    if (!this.confirmationBatch || this.confirmationBatch.emitted) return;
    this.confirmationBatch.expected = Math.max(0, this.confirmationBatch.expected - 1);
    if (this.confirmationBatch.expected === 0 && this.confirmationBatch.entries.size === 0) { this.confirmationBatch = null; return; }
    if (this.confirmationBatch.entries.size >= this.confirmationBatch.expected) {
      this.confirmationBatch.emitted = true;
      this.emit('publish-confirmation', { batchId: this.confirmationBatch.batchId, entries: [...this.confirmationBatch.entries.values()] });
    }
  }
  resolvePublishConfirmation(batchId, actions = {}) {
    const batch = this.confirmationBatch;
    if (!batch || batch.batchId !== batchId) return false;
    for (const [confirmationId, resolve] of batch.resolvers) resolve(['confirm', 'cancel', 'retry'].includes(actions[confirmationId]) ? actions[confirmationId] : 'cancel');
    this.confirmationBatch = null;
    return true;
  }
  async runWithConcurrency(items, limit, worker) {
    const results = [];
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    });
    await Promise.all(runners);
    return results;
  }
  async openLogin(account) {
    const chrome = detectChrome(this.app); if (!chrome.available) throw new RpaError('CHROME_NOT_FOUND', '未检测到 Google Chrome');
    const flow = getPlatformFlow(account.platform); const profileDir = this.profiles.resolve(account);
    const session = this.sessions.get(account.id) || new BrowserSession({ account, executable: chrome.executable, profileDir, windowSize: { width: this.state.settings?.browserWidth, height: this.state.settings?.browserHeight }, windowTitle: account.name });
    this.sessions.set(account.id, session); this.log('accounts', account, `使用账号缓存目录：${profileDir}`); this.log('accounts', account, `启动 Chrome，准备打开登录页：${flow.loginUrl}`); await session.start(flow.loginUrl); account.cacheDir = profileDir; account.debugPort = session.port; account.status = '登录中'; this.log('accounts', account, `Chrome 已连接，调试端口：${session.port}`);
    return { browser: chrome.executable, profileDir, port: session.port, url: flow.loginUrl };
  }
  async checkLogin(account) {
    const flow = getPlatformFlow(account.platform); const session = this.sessions.get(account.id);
    if (!session) return { status: '浏览器未连接', loggedIn: false };
    const cookies = await session.cookies(); const cookieMatch = cookies.some(cookie => flow.sessionCookies.includes(cookie.name) && cookie.value);
    const selectorMatch = await session.evaluate(selectors => selectors.some(selector => Array.from(document.querySelectorAll(selector)).some(element => { const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0; })), flow.selectors);
    const loginPageMatch = await session.evaluate(() => Array.from(document.querySelectorAll('input[type="password"], [class*="login-modal"], [class*="loginModal"], [class*="qrcode"]')).some(element => { const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0; }));
    let endpointMatch = false;
    if (flow.verifyEndpoint) {
      endpointMatch = Boolean(await session.evaluate(async (endpoint) => {
        try { const response = await fetch(endpoint, { credentials: 'include' }); const body = await response.json(); return response.ok && Boolean(body?.user || body?.data?.user || body?.user_info); } catch { return false; }
      }, flow.verifyEndpoint));
    }
    const currentUrl = session.page?.url() || '';
    const pageLooksAuthenticated = Boolean(currentUrl && !/(login|passport|signin|sign-in|auth|qrcode)/i.test(currentUrl));
    // Creator pages often render account widgets asynchronously and some platforms
    // reject the verification request from a newly opened tab. A valid session
    // cookie on a non-login creator page is therefore a valid fallback signal.
    const signalMatch = Boolean(endpointMatch || selectorMatch || (cookieMatch && pageLooksAuthenticated));
    const loggedIn = Boolean(!loginPageMatch && signalMatch);
    account.status = loggedIn ? '已登录' : '未登录';
    return { status: account.status, loggedIn, cookieMatch, selectorMatch, endpointMatch, loginPageMatch, pageLooksAuthenticated, url: currentUrl };
  }
  async waitForLogin(account, timeoutMs = 180000, onProgress = () => {}) {
    const started = Date.now();
    let attempt = 0;
    let lastSignature = '';
    while (Date.now() - started < timeoutMs) {
      attempt += 1;
      const result = await this.checkLogin(account);
      const signature = `${result.status}|${result.cookieMatch ? 1 : 0}|${result.selectorMatch ? 1 : 0}|${result.endpointMatch ? 1 : 0}|${result.loginPageMatch ? 1 : 0}`;
      if (signature !== lastSignature || attempt === 1) {
        onProgress(`登录检测第 ${attempt} 次：${result.status}（Cookie=${result.cookieMatch ? '有' : '无'}，页面=${result.selectorMatch ? '有' : '无'}，接口=${result.endpointMatch ? '通过' : '未通过'}${result.loginPageMatch ? '，仍在登录页' : ''}）`);
        lastSignature = signature;
      }
      if (result.loggedIn) return result;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new RpaError('LOGIN_TIMEOUT', `${account.platform} 登录等待超时`);
  }
  async publishJob(job) {
    const results = [];
    const expected = (job.targets || []).filter((target) => this.state.accounts.some((item) => item.id === target.accountId && item.platform === target.platform)).length;
    if (expected > 0) this.beginPublishConfirmationBatch(expected);
    const concurrency = Math.max(1, Math.min(20, Number(this.state.settings?.maxConcurrentUploads) || 2));
    this.log('queue', null, `素材上传最大并发账号数：${concurrency}`);
    await this.runWithConcurrency(job.targets || [], concurrency, async (target) => {
      const account = this.state.accounts.find(item => item.id === target.accountId && item.platform === target.platform);
      if (!account) { results.push({ ...target, success: false, error: '账号不存在' }); this.skipPublishConfirmation(target.accountId); return; }
      try {
        const chrome = detectChrome(this.app); if (!chrome.available) throw new RpaError('CHROME_NOT_FOUND', '未检测到 Google Chrome');
        const flow = getPlatformFlow(account.platform); const profileDir = this.profiles.resolve(account);
        const session = this.sessions.get(account.id) || new BrowserSession({ account, executable: chrome.executable, profileDir, windowSize: { width: this.state.settings?.browserWidth, height: this.state.settings?.browserHeight }, windowTitle: account.name });
        this.sessions.set(account.id, session);
        const log = (message) => this.log('queue', account, message);
        log(`使用账号缓存目录：${profileDir}`);
        const publishUrl = getPublishUrl(account.platform, job.type) || flow.publishUrl || flow.loginUrl;
        log(`启动发布浏览器并直接打开发布页面：${publishUrl}`);
        await session.start(publishUrl);
        log(`Chrome 已连接，调试端口：${session.port}`);
        let login = await this.checkLogin(account);
        if (!login.loggedIn && !login.loginPageMatch) {
          log('发布页面仍在加载，进行一次短暂登录状态复核');
          await new Promise((resolve) => setTimeout(resolve, 2500));
          login = await this.checkLogin(account);
        }
        if (!login?.loggedIn) { log(`登录检测未通过：Cookie=${login?.cookieMatch ? '有' : '无'}，页面标识=${login?.selectorMatch ? '有' : '无'}，接口=${login?.endpointMatch ? '通过' : '未通过'}`); throw new RpaError('NOT_LOGGED_IN', `${account.platform} / ${account.name} 尚未登录或登录状态尚未同步`); }
        log('登录状态已确认');
        const beforePublish = () => this.requestPublishConfirmation(account, job, expected);
        await publishOnPlatform({ page: session.page, platform: account.platform, job, log, beforePublish });
        log('平台发布流程完成');
        results.push({ ...target, success: true, accountId: account.id });
      } catch (error) {
        this.skipPublishConfirmation(account.id);
        this.log('queue', account, `发布流程失败：${error.message}`);
        results.push({ ...target, success: false, error: error.message, code: error.code });
      } finally {
        await this.close(account.id).catch((error) => this.log('queue', account, `关闭账号浏览器失败：${error.message}`));
        account.debugPort = undefined;
      }
    });
    return results;
  }
  async close(accountId) { const session = this.sessions.get(accountId); if (session) await session.close(); this.sessions.delete(accountId); }
  async closeAll() {
    const sessions = [...this.sessions.values()];
    await Promise.allSettled(sessions.map((session) => session.close()));
    this.sessions.clear();
  }
}

module.exports = { RpaService };
