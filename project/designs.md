# ContextDrop 产品设计文档

> 倒排式记录，最新记录在最上方。只增不减。

---

## 2026-03-24 底部按钮UI重构（已实现）

**摘要：** 重构底部按钮布局，新增设置弹出菜单

**正文：**

### 功能概述
- 将原有4个按钮精简为3个等宽按钮
- 导出/导入功能移至设置菜单

### 设计决策
| 项目 | 决定 |
|------|------|
| 按钮数量 | 3个（设置、管理、刷新） |
| 按钮宽度 | 等宽，使用 calc((100% - 16px) / 3) |
| 导出/导入 | 移至设置弹出菜单 |
| 菜单方向 | 向上弹出 |
| 菜单宽度 | 自适应内容（white-space: nowrap） |

### UI 设计
```
┌─────────────────────────────────────────┐
│  ...会话列表...                          │
├─────────────────────────────────────────┤
│          ┌─────────────────┐            │
│          │ 📤 记忆导出到文件 │            │  ← 弹出菜单
│          │ 📥 从文件导入记忆 │            │
│          └─────────────────┘            │
│ [⚙️ 设置] [🗑️ 管理] [🔄 刷新]           │
└─────────────────────────────────────────┘
```

### 交互细节
- 点击「设置」按钮显示/隐藏菜单
- 点击页面其他位置自动关闭菜单
- 菜单项点击后执行对应功能并关闭菜单

---

## 2026-03-24 自动捕获按钮样式优化（已实现）

**摘要：** 优化自动捕获按钮关闭状态的可见性

**正文：**

### 设计决策
| 状态 | 背景 | 文字 |
|------|------|------|
| 关闭 | #d8d8d8（灰色） | --text-primary |
| 开启 | --accent-copper（古铜色） | white |
| 禁用 | #d8d8d8, opacity: 0.5 | --text-secondary |

### 技术实现
- 关闭状态使用 `.btn-assistant-secondary` 类
- 开启状态添加 `.active` 类
- 禁用状态添加 `.disabled` 类

---

## 2026-03-02 会话查看功能设计（已实现）

**摘要：** 点击会话查看完整对话历史

**正文：**

### 功能概述
- 用户点击会话卡片，弹出对话框显示完整对话历史
- 支持复制全部内容
- 搜索关键词高亮

### 设计决策
| 项目 | 决定 |
|------|------|
| 触发方式 | 点击 session-info 区域 |
| 对话框大小 | 480px宽，最大85vh高 |
| 消息样式 | 气泡式，用户蓝色/助手绿色 |
| 复制功能 | 对话框底部"复制全部"按钮 |

### UI 设计
```
┌─────────────────────────────────────────┐
│  会话标题                豆包 · 3/2 · 15条 │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │ 👤 用户  14:30                   │    │
│  │ 你好，请帮我写一段代码...         │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ 🤖 助手  14:31                   │    │
│  │ 好的，我来帮你写这段代码...       │    │
│  └─────────────────────────────────┘    │
│  ...更多消息...                          │
├─────────────────────────────────────────┤
│      [📋 复制全部]      [关闭]           │
└─────────────────────────────────────────┘
```

### 交互细节
- 悬停 session-info 显示提示："点击查看完整对话"
- 点击后弹出模态对话框
- 消息区可滚动
- 点击遮罩或关闭按钮关闭对话框
- 支持搜索关键词高亮（黄色背景）

### 技术实现
- 新增 `session-view-dialog` HTML 结构
- CSS 类：`.session-message.user`, `.session-message.assistant`
- 函数：`handleViewSession()`, `renderSessionMessages()`, `handleSessionViewCopy()`
- 使用 `formatSessionForInjection()` 格式化复制内容

---

## 2026-03-01 批量主动捕获功能设计（已对齐）

**摘要：** 一键捕获 AI 平台所有会话历史

**正文：**

