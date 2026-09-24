const { RpaError } = require('../errors');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const publishUrls = {
  X: 'https://x.com/compose/post',
  小红书: 'https://creator.xiaohongshu.com/publish/publish?target=video',
  抖音: 'https://creator.douyin.com/creator-micro/content/upload',
  快手: 'https://cp.kuaishou.com/article/publish/video',
  微信公众号: 'https://mp.weixin.qq.com/',
  微信视频号: 'https://channels.weixin.qq.com/platform/post/create',
  西瓜视频: 'https://studio.ixigua.com/',
  哔哩哔哩: 'https://member.bilibili.com/platform/upload/video/frame',
  知乎: 'https://www.zhihu.com/creator',
  掘金: 'https://juejin.cn/creator',
};

function getPublishUrl(platform, type) {
  if (platform === '小红书') return type === 'article' ? 'https://creator.xiaohongshu.com/publish/publish?target=image' : publishUrls[platform];
  if (platform === '抖音') return type === 'article' ? 'https://creator.douyin.com/creator-micro/content/upload?default-tab=3' : publishUrls[platform];
  if (platform === '掘金') return 'https://juejin.cn/editor/drafts/new?v=2';
  if (platform === '知乎' && type === 'article') return 'https://zhuanlan.zhihu.com/write';
  return publishUrls[platform];
}

const selectors = {
  title: {
    X: ['textarea[placeholder*="内容"]', '[data-testid="tweetTextarea_0"]'],
    小红书: ['input[placeholder*="标题"]', 'input[type="text"]'],
    抖音: ['input[placeholder*="作品标题"]'],
    快手: ['input[placeholder*="标题"]', 'input[type="text"]'],
    微信公众号: ['input[placeholder*="标题"]', 'input[placeholder*="请输入标题"]'],
    微信视频号: ['input[placeholder*="标题"]', 'input[placeholder*="作品标题"]', 'input[type="text"]'],
    西瓜视频: ['input[placeholder*="标题"]', 'input[type="text"]'],
    哔哩哔哩: ['input[placeholder*="标题"]', 'input[placeholder*="稿件标题"]', 'input[placeholder*="视频标题"]', 'input[type="text"]'],
    知乎: ['input[placeholder*="标题"]', 'textarea[placeholder*="标题"]'],
    掘金: ['input[placeholder="输入文章标题..."]'],
  },
  editor: {
    X: ['div[contenteditable="true"]', 'textarea[placeholder*="内容"]'],
    小红书: ['div[contenteditable="true"]'],
    抖音: ['div.zone-container.editor-kit-container.editor.editor-comp-publish[contenteditable="true"]', 'div[contenteditable="true"]'],
    快手: ['div[contenteditable="true"]'],
    微信公众号: ['#edui1_contentplaceholder', '[contenteditable="true"]'],
    知乎: ['div[data-contents="true"]', 'div[contenteditable="true"]'],
    掘金: ['div.CodeMirror-code[role="presentation"]', 'div[contenteditable="true"]'],
    西瓜视频: ['div[contenteditable="true"]', 'textarea'],
    微信视频号: ['div[contenteditable="true"]', 'textarea[placeholder*="描述"]'],
    哔哩哔哩: ['div[contenteditable="true"]', 'textarea[placeholder*="简介"]', 'textarea[placeholder*="作品简介"]', 'textarea'],
  },
  file: {
  X: ['input[type="file"]'],
    小红书: ['input[type="file"]'],
    抖音: ['input[type="file"]'],
    快手: ['input[type="file"]'],
    西瓜视频: ['input[type="file"]'],
    微信视频号: ['input[type="file"]', 'input[accept*="video"]'],
    哔哩哔哩: ['input[type="file"][accept*="video"]', 'input[type="file"]', 'input[accept*="video"]'],
    知乎: ['input[type="file"]'],
  },
  image: {
    小红书: ['input[accept*="image"]', 'input[type="file"]'],
    抖音: ['input.semi-upload-hidden-input', 'input[accept*="image"]'],
    快手: ['div.ant-modal-body input[type="file"]', 'input[accept*="image"]'],
    知乎: ['input.UploadPicture-input', 'input[accept*="image"]'],
    微信公众号: ['input[type="file"]'],
    掘金: ['input[type="file"]'],
    哔哩哔哩: ['input[type="file"][accept*="image"]', 'input[accept*="image"]', 'input[type="file"]'],
  },
};

