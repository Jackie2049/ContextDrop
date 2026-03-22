// Background service worker
// Handles extension lifecycle events and Native Messaging

// ========== Side Panel 配置 ==========

// 允许在所有标签页使用侧边栏（点击图标或快捷键时打开）
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ========== 全局状态 ==========

// 全局批量捕获状态
interface BatchCaptureState {
  isRunning: boolean;
  platform: string | null;
  tabId: number | null;
}

// Native Host 配置
const NATIVE_HOST_NAME = 'com.contextdrop.host';
let nativeHostConnected = false;

let batchCaptureState: BatchCaptureState = {
  isRunning: false,
  platform: null,
  tabId: null,
};

// ========== Native Messaging 通信 ==========

interface NativeMessage {
  action: string;
  [key: string]: any;
}

interface NativeResponse {
  success: boolean;
  error?: string;
  data?: any;
  server_running?: boolean;
}

/**
 * 发送消息到 Native Host
 */
async function sendNativeMessage(message: NativeMessage): Promise<NativeResponse> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[ContextDrop] Native messaging error:', chrome.runtime.lastError.message);
          nativeHostConnected = false;
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          nativeHostConnected = true;
          resolve(response || { success: false, error: 'No response from native host' });
        }
      });
    } catch (error) {
      console.error('[ContextDrop] Failed to send native message:', error);
      resolve({ success: false, error: String(error) });
    }
  });
}

/**
 * 检查 Native Host 和本地服务器状态
 */
async function checkLocalServerStatus(): Promise<{ nativeHost: boolean; server: boolean }> {
  const response = await sendNativeMessage({ action: 'health_check' });
  return {
    nativeHost: response.success,
    server: response.server_running || false,
  };
}

/**
 * 同步 Session 到本地服务器
 */
async function syncSessionToLocalServer(session: any): Promise<boolean> {
  const response = await sendNativeMessage({
    action: 'save_session',
    session,
  });
  return response.success;
}

// ========== Chrome 扩展事件 ==========

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[ContextDrop] Extension installed', details);

  // Initialize storage
  chrome.storage.local.get('sessions', (result) => {
    if (!result.sessions) {
      chrome.storage.local.set({ sessions: [] });
    }
  });

  // Check local server status
  checkLocalServerStatus().then((status) => {
    console.log('[ContextDrop] Local server status:', status);
    chrome.storage.local.set({ serverStatus: status });
  });
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Session 保存 - 同时同步到本地服务器
  if (request.type === 'SAVE_SESSION') {
    // 异步同步到本地服务器
    if (request.session) {
      syncSessionToLocalServer(request.session).then((synced) => {
        console.log('[ContextDrop] Session synced to local server:', synced);
      });
    }
    sendResponse({ success: true });
    return true;
  }

  // 检查批量捕获状态
  if (request.type === 'BATCH_CAPTURE_CHECK_LOCK') {
    sendResponse({
      isLocked: batchCaptureState.isRunning,
      platform: batchCaptureState.platform,
      tabId: batchCaptureState.tabId,
    });
    return true;
  }

  // 获取批量捕获锁
  if (request.type === 'BATCH_CAPTURE_ACQUIRE_LOCK') {
    if (batchCaptureState.isRunning) {
      sendResponse({
        success: false,
        reason: '另一个批量捕获正在进行中',
        platform: batchCaptureState.platform,
      });
    } else {
      batchCaptureState = {
        isRunning: true,
        platform: request.platform,
        tabId: sender.tab?.id || request.tabId || null,
      };
      console.log('[ContextDrop] Batch capture lock acquired:', batchCaptureState);
      sendResponse({ success: true });
    }
    return true;
  }

  // 释放批量捕获锁
  if (request.type === 'BATCH_CAPTURE_RELEASE_LOCK') {
    console.log('[ContextDrop] Batch capture lock released:', batchCaptureState);
    batchCaptureState = {
      isRunning: false,
      platform: null,
      tabId: null,
    };
    sendResponse({ success: true });
    return true;
  }

  // ========== Native Messaging API ==========

  // 检查本地服务器状态
  if (request.type === 'CHECK_SERVER_STATUS') {
    checkLocalServerStatus().then((status) => {
      chrome.storage.local.set({ serverStatus: status });
      sendResponse(status);
    });
    return true; // Keep channel open for async response
  }

  // 从本地服务器获取 Sessions
  if (request.type === 'GET_SESSIONS_FROM_SERVER') {
    sendNativeMessage({
      action: 'get_sessions',
      source: request.source,
      platform: request.platform,
      limit: request.limit || 100,
      offset: request.offset || 0,
    }).then((response) => {
      sendResponse(response);
    });
    return true;
  }

  // 从本地服务器搜素 Sessions
  if (request.type === 'SEARCH_SESSIONS_SERVER') {
    sendNativeMessage({
      action: 'search_sessions',
      query: request.query,
      limit: request.limit || 10,
    }).then((response) => {
      sendResponse(response);
    });
    return true;
  }

  // 写入 Memory
  if (request.type === 'WRITE_MEMORY') {
    sendNativeMessage({
      action: 'write_memory',
      content: request.content,
      metadata: request.metadata,
    }).then((response) => {
      sendResponse(response);
    });
    return true;
  }

  // 搜索 Memories
  if (request.type === 'SEARCH_MEMORIES') {
    sendNativeMessage({
      action: 'search_memories',
      query: request.query,
      limit: request.limit || 10,
    }).then((response) => {
      sendResponse(response);
    });
    return true;
  }

  // 获取统计信息
  if (request.type === 'GET_STATS') {
    sendNativeMessage({
      action: 'get_stats',
    }).then((response) => {
      sendResponse(response);
    });
    return true;
  }

  return true;
});

// 监听标签页关闭，自动释放锁
chrome.tabs.onRemoved.addListener((tabId) => {
  if (batchCaptureState.isRunning && batchCaptureState.tabId === tabId) {
    console.log('[ContextDrop] Tab closed, releasing batch capture lock');
    batchCaptureState = {
      isRunning: false,
      platform: null,
      tabId: null,
    };
  }
});

// Update icon based on current tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateIconForUrl(tab.url);
  } catch (e) {
    // Ignore errors
  }
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    updateIconForUrl(changeInfo.url);
  }
});

function updateIconForUrl(url?: string) {
  if (!url) return;

  const isSupported =
    url.includes('doubao.com') ||
    url.includes('yuanbao.tencent.com') ||
    url.includes('claude.ai') ||
    url.includes('deepseek.com') ||
    url.includes('kimi.com') ||
    url.includes('gemini.google.com') ||
    url.includes('chatgpt.com') ||
    url.includes('chat.openai.com');

  // Set badge to indicate support status
  if (isSupported) {
    chrome.action.setBadgeText({ text: '●' });
    chrome.action.setBadgeBackgroundColor({ color: '#52c41a' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}
