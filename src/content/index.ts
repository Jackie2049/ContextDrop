import { sessionStorage } from '../storage/session-storage';
import { detectPlatform, extractSessionId, extractSessionIdFromDOM, createMessageExtractor } from '../utils/extractor';
import { startBatchCapture, pauseBatchCapture, resumeBatchCapture, cancelBatchCapture, isBatchCaptureRunning, getBatchCaptureProgress, setSelectedSessions } from './batch-capture';
import { injectToInput } from '../utils/injector';
import type { Platform, Session, Message } from '../types';

const DEBUG = false;  // Disable verbose logging in production

function log(...args: any[]) {
  if (DEBUG) console.log('[ContextDrop]', ...args);
}

let currentPlatform: Platform | null = null;
let currentSessionId: string | null = null;
let lastMessageCount = 0;
let lastMessageHash = '';
let lastSavedMessages: Message[] = [];
let pendingSave: number | null = null;
let saveTimeout: number | null = null;
let observer: MutationObserver | null = null;
let isAutoCaptureEnabled = false;  // 自动捕获开关状态

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

    // DeepSeek / Doubao 专用调试
    // 启用自动调试日志以帮助诊断问题
    if (currentPlatform === 'deepseek') {
      if (DEBUG) console.log('[ContextDrop] === DeepSeek Debug Start ===');
      if (DEBUG) console.log('[ContextDrop] URL:', url);
      setTimeout(() => {
        if (DEBUG) debugDeepSeekPage();
      }, 2000);
    }

    if (currentPlatform === 'doubao') {
      if (DEBUG) console.log('[ContextDrop] === Doubao Debug Start ===');
      if (DEBUG) console.log('[ContextDrop] URL:', url);
      setTimeout(() => {
        if (DEBUG) debugDoubaoPage();
      }, 3000); // 稍长延迟确保页面完全加载
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

    if (DEBUG) log('Detected:', currentPlatform, 'Session:', currentSessionId);

    startCapturing();
  } catch (err) {
    console.error('[ContextDrop] Init failed:', err);
  }
}

// DeepSeek 专用调试函数
function debugDeepSeekPage() {
  console.log('[ContextDrop] === DeepSeek DOM Analysis ===');

  // 1. 检查主要容器
  const mainSelectors = ['main', '[class*="main"]', '[class*="chat"]', '[class*="conversation"]', '[class*="ds-scroll-area"]'];
  for (const sel of mainSelectors) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      console.log(`[ContextDrop] Found ${els.length} elements with: ${sel}`);
    }
  }

  // 2. 检查消息元素
  console.log('[ContextDrop] --- Looking for message elements ---');
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

  console.log(`[ContextDrop] Found ${candidates.length} potential message elements`);
  candidates.slice(0, 5).forEach((el, i) => {
    console.log(`[ContextDrop] [${i}] class="${el.className}"`);
    console.log(`[ContextDrop]     text="${el.textContent?.slice(0, 100)}..."`);
  });

  // 3. 检查侧边栏
  console.log('[ContextDrop] --- Looking for sidebar ---');
  const sidebarSelectors = ['nav', 'aside', '[class*="sidebar"]', '[class*="history"]', '[class*="session"]'];
  for (const sel of sidebarSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      console.log(`[ContextDrop] Sidebar found with: ${sel}`);
      console.log(`[ContextDrop]   classes: ${el.className}`);
      console.log(`[ContextDrop]   children: ${el.children.length}`);
    }
  }

  // 4. 输出所有 ds- 开头的 class
  console.log('[ContextDrop] --- ds- prefixed classes ---');
  const dsElements = document.querySelectorAll('[class*="ds-"]');
  const dsClasses = new Set<string>();
  dsElements.forEach(el => {
    const classes = el.className.split(/\s+/);
    classes.forEach(c => {
      if (c.startsWith('ds-')) dsClasses.add(c);
    });
  });
  console.log('[ContextDrop] ds- classes:', Array.from(dsClasses).slice(0, 20));

  // 5. 尝试提取消息
  console.log('[ContextDrop] --- Trying message extraction ---');
  try {
    const extractor = createMessageExtractor('deepseek');
    const title = extractor.extractTitle();
    const messages = extractor.extractMessages();
    console.log(`[ContextDrop] Title: "${title}"`);
    console.log(`[ContextDrop] Messages: ${messages.length}`);
    if (messages.length > 0) {
      messages.slice(0, 3).forEach((m, i) => {
        console.log(`[ContextDrop] [${i}] ${m.role}: "${m.content.slice(0, 50)}..."`);
      });
    }
  } catch (e) {
    console.error('[ContextDrop] Extraction error:', e);
  }

  console.log('[ContextDrop] === DeepSeek Debug End ===');
}

