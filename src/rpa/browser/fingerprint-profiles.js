const profiles = {
  windows: { label: 'Windows 11 / Chrome', platform: 'Win32', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36', brands: [{ brand: 'Chromium', version: '154' }, { brand: 'Google Chrome', version: '154' }], mobile: false, locale: 'zh-CN', timezone: 'Asia/Shanghai', width: 1440, height: 900 },
  macos: { label: 'macOS / Chrome', platform: 'MacIntel', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36', brands: [{ brand: 'Chromium', version: '154' }, { brand: 'Google Chrome', version: '154' }], mobile: false, locale: 'zh-CN', timezone: 'Asia/Shanghai', width: 1440, height: 900 },
  linux: { label: 'Linux / Chrome', platform: 'Linux x86_64', ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36', brands: [{ brand: 'Chromium', version: '154' }, { brand: 'Google Chrome', version: '154' }], mobile: false, locale: 'zh-CN', timezone: 'Asia/Shanghai', width: 1440, height: 900 },
  android: { label: 'Android / Chrome', platform: 'Linux armv8l', ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36', brands: [{ brand: 'Chromium', version: '154' }, { brand: 'Google Chrome', version: '154' }], mobile: true, locale: 'zh-CN', timezone: 'Asia/Shanghai', width: 412, height: 915 }
};

function cloneFingerprint(profile) {
  return {
    ...profile,
    brands: profile.brands.map(item => ({ ...item }))
  };
}

function getFingerprint(key = 'windows') { return cloneFingerprint(profiles[key] || profiles.windows); }

function isCompleteFingerprint(value) {
  return Boolean(value && typeof value === 'object' && value.mobile === false && value.ua && value.platform && value.locale && value.timezone && Array.isArray(value.brands) && Number.isInteger(value.width) && Number.isInteger(value.height) && Number.isInteger(value.deviceMemory) && Number.isInteger(value.hardwareConcurrency));
}

function createRandomFingerprint() {
  // Desktop Chrome profiles are used by the external browser; mobile UA values
  // would create an inconsistent desktop/mobile fingerprint and trigger platform security checks.
  const keys = Object.keys(profiles).filter((key) => key !== 'android');
  const base = profiles[keys[Math.floor(Math.random() * keys.length)]];
  const resolutions = base.mobile ? [[360, 800], [375, 812], [390, 844], [412, 915]] : [[1366, 768], [1440, 900], [1536, 864], [1600, 900], [1920, 1080]];
  const [width, height] = resolutions[Math.floor(Math.random() * resolutions.length)];
  const result = { ...cloneFingerprint(base), width, height, deviceMemory: [4, 8, 16][Math.floor(Math.random() * 3)], hardwareConcurrency: [4, 8, 12, 16][Math.floor(Math.random() * 4)], seed: Math.random().toString(36).slice(2) };
  return result;
}
function ensureFingerprint(account) {
  if (!isCompleteFingerprint(account.fingerprint)) account.fingerprint = createRandomFingerprint();
  return account.fingerprint;
}
module.exports = { profiles, getFingerprint, createRandomFingerprint, isCompleteFingerprint, ensureFingerprint };
