"""
OmniContext SDK 单元测试

这些测试不需要实际服务器运行，使用 mock 进行测试
"""
import pytest
from unittest.mock import patch, Mock, MagicMock
import json
import sys
import os

# 添加 sdk 到 path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from omnicontext import Client, Session, Memory, Message, SearchResult, OmniContextError
import omnicontext.client as client_module


class MockResponse:
    """模拟 HTTP 响应"""
    def __init__(self, data, status=200):
        self.data = data
        self.status = status
        self._data_str = json.dumps(data).encode('utf-8')

    def read(self):
        return self._data_str

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class MockErrorResponse:
    """模拟错误响应"""
    def __init__(self, status, reason="Error"):
        self.status = status
        self.reason = reason

    def read(self):
        return b'{"detail": "Error message"}'

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class TestModels:
    """数据模型测试"""

    def test_message_from_dict(self):
        """测试 Message 模型"""
        msg = Message.from_dict({
            "id": "msg-1",
            "role": "user",
            "content": "Hello",
            "timestamp": 1234567890
        })
        assert msg.id == "msg-1"
        assert msg.role == "user"
        assert msg.content == "Hello"
        assert msg.timestamp == 1234567890

    def test_message_to_dict(self):
        """测试 Message 转换为字典"""
        msg = Message(id="msg-1", role="user", content="Hello", timestamp=1000)
        d = msg.to_dict()
        assert d["id"] == "msg-1"
        assert d["role"] == "user"
        assert d["content"] == "Hello"
        assert d["timestamp"] == 1000

    def test_session_from_dict(self):
        """测试 Session 模型"""
        session = Session.from_dict({
            "id": "session-1",
            "source": "api",
            "title": "Test Session",
            "messages": [
                {"id": "m1", "role": "user", "content": "Hi", "timestamp": 1000}
            ],
            "platform": None,
            "tags": ["test"],
            "metadata": {"key": "value"},
            "created_at": 1000,
            "updated_at": 2000
        })
        assert session.id == "session-1"
        assert session.source == "api"
        assert session.title == "Test Session"
        assert len(session.messages) == 1
        assert session.tags == ["test"]

    def test_session_from_dict_with_platform(self):
        """测试带平台的 Session 模型"""
        session = Session.from_dict({
            "id": "session-2",
            "source": "platform",
            "title": "Platform Session",
            "messages": [],
            "platform": "kimi",
            "tags": [],
            "created_at": 1000,
            "updated_at": 2000
        })
        assert session.source == "platform"
        assert session.platform == "kimi"

    def test_memory_from_dict(self):
        """测试 Memory 模型"""
        memory = Memory.from_dict({
            "id": "memory-1",
            "content": "Test memory",
            "created_at": 1000,
            "metadata": {"type": "test"}
        })
        assert memory.id == "memory-1"
        assert memory.content == "Test memory"
        assert memory.metadata == {"type": "test"}

    def test_search_result_from_dict(self):
        """测试 SearchResult 模型"""
        result = SearchResult.from_dict({
            "session_id": "session-1",
            "session_title": "Test Session",
            "matched_messages": [
                {"id": "m1", "role": "user", "content": "Match", "timestamp": 1000}
            ],
            "relevance": 0.95
        })
        assert result.session_id == "session-1"
        assert result.relevance == 0.95
        assert len(result.matched_messages) == 1


