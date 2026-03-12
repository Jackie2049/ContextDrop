#!/usr/bin/env python3
"""
OmniContext Server 测试脚本

测试 HTTP API 功能
"""
import sys
import time
import threading
import subprocess
import json
import urllib.parse

# 在后台启动服务器
def start_server():
    import uvicorn
    from main import app
    uvicorn.run(app, host="127.0.0.1", port=8766, log_level="error")

if __name__ == "__main__":
    # 启动服务器
    print("🚀 启动服务器...")
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(2)  # 等待服务器启动

    # 测试 API
    import urllib.request
    base_url = "http://127.0.0.1:8766"

    def api_call(method, path, data=None):
        # 对 URL 中的查询参数进行编码
        url = base_url + path
        # 处理 URL 编码
        if '?' in url:
            base, query = url.split('?', 1)
            # 解析并重新编码查询参数
            params = urllib.parse.parse_qs(query)
            encoded_query = urllib.parse.urlencode(params, doseq=True)
            url = f"{base}?{encoded_query}"

        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode() if data else None,
            headers={"Content-Type": "application/json"},
            method=method
        )
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())

    print("\n=== 测试 Health Check ===")
    result = api_call("GET", "/health")
    print(f"Health: {result}")
    assert result["status"] == "ok"

    print("\n=== 测试创建会话 ===")
    result = api_call("POST", "/api/sessions", {
        "title": "测试会话",
        "messages": [
            {"role": "user", "content": "你好"},
            {"role": "assistant", "content": "你好！有什么可以帮助你的？"}
        ],
        "metadata": {"test": True}
    })
    print(f"Created session: {result['id']}")
    session_id = result["id"]

    print("\n=== 测试获取会话 ===")
    result = api_call("GET", f"/api/sessions/{session_id}")
    print(f"Session title: {result['title']}")
    print(f"Messages: {len(result['messages'])}")

    print("\n=== 测试追加消息 ===")
    result = api_call("POST", f"/api/sessions/{session_id}/messages", {
        "messages": [
            {"role": "user", "content": "再追加一条"}
        ]
    })
    print(f"Messages after append: {len(result['messages'])}")

    print("\n=== 测试搜索会话 ===")
    result = api_call("GET", "/api/sessions/search?q=你好")
    print(f"Search results: {len(result['results'])}")

    print("\n=== 测试写入记忆 ===")
    result = api_call("POST", "/api/memories", {
        "content": "用户偏好使用 Python 进行数据分析",
        "metadata": {"type": "preference"}
    })
    print(f"Created memory: {result['id']}")

    print("\n=== 测试搜索记忆 ===")
    result = api_call("GET", "/api/memories/search?q=Python")
    print(f"Memory search results: {len(result['memories'])}")

    print("\n=== 测试统计 ===")
    result = api_call("GET", "/api/stats")
    print(f"Stats: {json.dumps(result, indent=2)}")

    print("\n=== 测试删除 ===")
    result = api_call("DELETE", f"/api/sessions/{session_id}")
    print(f"Delete session: {result}")

    print("\n✅ 所有测试通过！")
