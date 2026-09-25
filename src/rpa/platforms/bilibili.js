const { RpaError } = require('../errors');
const fs = require('fs');
const path = require('path');
const { sleep, firstLocator, typeLikeHuman, setFile, clickByText, schedule, runPublishFlow } = require('./shared');

// Bilibili renders an active anonymous input plus a legacy `buploader` input.
// The legacy node accepts CDP calls but does not update the upload state.
const videoInput = ['input[type="file"][accept*=".mp4"]:not([name="buploader"])', 'input[type="file"][accept*=".mp4"]', 'input[type="file"][accept*=".mov"]', 'input[type="file"]'];
const coverInput = ["input[type='file'][accept*='image']", "div.bcc-upload-wrapper input[type='file']"];

async function setFileWithDataTransfer(page, selectors, filePath) {
  let selector = null;
  for (const candidate of selectors) {
    const locator = page.locator(candidate).first();
    try { await locator.waitFor({ state: 'attached', timeout: 5000 }); selector = candidate; break; } catch {}
  }
  if (!selector) return false;
  const stat = fs.statSync(filePath);
  // The extension creates a File in the page itself. Keep this path for
  // normal-sized assets; very large files fall back to CDP below to avoid
  // duplicating excessive data in the DevTools protocol message.
  if (stat.size > 120 * 1024 * 1024) return false;
  const buffer = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === '.mp4' ? 'video/mp4' : extension === '.mov' ? 'video/quicktime' : extension === '.png' ? 'image/png' : 'image/jpeg';
  try {
    const chunkSize = 2 * 1024 * 1024;
    for (let offset = 0; offset < buffer.length; offset += chunkSize) {
      const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length)).toString('base64');
      await page.evaluate(({ key, chunk, reset }) => {
        if (reset || !window[key]) window[key] = [];
        window[key].push(chunk);
      }, { key: '__autopostFileChunks', chunk, reset: offset === 0 });
    }
    await page.evaluate(({ selector: inputSelector, name, type }) => {
      const chunks = window.__autopostFileChunks || [];
      const bytes = chunks.map((chunk) => {
        const binary = atob(chunk);
        const part = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) part[index] = binary.charCodeAt(index);
        return part;
      });
      const file = new File(bytes, name, { type });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.querySelector(inputSelector);
      if (!input) throw new Error('file input was replaced before DataTransfer assignment');
      input.files = transfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      delete window.__autopostFileChunks;
    }, { selector, name: path.basename(filePath), type: mime });
    return true;
  } catch {
    return false;
  }
}

async function waitForUpload(page, log) {
  const started = Date.now();
  let lastLog = 0;
  while (Date.now() - started < 10 * 60 * 1000) {
    const status = await page.evaluate(() => {
      const visible = (node) => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && !!(node.offsetWidth || node.offsetHeight);
      };
      const complete = [...document.querySelectorAll('*')].some((node) => visible(node) && /^(上传完成|上传成功|视频上传完成)$/.test((node.textContent || '').trim()));
      // Old upload cards remain in the DOM after a retry. Only inspect visible
      // error banners that are not part of a completed upload card.
      const failed = [...document.querySelectorAll('[role="alert"], .error, .error-tip, [class*="error"]')]
        .some((node) => visible(node) && /(上传失败|上传出错|文件格式不支持)/.test(node.textContent || ''));
      return { complete, failed };
    }).catch(() => ({ complete: false, failed: false }));
    if (status.failed) throw new RpaError('BILIBILI_UPLOAD_FAILED', '哔哩哔哩报告视频上传失败');
    if (status.complete) { log('哔哩哔哩视频上传完成'); return; }
    if (Date.now() - lastLog > 10000) { log('等待哔哩哔哩视频上传完成'); lastLog = Date.now(); }
    await sleep(1000);
  }
  throw new RpaError('BILIBILI_UPLOAD_TIMEOUT', '哔哩哔哩视频上传超过 10 分钟未完成');
}

async function uploadVideo(page, job, log) {
  if (!job.file && !job.video) throw new RpaError('VIDEO_REQUIRED', '哔哩哔哩缺少视频素材');
  log('开始查找哔哩哔哩隐藏视频文件控件');
  // Do not click `.upload-area`: Bilibili opens the native file chooser there.
  const videoPath = job.file || job.video;
  // Keep the video in Chrome's local file pipeline. A large Base64 payload
  // sent through page.evaluate can crash the Bilibili renderer.
  const injected = await setFile(page, videoInput, videoPath).catch((error) => { log(`CDP 文件注入失败：${error.message}`); return false; });
  if (page.isClosed()) throw new RpaError('BILIBILI_PAGE_CLOSED', '哔哩哔哩发布页面在视频上传时被关闭');
  if (!injected) throw new RpaError('VIDEO_INPUT_NOT_FOUND', '哔哩哔哩未找到视频文件控件');
  // setFile() dispatches input/change exactly once. Dispatching again causes
  // Bilibili to create duplicate pending video cards.
  const fileCount = await page.locator(videoInput[0]).first().evaluate((input) => input.files?.length || 0).catch(() => 0);
  log(`哔哩哔哩视频文件控件已触发 change（文件数：${fileCount}）`);
  log(`哔哩哔哩视频文件已注入：${job.file || job.video}`);
  await waitForUpload(page, log);
}

