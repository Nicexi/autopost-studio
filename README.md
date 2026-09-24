# Autopost Studio

离线优先的 Electron 内容管理工作台，面向需要管理多个平台、多个账号的自媒体创作者。

## 当前 MVP

- 本地 JSON 持久化，不依赖云服务
- 视频 / 文章两种内容类型
- 内容库、模板标记、搜索和筛选
- X、小红书、抖音、快手、微信公众号、西瓜视频、知乎、掘金账号矩阵
- 一条内容选择多个平台后加入发布队列
- 发布队列和账号状态视图

## 启动

```bash
npm install
npm start
```

如果终端设置了 `ELECTRON_RUN_AS_NODE=1`，请先运行：

```bash
env -u ELECTRON_RUN_AS_NODE npm start
```

## 发布器规划

`social-auto-upload` 的实现适合放在独立的本地发布器进程中。Electron 主进程后续通过子进程或本地 HTTP 调用它，并为每个平台实现统一接口：

```text
login(platform, account)
check(platform, account)
publishVideo(platform, account, payload)
publishArticle(platform, account, payload)
```

首批接入优先级：

1. 小红书、抖音、快手：参考项目已有浏览器自动化流程
2. 微信公众号、知乎、掘金：独立的文章编辑和发布流程
3. X、西瓜视频：先完成账号登录与视频发布，再补定时和平台特有字段

平台账号的 Cookie、浏览器 Profile 和 Token 必须按账号隔离保存。发布失败只重试当前平台账号，不影响同一内容的其它任务。

## 重要限制

部分平台没有稳定的公开发布 API，浏览器自动化可能受登录失效、验证码、风控和页面改版影响。正式发布前应增加人工确认、失败截图和任务日志，并遵守各平台服务条款。
