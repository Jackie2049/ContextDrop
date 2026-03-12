#!/usr/bin/env python3
"""
OmniContext SDK 使用示例

运行前请确保本地服务器已启动:
    cd server
    python main.py
"""
import sys
import os

# 添加 SDK 到 path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from omnicontext import Client, OmniContextError


def main():
    # 创建客户端
    client = Client(host="127.0.0.1", port=8765)

    # 检查连接
    print("🔍 检查服务器连接...")
    if not client.is_connected():
        print("❌ 无法连接到 OmniContext 服务器")
        print("   请先启动服务器: cd server && python main.py")
        return

    print("✅ 已连接到 OmniContext 服务\n")

    # 获取统计信息
    print("📊 统计信息:")
    stats = client.get_stats()
    for key, value in stats.items():
        print(f"   {key}: {value}")
    print()

    # 获取会话列表
    print("📝 获取会话列表:")
    sessions = client.get_sessions(limit=5)
    print(f"   找到 {len(sessions)} 个会话")
    for s in sessions[:3]:
        platform = s.platform or "API"
        print(f"   - [{platform}] {s.title} ({len(s.messages)} 消息)")
    print()

    # 写入一个新的会话
    print("✍️  写入新会话:")
    new_session = client.write_session(
        title="SDK 测试会话",
        messages=[
            {"role": "user", "content": "你好，这是一个测试"},
            {"role": "assistant", "content": "你好！我是通过 SDK 写入的消息"}
        ],
        tags=["sdk-test"],
        metadata={"source": "example_script"}
    )
    print(f"   创建会话: {new_session.id}")
    print(f"   标题: {new_session.title}")
    print()

    # 追加消息
    print("📝 追加消息:")
    updated = client.append_messages(new_session.id, [
        {"role": "user", "content": "追加一条用户消息"},
        {"role": "assistant", "content": "收到追加的消息"}
    ])
    print(f"   消息数: {len(updated.messages)}")
    print()

    # 写入记忆
    print("🧠 写入记忆:")
    memory = client.write_memory(
        content="用户偏好使用 Python 进行数据分析",
        metadata={"type": "preference", "category": "coding"}
    )
    print(f"   创建记忆: {memory.id}")
    print(f"   内容: {memory.content[:50]}...")
    print()

    # 搜索记忆
    print("🔍 搜索记忆:")
    memories = client.search_memories("用户偏好", limit=3)
    print(f"   找到 {len(memories)} 条相关记忆")
    for m in memories:
        print(f"   - {m.content[:50]}...")
    print()

    # 清理测试数据
    print("🧹 清理测试数据:")
    client.delete_session(new_session.id)
    client.delete_memory(memory.id)
    print("   已删除测试会话和记忆\n")

    print("✅ 示例运行完成!")


if __name__ == "__main__":
    main()