### 设计决策（已确认）
| 项目 | 决定 |
|------|------|
| 实现方案 | A. 自动化 UI 操作 |
| 用户操作 | 必须前台，不建议打断 |
| 功能入口 | Popup 中按钮 |

### 用户流程
```
1. 用户在豆包页面打开 Popup
2. 点击「批量捕获 豆包 所有会话」
3. 显示进度条：X/Y，当前会话标题，已捕获消息数
4. 完成后自动刷新列表
```

### 技术实现
```
Popup → chrome.tabs.sendMessage → Content Script
                                     ↓
                              BatchCapture.start()
                                     ↓
                              1. 获取会话列表元素
                              2. 逐个点击会话
                              3. 滚动加载历史
                              4. 捕获并保存
                              5. 发送进度更新
```

### 平台适配
- 豆包：已实现基础框架，DOM 选择器待实测验证
- 元宝/Claude：待实现

---

**摘要：** 数据备份与恢复功能

**正文：**

### 功能概述
- 导出：全量导出所有会话 + 标签 + 关联
- 导入：从备份文件恢复数据

### 设计决策（已确认）
| 项目 | 决定 |
|------|------|
| 导出加密 | ❌ 暂不做 |
| 部分导出 | ❌ 暂不做（全量导出） |
| 导入预览 | ❌ 暂不做 |
| UI位置 | Footer 区域 |
| 导入确认 | 显示模式选择对话框 |
| 导入反馈 | Toast 提示 |

### UI 布局
```
┌─────────────────────────────────┐
│  🧠 ContextDrop                 │
│  ...会话列表...                  │
├─────────────────────────────────┤
│ [📤 导出] [📥 导入] [🔄 刷新]    │
└─────────────────────────────────┘
```

### 导出功能
- 点击「导出」按钮
- 收集所有数据（会话 + 标签 + 关联）
- 生成 JSON 文件并下载
- 文件名：`contextdrop-backup-YYYY-MM-DD.json`
- Toast 提示：「备份文件已下载」

### 导入功能

**流程：**
1. 点击「导入」按钮
2. 打开文件选择器（只接受 .json）
3. 读取并验证文件
4. 显示导入模式选择对话框
5. 用户选择模式后执行导入
6. Toast 提示结果

**导入模式选择对话框：**
```
┌─────────────────────────────────┐
│  📥 导入确认                    │
├─────────────────────────────────┤
│  文件：contextdrop-backup.json  │
│  会话数：25                     │
│  标签数：5                      │
├─────────────────────────────────┤
│  导入方式：                     │
│  ○ 合并（保留现有）- 推荐       │
│  ○ 合并（覆盖冲突）             │
│  ○ 完全覆盖（清空现有数据）     │
├─────────────────────────────────┤
│       [取消]  [确认导入]        │
└─────────────────────────────────┘
```

**导入模式说明：**
| 模式 | 说明 |
|------|------|
| 合并（保留现有） | 新数据导入，ID冲突时保留本地数据 |
| 合并（覆盖冲突） | 新数据导入，ID冲突时使用导入数据 |
| 完全覆盖 | 清空本地所有数据，完全使用导入数据 |

### 数据结构
```typescript
interface ExportData {
  version: string;           // 格式版本号 "1.0"
  exportedAt: string;        // ISO 时间戳
  sessions: Session[];       // 所有会话
  tags: Tag[];               // 所有标签
  sessionTags: Record<string, string[]>;  // 会话-标签关联
}
```

### Toast 提示
- 导出成功：「备份文件已下载」
- 导入成功：「导入成功：X个会话，X个标签」
- 导入失败：「导入失败：文件格式无效」

---

## 2026-02-28 搜索功能设计

**摘要：** 快速定位历史会话

**正文：**

### 评审结论

| 功能 | 决定 | 备注 |
|------|------|------|
| 实时搜索 | ✅ 采用 | 输入即搜索，无需回车 |
| 搜索历史 | ❌ 暂不做 | 记录到未来功能 |
| 标签筛选 | ✅ 多选 | 作为集合匹配 |
| 时间筛选 | ❌ 暂不做 | 记录到未来功能 |

