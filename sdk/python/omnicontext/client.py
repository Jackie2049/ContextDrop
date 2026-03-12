"""
OmniContext 客户端

与本地 OmniContext 服务交互
"""
import json
from typing import Optional, List, Dict, Any, Literal
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode

from .models import Session, Memory, Message, SearchResult


class OmniContextError(Exception):
    """OmniContext 错误"""
    pass


class Client:
    """
    OmniContext 客户端

    用法:
        import omnicontext

        client = omnicontext.Client()

        # 读取
        sessions = client.get_sessions()
        results = client.search_sessions("用户偏好")

        # 写入
        client.write_session(title="Agent对话", messages=[
            {"role": "user", "content": "你好"},
            {"role": "assistant", "content": "你好！"}
        ])

        # 记忆接口
        client.write_memory("用户偏好Python编程")
        memories = client.search_memories("用户偏好")
    """

    def __init__(self, host: str = "127.0.0.1", port: int = 8765, timeout: int = 30):
        """
        初始化客户端

        Args:
            host: 服务地址，默认 127.0.0.1
            port: 服务端口，默认 8765
            timeout: 请求超时时间（秒），默认 30
        """
        self.base_url = f"http://{host}:{port}"
        self.timeout = timeout

    def _request(self, method: str, path: str, data: Any = None, params: dict = None) -> Any:
        """发送 HTTP 请求"""
        url = f"{self.base_url}{path}"
        if params:
            url += f"?{urlencode(params)}"

        headers = {"Content-Type": "application/json"}
        body = json.dumps(data).encode("utf-8") if data else None

        req = Request(url, data=body, headers=headers, method=method)

        try:
            with urlopen(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as e:
            error_body = e.read().decode("utf-8") if e.fp else ""
            raise OmniContextError(f"HTTP {e.code}: {error_body}")
        except URLError as e:
            raise OmniContextError(f"连接失败: {e.reason}。请确保 OmniContext 服务正在运行。")

    # ============ Session API ============

    def get_sessions(
        self,
        source: Optional[Literal["platform", "api"]] = None,
        platform: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Session]:
        """
        获取会话列表

        Args:
            source: 来源筛选，"platform" 或 "api"
            platform: 平台筛选，如 "doubao", "kimi" 等
            limit: 返回数量限制
            offset: 偏移量

        Returns:
            会话列表
        """
        params = {"limit": limit, "offset": offset}
        if source:
            params["source"] = source
        if platform:
            params["platform"] = platform

        result = self._request("GET", "/api/sessions", params=params)
        return [Session.from_dict(s) for s in result.get("sessions", [])]

    def get_session(self, session_id: str) -> Optional[Session]:
        """
        获取单个会话

        Args:
            session_id: 会话 ID

        Returns:
            会话对象，不存在则返回 None
        """
        try:
            data = self._request("GET", f"/api/sessions/{session_id}")
            return Session.from_dict(data)
        except OmniContextError as e:
            if "404" in str(e):
                return None
            raise

    def write_session(
        self,
        title: str,
        messages: List[Dict[str, str]],
        tags: List[str] = None,
        metadata: Dict[str, Any] = None
    ) -> Session:
        """
        写入新会话

        Args:
            title: 会话标题
            messages: 消息列表，每条消息包含 role 和 content
            tags: 标签列表
            metadata: 元数据

        Returns:
            创建的会话对象
        """
        data = {
            "title": title,
            "messages": messages,
            "tags": tags or [],
            "metadata": metadata
        }
        result = self._request("POST", "/api/sessions", data=data)
        return Session.from_dict(result)

    def append_messages(self, session_id: str, messages: List[Dict[str, str]]) -> Session:
        """
        追加消息到会话

        Args:
            session_id: 会话 ID
            messages: 消息列表

        Returns:
            更新后的会话对象
        """
        data = {"messages": messages}
        result = self._request("POST", f"/api/sessions/{session_id}/messages", data=data)
        return Session.from_dict(result)

    def delete_session(self, session_id: str) -> bool:
        """
        删除会话

        Args:
            session_id: 会话 ID

        Returns:
            是否成功
        """
        try:
            self._request("DELETE", f"/api/sessions/{session_id}")
            return True
        except OmniContextError:
            return False

    def search_sessions(self, query: str, limit: int = 10) -> List[SearchResult]:
        """
        搜索会话

        Args:
            query: 搜索关键词
            limit: 返回数量限制

        Returns:
            搜索结果列表
        """
        result = self._request("GET", "/api/sessions/search", params={"q": query, "limit": limit})
        return [SearchResult.from_dict(r) for r in result.get("results", [])]

    # Alias for search_sessions
    search = search_sessions

    # ============ Memory API ============

    def get_memories(self, limit: int = 100, offset: int = 0) -> List[Memory]:
        """
        获取记忆列表

        Args:
            limit: 返回数量限制
            offset: 偏移量

        Returns:
            记忆列表
        """
        result = self._request("GET", "/api/memories", params={"limit": limit, "offset": offset})
        return [Memory.from_dict(m) for m in result.get("memories", [])]

    def write_memory(self, content: str, metadata: Dict[str, Any] = None) -> Memory:
        """
        写入记忆

        Args:
            content: 记忆内容
            metadata: 元数据

        Returns:
            创建的记忆对象
        """
        data = {"content": content, "metadata": metadata}
        result = self._request("POST", "/api/memories", data=data)
        return Memory.from_dict(result)

    def search_memories(self, query: str, limit: int = 10) -> List[Memory]:
        """
        搜索记忆

        Args:
            query: 搜索关键词
            limit: 返回数量限制

        Returns:
            记忆列表
        """
        result = self._request("GET", "/api/memories/search", params={"q": query, "limit": limit})
        return [Memory.from_dict(m) for m in result.get("memories", [])]

    def delete_memory(self, memory_id: str) -> bool:
        """
        删除记忆

        Args:
            memory_id: 记忆 ID

        Returns:
            是否成功
        """
        try:
            self._request("DELETE", f"/api/memories/{memory_id}")
            return True
        except OmniContextError:
            return False

    # ============ Stats API ============

    def get_stats(self) -> Dict[str, Any]:
        """
        获取统计信息

        Returns:
            统计数据
        """
        return self._request("GET", "/api/stats")

    # ============ Health Check ============

    def is_connected(self) -> bool:
        """
        检查是否连接到服务

        Returns:
            是否连接
        """
        try:
            self._request("GET", "/health")
            return True
        except OmniContextError:
            return False

    # ============ Convenience Aliases ============

    # Alias methods for more intuitive naming
    search = search_sessions
    get = get_session
    list = get_sessions
    write = write_session
    delete = delete_session
