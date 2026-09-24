import React from "react";
import { Button, Form, Input, Modal, Segmented, Select, Tag } from "antd";
import {
  ClockCircleOutlined,
  FileImageOutlined,
  FileTextOutlined,
  SendOutlined,
  UploadOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import PlatformIcon from "./PlatformIcon";
import { PLATFORM_MODES } from "./platforms";

const IMAGE_FILTER = [{ name: "图片", extensions: ["jpg", "jpeg", "png", "webp"] }];
const VIDEO_FILTER = [{ name: "视频", extensions: ["mp4", "mov", "mkv", "webm"] }];

function FileField({ form, name, label, placeholder, multiple = false, filters, icon }) {
  async function chooseFile() {
    const files = await window.autopost.chooseFiles({ multiple, filters });
    if (files.length) form.setFieldValue(name, files.join("\n"));
  }

  return (
    <Form.Item name={name} label={label} rules={name === "file" ? [{ required: true, message: `请选择${label}` }] : []}>
      <Input className="asset-input" prefix={icon} placeholder={placeholder} readOnly addonAfter={<Button type="text" icon={<UploadOutlined />} onClick={chooseFile}>选择文件</Button>} />
    </Form.Item>
  );
}

export default function PublishTaskModal({ open, form, accounts, editing = false, onCancel, onFinish }) {
  const contentType = Form.useWatch("type", form) || "video";
  const selectedTargetIds = Form.useWatch("targets", form) || [];
  const publishAt = Form.useWatch("publishAt", form);
  const selectedAccounts = selectedTargetIds.map((id) => accounts.find((account) => account.id === id)).filter(Boolean);
  const selectedPlatforms = [...new Set(selectedAccounts.map((account) => account.platform))];
  const supportsMentions = selectedPlatforms.some((platform) => ["X", "抖音", "快手", "知乎", "掘金"].includes(platform));
  const supportsCollection = selectedPlatforms.some((platform) => ["抖音", "快手", "西瓜视频"].includes(platform));
  const supportsBilibili = selectedPlatforms.includes("哔哩哔哩");
  const compatibleAccounts = accounts.filter((account) => (PLATFORM_MODES[account.platform] || []).includes(contentType));

  function changeType(type) {
    form.setFieldsValue({
      type,
      targets: selectedTargetIds.filter((id) => {
        const account = accounts.find((item) => item.id === id);
        return account && (PLATFORM_MODES[account.platform] || []).includes(type);
      }),
      file: "",
      cover: "",
      verticalCover: "",
      horizontalCover: "",
      articleCover: "",
    });
  }

  return (
    <Modal
      className="publish-task-modal"
      width={960}
      title={<div className="publish-modal-title"><SendOutlined /><div><b>{editing ? "编辑发布任务" : "创建发布任务"}</b><span>整理内容并选择发布账号</span></div></div>}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={editing ? "保存修改" : "加入发布队列"}
      cancelText="取消"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ type: "video", visibility: "public" }}>
        <div className="publish-layout">
          <section className="publish-editor">
            <div className="publish-section-head">
              <div><b>内容与素材</b><span>编辑将用于所有目标平台的基础内容</span></div>
              <Form.Item name="type" noStyle>
                <Segmented
                  options={[
                    { value: "video", label: "视频", icon: <VideoCameraOutlined /> },
                    { value: "article", label: "文章", icon: <FileTextOutlined /> },
                  ]}
                  onChange={changeType}
                />
              </Form.Item>
            </div>

            <Form.Item name="title" label="作品标题" rules={[{ required: true, message: "请输入作品标题" }]}>
              <Input size="large" showCount maxLength={100} placeholder="输入发布标题" />
            </Form.Item>

            <Form.Item name="body" label={contentType === "video" ? "作品描述" : "文章正文"}>
              <Input.TextArea rows={contentType === "video" ? 4 : 7} showCount maxLength={contentType === "video" ? 2000 : 20000} placeholder={contentType === "video" ? "输入视频描述" : "输入文章正文"} />
            </Form.Item>

            <div className="asset-grid">
              <FileField form={form} name="file" label={contentType === "video" ? "视频素材" : "文章配图"} placeholder={contentType === "video" ? "MP4、MOV、MKV 或 WebM" : "可选择多张图片"} multiple={contentType === "article"} filters={contentType === "video" ? VIDEO_FILTER : IMAGE_FILTER} icon={contentType === "video" ? <VideoCameraOutlined /> : <FileImageOutlined />} />
              <FileField form={form} name={contentType === "video" ? "cover" : "articleCover"} label={contentType === "video" ? "视频封面（通用）" : "文章封面"} placeholder="JPG、PNG 或 WebP" filters={IMAGE_FILTER} icon={<FileImageOutlined />} />
            </div>
            {contentType === "video" && <div className="metadata-grid cover-variants"><FileField form={form} name="verticalCover" label="竖版封面" placeholder="可选，9:16" filters={IMAGE_FILTER} icon={<FileImageOutlined />} /><FileField form={form} name="horizontalCover" label="横版封面" placeholder="可选，16:9" filters={IMAGE_FILTER} icon={<FileImageOutlined />} /></div>}

            <div className="metadata-grid">
              <Form.Item name="tags" label="作品标签"><Input placeholder="标签之间用逗号分隔" /></Form.Item>
              <Form.Item name="topics" label="作品话题"><Input placeholder="例如：旅行日常, 数码分享" /></Form.Item>
            </div>
          </section>

          <aside className="publish-delivery">
            <div className="publish-section-head compact">
              <div><b>发布设置</b><span>已选 {selectedTargetIds.length} 个账号</span></div>
            </div>

            <Form.Item name="targets" label="发布账号" rules={[{ required: true, message: "请选择至少一个账号" }]}>
              <Select
                mode="multiple"
                optionFilterProp="label"
                placeholder="选择账号"
                maxTagCount="responsive"
                options={compatibleAccounts.map((account) => ({ value: account.id, label: `${account.platform} / ${account.name}` }))}
              />
            </Form.Item>

            {selectedAccounts.length > 0 && <div className="selected-platforms">
              {selectedAccounts.map((account) => <Tag key={account.id} icon={<PlatformIcon platform={account.platform} />}>{account.platform} · {account.name}</Tag>)}
            </div>}

            {supportsMentions && <Form.Item name="mentions" label="@好友"><Input placeholder="多个好友用逗号分隔" /></Form.Item>}
            {supportsCollection && <Form.Item name="collection" label="添加合集"><Input placeholder="填写平台合集名称" /></Form.Item>}
            {supportsBilibili && <Form.Item name="creativeDeclaration" label="哔哩哔哩创作声明" initialValue="自制"><Select options={[{ value: "自制", label: "自制" }, { value: "转载", label: "转载" }, { value: "不涉及", label: "不涉及" }]} /></Form.Item>}

            <Form.Item name="visibility" label="可见范围">
              <Select options={[{ value: "public", label: "公开" }, { value: "private", label: "私密" }, { value: "friends", label: "仅好友可见" }]} />
            </Form.Item>

            <Form.Item name="publishAt" label="发布时间">
              <Input type="datetime-local" prefix={<ClockCircleOutlined />} />
            </Form.Item>

            <div className="delivery-note">
              <ClockCircleOutlined />
              <span>{publishAt ? "任务将在设定时间进入发布流程" : "未设置时间时加入待发布队列"}</span>
            </div>
          </aside>
        </div>
      </Form>
    </Modal>
  );
}
