# OmniContext Server

本地服务，提供 HTTP API 和 Native Messaging 支持。

## 安装

```bash
cd server
pip install -r requirements.txt
```

## 运行

```bash
python main.py
```

服务将在 `http://localhost:8765` 启动。

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/sessions | 获取会话列表 |
| GET | /api/sessions/{id} | 获取单个会话 |
| POST | /api/sessions | 创建会话 |
| POST | /api/sessions/{id}/messages | 追加消息 |
| DELETE | /api/sessions/{id} | 删除会话 |
| POST | /api/memories | 写入记忆 |
| GET | /api/memories/search | 搜索记忆 |
