import { sessionStorage } from '../storage/session-storage';
import { detectPlatform, extractSessionId, extractSessionIdFromDOM, createMessageExtractor } from '../utils/extractor';
import { startBatchCapture, pauseBatchCapture, resumeBatchCapture, cancelBatchCapture, isBatchCaptureRunning, getBatchCaptureProgress, setSelectedSessions } from './batch-capture';
import type { Platform, Session, Message } from '../types';

const DEBUG = true;  // Enable verbose logging for DeepSeek debugging

function log(...args: any[]) {
  if (DEBUG) console.log('[OmniContext]', ...args);
}

let currentPlatform: Platform | null = null;
let currentSessionId: string | null = null;
let lastMessageCount = 0;
let lastMessageHash = '';
let lastSavedMessages: Message[] = [];
let pendingSave: number | null = null;
let saveTimeout: number | null = null;
let observer: MutationObserver | null = null;

// Check if extension context is still valid
function isExtensionContextValid(): boolean {
  try {
    return !!chrome.runtime.id;
  } catch {
    return false;
  }
}

// Fast hash for message comparison (avoid full JSON.stringify)
function hashMessages(messages: Message[]): string {
  if (messages.length === 0) return '';
  // Hash based on count + first & last message (more stable)
  const first = messages[0];
  const last = messages[messages.length - 1];
  return `${messages.length}:${first.role}:${first.content.slice(0, 50)}:${last.role}:${last.content.slice(-50)}`;
}

function init() {
  try {
    const url = window.location.href;
    currentPlatform = detectPlatform(url);

    if (!currentPlatform) {
      log('Platform not detected');
      return;
    }

    // DeepSeek 专用调试
    if (currentPlatform === 'deepseek') {
      console.log('[OmniContext] === DeepSeek Debug Start ===');
      console.log('[OmniContext] URL:', url);

      // 分析页面结构
      setTimeout(() => {
        debugDeepSeekPage();
      }, 2000);
    }

    // First try URL-based extraction
    currentSessionId = extractSessionId(url, currentPlatform);

    // For platforms like Yuanbao, try DOM-based extraction
    // This is needed because the session ID might not be in the URL
    if (currentPlatform === 'yuanbao') {
      // Delay to allow page to fully load
      setTimeout(() => {
        const domSessionId = extractSessionIdFromDOM(currentPlatform!);
        if (domSessionId) {
          currentSessionId = domSessionId;
          log('Updated session ID from DOM:', currentSessionId);
        }
      }, 1000);
    }

    log('Detected:', currentPlatform, 'Session:', currentSessionId);

    startCapturing();
  } catch (err) {
    console.error('[OmniContext] Init failed:', err);
  }
}

// DeepSeek 专用调试函数
function debugDeepSeekPage() {
  console.log('[OmniContext] === DeepSeek DOM Analysis ===');

  // 1. 检查主要容器
  const mainSelectors = ['main', '[class*="main"]', '[class*="chat"]', '[class*="conversation"]', '[class*="ds-scroll-area"]'];
  for (const sel of mainSelectors) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      console.log(`[OmniContext] Found ${els.length} elements with: ${sel}`);
    }
  }

  // 2. 检查消息元素
  console.log('[OmniContext] --- Looking for message elements ---');
  const allDivs = document.querySelectorAll('div');
  const candidates: Element[] = [];

  allDivs.forEach(div => {
    const text = div.textContent?.trim() || '';
    const classList = div.className || '';

    // 消息元素通常有这些特征
    if (text.length > 10 && text.length < 2000) {
      // 检查是否可能是消息
      const hasMessageClass = classList.toLowerCase().includes('message') ||
                              classList.toLowerCase().includes('chat') ||
                              classList.toLowerCase().includes('bubble') ||
                              classList.toLowerCase().includes('content');

      if (hasMessageClass && div.children.length < 5) {
        candidates.push(div);
      }
    }
  });

  console.log(`[OmniContext] Found ${candidates.length} potential message elements`);
  candidates.slice(0, 5).forEach((el, i) => {
    console.log(`[OmniContext] [${i}] class="${el.className}"`);
    console.log(`[OmniContext]     text="${el.textContent?.slice(0, 100)}..."`);
  });

  // 3. 检查侧边栏
  console.log('[OmniContext] --- Looking for sidebar ---');
  const sidebarSelectors = ['nav', 'aside', '[class*="sidebar"]', '[class*="history"]', '[class*="session"]'];
  for (const sel of sidebarSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      console.log(`[OmniContext] Sidebar found with: ${sel}`);
      console.log(`[OmniContext]   classes: ${el.className}`);
      console.log(`[OmniContext]   children: ${el.children.length}`);
    }
  }

  // 4. 输出所有 ds- 开头的 class
  console.log('[OmniContext] --- ds- prefixed classes ---');
  const dsElements = document.querySelectorAll('[class*="ds-"]');
  const dsClasses = new Set<string>();
  dsElements.forEach(el => {
    const classes = el.className.split(/\s+/);
    classes.forEach(c => {
      if (c.startsWith('ds-')) dsClasses.add(c);
    });
  });
  console.log('[OmniContext] ds- classes:', Array.from(dsClasses).slice(0, 20));

  // 5. 尝试提取消息
  console.log('[OmniContext] --- Trying message extraction ---');
  try {
    const extractor = createMessageExtractor('deepseek');
    const title = extractor.extractTitle();
    const messages = extractor.extractMessages();
    console.log(`[OmniContext] Title: "${title}"`);
    console.log(`[OmniContext] Messages: ${messages.length}`);
    if (messages.length > 0) {
      messages.slice(0, 3).forEach((m, i) => {
        console.log(`[OmniContext] [${i}] ${m.role}: "${m.content.slice(0, 50)}..."`);
      });
    }
  } catch (e) {
    console.error('[OmniContext] Extraction error:', e);
  }

  console.log('[OmniContext] === DeepSeek Debug End ===');
}