### 交互设计

#### 搜索入口
```
┌─────────────────────────────────┐
│ 🧠 ContextDrop          [⚙️]   │
├─────────────────────────────────┤
│ [🔍 搜索会话...        ] [×]   │
├─────────────────────────────────┤
│ [豆包 ▼] [标签 ▼]               │
├─────────────────────────────────┤
│ ▼ 豆包 (5)                      │
│   └─ 会话列表...                │
└─────────────────────────────────┘
```

#### 搜索结果高亮
```
┌─────────────────────────────────┐
│ 📝 如何实现**深度学习**模型...  │
│    豆包 · 3条消息 · 今天        │
└─────────────────────────────────┘
```

### 技术方案
- 防抖搜索：300ms
- 搜索范围：标题 + 消息内容
- 高亮匹配：`<span class="highlight">`

---

## 2026-02-28 思考模式通用架构设计

**摘要：** 设计跨平台思考模式内容过滤方案

**正文：**

### 背景
主流AI平台（豆包、元宝、Claude）都推出了"思考模式"功能：
- 豆包：思考功能
- 元宝：深度思考
- Claude：Extended Thinking

这些功能会在回答前显示思考过程，但用户注入上下文时通常只需要最终回答。

### 架构设计

```
┌─────────────────────────────────────────────────────┐
│              extractMessages()                       │
│  ┌─────────────────────────────────────────────────┐│
│  │ if (platform === 'doubao') → extractDoubaoMessages()
│  │ if (platform === 'yuanbao') → extractYuanbaoMessages()
│  │ if (platform === 'claude') → extractClaudeMessages()
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### 各平台思考模式处理

#### 豆包 (Doubao)
```typescript
// 选择器
'[class*="message-block-container"]'
'[class*="bg-s-color-bg-trans"]'  // 用户标识

// 思考识别
'[class*="answer-content"], [class*="final-answer"]'
思考中... | thinking...
```

#### 元宝 (Yuanbao)
```typescript
// 选择器
'[class*="message-list"], [class*="chat-list"]'
'[class*="user-message"], [class*="assistant-message"]'

// 思考识别
思考过程 | 思考中 | 正在思考 | Think | Thinking
'[class*="thinking"], [class*="thought"], [class*="reasoning"]'
```

#### Claude
```typescript
// 选择器
'[class*="conversation"], [class*="messages"]'
'[class*="human"], [class*="assistant"]'

// 思考识别 (Extended Thinking)
'[class*="thinking"], [class*="thought"], [data-thinking]'
Thinking: | Extended thinking | Let me think
<thinking>...</thinking> | [Thinking]...[/Thinking]
```

### 通用处理流程

```
1. 查找消息容器
   ↓
2. 遍历消息块
   ↓
3. 判断角色（用户/助手）
   ↓
4. 助手消息 → 检测思考区块
   ↓
5. 克隆DOM，移除思考内容
   ↓
6. 返回纯净的最终回答
```

### 方法签名

```typescript
// 各平台专用提取
private extractDoubaoMessages(): Message[]
private extractYuanbaoMessages(): Message[]
private extractClaudeMessages(): Message[]

// 思考内容识别
private isDoubaoThinkingContent(text: string): boolean
private isYuanbaoThinkingContent(text: string): boolean
private isClaudeThinkingContent(text: string): boolean

