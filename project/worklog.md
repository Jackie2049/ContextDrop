# ContextDrop 项目日志

> 倒排式记录，最新记录在最上方。只增不减。

---

## 2026-03-24 底部按钮UI重构与自动捕获按钮样式优化

**摘要：** 重构底部按钮布局，新增设置弹出菜单，优化自动捕获按钮关闭状态样式

**正文：**

### 实现内容

#### 1. 底部按钮重构
- 原有4个按钮：管理、导出、导入、刷新
- 重构为3个等宽按钮：**设置**、**管理**、**刷新**
- 导出/导入功能移至设置弹出菜单

#### 2. 设置弹出菜单
- 点击「设置」按钮向上弹出菜单
- 菜单项：
  - 📤 记忆导出到文件
  - 📥 从文件导入记忆
- 菜单宽度自适应内容，不换行
- 点击页面其他位置自动关闭菜单

#### 3. 自动捕获按钮样式优化
- 关闭状态使用灰色背景（#d8d8d8），与背景区分
- 开启状态使用古铜色（--accent-copper）
- hover状态不再变色（保持一致性）

### 修改的文件
- `src/popup/index.html` - 重构footer按钮结构，添加设置菜单HTML
- `src/popup/index.ts` - 添加菜单DOM引用和事件处理逻辑
- `src/popup/style.css` - 添加设置菜单样式，修改按钮等宽布局，修改自动捕获按钮样式

### 技术细节
- 使用 `flex: 1 1 calc((100% - 16px) / 3)` 实现三按钮等宽
- 菜单使用 `white-space: nowrap` 自适应宽度
- 点击外部关闭菜单：document click 事件 + contains 检查

**状态：** ✅ 已完成

---

## 2026-03-22 修复 Side Panel 无法弹出问题

**摘要：** 修复 macOS Chrome 上 Side Panel 无法弹出的构建配置问题

**正文：**

### 问题
在 macOS Chrome 浏览器加载扩展后，Side Panel 无法弹出。

### 根因分析
`vite.config.ts` 缺少 `base: './'` 配置，导致构建后的 HTML 文件中资源路径为绝对路径 `/assets/...`，Chrome 扩展无法加载这些资源。

### 修复
在 `vite.config.ts` 中添加 `base: './'`，构建后资源路径变为相对路径 `../../assets/...`。

### 修改的文件
- `vite.config.ts` - 添加 `base: './'` 配置

**状态：** ✅ 已完成

---

## 2026-03-21 UI 改进：图标更新、布局优化、助手卡片始终显示

**摘要：** 移除顶部标题栏，统一卡片间距，更新扩展图标，助手卡片始终显示

**正文：**

### 实现内容

#### 1. 移除顶部标题栏
- 移除 `🧠 ContextDrop` 标题（使用 Chrome 扩展默认顶栏）
- 简化界面，减少冗余

#### 2. 统一卡片间距
- 所有卡片（助手卡片、搜索框、会话列表）统一使用 12px 间距
- 卡片内边距、卡片间距保持一致

#### 3. 更新扩展图标
- 使用粉色大脑图标替代默认拼图图标
- 创建 PNG 格式图标（16/32/48/128）
- Chrome 扩展图标必须是 PNG 格式（SVG 不支持）

#### 4. 助手卡片始终显示
- 卡片不再隐藏，始终可见
- 未检测到AI助手时显示问号图标（unknown.svg）
- 平台名称显示"未检测到AI助手"
- 状态显示"请打开支持的AI平台"
- `init()` 时立即调用 `updateCurrentAssistantCard(null, false)` 显示默认状态

### 修改的文件
- `manifest.json` - 更新图标引用为 PNG，添加 unknown.svg 到 web_accessible_resources
- `src/popup/index.html` - 移除标题栏，移除助手卡片的 display:none
- `src/popup/index.ts` - 助手卡片始终显示逻辑
- `src/popup/style.css` - 统一 12px 间距
- `icons/brain.svg` - 粉色大脑 SVG 图标
- `icons/icon-*.png` - PNG 图标文件
- `icons/unknown.svg` - 问号图标

**状态：** ✅ 已完成

---

## 2026-03-21 首次使用引导对话框 + 按钮布局优化

**摘要：** 实现首次使用引导对话框，优化按钮布局和样式

**正文：**

### 实现内容

#### 1. 首次使用引导对话框（Onboarding Dialog）
- 新用户首次打开扩展时显示引导对话框
- 三步骤引导：
  1. 打开AI平台 - 访问豆包、ChatGPT等
  2. 开启自动捕获 - 点击「自动捕获」按钮，持续捕获AI记忆
  3. 批量捕获会话 - 点击「批量捕获」按钮，扫描全部历史对话，无缝迁移AI记忆