function startCapturing() {
  log('Starting capture...');

  // Initial capture
  setTimeout(tryCapture, 300);

  // Use MutationObserver for instant response to DOM changes
  observer = new MutationObserver(() => {
    // Debounce: only check after a short delay
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = window.setTimeout(tryCapture, 200);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Fallback polling (less frequent, just in case)
  setInterval(tryCapture, 2000);
}

function tryCapture() {
  if (!currentPlatform || !isExtensionContextValid()) return;

  try {
    // For Yuanbao, always re-extract session ID from DOM (URL doesn't change when switching sessions)
    if (currentPlatform === 'yuanbao') {
      const domSessionId = extractSessionIdFromDOM(currentPlatform);
      if (domSessionId && domSessionId !== currentSessionId) {
        log('Session ID changed from', currentSessionId, 'to', domSessionId);
        currentSessionId = domSessionId;
        // Reset tracking for new session
        lastMessageCount = 0;
        lastMessageHash = '';
        lastSavedMessages = [];
      }
    }

    const extractor = createMessageExtractor(currentPlatform);
    const messages = extractor.extractMessages();

    if (messages.length === 0) return;

    // Fast comparison: count + hash of last message
    const currentHash = hashMessages(messages);
    if (messages.length !== lastMessageCount || currentHash !== lastMessageHash) {
      lastMessageCount = messages.length;
      lastMessageHash = currentHash;

      // Save asynchronously without blocking
      saveSessionDebounced(messages);
    }
  } catch (err) {
    log('Capture error:', err);
  }
}

function saveSessionDebounced(messages: Message[]) {
  // Debounce saves: wait 500ms before actually saving
  if (saveTimeout) clearTimeout(saveTimeout);

  saveTimeout = window.setTimeout(async () => {
    // Final check: compare content hash with last saved
    const saveHash = hashMessages(messages);
    const lastSaveHash = hashMessages(lastSavedMessages);

    if (saveHash === lastSaveHash && messages.length === lastSavedMessages.length) {
      return; // No actual change
    }

    lastSavedMessages = [...messages]; // Copy to avoid reference issues
    await doSave(messages);
  }, 500);
}

async function doSave(messages: Message[]) {
  if (!currentPlatform) return;

  try {
    // For platforms like Yuanbao, try to get session ID from DOM if not set
    if (!currentSessionId || currentSessionId.startsWith('yuanbao-')) {
      const domSessionId = extractSessionIdFromDOM(currentPlatform);
      if (domSessionId) {
        currentSessionId = domSessionId;
        log('Updated session ID from DOM:', currentSessionId);
      }
    }

    if (!currentSessionId) {
      log('No session ID available, skipping save');
      return;
    }

    const extractor = createMessageExtractor(currentPlatform);
    const title = extractor.extractTitle();

    const now = Date.now();
    const session: Session = {
      id: currentSessionId,
      platform: currentPlatform,
      title: title || '未命名对话',
      sourceUrl: window.location.href,
      createdAt: now,
      updatedAt: now,
      messages: messages,
      messageCount: messages.length,
    };

    await sessionStorage.saveSessionOptimized(session);
    console.log('[OmniContext] ✓ Saved:', title, `(${messages.length}条消息)`);
  } catch (err: any) {
    if (!err?.message?.includes('Extension context invalidated')) {
      console.error('[OmniContext] Save failed:', err);
    }
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (observer) observer.disconnect();
  if (pendingSave) clearTimeout(pendingSave);
  if (saveTimeout) clearTimeout(saveTimeout);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-init on URL change (for SPAs)
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (observer) observer.disconnect();
    currentPlatform = null;
    currentSessionId = null;
    lastMessageCount = 0;
    lastMessageHash = '';
    lastSavedMessages = [];
    init();
  }
}, 1000);

// Listen for batch capture commands from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'BATCH_CAPTURE_START') {
    if (!currentPlatform) {
      sendResponse({ success: false, error: '未检测到支持的平台' });
      return true;
    }

    startBatchCapture(currentPlatform, (progress) => {
      // Send progress updates to popup
      chrome.runtime.sendMessage({
        type: 'BATCH_CAPTURE_PROGRESS',
        progress,
      });
    });

    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'BATCH_CAPTURE_PAUSE') {
    pauseBatchCapture();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'BATCH_CAPTURE_RESUME') {
    resumeBatchCapture();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'BATCH_CAPTURE_CANCEL') {
    cancelBatchCapture();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'BATCH_CAPTURE_STATUS') {
    sendResponse({
      isRunning: isBatchCaptureRunning(),
      progress: getBatchCaptureProgress()
    });
    return true;
  }

  if (message.type === 'BATCH_CAPTURE_CHECK_SIDEBAR') {
    // 检查元宝会话列表侧边栏是否可见
    if (currentPlatform === 'yuanbao') {
      const sidebar = document.querySelector('.yb-nav') ||
                      document.querySelector('.yb-common-nav');
      const sessionList = document.querySelector('.yb-recent-conv-list');
      const sessionItems = document.querySelectorAll('.yb-recent-conv-list__item');

      const sidebarVisible = !!(sidebar &&
        sidebar.getBoundingClientRect().width > 0 &&
        sessionList &&
        sessionItems.length > 0);

      sendResponse({ sidebarVisible });
    } else if (currentPlatform === 'deepseek') {
      // 检查 DeepSeek 会话列表是否可见
      console.log('[OmniContext] DeepSeek sidebar check starting...');
      console.log('[OmniContext] currentPlatform:', currentPlatform);

      // 方法1: 检查会话链接
      const sessionLinks1 = document.querySelectorAll('a[href*="/chat/s/"]');
      const sessionLinks2 = document.querySelectorAll('a[href*="/a/chat/"]');
      const sessionLinks3 = document.querySelectorAll('a[href^="/a/"]');

      console.log(`[OmniContext] Method 1 (href*="/chat/s/"): ${sessionLinks1.length} links`);
      console.log(`[OmniContext] Method 2 (href*="/a/chat/"): ${sessionLinks2.length} links`);
      console.log(`[OmniContext] Method 3 (href^="/a/"): ${sessionLinks3.length} links`);

      // 方法2: 检查侧边栏容器
      const sidebar = document.querySelector('aside') ||
                      document.querySelector('[class*="sidebar"]') ||
                      document.querySelector('[class*="nav"]') ||
                      document.querySelector('[class*="history"]');
      console.log('[OmniContext] Sidebar element:', sidebar ? sidebar.className : 'not found');

      // 方法3: 检查所有可能的会话项
      const allLinks = document.querySelectorAll('a');
      let chatLinks = 0;
      allLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        if (href.includes('chat')) {
          chatLinks++;
        }
      });
      console.log(`[OmniContext] Total links with 'chat' in href: ${chatLinks}`);

      // 综合判断：任何一种方法检测到会话项就认为侧边栏已打开
      let visibleCount = 0;

      // 检查所有可能的会话链接
      const allSessionLinks = document.querySelectorAll('a[href*="chat"]');
      allSessionLinks.forEach(link => {
        const rect = link.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          visibleCount++;
        }
      });

      // 或者侧边栏容器存在且可见
      const sidebarVisible = visibleCount > 0 || (sidebar !== null && sidebar.getBoundingClientRect().width > 0);

      console.log(`[OmniContext] DeepSeek sidebar result: ${visibleCount} visible links, sidebar: ${!!sidebar}, final: ${sidebarVisible}`);
      sendResponse({ sidebarVisible: true }); // 暂时总是返回 true，让用户能继续操作
    } else {
      // 其他平台默认返回 true
      sendResponse({ sidebarVisible: true });
    }
    return true;
  }

  if (message.type === 'BATCH_CAPTURE_SELECT_SESSIONS') {
    setSelectedSessions(message.sessionIds || []);
    sendResponse({ success: true });
    return true;
  }

  return false;
});