async function firstLocator(page, candidates, { timeout = 10000, visible = true } = {}) {
  for (const selector of candidates || []) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: visible ? 'visible' : 'attached', timeout });
      return locator;
    } catch { /* try the next selector */ }
  }
  return null;
}

async function fillFirst(page, candidates, value, options = {}) {
  if (!value) return false;
  const locator = await firstLocator(page, candidates, options);
  if (!locator) return false;
  await typeLikeHuman(locator, String(value));
  return true;
}

async function typeLikeHuman(locator, value) {
  await locator.click();
  await locator.selectText().catch(() => {});
  await locator.pressSequentially(value, { delay: 8 + Math.floor(Math.random() * 13) });
}

async function setFile(page, candidates, filePath) {
  if (!filePath) return false;
  const files = Array.isArray(filePath) ? filePath : [filePath];

  // The browser is attached over CDP, so Playwright treats it as remote and
  // refuses to transfer files larger than 50 MB. DOM.setFileInputFiles sends
  // local paths to the Chrome process instead and works for large videos.
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    for (const selector of candidates || []) {
      const locator = page.locator(selector).first();
      try { await locator.waitFor({ state: 'attached', timeout: 15000 }); } catch { continue; }
      const result = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (result.nodeId) {
        await cdp.send('DOM.setFileInputFiles', { nodeId: result.nodeId, files });
        await cdp.detach().catch(() => {});
        return true;
      }
    }
    await cdp.detach().catch(() => {});
  } catch (error) {
    // Fall back for browser targets where the DOM CDP domain is unavailable.
    if (!String(error?.message || '').includes('50Mb')) throw error;
  }

  const locator = await firstLocator(page, candidates, { timeout: 15000, visible: false });
  if (!locator) return false;
  await locator.setInputFiles(files);
  return true;
}

async function clickByText(page, texts, { timeout = 5000 } = {}) {
  for (const text of texts) {
    const locator = page.getByText(text, { exact: true }).last();
    try { await locator.waitFor({ state: 'visible', timeout }); await locator.click(); return true; } catch { /* continue */ }
  }
  return false;
}

async function fillEditor(page, platform, text) {
  if (!text) return false;
  const editor = await firstLocator(page, selectors.editor[platform], { timeout: 15000 });
  if (!editor) return false;
  await typeLikeHuman(editor, text);
  return true;
}

async function uploadVideo(page, platform, job, log = () => {}) {
  const videoPath = job.file || job.video;
  if (!videoPath) throw new RpaError('VIDEO_REQUIRED', `${platform} 缺少视频素材`);
  const uploaded = await setFile(page, selectors.file[platform], videoPath);
  if (!uploaded) throw new RpaError('VIDEO_INPUT_NOT_FOUND', `${platform} 未找到视频上传控件`);
  log(`视频素材已注入：${videoPath}`);
  await sleep(platform === '哔哩哔哩' ? 5000 : 2500);
  log(platform === '哔哩哔哩' ? '等待哔哩哔哩视频转码和投稿表单加载' : '等待视频处理完成');
}