- 「不再提示」复选框，勾选后不再显示引导
- 引导状态存储在 `chrome.storage.local` 的 `onboarding_completed` 字段

#### 2. 按钮布局优化
- 自动捕获按钮移至左侧，批量捕获按钮移至右侧
- 自动捕获使用 secondary 样式（active 时显示 copper 色）
- 批量捕获使用 primary 样式（黑色）

### 修改的文件
- `src/popup/index.html` - 添加 onboarding dialog HTML，调整按钮顺序和样式
- `src/popup/index.ts` - 添加 onboarding 逻辑（DOM 引用、事件绑定、检查函数）
- `src/popup/style.css` - 添加 onboarding 对话框样式

### 技术细节
- `checkAndShowOnboarding()` - 检查是否需要显示引导（无会话且未标记完成）
- `showOnboardingDialog()` / `closeOnboardingDialog()` - 显示/隐藏引导对话框
- 引导完成后如勾选「不再提示」，写入 `onboarding_completed: true`

**状态：** ✅ 已完成

---

## 2026-03-19 Side Panel 标题栏图标（尝试中）

**摘要：** 尝试让 Chrome Side Panel 顶部标题栏显示自定义图标和名称

**正文：**

### 目标
让 Side Panel 顶部标题栏显示 `🧠 ContextDrop` 和自定义图标，类似豆包插件的效果。

### 已尝试的方案

#### 1. 修改 manifest.json 的 name 字段
```json
{
  "name": "🧠 ContextDrop"
}
```
**结果：** ❌ 标题栏仍显示默认图标

#### 2. 添加 side_panel.default_icon 配置
```json
{
  "side_panel": {
    "default_path": "src/popup/index.html",
    "default_icon": {
      "16": "icons/icon.svg",
      "48": "icons/icon.svg",
      "128": "icons/icon.svg",
      "256": "icons/icon.svg"
    }
  }
}
```
**结果：** ❌ 标题栏仍显示默认图标

#### 3. 添加 256px 图标尺寸
在 `icons` 和 `action.default_icon` 中添加 256px 尺寸支持。

**结果：** ❌ 标题栏仍显示默认图标

### 技术分析

Chrome Side Panel 的标题栏由 Chrome 浏览器控制，扩展开发者无法完全自定义。可能的原因：

1. **Chrome 版本差异**：不同版本的 Chrome 对 Side Panel 标题栏的渲染方式不同
2. **SVG 图标限制**：Chrome 可能不支持 SVG 格式的 Side Panel 图标，需要 PNG
3. **缓存问题**：Chrome 可能缓存了扩展图标，需要完全卸载重装
4. **API 限制**：Chrome Side Panel API 可能不支持完全自定义标题栏图标

### 下一步尝试方向

1. 将 SVG 图标转换为 PNG 格式（16x16, 48x48, 128x128, 256x256）
2. 完全卸载扩展后重新安装
3. 检查 Chrome 版本是否支持 Side Panel 图标自定义
4. 研究豆包插件的 manifest 配置

### 修改的文件
- `manifest.json` - 添加 🧠 emoji 到名称，添加 side_panel.default_icon
- `src/utils/extractor.ts` - 修复构建错误（类型问题）

**状态：** 🔴 未解决，需要进一步研究

---

## 2026-03-18 ChatGPT显示名称修复（第三轮 - 数据规范化）

**摘要：** 修复会话列表中ChatGPT会话仍然分组在 "CHATGPT" 下的问题

**正文：**

### 问题
前两轮修复只解决了**显示**问题，但没有解决**分组**问题：
- 历史数据 platform = 'CHATGPT'（全大写）
- 新数据 platform = 'chatgpt'（全小写）
- JavaScript 分组时视为不同键，导致分成两个组

### 修复方案
在数据加载时统一规范化 platform 值为小写。

**修改文件 1：`src/popup/index.ts`**
在 `loadSessions()` 函数中，所有数据加载完成后添加：
```typescript
// 规范化 platform 值（统一转为小写，解决历史数据大小写不一致问题）
sessions = sessions.map(s => ({
  ...s,
  platform: (s.platform?.toLowerCase() as Platform) || 'unknown'
}));
```

**修改文件 2：`src/content/index.ts`**
保存会话时确保 platform 值为小写：
```typescript
platform: currentPlatform?.toLowerCase() as Platform,
```

