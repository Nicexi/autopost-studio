import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  App as AntApp,
  Button,
  ConfigProvider,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  AppstoreOutlined,
  FileTextOutlined,
  LoginOutlined,
  PlusOutlined,
  SettingOutlined,
  UploadOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { Column } from "@ant-design/charts";
import "./styles.css";
import PlatformIcon from "./components/PlatformIcon";
import PublishTaskModal from "./components/PublishTaskModal";
import { PLATFORMS } from "./components/platforms";

const { Sider, Header, Content } = Layout;
const BURGUNDY = "#800020";
const platformColor = {
  X: "#800020",
  小红书: "#800020",
  抖音: "#800020",
  快手: "#800020",
  微信公众号: "#800020",
  微信视频号: "#800020",
  西瓜视频: "#800020",
  哔哩哔哩: "#800020",
  知乎: "#800020",
  掘金: "#800020",
};
function timestamp() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}
function App() {
  const [state, setState] = useState({
    contents: [],
    accounts: [],
    jobs: [],
    settings: { cacheRoot: "", maxConcurrentUploads: 2, browserWidth: 1280, browserHeight: 800 },
  });
  const [view, setView] = useState("contents");
  const [logs, setLogs] = useState({ accounts: [], queue: [] });
  const [publishConfirmation, setPublishConfirmation] = useState(null);
  const [confirmationActions, setConfirmationActions] = useState({});
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [contentOpen, setContentOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [accountForm] = Form.useForm();
  const [contentForm] = Form.useForm();
  const [msg, contextHolder] = message.useMessage();
  const log = (scope, text) =>
    setLogs((items) => ({ ...items, [scope]: [{ time: timestamp(), text }, ...items[scope]].slice(0, 200) }));
  React.useEffect(() => {
    window.autopost.getState().then((next) => {
      setState({ ...next, settings: { maxConcurrentUploads: 2, browserWidth: 1280, browserHeight: 800, ...(next.settings || {}) } });
    });
  }, []);
  React.useEffect(() => window.autopost.onRpaLog((entry) => {
    const scope = entry.scope === "accounts" ? "accounts" : "queue";
    setLogs((items) => ({ ...items, [scope]: [{ time: entry.time, text: `${entry.platform ? `${entry.platform} / ` : ""}${entry.accountName || ""}${entry.accountName ? "：" : ""}${entry.message}` }, ...items[scope]].slice(0, 200) }));
  }), []);
  React.useEffect(() => window.autopost.onPublishConfirmation((entry) => {
    setPublishConfirmation(entry);
    setConfirmationActions(Object.fromEntries((entry.entries || []).map((item) => [item.confirmationId, "confirm"])));
  }), []);
  const resolvePublishConfirmation = async (action) => {
    const current = publishConfirmation;
    if (!current) return;
    setPublishConfirmation(null);
    await window.autopost.confirmPublish(current.batchId, Object.fromEntries((current.entries || []).map((item) => [item.confirmationId, action === "confirm" ? (confirmationActions[item.confirmationId] || "confirm") : action])));
  };
  const save = async (next) => {
    setState(next);
    await window.autopost.saveState(next);
  };
  const accountRows = state.accounts.map((a) => ({ ...a, key: a.id }));
  const chartData = useMemo(() => PLATFORMS.map((platform) => ({
    platform,
    count: state.jobs.reduce(
      (n, job) =>
        n + (job.targets || []).filter((t) => t.platform === platform).length,
      0,
    ),
  })), [state.jobs]);
  const chartConfig = useMemo(() => ({
    data: chartData,
    xField: "platform",
    yField: "count",
    color: BURGUNDY,
    height: 220,
    label: { style: { fill: "#fff" } },
  }), [chartData]);
  const accountColumns = [
    {
      title: "平台",
      dataIndex: "platform",
      width: 110,
      render: (value) => (
        <Tag
          color={platformColor[value]}
          icon={<PlatformIcon platform={value} />}
        >
          {value}
        </Tag>
      ),
    },
    { title: "账号", dataIndex: "name", width: 140, ellipsis: true },
    { title: "备注", dataIndex: "note", width: 180, ellipsis: true, render: (value) => value || "—" },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value) => (
        <Tag
          color={value === "已登录" ? "green" : "default"}
          icon={value === "已登录" ? <CheckCircleOutlined /> : null}
        >
          {value}
        </Tag>
      ),
    },
    {
      title: "代理",
      dataIndex: "proxy",
      width: 90,
      render: (value) =>
        value?.enabled ? <Tag color={BURGUNDY}>已配置</Tag> : "直连",
    },
    { title: "缓存目录", dataIndex: "cacheDir", width: 320, ellipsis: true },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width:250,
        render: (_, record) => (
        <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditAccount(record)}>编辑</Button>
            <Button
            size="small"
            icon={<LoginOutlined />}
            onClick={async () => {
              await window.autopost.loginAccount(record.id);
              const next = {
                ...state,
                accounts: state.accounts.map((a) =>
                  a.id === record.id ? { ...a, status: "登录中" } : a,
                ),
              };
              await save(next);
              log("accounts", `${record.platform} / ${record.name} 已打开 RPA 登录窗口，等待登录完成`);
              window.autopost.rpaLoginAccount(record.id).then(async result => { const updated = { ...state, accounts: state.accounts.map(a => a.id === record.id ? { ...a, status: result.status } : a) }; await save(updated); log("accounts", `${record.platform} / ${record.name} RPA 检测：${result.status}`); }).catch(error => log("accounts", `${record.platform} 登录检测失败：${error.message}`));
            }}
          >
            登录
          </Button>
          <Button
            size="small"
            onClick={async () => {
              const result = await window.autopost.checkAccountLogin(record.id);
              const next = {
                ...state,
                accounts: state.accounts.map((a) =>
                  a.id === record.id ? { ...a, status: result.status } : a,
                ),
              };
              await save(next);
              log("accounts", `${record.platform} / ${record.name} 登录检测：${result.status}（Cookie:${result.cookieMatch ? "有" : "无"}，页面:${result.selectorMatch ? "有账号标识" : "无账号标识"}${result.endpointMatch ? "，接口通过" : ""}${result.loginPageMatch ? "，检测到登录界面" : ""}）`);
            }}
          >
            {"检测"}
          </Button>
          <Button
            size="small"
            icon={<FolderOpenOutlined />}
            onClick={async () => {
              await window.autopost.openAccountCache(record.id);
              log("accounts", `已打开 ${record.name} 的缓存目录`);
            }}
          >
            缓存
          </Button>
          <Popconfirm
            title="删除账号及全部缓存？"
            description="该账号的 Chrome 登录状态、Cookies 和本地缓存都会被永久删除。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              try {
                await window.autopost.deleteAccount(record.id);
                const next = { ...state, accounts: state.accounts.filter((account) => account.id !== record.id), jobs: state.jobs.map((job) => ({ ...job, targets: (job.targets || []).filter((target) => target.accountId !== record.id) })).filter((job) => job.targets.length), contents: state.contents.map((content) => ({ ...content, targets: (content.targets || []).filter((target) => target.accountId !== record.id) })).filter((content) => content.targets.length) };
                await save(next);
                log("accounts", `已删除账号及缓存：${record.platform} / ${record.name}`);
                msg.success("账号及缓存已删除");
              } catch (error) { msg.error(error.message); log("accounts", `删除账号失败：${error.message}`); }
            }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label="删除账号" />
          </Popconfirm>
        </Space>
      ),
    },
  ];
  const contentColumns = [
    { title: "标题", dataIndex: "title" },
    {
      title: "类型",
      dataIndex: "type",
      render: (value) => (value === "video" ? "视频" : "文章"),
    },
    {
      title: "发布目标",
      dataIndex: "targets",
      render: (targets) =>
        (targets || []).map((t) => (
          <Tag key={`${t.platform}-${t.accountId}`} color={BURGUNDY}>
            {t.platform}
          </Tag>
        )),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      render: (value) => new Date(value).toLocaleString("zh-CN"),
    },
  ];
  async function addAccount(values) {
    if (editingAccount) {
      const account = await window.autopost.updateAccount({ accountId: editingAccount.id, platform: values.platform, name: values.name, note: values.note, proxy: { enabled: values.proxy, server: values.server, username: values.username, password: values.password } });
      const next = { ...state, accounts: state.accounts.map((item) => item.id === account.id ? account : item) };
      await save(next);
      setAccountOpen(false); setEditingAccount(null); accountForm.resetFields();
      log("accounts", `已更新账号并同步缓存目录：${account.platform} / ${account.name}`); msg.success("账号已更新");
      return;
    }
    const account = await window.autopost.addAccount({
      platform: values.platform,
      name: values.name,
      note: values.note,
      fingerprint: { profile: values.fingerprint || 'windows' },
      proxy: {
        enabled: values.proxy,
        server: values.server,
        username: values.username,
        password: values.password,
      },
    });
    const next = { ...state, accounts: [...state.accounts, account] };
    await save(next);
    setAccountOpen(false);
    accountForm.resetFields();
    log("accounts", `已创建账号：${account.platform} / ${account.name}`);
    msg.success("账号已创建");
  }
  async function addContent(values) {
    if (values.publishAt) {
      const publishTime = new Date(values.publishAt).getTime();
      if (!Number.isFinite(publishTime) || publishTime <= Date.now()) {
        msg.error("定时发布时间必须晚于当前时间");
        return;
      }
    }
    const targets = values.targets.map((id) => {
      const a = state.accounts.find((item) => item.id === id);
      return { accountId: id, platform: a.platform };
    });
    const item = {
      id: editingJob?.id || crypto.randomUUID(),
      type: values.type,
      title: values.title,
      file: values.file || "",
      images: values.type === "article" ? String(values.file || "").split(/\r?\n/).map((file) => file.trim()).filter(Boolean) : [],
      cover: values.cover || "",
      verticalCover: values.verticalCover || "",
      horizontalCover: values.horizontalCover || "",
      articleCover: values.articleCover || "",
      body: values.body || "",
      tags: values.tags || "",
      topics: values.topics || "",
      mentions: values.mentions || "",
      collection: values.collection || "",
      creativeDeclaration: values.creativeDeclaration || "自制",
      visibility: values.visibility || "public",
      publishAt: values.publishAt ? new Date(values.publishAt).toISOString() : null,
      platformSettings: Object.fromEntries([...new Set(targets.map((target) => target.platform))].map((platform) => [platform, { cover: values.cover || "", verticalCover: values.verticalCover || "", horizontalCover: values.horizontalCover || "", articleCover: values.articleCover || "", topics: values.topics || "", mentions: values.mentions || "", collection: values.collection || "", visibility: values.visibility || "public" }])),
      platforms: [...new Set(targets.map((t) => t.platform))],
      targets,
      createdAt: editingJob?.createdAt || new Date().toISOString(),
    };
    const next = editingJob
      ? { ...state, contents: state.contents.map((content) => content.id === item.id ? item : content), jobs: state.jobs.map((job) => job.id === item.id ? { ...item, status: job.status === "publishing" ? "ready" : (item.publishAt ? "scheduled" : "ready"), results: undefined, publishedAt: undefined } : job) }
      : { ...state, contents: [item, ...state.contents], jobs: [{ ...item, status: item.publishAt ? "scheduled" : "ready" }, ...state.jobs] };
    await save(next);
    setContentOpen(false);
    setEditingJob(null);
    contentForm.resetFields();
    log("queue", `${editingJob ? "已更新" : "已创建"}发布任务：${item.title}`);
    msg.success(editingJob ? "发布任务已更新" : "发布任务已加入队列");
  }
  function openNewContent() {
    setEditingJob(null);
    contentForm.resetFields();
    setContentOpen(true);
  }
  function openEditAccount(account) {
    setEditingAccount(account);
    accountForm.setFieldsValue({ platform: account.platform, name: account.name, note: account.note || '', proxy: Boolean(account.proxy?.enabled), server: account.proxy?.server || '', username: account.proxy?.username || '', password: account.proxy?.password || '' });
    setAccountOpen(true);
  }
  function openNewAccount() {
    setEditingAccount(null);
    accountForm.resetFields();
    setAccountOpen(true);
  }
  function openEditContent(job) {
    setEditingJob(job);
    const date = job.publishAt ? new Date(job.publishAt) : null;
    const localPublishAt = date && Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` : null;
    setContentOpen(true);
    window.setTimeout(() => contentForm.setFieldsValue({ ...job, targets: (job.targets || []).map((target) => target.accountId), file: job.type === "article" ? (job.images || []).join("\n") : job.file || "", publishAt: localPublishAt }), 0);
  }
  async function chooseRoot() {
    const root = await window.autopost.chooseDirectory();
    if (!root) return;
    const settings = await window.autopost.setCacheRoot(root);
    await save({ ...state, settings });
    log("accounts", `缓存根目录已设置为：${root}`);
    msg.success("缓存根目录已更新");
  }
  const menu = [
    { key: "contents", icon: <FileTextOutlined />, label: "内容库" },
    {
      key: "queue",
      icon: <UploadOutlined />,
      label: `发布队列 (${state.jobs.length})`,
    },
    { key: "accounts", icon: <AppstoreOutlined />, label: "账号列表" },
    { key: "settings", icon: <SettingOutlined />, label: "设置中心" },
  ];
  return (
    <AntApp>
      {contextHolder}
      <Layout className="shell">
        <Sider width={238} className="sider">
          <div className="brand">
            <span>A</span>
            <div>
              <b>Autopost</b>
              <small>CREATOR DESK</small>
            </div>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[view]}
            items={menu}
            onClick={({ key }) => setView(key)}
          />
        </Sider>
        <Layout>
          <Header className="header">
            <div>
              <Typography.Text className="eyebrow">
                OFFLINE CONTENT OPERATIONS
              </Typography.Text>
              <Typography.Title level={2}>
                {view === "contents"
                  ? "内容库"
                  : view === "queue"
                    ? "发布队列"
                    : view === "accounts"
                      ? "账号列表"
                      : "设置中心"}
              </Typography.Title>
            </div>
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() =>
                  view === "accounts"
                    ? openNewAccount()
                    : openNewContent()
                }
              >
                {view === "accounts" ? "添加账号" : "新建内容"}
              </Button>
            </Space>
          </Header>
          <Content className="content-wrap">
            <div className="workspace">
              {view === "contents" && (
                <>
                  <div className="hero">
                    <div>
                      <Typography.Text className="eyebrow">
                        LOCAL LIBRARY
                      </Typography.Text>
                      <Typography.Title level={3}>
                        一条内容，多平台分发。
                      </Typography.Title>
                      <Typography.Paragraph>
                        在本地整理内容、绑定账号，再创建可追踪的发布任务。
                      </Typography.Paragraph>
                    </div>
                    <div className="hero-number">
                      <b>{state.contents.length}</b>
                      <span>本地内容</span>
                    </div>
                  </div>
                  <div className="panel">
                    <Typography.Title level={4}>发布概览</Typography.Title>
                    <Column {...chartConfig} />
                  </div>
                  <div className="panel">
                    <Table
                      size="middle"
                      columns={contentColumns}
                      dataSource={state.contents.map((x) => ({
                        ...x,
                        key: x.id,
                      }))}
                      locale={{ emptyText: "还没有内容" }}
                      pagination={{ pageSize: 8 }}
                    />
                  </div>
                </>
              )}
              {view === "accounts" && (
                <div className="panel">
              <Table
                size="middle"
                columns={accountColumns}
                dataSource={accountRows}
                locale={{ emptyText: "还没有账号" }}
                className="accounts-table"
                tableLayout="fixed"
                scroll={{ x: 1190 }}
                pagination={{ pageSize: 10 }}
                  />
                </div>
              )}
              {view === "queue" && (
                <div className="panel">
                  <Table
                    size="middle"
                    columns={[
                      { title: "标题", dataIndex: "title" },
                      {
                        title: "平台 / 账号",
                        dataIndex: "targets",
                        render: (targets) =>
                          (targets || []).map((t) => {
                            const a = state.accounts.find(
                              (x) => x.id === t.accountId,
                            );
                            return (
                              <Tag
                                key={t.accountId}
                                color={BURGUNDY}
                                icon={<PlatformIcon platform={t.platform} />}
                              >
                                {t.platform} / {a?.name || "账号"}
                              </Tag>
                            );
                          }),
                      },
                      {
                        title: "状态",
                        dataIndex: "status",
                        render: (value) => (
                          <Tag
                            color={value === "published" ? "green" : value === "failed" ? "red" : BURGUNDY}
                          >
                            {value === "published" ? "已发布" : value === "scheduled" ? "定时发布" : value === "publishing" ? "发布中" : value === "partial" ? "部分成功" : value === "failed" ? "发布失败" : "待发布"}
                          </Tag>
                        ),
                      },
                      { title: "发布时间", dataIndex: "publishAt", render: (value) => value ? new Date(value).toLocaleString("zh-CN") : "立即" },
                      {
                        title: "操作", key: "actions", fixed: "right", width: 250,
                        render: (_, record) => (
                          <Space size={4}>
                            <Button size="small" icon={<EditOutlined />} disabled={record.status === "publishing"} onClick={() => openEditContent(record)}>编辑</Button>
                            <Button size="small" type="primary" disabled={record.status === "publishing"} onClick={async () => { try { log("queue", `开始填充任务素材：${record.title}`); const result = await window.autopost.publishJob(record.id); const latest = await window.autopost.getState(); setState(latest); log("queue", `${record.title}：${result.status === "published" ? "全部平台发布成功" : `发布结果 ${result.status}`}`); result.results.filter((item) => !item.success).forEach((item) => { const account = state.accounts.find((entry) => entry.id === item.accountId); log("queue", `${item.platform} / ${account?.name || "账号"} 发布失败：${item.error}`); }); result.status === "published" ? msg.success("发布完成") : msg.warning("部分平台未发布成功"); } catch (error) { log("queue", `发布失败：${error.message}`); msg.error(error.message); } }}>开始</Button>
                            <Popconfirm title="删除这个发布任务？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={async () => { await window.autopost.deleteJob(record.id); await save({ ...state, jobs: state.jobs.filter((job) => job.id !== record.id), contents: state.contents.filter((content) => content.id !== record.id) }); log("queue", `已删除发布任务：${record.title}`); msg.success("任务已删除"); }}>
                              <Button size="small" danger icon={<DeleteOutlined />} aria-label="删除任务" />
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                    dataSource={state.jobs.map((x) => ({ ...x, key: x.id }))}
                    scroll={{ x: 900 }}
                    pagination={{ pageSize: 10 }}
                  />
                </div>
              )}
              {view === "settings" && (
                <div className="panel settings">
                  <Typography.Title level={4}>缓存与本地数据</Typography.Title>
                  <Typography.Paragraph>
                    新账号会在缓存根目录下自动创建独立的“平台 /
                    账号”目录。登录状态和代理配置只属于对应账号。
                  </Typography.Paragraph>
                  <Space.Compact block>
                    <Input
                      value={state.settings.cacheRoot}
                      placeholder="使用应用默认目录"
                      readOnly
                    />
                    <Button onClick={chooseRoot}>选择缓存根目录</Button>
                  </Space.Compact>
                  <div style={{ marginTop: 20 }}>
                    <Typography.Text strong>同时上传账号数</Typography.Text>
                    <Typography.Paragraph type="secondary">控制素材上传阶段的最大并发账号数，建议根据电脑性能设置。</Typography.Paragraph>
                    <InputNumber min={1} max={20} value={state.settings.maxConcurrentUploads || 2} onChange={async (value) => { const maxConcurrentUploads = Math.max(1, Math.min(20, Number(value) || 1)); await save({ ...state, settings: { ...state.settings, maxConcurrentUploads } }); msg.success(`最大并发账号数已设置为 ${maxConcurrentUploads}`); }} />
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <Typography.Text strong>浏览器窗口尺寸</Typography.Text>
                    <Typography.Paragraph type="secondary">新打开的指纹浏览器将使用此窗口宽高。</Typography.Paragraph>
                    <Space.Compact>
                      <InputNumber min={800} max={3000} value={state.settings.browserWidth || 1280} addonBefore="宽" onChange={async (browserWidth) => { await save({ ...state, settings: { ...state.settings, browserWidth: Math.max(800, Math.min(3000, Number(browserWidth) || 1280)) } }); }} />
                      <InputNumber min={600} max={2400} value={state.settings.browserHeight || 800} addonBefore="高" onChange={async (browserHeight) => { await save({ ...state, settings: { ...state.settings, browserHeight: Math.max(600, Math.min(2400, Number(browserHeight) || 800)) } }); }} />
                    </Space.Compact>
                  </div>
                </div>
              )}
            </div>
            {(view === "accounts" || view === "queue") && <aside className="right-rail">
              <div className="right-summary" />
              <aside className="log-panel">
                <div className="log-title">
                  <b>操作日志</b>
                  <Button type="link" size="small" onClick={() => setLogs(items => ({ ...items, [view]: [] }))}>
                    清空
                  </Button>
                </div>
                <div className="logs">
                  {logs[view].length ? (
                    logs[view].map((entry, i) => (
                      <div className="log-line" key={`${entry.time}-${i}`}>
                        <time>{entry.time}</time>
                        <span>{entry.text}</span>
                      </div>
                    ))
                  ) : (
                    <div className="log-empty">暂无操作记录</div>
                  )}
                </div>
              </aside>
            </aside>}
          </Content>
        </Layout>
      </Layout>
      <Modal
        title="确认发布"
        open={Boolean(publishConfirmation)}
        closable={false}
        maskClosable={false}
        onCancel={() => resolvePublishConfirmation("cancel")}
        footer={[
          <Button key="cancel" onClick={() => resolvePublishConfirmation("cancel")}>全部取消</Button>,
          <Button key="confirm" type="primary" onClick={() => resolvePublishConfirmation("confirm")}>确认发布</Button>,
        ]}
      >
        <Typography.Paragraph>
          {publishConfirmation ? "所有账号素材已填充完成，请逐项检查后确认发布。" : ""}
        </Typography.Paragraph>
        <div className="confirmation-list">
          {(publishConfirmation?.entries || []).map((entry) => (
            <div className="confirmation-row" key={entry.confirmationId}>
              <div><b>{entry.platform} / {entry.accountName}</b><div>{entry.title || "未命名内容"}</div></div>
              <Space size={6}>
                <Button size="small" type={confirmationActions[entry.confirmationId] === "retry" ? "primary" : "default"} onClick={() => setConfirmationActions((items) => ({ ...items, [entry.confirmationId]: "retry" }))}>重试</Button>
                <Button size="small" danger type={confirmationActions[entry.confirmationId] === "cancel" ? "primary" : "default"} onClick={() => setConfirmationActions((items) => ({ ...items, [entry.confirmationId]: "cancel" }))}>删除</Button>
              </Space>
            </div>
          ))}
        </div>
      </Modal>
      <Modal
        title={editingAccount ? "编辑账号" : "创建账号"}
        open={accountOpen}
        onCancel={() => { setAccountOpen(false); setEditingAccount(null); accountForm.resetFields(); }}
        onOk={() => accountForm.submit()}
        okText={editingAccount ? "保存修改" : "创建"}
        cancelText="取消"
      >
        <Form
          form={accountForm}
          layout="vertical"
          onFinish={addAccount}
          initialValues={{ platform: PLATFORMS[0], proxy: false }}
        >
          <Form.Item name="platform" label="平台" rules={[{ required: true }]}>
            <Select disabled={Boolean(editingAccount)}
              options={PLATFORMS.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item name="name" label="账号名称" rules={[{ required: true }]}>
            <Input placeholder="主账号 / 品牌号" />
          </Form.Item>
          <Form.Item name="note" label="账号备注">
            <Input placeholder="内容方向或负责人" />
          </Form.Item>
          <Form.Item name="proxy" label="使用代理" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.proxy !== next.proxy}
          >
            {({ getFieldValue }) =>
              getFieldValue("proxy") ? (
                <>
                  <Form.Item
                    name="server"
                    label="代理地址"
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="http://127.0.0.1:7890" />
                  </Form.Item>
                  <Space.Compact block>
                    <Form.Item name="username" noStyle>
                      <Input placeholder="代理用户名" />
                    </Form.Item>
                    <Form.Item name="password" noStyle>
                      <Input.Password placeholder="代理密码" />
                    </Form.Item>
                  </Space.Compact>
                </>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>
      <PublishTaskModal open={contentOpen} form={contentForm} accounts={state.accounts} editing={Boolean(editingJob)} onCancel={() => { setContentOpen(false); setEditingJob(null); }} onFinish={addContent} />
    </AntApp>
  );
}
createRoot(document.getElementById("root")).render(
  <ConfigProvider
    theme={{
      token: {
        colorPrimary: BURGUNDY,
        colorLink: BURGUNDY,
        borderRadius: 4,
        colorText: "#35131f",
      },
      components: {
        Layout: { siderBg: BURGUNDY, headerBg: "#fff" },
        Menu: {
          darkItemBg: BURGUNDY,
          darkItemSelectedBg: "#a12a4d",
          darkItemColor: "#fff",
          darkItemSelectedColor: "#fff",
          darkItemHoverBg: "#a12a4d",
        },
        Button: { primaryColor: "#fff" },
      },
    }}
  >
    <App />
  </ConfigProvider>,
);
