# OmniContext

Seamlessly share chat context across different AI assistants (including Doubao and more) with conversation auto-captures and one-click context injection.

在不同AI助手间无缝共享对话上下文，支持豆包、元宝、Claude等平台，自动捕获聊天记录，一键注入上下文，让AI协作更连贯。

---

## 功能特性

- 🤖 **多平台支持** - 豆包、元宝、Claude 等主流AI助手
- 💾 **自动捕获** - 访问平台时自动记录对话历史
- 📋 **一键注入** - 选择历史会话，格式化复制到剪贴板
- 🔒 **本地存储** - 数据仅存储在浏览器本地，隐私优先
- 📤 **数据导出** - 支持JSON格式备份

---

## 安装使用

### 途径1：直接安装使用（推荐）

不需要安装 Node.js，直接下载使用：

```bash
git clone https://github.com/2012zzhao/OmniContext.git
```

然后在 Chrome 中加载扩展：

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `OmniContext/product` 文件夹

即可开始使用！

### 途径2：基于源码自行构建

如果你想修改代码或参与开发：

```bash
git clone https://github.com/2012zzhao/OmniContext.git
cd OmniContext
npm install
npm run build
```

构建完成后，在 Chrome 中加载 `dist/` 目录。

---

## 使用指南

### 1. 自动捕获对话

安装扩展后，在支持的 AI 平台（豆包、元宝、Claude）正常聊天即可。

- 扩展会自动检测页面并捕获对话内容
- 数据仅存储在浏览器本地，不会上传到任何服务器
- 每次发送新消息后，扩展会自动更新保存

### 2. 查看和选择历史会话

点击浏览器工具栏的 🧠 图标打开扩展弹窗：

- **按平台分组**：会话按豆包、元宝、Claude 分组显示
- **会话标题**：显示从页面抓取的会话标题（可编辑）
- **消息数量**：显示每个会话的消息条数
- **最后更新时间**：显示会话最后更新时间

### 3. 注入上下文到其他 AI 助手

1. 在新平台（或新会话）打开 OmniContext 弹窗
2. 找到之前保存的会话
3. 点击会话右侧的 📋 「复制」按钮
4. 格式化后的上下文会自动复制到剪贴板
5. 粘贴到当前 AI 助手的输入框即可

复制的内容格式示例：
```
【上下文引用】
以下是我之前在豆包的对话记录：

---
会话: Java学习路线
来源: 豆包
日期: 2024-01-15 10:00
消息数: 5

[用户] 我想学Java，有什么建议？

[豆包] Java是一门很好的编程语言，建议从基础开始...

[用户] 具体需要学哪些内容？
---

基于以上背景，请帮我继续...
```

### 4. 管理会话

- **编辑标题**：点击 ✏️ 图标可以修改会话标题
- **删除会话**：点击 🗑️ 图标删除不需要的会话（不可恢复）
- **刷新列表**：点击 🔄 按钮刷新会话列表

### 5. 导出备份

点击 📤 「导出」按钮，可以将所有会话数据导出为 JSON 文件，用于备份或迁移。

导出的文件格式：
```json
[
  {
    "id": "session-id",
    "platform": "doubao",
    "title": "会话标题",
    "messages": [...],
    "messageCount": 10,
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
]
```

---

## 常见问题

**Q: 扩展无法捕获对话？**

A: 确保：
1. 扩展已正确加载（图标显示在工具栏）
2. 你在支持的平台上（豆包、元宝、Claude）
3. 页面已完全加载（等待几秒钟）
4. 已经发送了至少一条消息

**Q: 复制的内容粘贴后格式错乱？**

A: 某些 AI 助手可能不支持 Markdown 格式。如果粘贴后格式不对，可以：
1. 手动删除 Markdown 标记
2. 或只复制需要的对话片段

**Q: 数据会丢失吗？**

A: 数据存储在浏览器本地（IndexedDB）。
- 卸载扩展会丢失数据
- 清除浏览器数据会丢失数据
- 建议定期点击「导出」备份重要对话

---

## 项目结构

```
OmniContext/
├── src/                     # Chrome 扩展核心源代码
│   ├── background/          # 后台服务 (Service Worker)
│   ├── content/             # 内容脚本 (页面注入)
│   ├── popup/               # 弹窗 UI
│   ├── storage/             # IndexedDB 存储封装
│   ├── types/               # TypeScript 类型定义
│   └── utils/               # 工具函数
├── tests/                   # 测试文件
├── project/                 # 项目管理文档
├── native/                  # Native Messaging Host (Python)
│   ├── native_host.py       # 本地消息主机
│   ├── install.py           # 安装脚本
│   └── README.md
├── server/                  # Python FastAPI 服务器
│   ├── main.py              # 服务入口
│   ├── storage.py           # 存储模块
│   └── models.py            # 数据模型
├── sdk/python/              # Python SDK
├── icons/                   # 图标资源
├── product/                 # 可分发扩展版本
├── dist/                    # 构建输出 (.gitignore)
├── manifest.json            # 扩展配置
├── package.json
└── README.md
```

---

## 软件架构

### Chrome Extension MV3 架构

```
┌─────────────────────────────────────────┐
│           Chrome Extension              │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Content │ │Background│ │  Popup   │ │
│  │ Script  │ │  Script  │ │   UI     │ │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ │
│       └─────────────┴──────────┘         │
│              chrome.storage              │
└─────────────────────────────────────────┘
```

### 数据流

```
AI平台页面 → Content Script → Extractor → Storage → Popup显示 → 复制注入
```

### 核心模块

| 模块 | 职责 |
|------|------|
| Content Script | 页面DOM监听、消息提取、自动保存 |
| Background | 扩展生命周期管理、图标状态更新 |
| Popup | 用户界面、会话管理、操作交互 |
| Storage | IndexedDB封装、Session CRUD |
| Extractor | 平台特定选择器、DOM解析 |
| Formatter | 格式化输出、剪贴板操作 |

---

## 开发

### 技术栈

- **构建**: Vite + @crxjs/vite-plugin
- **语言**: TypeScript
- **测试**: Vitest + jsdom
- **样式**: 原生CSS

### 命令

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 测试
npm test

# 生产构建
npm run build
```

### 测试

项目采用TDD开发，所有核心模块均有测试覆盖：

```
✓ storage.test.ts    9 tests
✓ extractor.test.ts  18 tests
✓ formatter.test.ts  8 tests
```

---

## 支持平台

| 平台 | 状态 | 备注 |
|------|------|------|
| 豆包 (Doubao) | ✅ | 完整支持CSS Modules解析 |
| 元宝 (Yuanbao) | ✅ | 完整支持 |
| Claude | ✅ | 完整支持 |
| DeepSeek | ✅ | 完整支持 |
| Kimi | ✅ | 完整支持 |
| Gemini | ✅ | 新增支持 |

---

## 数据模型

### Session
```typescript
interface Session {
  id: string;              // 唯一标识
  platform: Platform;      // 平台类型
  title: string;           // 会话标题
  sourceUrl: string;       // 来源链接
  createdAt: number;       // 创建时间
  updatedAt: number;       // 更新时间
  messages: Message[];     // 消息列表
  messageCount: number;    // 消息数量
}
```

### Message
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
```

---

## 贡献

欢迎提交 Issue 和 PR！

---

## 许可

MIT License