### 结果
- 所有 ChatGPT 会话统一显示在一个 "ChatGPT" 分组下
- 新保存的数据自动使用小写的 platform 值

---

## 2026-03-17 ChatGPT显示名称修复（完整版）

**摘要：** 修复会话列表中ChatGPT平台显示为CHATGPT的问题

**正文：**

### 问题
- 会话列表中ChatGPT平台显示为全大写 "CHATGPT" 而非 "ChatGPT"
- 根本原因是历史数据中平台值存储为大写 'CHATGPT'

### 第一轮修复
- 修改 `src/utils/extractor.ts` 中的 `formatPlatformName` 函数：
  - 支持字符串类型输入（兼容大小写混用）
  - 使用 `toLowerCase()` 规范化平台值
  - 添加默认值回退

### 第二轮修复（关键）
发现 `src/popup/index.ts` 中有多处直接内联平台名称映射，未使用 `formatPlatformName`：

1. **第1155-1164行** - 批量捕获状态检查
2. **第1172-1178行** - 全局锁检查提示
3. **第1299-1308行** - 批量扫描平台名称显示

**修改内容：**
- 将内联的 `platformNames[platform] || platform` 改为统一调用 `formatPlatformName(platform)`
- 确保所有显示平台名称的地方都经过大小写规范化处理

### 结果
- 无论数据存储的是 'CHATGPT'、'chatgpt' 还是 'ChatGPT'，显示均为 "ChatGPT"

---

## 2026-03-17 UI风格优化：iOS中浮雕风格

**摘要：** 将UI从Material Design风格优化为中浮雕iOS风格，仅修改CSS，保持DOM结构不变

**正文：**

### 设计系统更新

#### 色彩系统
- `--canvas-bg: #f3f3f5` - 柔和灰背景
- `--surface-bg: #ffffff` - 卡片纯白表面
- `--text-primary: #1c1c1e` - 近黑色主文字
- `--text-secondary: #8e8e93` - 中灰次要文字
- `--accent-copper: #c87a38` - 古铜色强调

#### 圆角系统
- `--radius-card: 16px` - 卡片圆角
- `--radius-pill: 999px` - 药丸按钮
- `--radius-inner: 10px` - 内部元素

#### 阴影系统
- `--shadow-base: 0 10px 30px -8px rgba(0,0,0,0.12)` - 基础阴影
- `--shadow-hover: 0 16px 40px -10px rgba(0,0,0,0.15)` - 悬停阴影
- `--shadow-float: 0 24px 48px -12px rgba(0,0,0,0.2)` - 悬浮阴影

### 关键样式变更

#### Header
- 移除紫色渐变背景
- 改为透明背景 + 深色文字

#### 搜索栏
- 药丸形状（pill）圆角
- 添加精致阴影

#### 会话卡片
- 圆角16px
- 添加iOS风格阴影
- 悬停时阴影增强

#### 按钮
- 全部改为药丸形状
- 主按钮：深色背景
- 次按钮：白色+阴影

#### 标签
- 毛玻璃效果（backdrop-filter blur）
- 深色半透明背景

#### 对话框
- 更大圆角（16px）
- 更强悬浮阴影
- 背景添加模糊效果

### 文件变更
- **仅修改**: `src/popup/style.css`
- **未修改**: `src/popup/index.html`（DOM结构完全保持）

### 验证结果
- 构建成功
- 已部署到 product 目录

---

## 2026-03-16 豆包自动捕获问题修复

**摘要：** 修复豆包平台自动捕获失效问题，增强DOM选择器健壮性

**正文：**

### 问题诊断
1. **现象**：豆包平台会话自动捕获无法正常工作
2. **根因**：豆包页面DOM结构更新，原有选择器失效
   - `bg-s-color-bg-trans` 类名可能已变更
   - 消息容器选择器不够全面

### 修复内容

#### 1. 增强调试功能 (`src/content/index.ts`)
- 启用自动调试日志（页面加载3秒后自动执行）
- 扩展 `debugDoubaoPage()` 函数：
  - 12种消息容器选择器检测
  - 5种用户消息标识检测
  - 页面主结构分析（main元素、滚动容器）
  - 自动HTML结构dump（当未找到消息块时）

#### 2. 改进消息块查找 (`src/utils/extractor.ts`)
- 扩展 `findDoubaoMessageBlocks()` 方法：
  - 新增方法4：搜索 conversation/chat content 容器
  - 改进方法5：更多消息类名模式匹配
  - 支持 `data-index` 属性选择器（虚拟列表常见）