// 豆包专用调试函数
function debugDoubaoPage() {
  console.log('[ContextDrop] === Doubao DOM Analysis ===');

  // 1. 检查消息块选择器（扩展列表）
  console.log('[ContextDrop] --- Step 1: Checking message selectors ---');
  const selectors = [
    '[class*="message-block-container"]',
    '[class*="message-block"]',
    '[class*="message-list"]',
    '[class*="chat-container"]',
    '[class*="conversation-content"]',
    '[class*="chat-content"]',
    '[class*="message-item"]',
    '[class*="msg-container"]',
    '[class*="bubble"]',
    '[class*="chat-bubble"]',
    '[data-index]',
    '[data-session-id] > div',
  ];

  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      console.log(`[ContextDrop] ✓ ${sel} -> ${els.length} elements`);
      // Show first element details
      if (els[0]) {
        console.log(`[ContextDrop]   First element class: "${els[0].className}"`);
      }
    }
  }

  // 2. 检查用户消息标识（扩展列表）
  console.log('[ContextDrop] --- Step 2: Checking user message indicators ---');
  const userIndicators = [
    { name: 'bg-s-color-bg-trans', selector: '[class*="bg-s-color-bg-trans"]' },
    { name: 'data-role="user"', selector: '[data-role="user"]' },
    { name: 'user-message class', selector: '[class*="user-message"]' },
    { name: 'message-user class', selector: '[class*="message-user"]' },
    { name: 'chat-user class', selector: '[class*="chat-user"]' },
  ];

  for (const indicator of userIndicators) {
    const els = document.querySelectorAll(indicator.selector);
    console.log(`[ContextDrop] ${indicator.name}: ${els.length} elements`);
  }

  // 3. 分析页面主结构
  console.log('[ContextDrop] --- Step 3: Analyzing page structure ---');
  const main = document.querySelector('main');
  console.log(`[ContextDrop] Main element: ${main ? 'found' : 'not found'}`);
  if (main) {
    console.log(`[ContextDrop] Main children: ${main.children.length}`);
    // Try to find message containers
    const allDivs = main.querySelectorAll('div');
    console.log(`[ContextDrop] Total divs in main: ${allDivs.length}`);

    // Look for scrollable containers
    const scrollContainers = main.querySelectorAll('[class*="scroll"], [style*="overflow"]');
    console.log(`[ContextDrop] Scroll containers in main: ${scrollContainers.length}`);
  }

  // 4. 分析消息块结构（如果找到）
  console.log('[ContextDrop] --- Step 4: Analyzing message blocks ---');
  const messageBlocks = document.querySelectorAll('[class*="message-block-container"], [class*="message-item"], [data-index]');
  console.log(`[ContextDrop] Found ${messageBlocks.length} potential message blocks`);

  if (messageBlocks.length > 0) {
    messageBlocks.forEach((block, i) => {
      if (i < 5) { // 显示前5个
        const classes = block.className;
        const text = block.textContent?.slice(0, 80) || '';
        const hasTransBg = !!block.querySelector('[class*="bg-s-color-bg-trans"]');
        const hasAvatar = !!block.querySelector('[class*="avatar"], img');
        const hasImg = !!block.querySelector('img');
        console.log(`[ContextDrop] [${i}] Text: "${text}..."`);
        console.log(`[ContextDrop]      Class: "${classes?.slice(0, 60)}"`);
        console.log(`[ContextDrop]      transBg=${hasTransBg}, avatar=${hasAvatar}, img=${hasImg}`);
      }
    });
  } else {
    // 如果没有找到消息块，输出一些HTML帮助调试
    console.log('[ContextDrop] ⚠️ No message blocks found. Dumping main HTML:');
    if (main) {
      console.log(main.innerHTML.slice(0, 2000));
    } else {
      console.log(document.body.innerHTML.slice(0, 2000));
    }
  }

  // 5. 尝试提取消息
  console.log('[ContextDrop] --- Step 5: Trying message extraction ---');
  try {
    const extractor = createMessageExtractor('doubao');
    const title = extractor.extractTitle();
    const messages = extractor.extractMessages();
    console.log(`[ContextDrop] Title: "${title}"`);
    console.log(`[ContextDrop] Messages extracted: ${messages.length}`);
    if (messages.length > 0) {
      messages.slice(0, 5).forEach((m, i) => {
        console.log(`[ContextDrop] [${i}] ${m.role}: "${m.content.slice(0, 60)}..."`);
      });
    } else {
      console.warn('[ContextDrop] ⚠️ No messages extracted - detection may need update');
    }
  } catch (e) {
    console.error('[ContextDrop] Extraction error:', e);
  }

  console.log('[ContextDrop] === Doubao Debug End ===');
}