async function uploadCover(page, platform, job, log = () => {}) {
  const coverPath = job.cover || job.verticalCover || job.horizontalCover;
  if (!coverPath || !selectors.image[platform]) { log('未设置视频封面，跳过封面上传'); return false; }
  const coverTriggers = {
    小红书: ['div.noCover.uploadCover', 'text=设置封面'],
    抖音: ['div.content-upload-new', 'text=设置封面'],
    快手: ['text=设置封面', 'text=更换封面'],
    知乎: ['div.VideoUploadForm-imageEditButton', 'text=设置封面'],
    哔哩哔哩: ['text=上传封面', 'text=更换封面', '[class*="cover"] input[type="file"]'],
  };
  const trigger = await firstLocator(page, coverTriggers[platform], { timeout: 2500 });
  if (trigger) await trigger.click().catch(() => {});
  const uploaded = await setFile(page, selectors.image[platform], coverPath);
  if (uploaded) { log(`封面已注入：${coverPath}`); await sleep(1500); } else log('未找到封面上传控件');
  return uploaded;
}

async function schedule(page, publishAt, log = () => {}) {
  if (!publishAt) { log('未设置定时发布时间'); return false; }
  await clickByText(page, ['定时发布', '预约发布'], { timeout: 3000 });
  const value = new Date(publishAt).toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-');
  const input = await firstLocator(page, ['input[placeholder*="日期"]', 'input[placeholder*="时间"]', 'input[format*="yyyy"]'], { timeout: 3000 });
  if (!input) { log('未找到定时发布时间控件'); return false; }
  await input.fill(value);
  await input.press('Enter').catch(() => {});
  log(`已设置定时发布时间：${value}`);
  return true;
}

async function selectBilibiliDeclaration(page, value, log = () => {}) {
  const declaration = value || '自制';
  // Bilibili has used a native select, radio labels and a custom popover
  // for this field across different creator accounts. Prefer form controls
  // first, then fall back to the visible text flow.
  const select = page.locator('select').filter({ has: page.locator('option') }).first();
  try {
    if (await select.isVisible({ timeout: 1200 })) {
      const options = await select.locator('option').allTextContents();
      const option = options.find((text) => text.trim() === declaration) || options.find((text) => text.includes(declaration));
      if (option) {
        await select.selectOption({ label: option.trim() });
        log(`哔哩哔哩创作声明已选择：${declaration}`);
        return true;
      }
    }
  } catch { /* continue with custom controls */ }

  const opened = await clickByText(page, ['创作声明', '声明原创'], { timeout: 3000 });
  if (opened) await sleep(300);
  for (const selector of [
    `label:has-text("${declaration}")`,
    `[role="radio"]:has-text("${declaration}")`,
    `input[type="radio"][value="${declaration}"]`,
  ]) {
    try {
      const control = page.locator(selector).first();
      if (await control.isVisible({ timeout: 1200 })) {
        await control.click();
        log(`哔哩哔哩创作声明已选择：${declaration}`);
        return true;
      }
    } catch { /* continue with text fallback */ }
  }
  const selected = await clickByText(page, [declaration, declaration === '自制' ? '原创' : '自制'], { timeout: 3000 });
  if (selected) log(`哔哩哔哩创作声明已选择：${declaration}`);
  else log('未找到哔哩哔哩创作声明控件，保留平台默认值');
  return selected;
}

async function waitForManualPublish(page, platform, log = () => {}, timeoutMs = 30 * 60 * 1000) {
  const clicked = await clickByText(page, ['发布', '立即发布', '提交发布', '立即投稿', '投稿'], { timeout: 10000 });
  if (!clicked) throw new RpaError('PUBLISH_BUTTON_NOT_FOUND', `${platform} 未找到发布按钮`);
  log('已确认，RPA 已点击平台发布按钮');
  log('RPA 已暂停，等待平台反馈结果');
  const started = Date.now();
  let lastUrl = '';
  while (Date.now() - started < timeoutMs) {
    const url = page.url();
    if (url !== lastUrl) {
      log(`当前发布页面：${url}`);
      lastUrl = url;
    }
    const signal = await page.evaluate(() => {
      const successPattern = /(发布成功|作品发布成功|提交成功|上传成功|审核通过)/;
      const urlSuccess = /(success|complete|published|manage|content\/list)/i.test(location.href);
      const nodes = Array.from(document.querySelectorAll('[role="alert"], [class*="toast"], [class*="Toast"], [class*="success"], [class*="Success"], [class*="modal"], [class*="Modal"]'));
      const visibleSuccess = nodes.some((node) => {
        const style = window.getComputedStyle(node);
        const text = (node.innerText || '').trim();
        return style.display !== 'none' && style.visibility !== 'hidden' && text.length < 180 && successPattern.test(text);
      });
      return { success: urlSuccess || visibleSuccess };
    }).catch(() => ({ success: false }));
    if (signal.success) {
      log('检测到平台发布确认，发布流程完成');
      return true;
    }
    await sleep(1500);
  }
  throw new RpaError('MANUAL_PUBLISH_TIMEOUT', `${platform} 等待手动点击发布超时，未检测到平台确认`);
}