#### 3. 优化用户消息检测
- 新增布局特征检测（flex对齐方式）
- 扩展用户标识检查：
  - `[data-role="user"]`
  - `[class*="user-message"]`
  - `[class*="message-user"]`
  - `[class*="chat-user"]`
  - `justify-content: flex-end`
- 新增助手标识：`[data-role="assistant"]`
- 改进评分系统：模糊情况使用评分比较而非硬判断

#### 4. 增强内容提取
- 扩展内容选择器至6种模式：
  - `[class*="container-"]`
  - `[class*="message-content"]`
  - `[class*="content"]`
  - `[class*="text"]`
  - `[class*="message-body"]`
  - `[class*="bubble"]`
- 迭代选择器匹配策略（首个匹配即使用）

### 技术要点
- **多选择器策略**：从具体到通用，逐级回退
- **评分系统**：用户特征 vs 助手特征评分，处理模糊情况
- **自动调试**：页面加载自动输出诊断信息，便于远程排查
- **布局检测**：利用CSS计算属性（getComputedStyle）辅助判断

### 文件修改
- `src/content/index.ts` - 启用自动调试，增强debug函数
- `src/utils/extractor.ts` - 改进提取逻辑和回退机制

---

## 开发规范

### 构建部署流程

**重要习惯：** 每完成一次迭代（阶段性开发完成，确保无 bug，非中间阶段），必须运行 `deploy.sh` 构建产物：

```bash
cd ~/cc-workspace/ContextDrop && ./deploy.sh
```

这样用户可以立即拿到可用的扩展进行测试。

**流程：**
1. 开发代码
2. `npm test` 测试通过（确保无 bug）
3. `./deploy.sh` 构建部署
4. 产物输出到 Windows 桌面：`C:\Users\73523\Desktop\ContextDrop`

**注意：** 只在完整迭代完成后执行，中间开发阶段不需要。

---

## 2026-03-10 Gemini 平台支持开发

**摘要：** 为 ContextDrop 添加 Gemini (gemini.google.com) 平台的会话捕获支持

**正文：**

### 实现功能
1. **单次会话捕获** - 自动检测并捕获当前 Gemini 对话
2. **批量会话捕获** - 支持一键捕获 Gemini 所有历史会话

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/types/index.ts` | Platform 类型添加 'gemini' |
| `manifest.json` | 添加 gemini.google.com 权限 |
| `src/utils/extractor.ts` | Gemini 配置、消息提取方法 |
| `src/content/index.ts` | Gemini sidebar 检测 |
| `src/content/batch-capture.ts` | Gemini 批量捕获方法 |
| `src/popup/index.ts` | Gemini 图标、平台名称 |
| `src/popup/index.html` | 过滤器添加 Gemini 选项 |
| `icons/platforms/gemini.svg` | Gemini 图标 |

### 技术细节

#### URL 结构
```
gemini.google.com/app/{sessionId}
```

#### 消息选择器
```typescript
// 用户消息
'[class*="user-query-container"]'
'[class*="user-query"]'
'[data-test-id="user-query"]'

// AI 回复
'[class*="response-container"]'
'[class*="model-response"]'
'[data-test-id="model-response"]'
```

#### 批量捕获流程
1. 滚动侧边栏加载所有会话
2. 扫描并发现会话列表
3. 用户选择要捕获的会话
4. 逐个点击会话链接
5. 滚动加载历史消息
6. 提取并保存会话

### 注意事项
- 不修改任何现有平台的代码（豆包、元宝等）
- 只添加新的 Gemini 相关功能
- 保持与其他平台一致的实现模式

---

## 2026-03-05 API 读写功能架构设计

**摘要：** 完成 API 读写功能的架构设计讨论，确定技术方案

**正文：**

### 背景
当前 ContextDrop 只能通过网页捕获主流 AI 助手的对话。本功能新增 **API 读写能力**，让用户程序和 Agent 也能读写 memory，使 ContextDrop 成为连接 AI 助手和用户程序/Agent 的上下文管理中心。

### 交互对象分类

| 交互对象 | 渠道 | 读 | 写 |
|---------|------|----|----|
| AI 助手网页 | 网页捕获(Content Script) | ❌ | ✅ |
| 用户 | Popup UI | ✅ | ✅ (标签/删除) |
| 用户程序/Agent | **API (新增)** | ✅ | ✅ |

### 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    ContextDrop 本地服务                          │
│                                                                  │
│   ┌──────────────┐                                              │
│   │ Native Host  │ ←── Native Messaging ──→ Chrome 扩展          │
│   │ (stdio)      │                    (网页捕获/Popup)           │
│   └──────┬───────┘                                              │
│          │                                                       │
│   ┌──────▼───────┐     ┌──────────────┐                         │
│   │ 数据存储      │ ←── │ Memory API   │                         │
│   │ (SQLite)     │     │ (读写逻辑)    │                         │
│   └──────────────┘     └──────┬───────┘                         │
│                               │                                  │
│                        ┌──────▼───────┐                         │
│                        │ HTTP Server  │                         │
│                        │ :8765        │                         │
│                        └──────┬───────┘                         │
└───────────────────────────────│─────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
        ┌─────▼─────┐     ┌─────▼─────┐    ┌──────▼──────┐
        │ Python SDK │     │ HTTP 调用  │    │ 其他语言 SDK │
        │(封装API)   │     │(直接调用)  │    │(未来扩展)   │
        └───────────┘     └───────────┘    └─────────────┘
```

