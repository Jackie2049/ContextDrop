#!/usr/bin/env python3
"""
OmniContext Native Messaging Host

This script acts as a bridge between the Chrome extension and the local HTTP server.
It receives messages from the extension via stdin (Native Messaging protocol)
and forwards them to the HTTP API, then returns the response.

This allows the extension to:
1. Sync captured sessions to local storage
2. Read sessions from local storage
3. Search memories across all platforms
"""

import sys
import json
import struct
import urllib.request
import urllib.error
from typing import Optional, Dict, Any

# Local HTTP server configuration
HTTP_HOST = "127.0.0.1"
HTTP_PORT = 8765
BASE_URL = f"http://{HTTP_HOST}:{HTTP_PORT}"


def read_message() -> Optional[Dict[str, Any]]:
    """Read a message from Chrome extension via Native Messaging protocol."""
    # Read the message length (first 4 bytes)
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None

    # Unpack message length as 32-bit integer
    message_length = struct.unpack('I', raw_length)[0]

    # Read the message content
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)


def send_message(message: Dict[str, Any]) -> None:
    """Send a message to Chrome extension via Native Messaging protocol."""
    # Encode the message
    encoded_message = json.dumps(message).encode('utf-8')

    # Write the message length first (4 bytes)
    sys.stdout.buffer.write(struct.pack('I', len(encoded_message)))

    # Write the message content
    sys.stdout.buffer.write(encoded_message)
    sys.stdout.buffer.flush()


def http_request(method: str, path: str, data: Optional[Dict] = None) -> Dict[str, Any]:
    """Make an HTTP request to the local server."""
    url = f"{BASE_URL}{path}"

    try:
        headers = {'Content-Type': 'application/json'}

        if data:
            body = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(url, data=body, headers=headers, method=method)
        else:
            req = urllib.request.Request(url, headers=headers, method=method)

        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))

    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.reason}", "success": False}
    except urllib.error.URLError as e:
        return {"error": f"Connection failed: {e.reason}", "success": False}
    except Exception as e:
        return {"error": str(e), "success": False}


def handle_message(message: Dict[str, Any]) -> Dict[str, Any]:
    """Process incoming message and route to appropriate handler."""
    action = message.get('action')

    if not action:
        return {"error": "Missing action", "success": False}

    # Route to appropriate handler
    if action == 'ping':
        return {"success": True, "message": "pong"}

    elif action == 'save_session':
        # Sync session to local server
        session = message.get('session')
        if not session:
            return {"error": "Missing session data", "success": False}

        # Convert to API format
        api_session = {
            "title": session.get('title', 'Untitled'),
            "messages": [
                {"role": m.get('role'), "content": m.get('content')}
                for m in session.get('messages', [])
            ],
            "tags": session.get('tags', []),
            "metadata": {
                "source": "platform",
                "platform": session.get('platform'),
                "sourceUrl": session.get('sourceUrl'),
                "originalId": session.get('id'),
            }
        }

        result = http_request('POST', '/api/sessions', api_session)
        return {"success": True, "data": result}

    elif action == 'get_sessions':
        # Get sessions with optional filters
        params = []
        if message.get('source'):
            params.append(f"source={message['source']}")
        if message.get('platform'):
            params.append(f"platform={message['platform']}")
        if message.get('limit'):
            params.append(f"limit={message['limit']}")
        if message.get('offset'):
            params.append(f"offset={message['offset']}")

        query = '?' + '&'.join(params) if params else ''
        result = http_request('GET', f'/api/sessions{query}')
        return {"success": True, "data": result}

    elif action == 'get_session':
        # Get single session
        session_id = message.get('session_id')
        if not session_id:
            return {"error": "Missing session_id", "success": False}

        result = http_request('GET', f'/api/sessions/{session_id}')
        return {"success": True, "data": result}

    elif action == 'search_sessions':
        # Search sessions
        query = message.get('query', '')
        limit = message.get('limit', 10)
        result = http_request('GET', f'/api/sessions/search?q={query}&limit={limit}')
        return {"success": True, "data": result}

    elif action == 'delete_session':
        # Delete session
        session_id = message.get('session_id')
        if not session_id:
            return {"error": "Missing session_id", "success": False}

        result = http_request('DELETE', f'/api/sessions/{session_id}')
        return {"success": True, "data": result}

    elif action == 'write_memory':
        # Write a memory
        content = message.get('content')
        if not content:
            return {"error": "Missing content", "success": False}

        data = {
            "content": content,
            "metadata": message.get('metadata', {})
        }
        result = http_request('POST', '/api/memories', data)
        return {"success": True, "data": result}

    elif action == 'search_memories':
        # Search memories
        query = message.get('query', '')
        limit = message.get('limit', 10)
        result = http_request('GET', f'/api/memories/search?q={query}&limit={limit}')
        return {"success": True, "data": result}

    elif action == 'get_stats':
        # Get statistics
        result = http_request('GET', '/api/stats')
        return {"success": True, "data": result}

    elif action == 'health_check':
        # Check if server is running
        try:
            result = http_request('GET', '/health')
            return {"success": True, "server_running": result.get('status') == 'ok'}
        except:
            return {"success": False, "server_running": False}

    else:
        return {"error": f"Unknown action: {action}", "success": False}


def main():
    """Main loop - process messages from Chrome extension."""
    # Log to stderr (visible in browser's console when debugging)
    print("[OmniContext Native Host] Starting...", file=sys.stderr)

    while True:
        try:
            message = read_message()
            if message is None:
                # EOF reached, exit
                break

            # Process the message
            response = handle_message(message)

            # Send response back to extension
            send_message(response)

        except Exception as e:
            # Send error response
            send_message({"error": str(e), "success": False})
            print(f"[OmniContext Native Host] Error: {e}", file=sys.stderr)

    print("[OmniContext Native Host] Exiting...", file=sys.stderr)


if __name__ == '__main__':
    main()