async function fillArticle(page, platform, job, log = () => {}) {
  if (!(await fillFirst(page, selectors.title[platform], job.title, { timeout: 15000 }))) throw new RpaError('TITLE_INPUT_NOT_FOUND', `${platform} 未找到标题输入框`);
  log(`标题已填写：${job.title}`);
  const articleBody = job.body || job.description || '';
  if (!(await fillEditor(page, platform, articleBody))) throw new RpaError('EDITOR_NOT_FOUND', `${platform} 未找到文章编辑器`);
  log('文章正文已填写');
  const images = Array.isArray(job.images) ? job.images : String(job.file || '').split(/\r?\n/).filter(Boolean);
  if (images.length && selectors.image[platform]) { await setFile(page, selectors.image[platform], images); log(`文章图片已注入：${images.length} 张`); }
  if (job.articleCover && selectors.image[platform]) { await setFile(page, selectors.image[platform], job.articleCover); log(`文章封面已注入：${job.articleCover}`); }
  await schedule(page, job.publishAt, log);
  return true;
}

async function fillVideo(page, platform, job, log = () => {}) {
  await uploadVideo(page, platform, job, log);
  if (!(await fillFirst(page, selectors.title[platform], job.title, { timeout: 15000 }))) throw new RpaError('TITLE_INPUT_NOT_FOUND', `${platform} 未找到作品标题输入框`);
  log(`作品标题已填写：${job.title}`);
  await fillEditor(page, platform, [job.body || job.description || '', ...(job.topics ? String(job.topics).split(/[,，\s]+/).filter(Boolean).map((tag) => `#${tag}`) : []), ...(job.tags ? String(job.tags).split(/[,，\s]+/).filter(Boolean).map((tag) => `#${tag}`) : [])].filter(Boolean).join(' '));
  log('作品描述、话题和标签已填写');
  await uploadCover(page, platform, job, log);
  if (platform === '哔哩哔哩') await selectBilibiliDeclaration(page, job.creativeDeclaration, log);
  await schedule(page, job.publishAt, log);
  return true;
}

async function publishOnPlatform({ page, platform, job, log, beforePublish = async () => 'confirm' }) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt > 1) {
      log(`开始第 ${attempt} 次重新填充素材`);
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(1500);
    }
    if (job.type === 'article') await fillArticle(page, platform, job, log);
    else await fillVideo(page, platform, job, log);
    const action = await beforePublish();
    if (action === 'retry') {
      if (attempt === 3) throw new RpaError('RETRY_LIMIT', `${platform} 素材重新上传次数已达上限`);
      log('收到重新上传指令，将重新执行素材填充流程');
      continue;
    }
    if (action !== 'confirm') {
      log('用户取消了该账号的发布');
      throw new RpaError('USER_CANCELLED', `${platform} 已取消发布该账号`);
    }
    log('已确认发布，RPA 开始点击平台发布按钮');
    return waitForManualPublish(page, platform, log, 10 * 60 * 1000);
  }
}

module.exports = { publishUrls, getPublishUrl, publishOnPlatform };