### 数据模型设计

新增 `source` 字段区分数据来源：

```typescript
interface Session {
  id: string;
  source: 'platform' | 'api';    // 来源类型
  platform?: 'doubao' | 'yuanbao' | 'claude' | 'deepseek' | 'kimi';  // 仅 source=platform 时
  title: string;
  messages: Message[];
  metadata?: Record<string, any>; // API 写入可自定义扩展字段
  createdAt: number;
  updatedAt: number;
}
```

- `source: 'platform'` - 来自 AI 助手网页捕获，此时 `platform` 字段必填
- `source: 'api'` - 来自 API 写入，`platform` 字段为空，可用 `metadata` 存储自定义信息

### 技术选型

| 组件 | 技术选型 | 备注 |
|------|---------|------|
| 本地服务 | Python FastAPI | 先用 Python 快速实现 |
| 本地服务（未来）| Rust (Axum) | 后续重构，提升安全性和性能 |
| 数据存储 | SQLite | 单文件，查询灵活，Python 内置支持 |
| Python SDK | Python 3.8+ | 封装 HTTP API |
| Chrome 扩展通信 | Native Messaging | Chrome 官方标准方案 |

### 数据流

| 场景 | 路径 |
|------|------|
| 网页捕获写入 | AI 网页 → 扩展 → Native Messaging → 本地服务 → SQLite |
| SDK/API 写入 | Agent → Python SDK / HTTP → 本地服务 → SQLite |
| 读取 | 扩展/SDK → HTTP API / Native Messaging → 本地服务 → SQLite |

### 方案对比与决策

**API 暴露方式：**
- ❌ 文件接口 - 轮询延迟高，存在数据竞争
- ✅ 本地服务 + Native Messaging - 实时性好，无并发问题

**数据访问方式：**
- ❌ SDK 直接访问存储 - 并发时存在数据竞争
- ✅ 所有访问统一走 HTTP API - 服务内部控制并发

### 待实现

1. **Phase 1: 本地服务基础**
   - 创建 Python 项目结构
   - 实现 SQLite 存储层
   - 实现 HTTP API (FastAPI)
   - 实现 Native Messaging Host

2. **Phase 2: Chrome 扩展集成**
   - 添加 Native Messaging 配置
   - 扩展数据同步到本地服务
   - Popup 可选读取本地服务数据

3. **Phase 3: Python SDK**
   - 实现 SDK 核心功能
   - 编写文档和示例
   - 发布到 PyPI
=======
## 2026-03-16 豆包自动捕获问题修复

**摘要：** 修复豆包平台自动捕获失效问题，增强DOM选择器健壮性

**正文：**

### 问题诊断
1. **现象**：豆包平台会话自动捕获无法正常工作
2. **根因**：豆包页面DOM结构更新，原有选择器失效
   - `bg-s-color-bg-trans` 类名可能已变更
   - 消息容器选择器不够全面

### 修复内容

#### 1. 增强调试功能 (`src/content/index.ts`)
- 启用自动调试日志（页面加载3秒后自动执行）
- 扩展 `debugDoubaoPage()` 函数：
  - 12种消息容器选择器检测
  - 5种用户消息标识检测
  - 页面主结构分析（main元素、滚动容器）
  - 自动HTML结构dump（当未找到消息块时）

#### 2. 改进消息块查找 (`src/utils/extractor.ts`)
- 扩展 `findDoubaoMessageBlocks()` 方法：
  - 新增方法4：搜索 conversation/chat content 容器
  - 改进方法5：更多消息类名模式匹配
  - 支持 `data-index` 属性选择器（虚拟列表常见）

