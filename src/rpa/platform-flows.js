const flows = {
  X: { url: 'https://x.com/compose/post', cookies: ['auth_token'], loggedIn: ['[data-testid="SideNav_AccountSwitcher_Button"]', '[data-testid="tweetTextarea_0"]'] },
  小红书: { url: 'https://creator.xiaohongshu.com/', cookies: ['web_session'], loggedIn: ['[class*="user-info"]', '[class*="avatar"]'] },
  抖音: { url: 'https://creator.douyin.com/creator-micro/home', cookies: ['sessionid', 'sessionid_ss'], loggedIn: ['[class*="avatar"]', '[class*="account"]'] },
  快手: { url: 'https://cp.kuaishou.com/', cookies: ['kuaishou.server.web_st', 'userId'], loggedIn: ['[class*="avatar"]', '[class*="user"]'] },
  微信公众号: { url: 'https://mp.weixin.qq.com/', cookies: ['slave_sid'], loggedIn: ['#header_info', '.weui-desktop-account__info'] },
  西瓜视频: { url: 'https://studio.ixigua.com/', cookies: ['sessionid', 'sessionid_ss'], loggedIn: ['[class*="avatar"]', '[class*="user"]'] },
  知乎: { url: 'https://www.zhihu.com/creator', cookies: ['z_c0'], loggedIn: ['.AppHeader-profileEntry', '[class*="Profile"]'] },
  掘金: { url: 'https://juejin.cn/creator', cookies: ['sessionid', 'uid'], loggedIn: ['[class*="avatar"]', '[class*="user"]'] }
};

module.exports = { flows };
