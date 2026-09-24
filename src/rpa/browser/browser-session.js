const { spawn } = require('child_process');
const net = require('net');
const { chromium } = require('playwright-core');
const { RpaError } = require('../errors');
const { ensureFingerprint } = require('./fingerprint-profiles');
const reservedPorts = new Set();

function findFreePort(start = 9300) {
  if (reservedPorts.has(start)) return findFreePort(start + 1);
  return new Promise((resolve, reject) => { const server = net.createServer(); server.on('error', () => findFreePort(start + 1).then(resolve, reject)); server.listen(start, '127.0.0.1', () => server.close(() => { reservedPorts.add(start); resolve(start); })); });
}

async function connectWithRetry(port, processHandle, attempts = 36) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1500 });
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, Math.min(500 + attempt * 150, 1800)));
    }
  }
  throw new RpaError('BROWSER_CONNECT_FAILED', '无法连接到账号 Chrome 调试端口', { cause: lastError?.message || 'CDP 端口未响应', port, attempts });
}

class BrowserSession {
  constructor({ account, executable, profileDir, windowSize = {}, windowTitle = '' }) { this.account = account; this.executable = executable; this.profileDir = profileDir; this.windowSize = windowSize; this.windowTitle = windowTitle || account.name || account.id; this.fingerprint = ensureFingerprint(account); this.browser = null; this.context = null; this.page = null; this.process = null; this.port = null; }
  viewport() { const width = Number(this.windowSize.width) || this.fingerprint.width; const height = Number(this.windowSize.height) || this.fingerprint.height; return { width: Math.max(800, Math.round(width)), height: Math.max(600, Math.round(height)) }; }
  async start(url) {
    if (this.context && this.browser?.isConnected?.()) {
      try { await this.page.goto(url, { waitUntil: 'commit', timeout: 15000 }); await this.setWindowTitle(); return this; } catch { await this.close(); }
    }
    if (Number.isInteger(this.account.debugPort) && this.account.debugPort > 0 && !reservedPorts.has(this.account.debugPort)) {
      try {
        this.port = this.account.debugPort;
        reservedPorts.add(this.port);
        this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${this.port}`, { timeout: 2500 });
        await this.configure(url);
        return this;
      } catch {
        this.browser = null;
        this.context = null;
        this.page = null;
        reservedPorts.delete(this.port);
      }
    }

    const errors = [];
    for (let launchAttempt = 0; launchAttempt < 3; launchAttempt += 1) {
      this.port = await findFreePort(9300 + launchAttempt * 100);
      reservedPorts.add(this.port);
      const viewport = this.viewport();
      const args = [`--user-data-dir=${this.profileDir}`, '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${this.port}`, '--profile-directory=Default', '--no-first-run', '--no-default-browser-check', '--no-restore-session-state', '--new-window', `--window-size=${viewport.width},${viewport.height}`];
      if (this.account.proxy?.enabled && this.account.proxy.server) args.push(`--proxy-server=${this.account.proxy.server}`);
      args.push(url);
      this.process = spawn(this.executable, args, { detached: true, stdio: 'ignore' });
      this.process.unref();
      try {
        this.browser = await connectWithRetry(this.port, this.process, 36);
        this.account.debugPort = this.port;
        await this.configure(url);
        return this;
      } catch (error) {
        errors.push({ port: this.port, code: error.code, message: error.message });
        if (this.process.exitCode === null) this.process.kill();
        this.process = null;
        reservedPorts.delete(this.port);
      }
    }
    const detail = errors.map((item) => `${item.port}:${item.code || 'CDP_TIMEOUT'}`).join(', ');
    throw new RpaError('BROWSER_LAUNCH_FAILED', `账号 Chrome 启动失败；已尝试调试端口 ${detail || '未知'}，请确认窗口已完全启动后重试`, { attempts: errors });
  }
  async configure(url) {
    this.context = this.browser.contexts()[0];
    this.page = this.context.pages()[0] || await this.context.newPage();
    await this.context.addInitScript(({ platform, locale, mobile, __fpDeviceMemory, __fpHardwareConcurrency, colorDepth, pixelDepth, webglVendor, webglRenderer, seed }) => {
      Object.defineProperty(Navigator.prototype, 'platform', { configurable: true, get: () => platform });
      Object.defineProperty(Navigator.prototype, 'language', { configurable: true, get: () => locale });
      Object.defineProperty(Navigator.prototype, 'languages', { configurable: true, get: () => [locale, 'zh', 'en-US'] });
      Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => __fpDeviceMemory });
      Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { configurable: true, get: () => __fpHardwareConcurrency });
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { configurable: true, get: () => mobile ? 5 : 0 });
      Object.defineProperty(Navigator.prototype, 'webdriver', { configurable: true, get: () => undefined });
      Object.defineProperty(Navigator.prototype, 'pdfViewerEnabled', { configurable: true, get: () => true });
      for (const [key, value] of Object.entries({ platform, language: locale, colorDepth, pixelDepth })) {
        try { Object.defineProperty(Screen.prototype, key, { configurable: true, get: () => value }); } catch {}
      }
      const hash = String(seed || 'autopost').split('').reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
      const noise = hash % 7;
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function (...args) {
        const image = originalGetImageData.apply(this, args);
        if (image.data.length >= 4) image.data[noise % image.data.length] = (image.data[noise % image.data.length] + noise + 1) % 255;
        return image;
      };
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const context = this.getContext('2d');
        let backup = null;
        if (context && this.width > 0 && this.height > 0) {
          try { backup = context.getImageData(0, 0, 1, 1); context.fillStyle = `rgba(${noise},${(noise * 3) % 255},${(noise * 7) % 255},0.01)`; context.fillRect(0, 0, 1, 1); } catch { backup = null; }
        }
        const result = originalToDataURL.apply(this, args);
        if (backup && context) { try { context.putImageData(backup, 0, 0); } catch {} }
        return result;
      };
      const patchWebGL = (Prototype) => {
        if (!Prototype) return;
        const originalGetParameter = Prototype.getParameter;
        Prototype.getParameter = function (parameter) {
          if (parameter === 37445) return webglVendor;
          if (parameter === 37446) return webglRenderer;
          return originalGetParameter.call(this, parameter);
        };
      };
      patchWebGL(window.WebGLRenderingContext?.prototype);
      patchWebGL(window.WebGL2RenderingContext?.prototype);
    }, { platform: this.fingerprint.platform, locale: this.fingerprint.locale, mobile: this.fingerprint.mobile, __fpDeviceMemory: this.fingerprint.deviceMemory, __fpHardwareConcurrency: this.fingerprint.hardwareConcurrency, colorDepth: this.fingerprint.colorDepth, pixelDepth: this.fingerprint.pixelDepth, webglVendor: this.fingerprint.webglVendor, webglRenderer: this.fingerprint.webglRenderer, seed: this.fingerprint.seed || this.account.id });
    await this.context.addInitScript((title) => {
      const applyTitle = () => { if (document.title !== title) document.title = title; };
      applyTitle();
      const observeTitle = () => {
        const node = document.querySelector('title');
        if (node) new MutationObserver(applyTitle).observe(node, { childList: true, characterData: true, subtree: true });
      };
      observeTitle();
      window.setInterval(applyTitle, 3000);
    }, this.windowTitle);
    const cdp = await this.context.newCDPSession(this.page);
    await cdp.send('Emulation.setUserAgentOverride', { userAgent: this.fingerprint.ua, platform: this.fingerprint.platform, acceptLanguage: this.fingerprint.locale, userAgentMetadata: { brands: this.fingerprint.brands, fullVersion: '154.0.0.0', platform: this.fingerprint.platform, platformVersion: '10.0.0', architecture: 'x86', model: '', mobile: false } });
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: this.fingerprint.timezone });
    await this.page.setViewportSize(this.viewport());
    this.page.on('domcontentloaded', () => this.setWindowTitle());
    await this.page.goto(url, { waitUntil: 'commit', timeout: 15000 }).catch(() => {});
    await this.setWindowTitle();
  }
  async setWindowTitle() { if (!this.page || !this.windowTitle) return; await this.page.evaluate((title) => { document.title = title; }, this.windowTitle).catch(() => {}); }
  async close() { if (this.browser) await this.browser.close().catch(() => {}); if (this.port) reservedPorts.delete(this.port); this.browser = null; this.context = null; this.page = null; this.port = null; }
  async cookies() { return this.context ? this.context.cookies() : []; }
  async evaluate(expression, arg) { return this.page ? this.page.evaluate(expression, arg).catch(() => null) : null; }
}

module.exports = { BrowserSession };
