# OmniContext Native Host

Native Messaging Host 用于连接 Chrome 扩展和本地 HTTP 服务器。

## 架构说明

```
Chrome 扩展 <--(Native Messaging)--> native_host.py <--(HTTP)--> FastAPI 服务器
                                              |
                                              v
                                          SQLite
```

## 安装步骤

### 1. 获取扩展 ID

1. 打开 Chrome，访问 `chrome://extensions/`
2. 启用"开发者模式"
3. 加载 OmniContext 扩展
4. 复制扩展 ID（类似 `abcdefghijklmnopqrstuvwxyz123456`）

### 2. 运行安装脚本

```bash
cd native
python install.py --extension-id=你的扩展ID
```

### Linux

安装脚本会自动将 manifest 文件复制到：
- `~/.config/google-chrome/NativeMessagingHosts/com.omnicontext.host.json`
- `~/.config/chromium/NativeMessagingHosts/com.omnicontext.host.json`

### macOS

manifest 文件会被复制到：
- `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.omnicontext.host.json`

### Windows

需要手动添加注册表项：

1. 运行安装脚本会生成 `com.omnicontext.host.json` 文件
2. 打开注册表编辑器 (`regedit`)
3. 创建或导航到：
   ```
   HKCU\Software\Google\Chrome\NativeMessagingHosts\com.omnicontext.host
   ```
4. 将默认值设置为生成的 manifest 文件完整路径

### 3. 启动本地服务器

```bash
cd ../server
python main.py
```

服务器将在 `http://127.0.0.1:8765` 启动。

### 4. 重启 Chrome

完全关闭并重新打开 Chrome 浏览器。

## 验证安装

1. 打开 OmniContext 扩展的 Popup
2. 查看标题栏右侧的状态指示器：
   - 🟢 **实心绿点**：服务器已连接
   - 🟡 **半圆黄点**：Native Host 正常，服务器未运行
   - ⚪ **空心圆点**：Native Host 未安装或未连接

## 消息协议

Native Host 通过 stdin/stdout 与 Chrome 扩展通信，使用标准 Native Messaging 协议：

### 请求格式

```json
{
  "action": "get_sessions",
  "source": "platform",
  "platform": "doubao",
  "limit": 100
}
```

### 支持的操作

| Action | 说明 | 参数 |
|--------|------|------|
| `ping` | 健康检查 | - |
| `health_check` | 检查服务器状态 | - |
| `save_session` | 保存会话 | `session` |
| `get_sessions` | 获取会话列表 | `source`, `platform`, `limit`, `offset` |
| `get_session` | 获取单个会话 | `session_id` |
| `search_sessions` | 搜索会话 | `query`, `limit` |
| `delete_session` | 删除会话 | `session_id` |
| `write_memory` | 写入记忆 | `content`, `metadata` |
| `search_memories` | 搜索记忆 | `query`, `limit` |
| `get_stats` | 获取统计 | - |

## 故障排除

### Native Host 未连接

1. 确认 manifest 文件路径正确
2. 检查 manifest 中的 `path` 是否指向正确的 `native_host.py`
3. 确认 Python 3 已安装并在 PATH 中
4. 查看 Chrome 扩展的错误日志（`chrome://extensions/` -> 开发者模式 -> 查看 background 页面）

### 服务器未运行

1. 确认已运行 `python main.py`
2. 检查端口 8765 是否被占用
3. 测试 API：`curl http://127.0.0.1:8765/health`

### 权限问题

在 Linux/macOS 上，确保 `native_host.py` 有执行权限：

```bash
chmod +x native_host.py
```
