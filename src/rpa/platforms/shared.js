const { RpaError } = require('../errors');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function firstLocator(page, selectors, timeout = 5000, visible = true) {
  for (const selector of selectors || []) {
    const locator = page.locator(selector).first();
    try { await locator.waitFor({ state: visible ? 'visible' : 'attached', timeout }); return locator; } catch {}
  }
  return null;
}

async function typeLikeHuman(locator, value) {
  await locator.click();
  await locator.selectText().catch(() => {});
  await locator.pressSequentially(String(value), { delay: 8 + Math.floor(Math.random() * 13) });
}

async function setFile(page, selectors, filePath) {
  if (!filePath) return false;
  const files = Array.isArray(filePath) ? filePath : [filePath];
  const locator = await firstLocator(page, selectors, 5000, false);
  if (!locator) return false;

  // CDP passes local paths to the local Chrome process. Playwright's remote
  // file transfer rejects videos above 50 MB, so it is only a fallback.
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 1 });
    for (const selector of selectors) {
      const result = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!result.nodeId) continue;
      await cdp.send('DOM.setFileInputFiles', { nodeId: result.nodeId, files });
      // Chrome dispatches the file input events for DOM.setFileInputFiles.
      // Dispatching a second change event creates duplicate upload cards on
      // platforms such as Bilibili.
      return true;
    }
  } finally {
    await cdp.detach().catch(() => {});
  }
  await locator.setInputFiles(files);
  return true;
}

async function clickByText(page, texts, timeout = 3000) {
  for (const text of texts) {
    const locator = page.getByText(text, { exact: true }).last();
    try { await locator.waitFor({ state: 'visible', timeout }); await locator.click(); return true; } catch {}
  }
  return false;
}

async function schedule(page, publishAt, log) {
  if (!publishAt) return;
  await clickByText(page, ['定时发布', '预约发布']);
  const input = await firstLocator(page, ['input[placeholder*="日期"]', 'input[placeholder*="时间"]', 'input[format*="yyyy"]'], 3000);
  if (!input) { log('未找到定时发布时间控件'); return; }
  const value = new Date(publishAt).toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-');
  await input.fill(value);
  await input.press('Enter').catch(() => {});
  log(`已设置定时发布时间：${value}`);
}

async function waitForPublishResult(page, platform, log) {
  const buttons = platform === '哔哩哔哩' ? ['立即投稿', '投稿'] : ['发布', '立即发布', '提交发布', '立即投稿', '投稿'];
  if (!(await clickByText(page, buttons, 5000))) throw new RpaError('PUBLISH_BUTTON_NOT_FOUND', `${platform} 未找到发布按钮`);
  log('已点击平台发布按钮，等待平台反馈');
  const started = Date.now();
  while (Date.now() - started < 10 * 60 * 1000) {
    const success = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[role="alert"], [class*="toast"], [class*="Toast"], [class*="success"], [class*="Success"], [class*="modal"], [class*="Modal"]')];
      return /(success|complete|published|manage|content\/list)/i.test(location.href) || nodes.some((node) => /(发布成功|作品发布成功|提交成功|上传成功|审核通过)/.test(node.innerText || '') && node.getBoundingClientRect().width > 0);
    }).catch(() => false);
    if (success) { log('检测到平台发布成功'); return true; }
    await sleep(1500);
  }
  throw new RpaError('MANUAL_PUBLISH_TIMEOUT', `${platform} 发布后未检测到平台确认`);
}

async function runPublishFlow({ page, platform, job, log, beforePublish, fill }) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt > 1) {
      log(`开始第 ${attempt} 次重新填充素材`);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    await fill(page, job, log);
    const action = await beforePublish();
    if (action === 'retry') {
      if (attempt === 3) throw new RpaError('RETRY_LIMIT', `${platform} 素材重新上传次数已达上限`);
      continue;
    }
    if (action !== 'confirm') throw new RpaError('USER_CANCELLED', `${platform} 已取消发布该账号`);
    log('已确认发布，RPA 开始点击平台发布按钮');
    return waitForPublishResult(page, platform, log);
  }
}

module.exports = { sleep, firstLocator, typeLikeHuman, setFile, clickByText, schedule, runPublishFlow };