async function uploadCover(page, job, log) {
  const cover = job.horizontalCover || job.cover || job.verticalCover;
  if (!cover) { log('未设置哔哩哔哩封面，跳过'); return; }
  const entry = await firstLocator(page, ['text=添加封面', '.cover-empty-pill', 'div.cover-main-img > div.img', 'div.cover-main'], 10000);
  if (!entry) { log('未找到哔哩哔哩封面入口'); return; }
  await entry.click({ force: true }).catch(() => {});
  await sleep(700);
  // The cover editor mounts its hidden image input after opening. Never click
  // the upload label itself: that invokes the operating-system file picker.
  await firstLocator(page, coverInput, 10000, false);
  const injected = await setFile(page, coverInput, cover).catch((error) => { log(`CDP 封面文件注入失败：${error.message}`); return false; });
  if (page.isClosed()) throw new RpaError('BILIBILI_PAGE_CLOSED', '哔哩哔哩发布页面在封面上传时被关闭');
  if (!injected) { log('未找到哔哩哔哩封面文件控件'); return; }
  log(`哔哩哔哩封面文件已注入：${cover}`);
  await sleep(2500);
  if (await clickByText(page, ['完成'], 10000)) log('哔哩哔哩封面上传完成，已确认封面弹窗');
  else log('哔哩哔哩封面已注入，但未找到封面弹窗完成按钮');
}

async function selectDeclaration(page, value, log) {
  const declaration = value || '内容无需标注';
  const select = await firstLocator(page, [
    'input.bcc-select-input-inner[placeholder*="创作声明"]',
    'input[placeholder="请选择符合您视频内容的创作声明"]',
    'input[placeholder*="创作声明"]'
  ], 15000);
  if (select) {
    await select.click({ force: true });
    await sleep(300);
    const option = await firstLocator(page, [
      `[role="option"]:has-text("${declaration}")`,
      `.bcc-select-dropdown-item:has-text("${declaration}")`,
      `.bcc-select-option:has-text("${declaration}")`,
      `li:has-text("${declaration}")`,
      `text=${declaration}`
    ], 5000);
    if (option) {
      await option.click({ force: true });
      log(`哔哩哔哩创作声明已选择：${declaration}`);
      return;
    }
  }
  const checkbox = page.locator("div.original-input-wrp input[type='checkbox']").first();
  if (await checkbox.isVisible({ timeout: 1500 }).catch(() => false)) {
    const desired = declaration === '内容无需标注';
    if ((await checkbox.isChecked().catch(() => false)) !== desired) await checkbox.click({ force: true });
    log(`哔哩哔哩创作声明已选择：${declaration}`);
    return;
  }
  const labels = page.locator('span.check-radio-v2-name');
  const count = await labels.count();
  for (let index = 0; index < count; index += 1) {
    const label = labels.nth(index);
    const text = (await label.innerText().catch(() => '')).trim();
    if (text === declaration || (declaration === '内容无需标注' && text === '原创')) { await label.click({ force: true }); log(`哔哩哔哩创作声明已选择：${declaration}`); return; }
  }
  log('未找到哔哩哔哩创作声明控件，保留平台默认值');
}

async function fill(page, job, log) {
  await uploadVideo(page, job, log);
  const title = await firstLocator(page, ['input[maxlength="80"][type="text"]', 'input.input-val[type="text"][maxlength="80"]'], 15000);
  if (!title) throw new RpaError('TITLE_INPUT_NOT_FOUND', '哔哩哔哩未找到标题输入框');
  await typeLikeHuman(title, job.title || '');
  log(`哔哩哔哩标题已填写：${job.title || ''}`);
  const editor = await firstLocator(page, ['div.ql-editor[contenteditable="true"]', 'div[contenteditable="true"]'], 15000);
  if (editor && (job.body || job.description)) await typeLikeHuman(editor, job.body || job.description);
  await selectDeclaration(page, job.creativeDeclaration, log);
  await uploadCover(page, job, log);
  await schedule(page, job.publishAt, log);
}

function publish({ page, job, log, beforePublish }) {
  return runPublishFlow({ page, platform: '哔哩哔哩', job, log, beforePublish, fill });
}

module.exports = { publish, fill };