class TestClient:
    """客户端测试"""

    def test_client_initialization(self):
        """测试客户端初始化"""
        client = Client()
        assert client.base_url == "http://127.0.0.1:8765"
        assert client.timeout == 30

        client2 = Client(host="localhost", port=9000, timeout=10)
        assert client2.base_url == "http://localhost:9000"
        assert client2.timeout == 10

    @patch.object(client_module, 'urlopen')
    def test_is_connected_success(self, mock_urlopen):
        """测试连接检查成功"""
        mock_urlopen.return_value = MockResponse({"status": "ok"})

        client = Client()
        assert client.is_connected() is True

    @patch.object(client_module, 'urlopen')
    def test_is_connected_failure(self, mock_urlopen):
        """测试连接检查失败"""
        from urllib.error import URLError
        mock_urlopen.side_effect = URLError("Connection refused")

        client = Client()
        assert client.is_connected() is False

    @patch.object(client_module, 'urlopen')
    def test_get_sessions(self, mock_urlopen):
        """测试获取会话列表"""
        mock_urlopen.return_value = MockResponse({
            "total": 2,
            "sessions": [
                {
                    "id": "s1",
                    "source": "api",
                    "title": "Session 1",
                    "messages": [],
                    "tags": [],
                    "created_at": 1000,
                    "updated_at": 2000
                },
                {
                    "id": "s2",
                    "source": "platform",
                    "title": "Session 2",
                    "platform": "kimi",
                    "messages": [],
                    "tags": [],
                    "created_at": 1000,
                    "updated_at": 2000
                }
            ]
        })

        client = Client()
        sessions = client.get_sessions()

        assert len(sessions) == 2
        assert sessions[0].id == "s1"
        assert sessions[1].platform == "kimi"

    @patch.object(client_module, 'urlopen')
    def test_write_session(self, mock_urlopen):
        """测试写入会话"""
        mock_urlopen.return_value = MockResponse({
            "id": "new-session",
            "source": "api",
            "title": "New Session",
            "messages": [
                {"id": "m1", "role": "user", "content": "Hello", "timestamp": 1000}
            ],
            "tags": ["test"],
            "metadata": None,
            "created_at": 1000,
            "updated_at": 1000
        })

        client = Client()
        session = client.write_session(
            title="New Session",
            messages=[{"role": "user", "content": "Hello"}],
            tags=["test"]
        )

        assert session.id == "new-session"
        assert session.title == "New Session"
        assert len(session.messages) == 1

    @patch.object(client_module, 'urlopen')
    def test_write_memory(self, mock_urlopen):
        """测试写入记忆"""
        mock_urlopen.return_value = MockResponse({
            "id": "memory-1",
            "content": "Test memory",
            "created_at": 1000,
            "metadata": {"type": "test"}
        })

        client = Client()
        memory = client.write_memory("Test memory", metadata={"type": "test"})

        assert memory.id == "memory-1"
        assert memory.content == "Test memory"

    @patch.object(client_module, 'urlopen')
    def test_search_sessions(self, mock_urlopen):
        """测试搜索会话"""
        mock_urlopen.return_value = MockResponse({
            "query": "test",
            "total": 1,
            "results": [
                {
                    "session_id": "s1",
                    "session_title": "Test Session",
                    "matched_messages": [],
                    "relevance": 1.0
                }
            ]
        })

        client = Client()
        results = client.search_sessions("test")

        assert len(results) == 1
        assert results[0].session_id == "s1"

    @patch.object(client_module, 'urlopen')
    def test_delete_session_success(self, mock_urlopen):
        """测试删除会话成功"""
        mock_urlopen.return_value = MockResponse({
            "success": True
        })

        client = Client()
        result = client.delete_session("session-1")
        assert result is True

    @patch.object(client_module, 'urlopen')
    def test_error_handling_404(self, mock_urlopen):
        """测试404错误处理 - get_session 返回 None"""
        from urllib.error import HTTPError
        mock_urlopen.side_effect = HTTPError(
            "http://127.0.0.1:8765/api/sessions/invalid",
            404, "Not Found", {}, None
        )

        client = Client()
        # get_session 在404时返回None而不是抛出异常
        result = client.get_session("invalid")
        assert result is None

    @patch.object(client_module, 'urlopen')
    def test_error_handling_500(self, mock_urlopen):
        """测试500错误处理 - 抛出异常"""
        from urllib.error import HTTPError
        mock_urlopen.side_effect = HTTPError(
            "http://127.0.0.1:8765/api/sessions",
            500, "Internal Server Error", {}, None
        )

        client = Client()
        with pytest.raises(OmniContextError):
            client.get_sessions()

    def test_alias_methods(self):
        """测试别名方法"""
        client = Client()
        # 确保别名存在
        assert hasattr(client, 'search')
        assert hasattr(client, 'get')
        assert hasattr(client, 'list')
        assert hasattr(client, 'write')
        assert hasattr(client, 'delete')


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