#### 3. 优化用户消息检测
- 新增布局特征检测（flex对齐方式）
- 扩展用户标识检查：
  - `[data-role="user"]`
  - `[class*="user-message"]`
  - `[class*="message-user"]`
  - `[class*="chat-user"]`
  - `justify-content: flex-end`
- 新增助手标识：`[data-role="assistant"]`
- 改进评分系统：模糊情况使用评分比较而非硬判断

#### 4. 增强内容提取
- 扩展内容选择器至6种模式：
  - `[class*="container-"]`
  - `[class*="message-content"]`
  - `[class*="content"]`
  - `[class*="text"]`
  - `[class*="message-body"]`
  - `[class*="bubble"]`
- 迭代选择器匹配策略（首个匹配即使用）

### 技术要点
- **多选择器策略**：从具体到通用，逐级回退
- **评分系统**：用户特征 vs 助手特征评分，处理模糊情况
- **自动调试**：页面加载自动输出诊断信息，便于远程排查
- **布局检测**：利用CSS计算属性（getComputedStyle）辅助判断

### 文件修改
- `src/content/index.ts` - 启用自动调试，增强debug函数
- `src/utils/extractor.ts` - 改进提取逻辑和回退机制

---

## 2026-03-05 Kimi 平台适配

**摘要：** 完成 Kimi (kimi.com) 平台适配，支持消息捕获和批量捕获功能

**正文：**

### 平台基础适配
1. **manifest.json 配置**
   - 添加 `https://www.kimi.com/*` 到 host_permissions
   - 添加到 content_scripts matches
   - 创建 kimi.svg 图标

2. **类型定义更新**
   - Platform 类型添加 'kimi'
   - formatPlatformName 映射
   - 各模块平台判断逻辑

### 消息提取实现
1. **选择器适配**
   - Kimi 使用语义化 CSS 类名（与 DeepSeek 的 CSS Modules 不同）
   - 用户消息：`.chat-content-item-user`, `.segment-user`
   - 助手消息：`.chat-content-item-assistant`, `.segment-assistant`
   - 消息容器：`.chat-content-list`, `.message-list`

2. **extractKimiMessages() 方法**
   ```
   查找 chat-content-item 元素 → 判断角色 → 提取文本内容
   ```

3. **标题提取**
   - 选择器：`.chat-name`, `[class*="chat-title"]`, `title`
   - URL 格式：`/chat/{sessionId}`

### 批量捕获实现
1. **会话列表检测**
   - 选择器：`.chat-info-item a[href*="/chat/"]`
   - 侧边栏：`.sidebar` 元素

2. **会话 ID 提取**
   - URL 格式：`/chat/{sessionId}`
   - 从链接 href 属性提取

3. **导航策略**
   - 点击会话链接触发路由变化
   - `waitForSessionLoad` 等待消息加载

### 文件修改清单
- `manifest.json` - 添加 Kimi 权限
- `src/types/index.ts` - Platform 类型
- `src/utils/extractor.ts` - Kimi 配置和提取方法
- `src/content/batch-capture.ts` - 批量捕获支持
- `src/content/index.ts` - 侧边栏检测
- `src/popup/index.ts` - 平台名称映射
- `icons/platforms/kimi.svg` - 平台图标

### 技术要点
- **语义化类名**：Kimi 使用清晰的语义化 CSS 类名，易于选择
- **URL 路由**：`/chat/{sessionId}` 格式
- **思考模式**：暂未实现，待后续验证

---

## 2026-03-05 DeepSeek 平台适配

**摘要：** 完成 DeepSeek 平台完整适配，包括消息提取、批量捕获和思考内容过滤

**正文：**

### 平台基础适配
1. **manifest.json 配置**
   - 添加 `https://chat.deepseek.com/*` 到 host_permissions
   - 添加到 content_scripts matches
   - 创建 deepseek.svg 图标

2. **类型定义更新**
   - Platform 类型添加 'deepseek'
   - formatPlatformName 映射
   - 各模块平台判断逻辑

### 消息提取实现
1. **选择器适配**
   - DeepSeek 使用 CSS Modules（哈希类名如 `_63c77b1`）
   - 稳定类名：`ds-message`（所有消息）、`ds-think-content`（思考内容）
   - 用户消息特征：类名包含 `d29f3d7d`

2. **extractDeepseekMessages() 方法**
   ```
   查找 ds-message 元素 → 检测 ds-think-content → 判断角色 → 提取内容
   ```

3. **思考内容处理**
   - 与豆包/元宝保持一致：只捕获最终回答，不包含思考过程
   - 克隆 DOM → 移除思考区块 → 返回正文