// 内容清理
private extractDoubaoAssistantContent(element: Element): string
private extractYuanbaoAssistantContent(element: Element): string
private extractClaudeAssistantContent(element: Element): string
```

---

## 2026-02-27 AgenticEngineering 文档体系

**摘要：** 建立面向Agent协作的项目管理规范

**正文：**

### 文档组织原则

| 原则 | 说明 |
|------|------|
| 只增不减 | 历史记录保留，新内容追加 |
| 倒排记录 | 最新内容在上方，便于查看 |
| 结构化 | 时间 + 摘要 + 正文三层结构 |
| Markdown | 纯文本、版本友好、Agent可读 |

### 文档职责划分

| 文档 | 职责 |
|------|------|
| `worklog.md` | 工作日志、里程碑、阶段性进展 |
| `designs.md` | 产品设计、技术方案、架构决策 |

---

## 2026-02-27 品牌与命名规范

**摘要：** 项目正式命名为 ContextDrop

**正文：**

### 品牌含义
- **Omni**：全域、全平台
- **Context**：上下文、语境、记忆

### GitHub描述
```
Seamlessly share chat context across different AI assistants (including Doubao and more) with conversation auto-captures and one-click context injection.

在不同AI助手间无缝共享对话上下文，支持豆包、元宝、Claude等平台，自动捕获聊天记录，一键注入上下文，让AI协作更连贯。
```

### 技术命名规范
- 存储键名：`sessions`
- Session ID：`{platform}-{timestamp}` 或 URL提取的ID
- 控制台前缀：`[ContextDrop]`

---

## 2026-02-27 构建与部署流程

**摘要：** 标准化开发测试流程

**正文：**

### 开发流程
```
编码 → 测试 (npm test) → 构建 (npm run build) → 复制到桌面 → Chrome加载测试
```

### 桌面部署
- 目标路径：`C:\Users\73523\Desktop\ContextDrop\`
- 内容：dist/ 目录完整复制
- Chrome加载：`chrome://extensions/` → 加载已解压的扩展程序

---

## 2026-02-26 豆包平台DOM解析方案

**摘要：** CSS Modules环境下的选择器策略

**正文：**

### 问题
豆包使用CSS Modules，类名包含随机哈希（如 `message-block-container-PggqdK`）

### 解决方案
```typescript
// 使用属性包含选择器
const messageBlocks = document.querySelectorAll('[class*="message-block-container"]');

// 区分用户消息：检查是否存在用户样式类
const isUser = block.querySelector('[class*="bg-s-color-bg-trans"]') !== null;
```

### 选择器配置
| 元素 | 选择器 |
|------|--------|
| 消息块 | `[class*="message-block-container"]` |
| 用户标识 | `[class*="bg-s-color-bg-trans"]` |
| 内容容器 | `[class*="container-"]` |

---

## 2026-02-26 软件架构设计

**摘要：** Chrome扩展Manifest V3架构

**正文：**

### 架构图
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

### 模块职责
| 模块 | 职责 |
|------|------|
| Content Script | 页面DOM监听、消息提取 |
| Background | 生命周期管理、图标状态 |
| Popup | 用户界面、会话管理 |
| Storage | IndexedDB封装、CRUD |
| Extractor | 平台特定选择器、DOM解析 |
| Formatter | 格式化输出、剪贴板操作 |

### 数据流
```
AI平台页面 → Content Script → Extractor → Storage → Popup显示 → 复制注入
```

---

## 2026-02-26 产品功能设计

**摘要：** MVP功能定义与数据模型

**正文：**

### 核心功能
1. **自动捕获**：访问豆包/元宝/Claude时自动记录对话
2. **Session管理**：按平台分组、编辑标题、删除会话
3. **上下文注入**：选择历史会话，格式化复制到剪贴板
4. **数据导出**：JSON格式备份

### 数据模型
```typescript
interface Session {
  id: string;              // 唯一标识
  platform: Platform;      // 平台类型
  title: string;           // 会话标题（可编辑）
  sourceUrl: string;       // 来源链接
  createdAt: number;       // 创建时间
  updatedAt: number;       // 更新时间
  messages: Message[];     // 消息列表
  messageCount: number;    // 消息数量
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
```

### 注入格式模板
```markdown
【上下文引用】
以下是我之前在{平台名}的对话记录：

---
会话: {标题}
日期: {YYYY-MM-DD}

[用户] {内容}
[{平台}] {回复}
...
---

基于以上背景，请帮我继续...
```

---
