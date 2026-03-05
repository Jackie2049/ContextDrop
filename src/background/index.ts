// Background service worker
// Handles extension lifecycle events

// 全局批量捕获状态
interface BatchCaptureState {
  isRunning: boolean;
  platform: string | null;
  tabId: number | null;
}

let batchCaptureState: BatchCaptureState = {
  isRunning: false,
  platform: null,
  tabId: null,
};

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[OmniContext] Extension installed', details);

  // Initialize storage
  chrome.storage.local.get('sessions', (result) => {
    if (!result.sessions) {
      chrome.storage.local.set({ sessions: [] });
    }
  });
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SAVE_SESSION') {
    // Session is saved directly by content script via storage module
    sendResponse({ success: true });
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
      console.log('[OmniContext] Batch capture lock acquired:', batchCaptureState);
      sendResponse({ success: true });
    }
    return true;
  }

  // 释放批量捕获锁
  if (request.type === 'BATCH_CAPTURE_RELEASE_LOCK') {
    console.log('[OmniContext] Batch capture lock released:', batchCaptureState);
    batchCaptureState = {
      isRunning: false,
      platform: null,
      tabId: null,
    };
    sendResponse({ success: true });
    return true;
  }

  return true;
});

// 监听标签页关闭，自动释放锁
chrome.tabs.onRemoved.addListener((tabId) => {
  if (batchCaptureState.isRunning && batchCaptureState.tabId === tabId) {
    console.log('[OmniContext] Tab closed, releasing batch capture lock');
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
    url.includes('deepseek.com');

  // Set badge to indicate support status
  if (isSupported) {
    chrome.action.setBadgeText({ text: '●' });
    chrome.action.setBadgeBackgroundColor({ color: '#52c41a' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}