### 批量捕获实现
1. **会话列表检测**
   - 选择器：`._546d736` 类名 + `a[href*="/chat/s/"]` 链接
   - 可见性检查：`getBoundingClientRect()` 确保在视口内

2. **会话 ID 提取**
   - URL 格式：`/a/chat/s/{sessionId}`
   - 正则匹配：`/\/s\/([a-zA-Z0-9_-]+)/`

3. **导航策略**
   - 问题：`window.location.href` 导致页面重载，JS 状态丢失
   - 方案：点击会话链接，每次捕获前重新获取会话元素
   - 代码：`captureDeepseekSessions()` 专用方法

4. **滚动加载历史**
   - `deepseekScrollToLoadHistory()` 方法
   - 查找 `[class*="ds-scroll-area"]` 容器
   - 滚动到顶部加载更多消息

### Bug 修复

#### Bug 1: SVG className 类型错误
**错误信息：**
```
TypeError: (o.className || "").toLowerCase is not a function
at extractDeepseekAssistantContent
```

**原因分析：**
- DeepSeek 页面包含 SVG 图标元素
- SVG 元素的 `className` 属性类型是 `SVGAnimatedString`，不是字符串
- 直接调用 `.toLowerCase()` 会失败

**解决方案：**
```typescript
// 安全获取 className - 处理 SVG 元素的 SVGAnimatedString
let className = '';
try {
  className = (typeof el.className === 'string'
    ? el.className
    : (el.className as any)?.baseVal || '') || '';
} catch {
  className = '';
}
const classNameLower = className.toLowerCase();
```

#### Bug 2: 批量捕获只捕获1个会话
**原因：** 使用 `window.location.href` 导航后页面重载，JS 状态丢失

**解决：** 改用点击会话链接方式，每次捕获前重新查询会话列表
```typescript
// 每次捕获前重新获取会话元素
const sessionElements = await this.getSessionListElements();
// 找到对应的会话元素并点击
(targetElement as HTMLElement).click();
```

#### Bug 3: 侧边栏检测总是失败
**原因：** 依赖特定的 CSS Module 哈希类名，可能变化

**解决：** 暂时总是返回 true，让用户能继续操作
```typescript
// 暂时总是返回 true，让用户能继续操作
sendResponse({ sidebarVisible: true });
```

### 技术要点
- **CSS Modules 应对**：使用 `[class*="xxx"]` 属性选择器匹配部分类名
- **SPA 导航**：点击触发路由变化而非页面重载
- **SVG 处理**：检查 className 类型，使用 baseVal 获取 SVG 类名
- **状态持久化**：存储会话 ID 列表而非 DOM 元素引用

---

## 2026-03-02 批量捕获完善与会话查看功能

**摘要：** 修复批量捕获多项Bug，新增会话查看功能，优化整体UI体验

**正文：**

### 批量捕获功能完善
1. **进度计数修复**
   - 问题：显示 21/3 而非 2/3
   - 原因：`captured` 变量累加所有历史捕获数
   - 解决：使用正确的 `current` 变量显示进度

2. **负数ETA修复**
   - 问题：ETA显示 -75秒
   - 解决：当 `remaining <= 0` 时返回 `undefined`

3. **重复捕获Bug修复**
   - 问题：同一session被多次捕获
   - 原因：使用 `session.id` 判重，但捕获过程中id尚未生成
   - 解决：改用 `preSessionId`（基于平台和标题生成的预ID）

4. **消息级进度显示**
   - 新增 `sessionMessagesTotal` 字段
   - 显示格式：`正在处理 会话标题 (566条消息)`

5. **Session选择对话框**
   - 替代全量自动捕获
   - 用户可勾选要捕获的会话
   - 支持全选/取消全选

### UI/UX优化
1. **Popup高度修复**
   - 问题：打开后只显示约1cm高度
   - 解决：`min-height: 520px` + flexbox单层滚动

2. **平台Logo图标**
   - 移动SVG到 `icons/platforms/` 目录
   - 使用 `chrome.runtime.getURL()` 加载
   - 配置 `web_accessible_resources`

3. **标签管理对话框**
   - 替换原有的 `prompt()` 交互
   - 支持勾选已有标签
   - 支持创建新标签

4. **删除模式优化**
   - 删除进度可视化
   - 全选/取消全选
   - 批量删除确认

### 会话查看功能
- 点击session-info区域打开对话查看对话框
- 消息气泡样式：用户蓝色边框，助手绿色边框
- 显示角色标签和发送时间
- 支持"复制全部"功能
- 搜索关键词高亮显示
- 悬停提示："点击查看完整对话"

