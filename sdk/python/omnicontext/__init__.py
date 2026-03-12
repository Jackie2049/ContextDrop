"""
OmniContext Python SDK

用于与 OmniContext 本地服务交互的客户端库
"""
from .client import Client, OmniContextError
from .models import Session, Memory, Message, SearchResult

__version__ = "0.1.0"
__all__ = ["Client", "Session", "Memory", "Message", "SearchResult", "OmniContextError"]