// Make debug functions available globally for manual console use
// @ts-expect-error - Intentionally exposing for debugging
window.debugDeepSeekPage = debugDeepSeekPage;
// @ts-expect-error - Intentionally exposing for debugging
window.debugDoubaoPage = debugDoubaoPage;

function startCapturing() {
  if (DEBUG) log('Starting capture...');

  // Initial capture with delay to ensure DOM is ready
  setTimeout(tryCapture, 500);

  // Use MutationObserver for instant response to DOM changes
  observer = new MutationObserver(() => {
    // Debounce: only check after a short delay
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = window.setTimeout(tryCapture, 300);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Fallback polling (less frequent, just in case)
  setInterval(tryCapture, 5000);
}

function tryCapture() {
  if (!currentPlatform) {
    return;
  }

  if (!isExtensionContextValid()) {
    return;
  }

  try {
    // For Yuanbao, always re-extract session ID from DOM (URL doesn't change when switching sessions)
    if (currentPlatform === 'yuanbao') {
      const domSessionId = extractSessionIdFromDOM(currentPlatform);
      if (domSessionId && domSessionId !== currentSessionId) {
        currentSessionId = domSessionId;
        // Reset tracking for new session
        lastMessageCount = 0;
        lastMessageHash = '';
        lastSavedMessages = [];
      }
    }

    const extractor = createMessageExtractor(currentPlatform);
    const messages = extractor.extractMessages();

    if (messages.length === 0) {
      return;
    }

    // Fast comparison: count + hash
    const currentHash = hashMessages(messages);

    // Only save if content actually changed
    if (messages.length === lastMessageCount && currentHash === lastMessageHash) {
      return;
    }

    lastMessageCount = messages.length;
    lastMessageHash = currentHash;

    // Save asynchronously without blocking
    saveSessionDebounced(messages);
  } catch (err) {
    if (DEBUG) console.error('[ContextDrop] tryCapture error:', err);
  }
}

function saveSessionDebounced(messages: Message[]) {
  // Debounce saves: wait 800ms before actually saving
  if (saveTimeout) clearTimeout(saveTimeout);

  saveTimeout = window.setTimeout(async () => {
    // Final check: compare content with last saved
    const saveHash = hashMessages(messages);
    const lastSaveHash = hashMessages(lastSavedMessages);

    if (saveHash === lastSaveHash && messages.length === lastSavedMessages.length) {
      return; // No actual change, skip save
    }

    lastSavedMessages = [...messages]; // Copy to avoid reference issues
    await doSave(messages);
  }, 800);
}

async function doSave(messages: Message[]) {
  if (!currentPlatform) return;

  try {
    // For platforms like Yuanbao, try to get session ID from DOM if not set
    if (!currentSessionId || currentSessionId.startsWith('yuanbao-')) {
      const domSessionId = extractSessionIdFromDOM(currentPlatform);
      if (domSessionId) {
        currentSessionId = domSessionId;
      }
    }

    if (!currentSessionId) {
      return;
    }

    const extractor = createMessageExtractor(currentPlatform);
    const title = extractor.extractTitle();

    const now = Date.now();
    const session: Session = {
      id: currentSessionId,
      source: 'platform',
      platform: currentPlatform?.toLowerCase() as Platform,
      title: title || '未命名对话',
      sourceUrl: window.location.href,
      createdAt: now,
      updatedAt: now,
      messages: messages,
      messageCount: messages.length,
    };

    await sessionStorage.saveSessionOptimized(session);
    if (DEBUG) console.log('[ContextDrop] ✓ Saved:', title, `(${messages.length}条消息)`);
  } catch (err: any) {
    if (!err?.message?.includes('Extension context invalidated') && DEBUG) {
      console.error('[ContextDrop] Save failed:', err);
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

  // 处理自动捕获开关
  if (message.type === 'AUTO_CAPTURE_TOGGLE') {
    isAutoCaptureEnabled = message.enabled as boolean;
    console.log('[ContextDrop] Auto capture toggled:', isAutoCaptureEnabled);
    sendResponse({ success: true, enabled: isAutoCaptureEnabled });
    return true;
  }

  // 查询自动捕获状态
  if (message.type === 'AUTO_CAPTURE_STATUS') {
    sendResponse({
      enabled: isAutoCaptureEnabled,
      hasPlatform: !!currentPlatform,
      hasSessionId: !!currentSessionId,
      isConnected: isAutoCaptureEnabled && !!currentPlatform && !!currentSessionId
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
      console.log('[ContextDrop] DeepSeek sidebar check starting...');
      console.log('[ContextDrop] currentPlatform:', currentPlatform);

      // 方法1: 检查会话链接
      const sessionLinks1 = document.querySelectorAll('a[href*="/chat/s/"]');
      const sessionLinks2 = document.querySelectorAll('a[href*="/a/chat/"]');
      const sessionLinks3 = document.querySelectorAll('a[href^="/a/"]');

      console.log(`[ContextDrop] Method 1 (href*="/chat/s/"): ${sessionLinks1.length} links`);
      console.log(`[ContextDrop] Method 2 (href*="/a/chat/"): ${sessionLinks2.length} links`);
      console.log(`[ContextDrop] Method 3 (href^="/a/"): ${sessionLinks3.length} links`);

      // 方法2: 检查侧边栏容器
      const sidebar = document.querySelector('aside') ||
                      document.querySelector('[class*="sidebar"]') ||
                      document.querySelector('[class*="nav"]') ||
                      document.querySelector('[class*="history"]');
      console.log('[ContextDrop] Sidebar element:', sidebar ? sidebar.className : 'not found');

      // 方法3: 检查所有可能的会话项
      const allLinks = document.querySelectorAll('a');
      let chatLinks = 0;
      allLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        if (href.includes('chat')) {
          chatLinks++;
        }
      });
      console.log(`[ContextDrop] Total links with 'chat' in href: ${chatLinks}`);

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

      console.log(`[ContextDrop] DeepSeek sidebar result: ${visibleCount} visible links, sidebar: ${!!sidebar}, final: ${sidebarVisible}`);
      sendResponse({ sidebarVisible: true }); // 暂时总是返回 true，让用户能继续操作
    } else if (currentPlatform === 'kimi') {
      // Kimi: 检查会话列表是否可见
      console.log('[ContextDrop] Kimi sidebar check starting...');

      // 检查 .chat-info-item 链接
      const sessionLinks = document.querySelectorAll('.chat-info-item a[href*="/chat/"]');
      console.log(`[ContextDrop] Kimi: Found ${sessionLinks.length} session links`);

      // 检查侧边栏
      const sidebar = document.querySelector('.sidebar');
      console.log('[ContextDrop] Kimi sidebar:', sidebar ? 'found' : 'not found');

      // 检查可见的会话链接
      let visibleCount = 0;
      sessionLinks.forEach(link => {
        const rect = link.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          visibleCount++;
        }
      });

      const sidebarVisible = visibleCount > 0 || (sidebar !== null && sidebar.getBoundingClientRect().width > 0);
      console.log(`[ContextDrop] Kimi sidebar result: ${visibleCount} visible links, final: ${sidebarVisible}`);
      sendResponse({ sidebarVisible: true }); // 暂时总是返回 true
    } else if (currentPlatform === 'gemini') {
      // Gemini: 检查会话列表是否可见
      console.log('[ContextDrop] Gemini sidebar check starting...');

      // 检查 /app/ 链接
      const sessionLinks = document.querySelectorAll('a[href^="/app/"]');
      console.log(`[ContextDrop] Gemini: Found ${sessionLinks.length} session links`);

      // 检查侧边栏
      const sidebar = document.querySelector('nav, aside, [class*="sidebar"], [class*="nav"]');
      console.log('[ContextDrop] Gemini sidebar:', sidebar ? 'found' : 'not found');

      // 检查可见的会话链接
      let visibleCount = 0;
      sessionLinks.forEach(link => {
        const rect = link.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          visibleCount++;
        }
      });

      const sidebarVisible = visibleCount > 0 || (sidebar !== null && sidebar.getBoundingClientRect().width > 0);
      console.log(`[ContextDrop] Gemini sidebar result: ${visibleCount} visible links, final: ${sidebarVisible}`);
      sendResponse({ sidebarVisible: true }); // 暂时总是返回 true
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

  // 处理注入请求
  if (message.type === 'INJECT_CONTEXT') {
    if (!currentPlatform) {
      sendResponse({ success: false, error: '未检测到支持的平台' });
      return true;
    }

    const result = injectToInput(message.content, currentPlatform);
    sendResponse(result);
    return true;
  }

  return false;
});