### 技术改进
- `BatchCaptureProgress` 接口新增 `newSessions` 和 `updatedSessions`
- `captureCurrentSession` 返回 `{ session, isNew, isUpdated, oldCount }`
- CSS优化：cursor: pointer, hover背景色变化

### 提交记录
- 批量捕获进度修复
- Session查看对话框
- 平台Logo图标支持
- 标签管理对话框
- UI布局优化

---

## 2026-02-28 元宝与Claude思考模式支持

**摘要：** 完成元宝和Claude平台的思考模式开发，测试用例增至48个

**正文：**

### 元宝平台支持
- 新增 `extractYuanbaoMessages()` 专用提取方法
- 支持CSS Modules类名模式匹配
- 实现思考内容过滤逻辑
- 回退方案：`extractYuanbaoFromDocument()`

### Claude平台支持
- 更新选择器适配现代Claude.ai DOM结构
- 新增 `extractClaudeMessages()` 专用方法
- 支持 Extended Thinking 功能过滤
- 回退方案：`extractClaudeFromDocument()`

### 思考模式通用设计
```
消息提取 → 检测思考区块 → 克隆DOM → 移除思考内容 → 返回最终回答
```

### 测试覆盖
- 新增元宝测试用例：2个
- 新增Claude测试用例：2个
- 总测试用例：48个（全部通过）

### 提交记录
- `ec43865` fix: Update test to match Doubao CSS Module selectors
- `df3f452` fix: Update Yuanbao selectors to support CSS Modules
- `f73b99d` feat: Add thinking mode support for Yuanbao and Claude

**待测试：**
- [ ] 元宝实际对话捕获测试
- [ ] 元宝思考模式过滤验证
- [ ] Claude实际对话捕获测试
- [ ] Claude Extended Thinking过滤验证

---

## 2026-02-27 标签系统功能完成

**摘要：** 实现会话标签管理功能，支持分类和筛选

**正文：**
- TagStorage 模块：标签的增删改查，11个测试用例全部通过
- 标签-会话关联：支持多标签关联一个会话
- UI集成：会话卡片显示标签，支持添加/删除标签
- 交互方式：点击 🏷️ 按钮，通过 prompt 管理标签
- 标签样式：彩色标签 pill 样式，清晰可辨
- 默认蓝色标签，计划后续支持自定义颜色

**技术实现：**
- 数据模型：Tag {id, name, color, createdAt}
- 存储结构：tags 和 session_tags 两个 storage key
- 避免重复：同名标签不可创建，同一会话同一标签不可重复添加

**待优化：**
- [ ] 标签颜色选择器
- [ ] 按标签筛选会话
- [ ] 标签管理页面（创建/删除/重命名）

---

## 2026-02-27 项目初始化与命名规范

**摘要：** 完成项目重命名、GitHub仓库同步、AgenticEngineering文档体系建立

**正文：**
- 项目正式命名为 ContextDrop
- 完成代码库迁移至 `/home/zhaozifeng/cc-workspace/ContextDrop`
- 同步到 GitHub 仓库：https://github.com/2012zzhao/ContextDrop.git
- 主分支设为 `main`
- 建立项目管理文档体系（project/ 目录）
- 构建流程标准化：构建后自动复制到桌面供Chrome加载测试

---

## 2026-02-27 豆包平台适配完成

**摘要：** 解决豆包CSS Modules选择器问题，实现对话自动捕获

**正文：**
- 识别问题：豆包使用CSS Modules（类名如 `message-list-S2Fv2S`）
- 解决方案：使用属性选择器 `[class*="message-block-container"]`
- 通过 `bg-s-color-bg-trans` 类名区分用户/助手消息
- 豆包功能验证通过，可正常捕获和保存对话

---

## 2026-02-26 TDD开发完成核心功能

**摘要：** 采用测试驱动开发，完成35个测试用例并全部通过

**正文：**
- SessionStorage：IndexedDB存储，支持CRUD操作（9测试）
- MessageExtractor：平台检测、消息提取（18测试）
- Formatter：格式化输出、剪贴板复制（8测试）
- Content Script：自动捕获对话
- Popup UI：会话管理界面

---

## 2026-02-26 项目启动

**摘要：** Chrome扩展项目立项，支持豆包/元宝/Claude三平台

**正文：**
- 产品定位：跨平台AI对话上下文管理工具
- 核心功能：自动捕获 → 本地存储 → 按需注入
- 技术栈：Vite + TypeScript + CRXJS + Vitest
- 支持平台：豆包、元宝、Claude
- 数据模型：Session/Message/InjectionConfig

---
