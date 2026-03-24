import type { Platform, Session } from '../types';
import { formatPlatformName } from './extractor';
import { formatTimestamp } from './formatter';
import { estimateTokens } from './token-counter';

/**
 * 各平台的输入框选择器配置
 * 按优先级排列，第一个匹配到的使用
 */
export const INPUT_SELECTORS: Record<Platform, string[]> = {
  doubao: [
    '[contenteditable="true"][class*="editor"]',
    '[contenteditable="true"][class*="input"]',
    '[contenteditable="true"]',
    'textarea[class*="input"]',
    'textarea'
  ],
  yuanbao: [
    '[contenteditable="true"][class*="input"]',
    '[contenteditable="true"]',
    'textarea[class*="input"]',
    'textarea'
  ],
  claude: [
    'div[contenteditable="true"]',
    '[contenteditable="true"]',
    'textarea'
  ],
  deepseek: [
    'textarea[id*="input"]',
    'textarea[placeholder]',
    'textarea',
    '[contenteditable="true"]'
  ],
  kimi: [
    '.chat-input textarea',
    'textarea[placeholder*="输入"]',
    'textarea[placeholder*="发送"]',
    'textarea[class*="input"]',
    'textarea[placeholder]',
    'div[contenteditable="true"][class*="input"]',
    'div[contenteditable="true"][class*="editor"]',
    '[contenteditable="true"]',
    'textarea'
  ],
  gemini: [
    'textarea[aria-label*="输入"]',
    'textarea[placeholder]',
    'textarea',
    '[contenteditable="true"]'
  ],
  chatgpt: [
    'textarea#prompt-textarea',
    'textarea[data-id*="root"]',
    'textarea',
    '[contenteditable="true"]'
  ],
};

/**
 * 注入统计信息
 */
export interface InjectStats {
  tokenCount: number;
  charCount: number;
  messageCount: number;
  platform: Platform;
  maxTokens: number;
  needsTruncation: boolean;
}

/**
 * 获取注入统计信息
 */
export function getInjectStats(
  content: string,
  messageCount: number,
  platform: Platform,
  maxTokens: number
): InjectStats {
  const tokenCount = estimateTokens(content);
  const charCount = content.length;

  return {
    tokenCount,
    charCount,
    messageCount,
    platform,
    maxTokens,
    needsTruncation: tokenCount > maxTokens * 0.8,
  };
}

/**
 * 截断会话到最近 N 条消息
 */
export function truncateSession(session: Session, keepCount: number): Session {
  const truncatedMessages = session.messages.slice(-keepCount);

  return {
    ...session,
    messages: truncatedMessages,
    messageCount: truncatedMessages.length,
  };
}

/**
 * 格式化会话用于注入（支持截断）
 */
export function formatSessionForInject(
  session: Session,
  keepMessages?: number
): string {
  const platformName = session.platform ? formatPlatformName(session.platform) : 'AI';
  const timestamp = formatTimestamp(session.createdAt);

  // 如果指定了保留消息数，截断消息
  const messages = keepMessages
    ? session.messages.slice(-keepMessages)
    : session.messages;

  const content = messages
    .map((msg) => {
      const role = msg.role === 'user' ? '用户' : platformName;
      return `[${role}] ${msg.content}`;
    })
    .join('\n\n');

  const messageInfo = keepMessages && keepMessages < session.messageCount
    ? `（保留最近 ${keepMessages}/${session.messageCount} 条）`
    : '';

  return `【上下文引用】
以下是我之前在${platformName}的对话记录${messageInfo}：

---
会话: ${session.title}
来源: ${platformName}
日期: ${timestamp}

${content}
---

基于以上背景，请帮我继续...
`;
}

/**
 * 查找输入框元素
 */
export function findInputElement(platform: Platform): HTMLElement | null {
  const selectors = INPUT_SELECTORS[platform] || [];
  console.log(`[ContextDrop] Finding input for ${platform}, trying ${selectors.length} selectors`);

  for (const selector of selectors) {
    // 尝试所有匹配的元素，找到可见的那个
    const elements = document.querySelectorAll<HTMLElement>(selector);
    console.log(`[ContextDrop] Selector "${selector}": found ${elements.length} elements`);

    for (const el of elements) {
      // 检查元素是否可见
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log(`[ContextDrop] Found visible input element: ${el.tagName}, class="${el.className}"`);
        return el;
      }
    }
  }

  console.warn(`[ContextDrop] No visible input element found for ${platform}`);
  return null;
}

/**
 * 填充输入框
 * @param element 输入框元素
 * @param content 要填充的内容
 * @returns 是否成功
 */
export function fillInputElement(element: HTMLElement, content: string): boolean {
  try {
    // 先聚焦元素
    element.focus();

    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      // textarea 或 input
      const textarea = element as HTMLTextAreaElement;
      textarea.value = content;

      // 触发 React/Vue 等框架的输入事件
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(textarea, content);
      }
    } else if (element.isContentEditable || element.contentEditable === 'true') {
      // contenteditable 元素
      // 清空现有内容
      element.textContent = '';

      // 尝试使用 execCommand（对某些富文本编辑器更可靠）
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);

      // 使用 execCommand 插入文本
      const success = document.execCommand('insertText', false, content);
      if (!success) {
        // 回退到 textContent
        element.textContent = content;
      }
    } else {
      return false;
    }

    // 触发必要的事件，让平台识别内容变化
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    // 某些框架需要 keydown/keyup 事件
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));

    // 再次触发 input 事件确保框架更新
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: content
    }));

    return true;
  } catch (e) {
    console.error('[ContextDrop] Failed to fill input:', e);
    return false;
  }
}

/**
 * 注入内容到目标平台
 * 这个函数在 content script 中调用
 */
export function injectToInput(content: string, platform: Platform): { success: boolean; error?: string } {
  console.log(`[ContextDrop] injectToInput called for ${platform}, content length: ${content.length}`);

  const inputEl = findInputElement(platform);

  if (!inputEl) {
    console.error(`[ContextDrop] Input element not found for ${platform}`);
    return { success: false, error: '未找到输入框，请确保页面已完全加载' };
  }

  const success = fillInputElement(inputEl, content);

  if (!success) {
    console.error(`[ContextDrop] Failed to fill input element`);
    return { success: false, error: '填充输入框失败' };
  }

  // 聚焦输入框
  inputEl.focus();
  console.log(`[ContextDrop] Successfully injected content to ${platform}`);

  return { success: true };
}
