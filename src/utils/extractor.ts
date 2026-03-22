import type { Platform, Message } from '../types';

interface PlatformConfig {
  hostname: string;
  titleSelectors: string[];
  messageSelectors: {
    container: string;
    user: string;
    assistant: string;
  };
}

const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  doubao: {
    hostname: 'doubao.com',
    titleSelectors: [
      '[class*="chat-title"]',
      '[class*="header-title"]',
      'h1[class*="title"]',
      '[data-testid="chat-title"]',
      '[class*="conversation-title"]',
      '[class*="session-title"]',
      'title',
    ],
    messageSelectors: {
      container: '[class*="message-list"], [class*="chat-container"], [class*="conversation-content"], [class*="message-container"]',
      user: '[class*="message-block-container"] [class*="bg-s-color-bg-trans"], [class*="user-message"], [data-role="user"]',
      assistant: '[class*="message-block-container"]:not(:has([class*="bg-s-color-bg-trans"])), [class*="bot-message"], [class*="ai-message"], [data-role="assistant"]',
    },
  },
  yuanbao: {
    hostname: 'yuanbao.tencent.com',
    titleSelectors: [
      '.session-title',
      '.chat-title',
      '.active .title',
      '[data-testid="session-title"]',
      '[class*="chat-title"]',
      '[class*="session-title"]',
      'title',
    ],
    messageSelectors: {
      container: '[class*="agent-chat__list"], [class*="chat-list"], [class*="message-list"]',
      user: '[class*="bubble--human"], [class*="chat__bubble--human"]',
      assistant: '[class*="bubble--ai"], [class*="chat__bubble--ai"]',
    },
  },
  claude: {
    hostname: 'claude.ai',
    titleSelectors: [
      '[data-testid="chat-title-button"]',  // Most reliable
      'title',
    ],
    messageSelectors: {
      container: '[data-testid="sidebar-history"]',  // Only for placeholder, actual extraction uses dedicated methods
      user: '[data-testid="user-message"]',
      assistant: '[class*="font-claude-response"], [class*="font-claude-message"]',
    },
  },
  deepseek: {
    hostname: 'chat.deepseek.com',
    titleSelectors: [
      'title',
      '[class*="chat-title"]',
      '[class*="conversation-title"]',
      '[class*="session-title"]',
      'h1',
    ],
    messageSelectors: {
      // DeepSeek uses CSS Modules with hashed class names
      // ds-message is the stable part, user messages have additional class d29f3d7d
      container: '[class*="ds-scroll-area"], main, [class*="chat-container"]',
      user: '[class*="ds-message"][class*="d29f3d7d"], [class*="ds-chat-message--user"]',
      assistant: '[class*="ds-message"]:not([class*="d29f3d7d"]), [class*="ds-chat-message--assistant"]',
    },
  },
  kimi: {
    hostname: 'kimi.com',
    titleSelectors: [
      'title',
      '.chat-name',
      '[class*="chat-title"]',
      '[class*="session-title"]',
      'h1',
    ],
    messageSelectors: {
      // Kimi uses semantic class names
      container: '.chat-content-list, .message-list, [class*="chat-content"]',
      user: '.chat-content-item-user, .segment-user',
      assistant: '.chat-content-item-assistant, .segment-assistant',
    },
  },
  gemini: {
    hostname: 'gemini.google.com',
    titleSelectors: [
      '[class*="conversation-title"]',
      '[class*="chat-title"]',
      '[data-test-id="conversation-title"]',
      // 注意：不使用 h1 和 title，因为它们会匹配 "Google Gemini" 页面标题
    ],
    messageSelectors: {
      // Gemini uses Material Design components
      container: 'main, [class*="conversation-container"], [class*="chat-container"], [data-test-id="conversation-panel"]',
      user: '[class*="user-query"], [class*="user-message"], [data-test-id="user-query"]',
      assistant: '[class*="response-container"], [class*="model-response"], [data-test-id="model-response"]',
    },
  },
  chatgpt: {
    hostname: 'chatgpt.com',
    titleSelectors: [
      '[class*="conversation-title"]',
      '[class*="chat-title"]',
      '[data-testid="conversation-title"]',
      'h1',
      'title',
    ],
    messageSelectors: {
      // ChatGPT uses data-testid with conversation-turn pattern
      // Even turns are user messages, odd turns are assistant messages
      container: '[data-testid^="conversation-turn-"], [class*="ThreadLayout__NodeWrapper"]',
      user: '[data-testid^="conversation-turn-"]:nth-child(even) [class*="ConversationItem__ConversationItemWrapper-sc"]',
      assistant: '[data-testid^="conversation-turn-"]:nth-child(odd) [class*="ConversationItem__ConversationItemWrapper-sc"]',
    },
  },
};

export function detectPlatform(url: string): Platform | null {
  const hostname = new URL(url).hostname;

  if (hostname.includes('doubao.com')) return 'doubao';
  if (hostname.includes('yuanbao.tencent.com')) return 'yuanbao';
  if (hostname.includes('claude.ai')) return 'claude';
  if (hostname.includes('deepseek.com')) return 'deepseek';
  if (hostname.includes('kimi.com')) return 'kimi';
  if (hostname.includes('gemini.google.com')) return 'gemini';
  if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) return 'chatgpt';

  return null;
}

export function extractSessionId(url: string, platform: Platform): string {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);

  // Platform-specific extraction
  if (platform === 'yuanbao') {
    // Yuanbao may use query param or hash for session ID
    // Check query params first
    const chatId = urlObj.searchParams.get('chatId') || urlObj.searchParams.get('id');
    if (chatId) return chatId;

    // Check hash
    if (urlObj.hash && urlObj.hash.length > 1) {
      const hashPart = urlObj.hash.slice(1).split('/')[0];
      if (hashPart && hashPart.length >= 4) return hashPart;
    }

    // Check path for UUID pattern
    for (const part of pathParts) {
      // UUID pattern or long ID
      if (part && part !== 'chat' && part.length >= 8) {
        return part;
      }
    }

    // IMPORTANT: For Yuanbao, the session ID is typically in the DOM, not the URL
    // This fallback will be overridden by extractSessionIdFromDOM in content script
    // Use a timestamp-based ID to avoid collisions during initial load
    console.warn('[OmniContext] Yuanbao session ID not found in URL, will extract from DOM');
  }

  // Claude: URL format is /chat/{sessionId}
  if (platform === 'claude') {
    const chatIndex = pathParts.indexOf('chat');
    if (chatIndex !== -1 && chatIndex + 1 < pathParts.length) {
      const sessionId = pathParts[chatIndex + 1];
      if (sessionId && sessionId.length >= 4) {
        return sessionId;
      }
    }
  }

  // DeepSeek: URL format is /a/chat/s/{sessionId}
  if (platform === 'deepseek') {
    // Look for the session ID after '/s/' in the path
    const sIndex = pathParts.indexOf('s');
    if (sIndex !== -1 && sIndex + 1 < pathParts.length) {
      const sessionId = pathParts[sIndex + 1];
      if (sessionId && sessionId.length >= 4) {
        return sessionId;
      }
    }

    // Fallback: look for any UUID-like segment
    for (const part of pathParts) {
      // DeepSeek session IDs are typically UUIDs or long alphanumeric strings
      if (part && part.length >= 8 && /^[a-zA-Z0-9_-]+$/.test(part)) {
        return part;
      }
    }
  }

  // Kimi: URL format is /chat/{sessionId}
  if (platform === 'kimi') {
    const chatIndex = pathParts.indexOf('chat');
    if (chatIndex !== -1 && chatIndex + 1 < pathParts.length) {
      const sessionId = pathParts[chatIndex + 1];
      if (sessionId && sessionId.length >= 4) {
        return sessionId;
      }
    }
  }

  // Gemini: URL format is /app/{sessionId}
  if (platform === 'gemini') {
    const appIndex = pathParts.indexOf('app');
    if (appIndex !== -1 && appIndex + 1 < pathParts.length) {
      const sessionId = pathParts[appIndex + 1];
      if (sessionId && sessionId.length >= 4) {
        return sessionId;
      }
    }
  }

  // ChatGPT: URL format is /c/{sessionId} or /g/{gizmoId}/c/{sessionId} for GPTs
  if (platform === 'chatgpt') {
    // Look for /c/ pattern in the path
    const cIndex = pathParts.indexOf('c');
    if (cIndex !== -1 && cIndex + 1 < pathParts.length) {
      const sessionId = pathParts[cIndex + 1];
      if (sessionId && sessionId.length >= 4) {
        return sessionId;
      }
    }

    // Check for /g/{gizmoId}/c/{sessionId} pattern
    const gIndex = pathParts.indexOf('g');
    if (gIndex !== -1) {
      const cAfterG = pathParts.indexOf('c', gIndex);
      if (cAfterG !== -1 && cAfterG + 1 < pathParts.length) {
        const sessionId = pathParts[cAfterG + 1];
        if (sessionId && sessionId.length >= 4) {
          return sessionId;
        }
      }
    }
  }

  // Default: try to find UUID or ID in path
  for (const part of pathParts) {
    if (part && part !== 'chat' && part !== 'c' && part.length >= 4) {
      return part;
    }
  }

  // Check query params as fallback
  const queryId = urlObj.searchParams.get('chatId') ||
                  urlObj.searchParams.get('id') ||
                  urlObj.searchParams.get('session');
  if (queryId) return queryId;

  // Check hash as fallback
  if (urlObj.hash && urlObj.hash.length > 1) {
    const hashPart = urlObj.hash.slice(1).split('/')[0];
    if (hashPart && hashPart.length >= 4 && hashPart !== 'chat') return hashPart;
  }

  // Fallback: use path hash as session ID
  // This ensures different URLs get different IDs even if no explicit ID found
  const pathHash = pathParts.join('/') || 'root';
  return `${platform}-${simpleHash(pathHash)}`;
}

/**
 * Extract session ID from DOM (for platforms like Yuanbao where ID is not in URL)
 * This should be called from content script after page loads
 */
export function extractSessionIdFromDOM(platform: Platform): string | null {
  if (platform === 'yuanbao') {
    // Method 1: Check active session in sidebar
    const activeItem = document.querySelector('.yb-recent-conv-list__item.active [data-item-id]');
    if (activeItem) {
      const id = activeItem.getAttribute('data-item-id');
      if (id) {
        console.log('[OmniContext] Found Yuanbao session ID from active sidebar item:', id);
        return id;
      }
    }

    // Method 2: Check dt-cid attribute on active item
    const activeByCid = document.querySelector('.yb-recent-conv-list__item.active');
    if (activeByCid) {
      const cid = activeByCid.getAttribute('dt-cid');
      if (cid) {
        console.log('[OmniContext] Found Yuanbao session ID from dt-cid:', cid);
        return cid;
      }
    }

    // Method 3: Check data-conv-id on message items (format: sessionId_msgIndex)
    const messageItem = document.querySelector('.agent-chat__list__item[data-conv-id]');
    if (messageItem) {
      const convId = messageItem.getAttribute('data-conv-id');
      if (convId) {
        // Extract session ID from format like "uuid_1"
        const parts = convId.split('_');
        if (parts.length >= 1) {
          const sessionId = parts.slice(0, -1).join('_') || convId;
          console.log('[OmniContext] Found Yuanbao session ID from message data-conv-id:', sessionId);
          return sessionId;
        }
      }
    }

    // Method 4: Check URL for any dynamic updates
    const currentUrl = window.location.href;
    const urlObj = new URL(currentUrl);

    // Some versions might use query params
    const chatId = urlObj.searchParams.get('chatId') ||
                   urlObj.searchParams.get('id') ||
                   urlObj.searchParams.get('cid');
    if (chatId) {
      console.log('[OmniContext] Found Yuanbao session ID from URL params:', chatId);
      return chatId;
    }

    console.warn('[OmniContext] Could not extract Yuanbao session ID from DOM');
    return null;
  }

  return null;
}

// Simple string hash function
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function formatPlatformName(platform: Platform | string): string {
  const names: Record<string, string> = {
    doubao: '豆包',
    yuanbao: '元宝',
    claude: 'Claude',
    deepseek: 'DeepSeek',
    kimi: 'Kimi',
    gemini: 'Gemini',
    chatgpt: 'ChatGPT',
  };
  return names[platform?.toLowerCase()] || platform;
}

export interface MessageExtractor {
  platform: Platform;
  extractTitle(): string;
  extractMessages(): Message[];
}

class PlatformMessageExtractor implements MessageExtractor {
  constructor(public platform: Platform) {}

  private get config(): PlatformConfig {
    return PLATFORM_CONFIGS[this.platform];
  }

  extractTitle(): string {
    // Try each selector
    for (const selector of this.config.titleSelectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    // Fallback: use first user message or default
    const firstUserMessage = document.querySelector(this.config.messageSelectors.user);
    if (firstUserMessage?.textContent?.trim()) {
      const text = firstUserMessage.textContent.trim();
      return text.slice(0, 20) + (text.length > 20 ? '...' : '');
    }

    return `未命名对话 - ${new Date().toLocaleDateString()}`;
  }

  extractMessages(): Message[] {
    // Special handling for each platform
    if (this.platform === 'doubao') {
      return this.extractDoubaoMessages();
    }

    if (this.platform === 'yuanbao') {
      return this.extractYuanbaoMessages();
    }

    if (this.platform === 'claude') {
      return this.extractClaudeMessages();
    }

    if (this.platform === 'deepseek') {
      return this.extractDeepseekMessages();
    }

    if (this.platform === 'kimi') {
      return this.extractKimiMessages();
    }

    if (this.platform === 'gemini') {
      return this.extractGeminiMessages();
    }

    if (this.platform === 'chatgpt') {
      return this.extractChatgptMessages();
    }

    const messages: Message[] = [];
    const container = document.querySelector(this.config.messageSelectors.container);

    if (!container) {
      return this.extractMessagesFromDocument();
    }

    const allElements = container.querySelectorAll(
      `${this.config.messageSelectors.user}, ${this.config.messageSelectors.assistant}`
    );

    allElements.forEach((el, index) => {
      const isUser = el.matches(this.config.messageSelectors.user);
      const content = this.extractTextContent(el);

      if (content) {
        messages.push({
          id: `${this.platform}-msg-${index}`,
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
      }
    });

    return messages;
  }

  private extractDoubaoMessages(): Message[] {
    const messages: Message[] = [];

    // 豆包 2026 新版 DOM 结构选择器
    const selectors = [
      '[class*="inner-item"]',  // 新版消息项
      '[class*="container-Pv"]',  // 新版消息容器
      '[class*="message-block-container"]',
      '[class*="message-block"]',
      '[class*="chat-message"]',
      '[class*="message-item"]',
      '[class*="msg-container"]',
    ];

    let messageBlocks: NodeListOf<Element> | Element[] = [];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        messageBlocks = elements;
        console.log(`[OmniContext] Doubao: found ${elements.length} elements with selector: ${selector}`);
        break;
      }
    }

    if (messageBlocks.length === 0) {
      console.warn('[OmniContext] No message blocks found, trying fallback extraction');
      return this.extractMessagesFromDocument();
    }

    messageBlocks.forEach((block, index) => {
      // 豆包新版：关键判断依据是 markdown
      // markdown=true → 助手消息，markdown=false → 用户消息
      const hasMarkdown = !!block.querySelector('[class*="markdown"], [class*="flow-markdown"]');

      // 助手消息特征：有 markdown 内容
      const isAssistantMessage = hasMarkdown;

      if (!isAssistantMessage) {
        // User message
        const contentElement = block.querySelector('[class*="content-"]') ||
                               block.querySelector('[class*="container-"]') ||
                               block.querySelector('[class*="message-content"]') ||
                               block;
        const content = this.extractTextContent(contentElement);
        if (content && content.length > 0) {
          messages.push({
            id: `doubao-msg-${index}`,
            role: 'user',
            content,
            timestamp: Date.now(),
          });
        }
      } else {
        // Assistant message
        const contentElement = block.querySelector('[class*="flow-markdown"]') ||
                               block.querySelector('[class*="markdown"]') ||
                               block.querySelector('[class*="content-"]') ||
                               block.querySelector('[class*="container-"]') ||
                               block;
        const content = this.extractDoubaoAssistantContent(contentElement);
        if (content && content.length > 0) {
          messages.push({
            id: `doubao-msg-${index}`,
            role: 'assistant',
            content,
            timestamp: Date.now(),
          });
        }
      }
    });

    console.log(`[OmniContext] Doubao: extracted ${messages.length} messages`);
    return messages;
  }

  private extractDoubaoAssistantContent(element: Element): string {
    // For Doubao with thinking mode, we need to:
    // 1. Find all text content
    // 2. Filter out thinking sections (usually marked with special classes)
    // 3. Keep only the final answer

    const allText = element.textContent || '';

    // Check if this contains thinking markers
    // Common patterns: "思考中...", thinking sections with special styling
    const thinkingPatterns = [
      /思考中[\.。]+/,
      / thinking[\.。]+/i,
    ];

    // If there's a clear separator between thinking and answer, use it
    const separators = ['</think>', '正式回答：', '回答：', '最终答案：'];

    for (const separator of separators) {
      const parts = allText.split(separator);
      if (parts.length > 1) {
        // Return the part after the last separator
        return parts[parts.length - 1].trim();
      }
    }

    // Try to find content after thinking section by looking for structural indicators
    const children = Array.from(element.children);
    let foundThinking = false;
    let finalContent = '';

    for (const child of children) {
      const text = child.textContent || '';

      // Skip thinking indicators
      if (thinkingPatterns.some(p => p.test(text))) {
        foundThinking = true;
        continue;
      }

      // Skip elements that look like thinking sections (often have special styling)
      const className = child.className || '';
      if (className.includes('thinking') || className.includes('thought')) {
        foundThinking = true;
        continue;
      }

      // If we've passed the thinking section, collect content
      if (foundThinking && text.length > 0) {
        finalContent += text + '\n';
      }
    }

    if (finalContent.length > 0) {
      return finalContent.trim();
    }

    // Fallback: return all content if we can't distinguish
    return this.extractTextContent(element);
  }

  private extractYuanbaoMessages(): Message[] {
    const messages: Message[] = [];

    // Yuanbao uses agent-chat__list as container, bubble--human/bubble--ai for messages
    const containerSelectors = [
      '[class*="agent-chat__list"]',
      '[class*="chat-list"]',
      '[class*="message-list"]',
    ];

    let container: Element | null = null;
    for (const selector of containerSelectors) {
      container = document.querySelector(selector);
      if (container) break;
    }

    // Find all bubble elements (user and AI)
    const userBubbles = document.querySelectorAll('[class*="bubble--human"]');
    const aiBubbles = document.querySelectorAll('[class*="bubble--ai"]');

    if (userBubbles.length === 0 && aiBubbles.length === 0) {
      return this.extractYuanbaoFromDocument();
    }

    // Collect all elements with their roles
    const allElements: Array<{ el: Element; isUser: boolean }> = [
      ...Array.from(userBubbles).map(el => ({ el, isUser: true })),
      ...Array.from(aiBubbles).map(el => ({ el, isUser: false })),
    ];

    // Sort by DOM position
    allElements.sort((a, b) => {
      const position = a.el.compareDocumentPosition(b.el);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    allElements.forEach(({ el, isUser }, index) => {
      const content = isUser
        ? this.extractYuanbaoUserContent(el)
        : this.extractYuanbaoAssistantContent(el);

      if (content) {
        messages.push({
          id: `yuanbao-msg-${index}`,
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
      }
    });

    return messages;
  }

  private extractYuanbaoFromDocument(): Message[] {
    const messages: Message[] = [];

    // Fallback: search entire document for Yuanbao bubble elements
    const userSelectors = [
      '[class*="bubble--human"]',
      '[class*="chat__bubble--human"]',
    ];

    const assistantSelectors = [
      '[class*="bubble--ai"]',
      '[class*="chat__bubble--ai"]',
    ];

    // Collect all elements with their roles
    const allElements: Array<{ el: Element; isUser: boolean }> = [];

    for (const selector of userSelectors) {
      document.querySelectorAll(selector).forEach(el => {
        allElements.push({ el, isUser: true });
      });
    }

    for (const selector of assistantSelectors) {
      document.querySelectorAll(selector).forEach(el => {
        allElements.push({ el, isUser: false });
      });
    }

    // Sort by DOM position
    allElements.sort((a, b) => {
      const position = a.el.compareDocumentPosition(b.el);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    allElements.forEach(({ el, isUser }, index) => {
      const content = isUser
        ? this.extractYuanbaoUserContent(el)
        : this.extractYuanbaoAssistantContent(el);

      if (content) {
        messages.push({
          id: `yuanbao-msg-${index}`,
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
      }
    });

    return messages;
  }

  private extractYuanbaoUserContent(element: Element): string {
    // Try common content selectors
    const contentSelectors = [
      '[class*="content"]',
      '[class*="text"]',
      '[class*="message-body"]',
      '.content',
      'p',
    ];

    for (const selector of contentSelectors) {
      const contentEl = element.querySelector(selector);
      if (contentEl?.textContent?.trim()) {
        return contentEl.textContent.trim();
      }
    }

    return element.textContent?.trim() || '';
  }

  private extractYuanbaoAssistantContent(element: Element): string {
    // Yuanbao thinking mode patterns
    // Try to find the final answer section
    const answerSelectors = [
      '[class*="answer"]',
      '[class*="final"]',
      '[class*="response"]',
      '[class*="result"]',
      '[class*="output"]',
    ];

    for (const selector of answerSelectors) {
      const answerEl = element.querySelector(selector);
      if (answerEl?.textContent?.trim()) {
        const text = answerEl.textContent.trim();
        // Make sure it's not just thinking content
        if (!this.isYuanbaoThinkingContent(text)) {
          return text;
        }
      }
    }

    // Try to filter thinking content from full text
    const fullText = element.textContent || '';

    // Common thinking mode markers in Yuanbao
    const thinkingMarkers = [
      '思考过程',
      '思考中',
      '正在思考',
      'Think',
      'Thinking',
    ];

    // Try to find separator patterns
    for (const marker of thinkingMarkers) {
      if (fullText.includes(marker)) {
        // Try to find content after thinking section
        const parts = fullText.split(new RegExp(`${marker}[\\s\\S]*?(?=[\n\r]{2}|$)`, 'i'));
        if (parts.length > 1 && parts[parts.length - 1].trim()) {
          return parts[parts.length - 1].trim();
        }
      }
    }

    // Check for thinking-related class names and skip them
    const children = Array.from(element.children);
    let finalContent = '';

    for (const child of children) {
      const className = (child.className || '').toLowerCase();

      // Skip thinking sections
      if (className.includes('thinking') ||
          className.includes('thought') ||
          className.includes('reasoning') ||
          className.includes('process')) {
        continue;
      }

      const text = child.textContent?.trim() || '';
      if (text && !this.isYuanbaoThinkingContent(text)) {
        finalContent += text + '\n';
      }
    }

    if (finalContent.trim()) {
      return finalContent.trim();
    }

    // Fallback: return cleaned full text
    return this.cleanYuanbaoContent(fullText);
  }

  private isYuanbaoThinkingContent(text: string): boolean {
    const thinkingPatterns = [
      /^思考[过程中]/,
      /^Think(ing)?[:：]/i,
      /^正在分析/,
      /^推理过程/,
    ];

    return thinkingPatterns.some(p => p.test(text.trim()));
  }

  private cleanYuanbaoContent(text: string): string {
    // Remove common thinking prefixes
    const prefixes = [
      /【思考】[\s\S]*?【回答】/,
      /<thinking>[\s\S]*?<\/thinking>/gi,
      /思考过程：[\s\S]*?(?=\n\n|回答)/,
    ];

    let cleaned = text;
    for (const prefix of prefixes) {
      cleaned = cleaned.replace(prefix, '');
    }

    return cleaned.trim();
  }

  private extractClaudeMessages(): Message[] {
    const messages: Message[] = [];

    // First, try to find all messages directly without turn containers
    const userMessages = document.querySelectorAll('[data-testid="user-message"]');
    const assistantMessages = document.querySelectorAll('[class*="font-claude-response"], [class*="font-claude-message"]');

    // If we found messages, use them directly
    if (userMessages.length > 0 || assistantMessages.length > 0) {
      type MessageElement = { element: Element; role: 'user' | 'assistant'; index: number };
      const userMsgs: MessageElement[] = Array.from(userMessages).map(el => ({
        element: el,
        role: 'user' as const,
        index: 0
      }));
      const assistantMsgs: MessageElement[] = Array.from(assistantMessages).map(el => ({
        element: el,
        role: 'assistant' as const,
        index: 0
      }));
      let allMessages = [...userMsgs, ...assistantMsgs];

      // Sort by DOM position
      allMessages.sort((a, b) => {
        const aRect = a.element.getBoundingClientRect();
        const bRect = b.element.getBoundingClientRect();
        return aRect.top - bRect.top;
      });

      // Extract content
      allMessages.forEach((msg, index) => {
        let content = '';
        if (msg.role === 'user') {
          content = this.extractClaudeUserContent(msg.element);
        } else {
          content = this.extractClaudeAssistantContent(msg.element);
        }

        if (content) {
          messages.push({
            id: `claude-msg-${index}`,
            role: msg.role,
            content,
            timestamp: Date.now()
          });
        }
      });

      return messages;
    }

    // Fallback: try turn containers
    const turnSelectors = [
      'div.flex.flex-col.gap-3.pt-6',  // Primary turn container
      '[class*="flex"][class*="flex-col"][class*="gap-3"]',  // Fallback
    ];

    let turns: NodeListOf<Element> | null = null;
    for (const sel of turnSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length >= 1) {
        turns = found;
        break;
      }
    }

    if (!turns || turns.length === 0) {
      return this.extractClaudeFromDocument();
    }

    turns.forEach((turn, index) => {
      // User message detection
      const userEl = turn.querySelector('[data-testid="user-message"]');
      if (userEl) {
        const content = this.extractClaudeUserContent(userEl);
        if (content) {
          messages.push({
            id: `claude-msg-${index}`,
            role: 'user',
            content,
            timestamp: Date.now()
          });
        }
      }
      // Assistant message detection
      else {
        const assistantEl = turn.querySelector(
          '[class*="font-claude-response"], [class*="font-claude-message"], div[class*="claude"]'
        );
        if (assistantEl) {
          const content = this.extractClaudeAssistantContent(assistantEl);
          if (content) {
            messages.push({
              id: `claude-msg-${index}`,
              role: 'assistant',
              content,
              timestamp: Date.now()
            });
          }
        }
      }
    });

    return messages;
  }

  private extractClaudeFromDocument(): Message[] {
    const messages: Message[] = [];

    // Fallback for Claude
    const allElements: Array<{ el: Element; isUser: boolean }> = [];

    // User messages
    document.querySelectorAll('[class*="human"], [class*="user-message"]').forEach(el => {
      allElements.push({ el, isUser: true });
    });

    // Assistant messages
    document.querySelectorAll('[class*="assistant"], [class*="claude-message"], [class*="font-claude-response"]').forEach(el => {
      allElements.push({ el, isUser: false });
    });

    // Sort by DOM position
    allElements.sort((a, b) => {
      const position = a.el.compareDocumentPosition(b.el);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    allElements.forEach(({ el, isUser }, index) => {
      const content = isUser
        ? this.extractClaudeUserContent(el)
        : this.extractClaudeAssistantContent(el);

      if (content) {
        messages.push({
          id: `claude-msg-${index}`,
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
      }
    });

    return messages;
  }

  private extractClaudeUserContent(element: Element): string {
    // Direct text content extraction (Claude user messages are plain text)
    return element.textContent?.trim() || '';
  }

  private extractClaudeAssistantContent(element: Element): string {
    // Check for Extended Thinking block (if present)
    const thinkingBlock = element.querySelector(
      '[class*="thinking"], [class*="thought"], [data-thinking]'
    );

    if (thinkingBlock) {
      // Clone element and remove thinking block
      const clone = element.cloneNode(true) as Element;
      clone.querySelector('[class*="thinking"], [class*="thought"], [data-thinking]')?.remove();
      const remaining = clone.textContent?.trim();
      if (remaining && remaining.length > 5) {
        return remaining;
      }
    }

    // Fallback to direct content extraction
    return this.cleanClaudeContent(element.textContent || '');
  }

  private cleanClaudeContent(text: string): string {
    // Remove Extended Thinking sections
    const patterns = [
      /\[Thinking\][\s\S]*?\[\/Thinking\]/gi,
      /<thinking>[\s\S]*?<\/thinking>/gi,
      /Thinking:\n[\s\S]*?(?=\n\n|Response|Answer)/i,
    ];

    let cleaned = text;
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.trim();
  }

  private extractDeepseekMessages(): Message[] {
    const messages: Message[] = [];

    console.log('[OmniContext] Extracting DeepSeek messages...');

    // DeepSeek uses CSS Modules with hashed class names
    // Try multiple selectors to find messages

    // 方法1: 查找 ds-message 类
    let allMessages = document.querySelectorAll('[class*="ds-message"]');
    console.log(`[OmniContext] Method 1 (ds-message): Found ${allMessages.length} elements`);

    // 方法2: 查找包含 chat 的类
    if (allMessages.length === 0) {
      allMessages = document.querySelectorAll('[class*="chat-message"], [class*="message-item"], [class*="Message"]');
      console.log(`[OmniContext] Method 2 (chat-message): Found ${allMessages.length} elements`);
    }

    // 方法3: 查找 main 区域内的段落
    if (allMessages.length === 0) {
      const main = document.querySelector('main');
      if (main) {
        allMessages = main.querySelectorAll('[class*="_"]');
        console.log(`[OmniContext] Method 3 (main divs with _): Found ${allMessages.length} elements`);
      }
    }

    // 方法4: 查找对话气泡
    if (allMessages.length === 0) {
      allMessages = document.querySelectorAll('[class*="bubble"], [class*="balloon"], [class*="msg"]');
      console.log(`[OmniContext] Method 4 (bubble/msg): Found ${allMessages.length} elements`);
    }

    if (allMessages.length === 0) {
      // Fallback: try broader extraction
      console.log('[OmniContext] No message elements found, trying fallback...');
      return this.extractDeepseekFromDocument();
    }

    // 过滤出可能是消息的元素（排除太短或太长的）
    const candidateMessages = Array.from(allMessages).filter(el => {
      const text = el.textContent?.trim() || '';
      const children = el.children.length;
      // 消息元素通常：有一定文本内容，子元素不多
      return text.length >= 2 && text.length <= 10000 && children <= 10;
    });

    console.log(`[OmniContext] Filtered to ${candidateMessages.length} candidate messages`);

    // 如果候选消息太少，使用原始列表
    const messagesToProcess = candidateMessages.length > 0 ? candidateMessages : Array.from(allMessages);

    messagesToProcess.forEach((msgEl, index) => {
      const className = msgEl.className || '';
      const fullText = msgEl.textContent?.trim() || '';

      // 跳过太短的内容
      if (fullText.length < 2) return;

      console.log(`[OmniContext] [${index}] class="${className.slice(0, 50)}" text="${fullText.slice(0, 50)}..."`);

      // 改进的检测逻辑：先检测助手消息（特征更明显），再检测用户消息
      // 1. 助手消息特征
      const hasThinkingContent = !!msgEl.querySelector('[class*="ds-think-content"], [class*="think"], [class*="reasoning"]');
      const hasCodeBlock = !!msgEl.querySelector('pre, code, [class*="code"]');
      const isLongResponse = fullText.length > 300;
      const hasAssistantMarkers = fullText.includes('好的') ||
                                   fullText.includes('以下') ||
                                   fullText.includes('我来') ||
                                   fullText.includes('首先') ||
                                   fullText.includes('```');

      // 2. 用户消息特征（更精确的匹配）
      const hasSpecificUserClass = className.includes('d29f3d7d') ||
                                    className.includes('ds-chat-message--user') ||
                                    className.includes('ds-message--user');
      const isShortPrompt = fullText.length < 100 && !hasCodeBlock;

      // 3. 综合判断
      const isAssistantMessage = hasThinkingContent ||
                                  (hasCodeBlock && !hasSpecificUserClass) ||
                                  (isLongResponse && hasAssistantMarkers);

      const isUserMessage = hasSpecificUserClass ||
                            (isShortPrompt && !isAssistantMessage && !hasAssistantMarkers);

      if (isUserMessage) {
        const content = this.extractDeepseekUserContent(msgEl);
        if (content && content.length >= 2) {
          messages.push({
            id: `deepseek-msg-${index}`,
            role: 'user',
            content,
            timestamp: Date.now(),
          });
          console.log(`[OmniContext] [${index}] USER: "${content.slice(0, 50)}..."`);
        }
      } else {
        const content = this.extractDeepseekAssistantContent(msgEl);
        if (content) {
          messages.push({
            id: `deepseek-msg-${index}`,
            role: 'assistant',
            content,
            timestamp: Date.now(),
          });
          console.log(`[OmniContext] [${index}] ASSISTANT: "${content.slice(0, 50)}..."`);
        }
      }
    });

    console.log(`[OmniContext] Extracted ${messages.length} DeepSeek messages`);

    // 如果还是没找到消息，尝试终极备用方案
    if (messages.length === 0) {
      console.log('[OmniContext] No messages found, trying ultimate fallback...');
      return this.extractDeepseekUltimateFallback();
    }

    return messages;
  }

  // 终极备用方案：直接提取主区域的可见文本
  private extractDeepseekUltimateFallback(): Message[] {
    const messages: Message[] = [];

    // 找到主内容区域
    const main = document.querySelector('main') ||
                 document.querySelector('[class*="chat"]') ||
                 document.querySelector('[class*="conversation"]');

    if (!main) {
      console.warn('[OmniContext] No main content area found');
      return messages;
    }

    // 获取所有段落或文本块
    const textBlocks = main.querySelectorAll('p, div > span, [class*="content"], [class*="text"]');
    console.log(`[OmniContext] Ultimate fallback: found ${textBlocks.length} text blocks`);

    // 按位置排序，交替分配用户/助手角色
    textBlocks.forEach((block, index) => {
      const text = block.textContent?.trim() || '';
      // 跳过太短的文本
      if (text.length < 5) return;

      // 简单交替：偶数索引为用户，奇数为助手
      const isUser = index % 2 === 0;

      messages.push({
        id: `deepseek-ultimate-${index}`,
        role: isUser ? 'user' : 'assistant',
        content: text.slice(0, 5000), // 限制长度
        timestamp: Date.now(),
      });
    });

    // 如果连这个都没有，就把整个 main 的文本作为一个助手消息
    if (messages.length === 0) {
      const fullText = main.textContent?.trim() || '';
      if (fullText.length > 10) {
        messages.push({
          id: 'deepseek-ultimate-full',
          role: 'assistant',
          content: fullText.slice(0, 10000),
          timestamp: Date.now(),
        });
        console.log(`[OmniContext] Ultimate fallback: using full text (${fullText.length} chars)`);
      }
    }

    console.log(`[OmniContext] Ultimate fallback extracted ${messages.length} messages`);
    return messages;
  }

  private extractDeepseekFromDocument(): Message[] {
    const messages: Message[] = [];

    console.log('[OmniContext] Trying DeepSeek fallback extraction...');

    // Fallback: look for common message patterns
    const containerSelectors = [
      '[class*="ds-scroll-area"]',
      '[class*="chat-container"]',
      '[class*="conversation"]',
      'main',
    ];

    let container: Element | null = null;
    for (const selector of containerSelectors) {
      container = document.querySelector(selector);
      if (container) {
        console.log(`[OmniContext] Found container with: ${selector}`);
        break;
      }
    }

    if (!container) {
      container = document.body;
    }

    // Look for all elements that might be messages
    const allDivs = container.querySelectorAll('div');
    const messageCandidates: Array<{ el: Element; score: number }> = [];

    allDivs.forEach(div => {
      const className = (div.className || '').toLowerCase();
      const text = div.textContent || '';
      const children = div.children.length;

      // Score based on message-like characteristics
      let score = 0;

      // Has message-related class
      if (className.includes('message') || className.includes('ds-message')) score += 3;
      if (className.includes('chat')) score += 2;
      if (className.includes('bubble')) score += 2;

      // Appropriate length (not too short, not container)
      if (text.length >= 5 && text.length <= 5000) score += 1;
      if (text.length > 100 && text.length < 2000) score += 1;

      // Not too many children (leaf-ish elements)
      if (children <= 3) score += 1;

      if (score >= 3) {
        messageCandidates.push({ el: div, score });
      }
    });

    // Sort by score and take top candidates
    messageCandidates.sort((a, b) => b.score - a.score);
    const topCandidates = messageCandidates.slice(0, 50);

    console.log(`[OmniContext] Found ${topCandidates.length} message candidates`);

    // Try to determine role based on position and content
    topCandidates.forEach(({ el }, index) => {
      const className = el.className || '';
      const text = el.textContent?.trim() || '';

      // User messages usually appear first and are shorter
      // This is a rough heuristic
      const isUserMessage = className.includes('user') ||
                           className.includes('human') ||
                           (text.length < 200 && index % 2 === 0);

      if (text.length > 0) {
        messages.push({
          id: `deepseek-fallback-msg-${index}`,
          role: isUserMessage ? 'user' : 'assistant',
          content: text,
          timestamp: Date.now(),
        });
      }
    });

    return messages;
  }

  private extractDeepseekUserContent(element: Element): string {
    // Try to find the main content container
    const contentSelectors = [
      '[class*="content"]',
      '[class*="text"]',
      '.ds-message-content',
      'p',
    ];

    for (const selector of contentSelectors) {
      const contentEl = element.querySelector(selector);
      if (contentEl?.textContent?.trim()) {
        const text = contentEl.textContent.trim();
        // Make sure it's not the entire message text
        if (text.length < element.textContent!.length * 0.9) {
          return text;
        }
      }
    }

    // Fallback: use element's direct text
    return element.textContent?.trim() || '';
  }

  private extractDeepseekAssistantContent(element: Element): string {
    // DeepSeek has thinking content in ds-think-content class
    // We exclude thinking content to be consistent with Yuanbao and Doubao

    // Get the main content (excluding thinking)
    const clone = element.cloneNode(true) as Element;

    // Remove thinking content elements
    const thinkingElements = clone.querySelectorAll('[class*="ds-think-content"], [class*="think-content"], [class*="thinking"]');
    thinkingElements.forEach(el => el.remove());

    // Also remove any elements with thinking-related class names
    const thinkingPatterns = ['think', 'reasoning', 'thought'];
    const allElements = clone.querySelectorAll('*');
    allElements.forEach(el => {
      // 安全获取 className - 处理 SVG 元素的 SVGAnimatedString
      let className = '';
      try {
        className = (typeof el.className === 'string' ? el.className : (el.className as any)?.baseVal || '') || '';
      } catch {
        className = '';
      }
      const classNameLower = className.toLowerCase();
      if (thinkingPatterns.some(p => classNameLower.includes(p))) {
        el.remove();
      }
    });

    const mainText = clone.textContent?.trim() || '';
    return mainText;
  }

  // ========== Kimi 平台消息提取 ==========

  private extractKimiMessages(): Message[] {
    const messages: Message[] = [];

    console.log('[OmniContext] Extracting Kimi messages...');

    // Kimi 使用语义化类名，结构清晰
    // 用户消息: .chat-content-item-user 或 .segment-user
    // 助手消息: .chat-content-item-assistant 或 .segment-assistant
    // 消息内容: .segment-content

    // 查找所有消息项
    const userMessages = document.querySelectorAll('.chat-content-item-user');
    const assistantMessages = document.querySelectorAll('.chat-content-item-assistant');

    console.log(`[OmniContext] Kimi: Found ${userMessages.length} user messages, ${assistantMessages.length} assistant messages`);

    // 合并并按 DOM 顺序排序
    const allElements: Array<{ el: Element; isUser: boolean }> = [
      ...Array.from(userMessages).map(el => ({ el, isUser: true })),
      ...Array.from(assistantMessages).map(el => ({ el, isUser: false })),
    ];

    // 按 DOM 位置排序
    allElements.sort((a, b) => {
      const position = a.el.compareDocumentPosition(b.el);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    allElements.forEach(({ el, isUser }, index) => {
      const content = this.extractKimiContent(el);
      if (content && content.length >= 2) {
        messages.push({
          id: `kimi-msg-${index}`,
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
        console.log(`[OmniContext] Kimi [${index}] ${isUser ? 'USER' : 'ASSISTANT'}: "${content.slice(0, 50)}..."`);
      }
    });

    console.log(`[OmniContext] Kimi: Extracted ${messages.length} messages`);

    // 如果没找到消息，尝试备用方案
    if (messages.length === 0) {
      return this.extractKimiFromDocument();
    }

    return messages;
  }

  private extractKimiContent(element: Element): string {
    // Kimi 消息内容在 .segment-content 中
    const contentEl = element.querySelector('.segment-content');
    if (contentEl?.textContent?.trim()) {
      return contentEl.textContent.trim();
    }

    // 备用：直接使用元素文本
    return element.textContent?.trim() || '';
  }

  private extractKimiFromDocument(): Message[] {
    const messages: Message[] = [];

    console.log('[OmniContext] Kimi: Trying fallback extraction...');

    // 查找消息列表容器
    const container = document.querySelector('.chat-content-list, .message-list, [class*="chat-content"]');
    if (!container) {
      console.warn('[OmniContext] Kimi: No message container found');
      return messages;
    }

    // 查找所有 segment 元素
    const segments = container.querySelectorAll('.segment-user, .segment-assistant, [class*="segment"]');
    console.log(`[OmniContext] Kimi fallback: Found ${segments.length} segments`);

    segments.forEach((segment, index) => {
      const className = segment.className || '';
      const isUser = className.includes('user');
      const content = segment.textContent?.trim() || '';

      if (content.length >= 2) {
        messages.push({
          id: `kimi-fallback-${index}`,
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
      }
    });

    console.log(`[OmniContext] Kimi fallback: Extracted ${messages.length} messages`);
    return messages;
  }

  // ========== Gemini 平台消息提取 ==========

  private extractGeminiMessages(): Message[] {
    const messages: Message[] = [];

    console.log('[OmniContext] Extracting Gemini messages...');

    // Gemini uses Material Design, user messages and AI responses are clearly distinguished
    // User: user-query-container or elements containing user-query
    // AI: response-container or elements containing model-response

    const userSelectors = [
      '[class*="user-query-container"]',
      '[class*="user-query"]',
      '[data-test-id="user-query"]',
      '.user-query-container',
    ];

    const assistantSelectors = [
      '[class*="response-container"]',
      '[class*="model-response"]',
      '[data-test-id="model-response"]',
      '.response-container',
    ];

    // Collect all message elements (deduplicate by element reference first)
    const seenElements = new Set<Element>();
    const allElements: Array<{ el: Element; isUser: boolean }> = [];

    for (const selector of userSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (!seenElements.has(el)) {
          seenElements.add(el);
          allElements.push({ el, isUser: true });
        }
      });
    }

    for (const selector of assistantSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (!seenElements.has(el)) {
          seenElements.add(el);
          allElements.push({ el, isUser: false });
        }
      });
    }

    console.log(`[OmniContext] Gemini: Found ${allElements.filter(e => e.isUser).length} user elements, ${allElements.filter(e => !e.isUser).length} assistant elements`);

    if (allElements.length === 0) {
      return this.extractGeminiFromDocument();
    }

    // Sort by DOM position
    allElements.sort((a, b) => {
      const position = a.el.compareDocumentPosition(b.el);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    allElements.forEach(({ el, isUser }, index) => {
      const content = this.extractGeminiContent(el, isUser);
      if (content && content.length >= 2) {
        messages.push({
          id: `gemini-msg-${index}`,
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
        console.log(`[OmniContext] Gemini [${index}] ${isUser ? 'USER' : 'ASSISTANT'}: "${content.slice(0, 50)}..."`);
      }
    });

    // Content-based deduplication: nested DOM elements may have the same content
    const dedupedMessages: Message[] = [];
    const seenContent = new Set<string>();
    for (const msg of messages) {
      const key = `${msg.role}:${msg.content}`;
      if (!seenContent.has(key)) {
        seenContent.add(key);
        dedupedMessages.push(msg);
      }
    }
    console.log(`[OmniContext] Gemini: After dedup: ${dedupedMessages.length} messages (removed ${messages.length - dedupedMessages.length} duplicates)`);

    if (dedupedMessages.length === 0) {
      return this.extractGeminiFromDocument();
    }

    return dedupedMessages;
  }

  private extractGeminiContent(element: Element, isUser: boolean): string {
    if (isUser) {
      // User message: usually in message-content or direct text
      const contentEl = element.querySelector('[class*="message-content"], [class*="query-content"], .query-text');
      if (contentEl?.textContent?.trim()) {
        return contentEl.textContent.trim();
      }
    } else {
      // AI response: may be in multiple areas, need to exclude tool calls etc.
      const mainContent = element.querySelector('[class*="response-text"], [class*="model-response-text"], [class*="message-content"]');
      if (mainContent?.textContent?.trim()) {
        return mainContent.textContent.trim();
      }
    }

    // Fallback: use element text directly
    const text = element.textContent?.trim() || '';
    return text;
  }

  private extractGeminiFromDocument(): Message[] {
    const messages: Message[] = [];

    console.log('[OmniContext] Gemini: Trying fallback extraction...');

    // Find main conversation area
    const mainContainer = document.querySelector('main, [class*="conversation"], [class*="chat-container"], [data-test-id="conversation-panel"]');
    if (!mainContainer) {
      console.warn('[OmniContext] Gemini: No message container found');
      return messages;
    }

    // Try to infer messages from DOM structure
    const messageBlocks = mainContainer.querySelectorAll('[class*="container"], [class*="message"], [class*="query"], [class*="response"]');
    console.log(`[OmniContext] Gemini fallback: Found ${messageBlocks.length} potential message blocks`);

    // Analyze each block's text length and structure
    const candidates: Array<{ el: Element; isUser: boolean; text: string }> = [];

    messageBlocks.forEach(block => {
      const text = block.textContent?.trim() || '';
      const className = block.className || '';

      // Skip too short or too long blocks
      if (text.length < 2 || text.length > 50000) return;

      // Determine if user message
      const isUser = className.toLowerCase().includes('user') ||
                     className.toLowerCase().includes('query') ||
                     className.toLowerCase().includes('human');

      candidates.push({ el: block, isUser, text });
    });

    // Sort by position and extract, with simple deduplication
    const seenText = new Set<string>();
    candidates.forEach((candidate, index) => {
      // Skip if same content as previous
      if (seenText.has(candidate.text)) return;
      seenText.add(candidate.text);

      messages.push({
        id: `gemini-fallback-${index}`,
        role: candidate.isUser ? 'user' : 'assistant',
        content: candidate.text.slice(0, 10000),
        timestamp: Date.now(),
      });
    });

    console.log(`[OmniContext] Gemini fallback: Extracted ${messages.length} messages`);
    return messages;
  }

  // ========== ChatGPT 平台消息提取 ==========

  private filterOutSidebarElements(elements: Element[]): Element[] {
    return elements.filter(el => {
      // Check if element is inside sidebar/navigation
      const isInSidebar = el.closest('nav') ||
                          el.closest('[class*="sidebar"]') ||
                          el.closest('[class*="history"]') ||
                          el.closest('[class*="chat-list"]') ||
                          el.closest('[data-testid="history-list"]') ||
                          el.closest('[class*="SideBar"]');
      return !isInSidebar;
    });
  }

  private extractChatgptMessages(): Message[] {
    const messages: Message[] = [];

    console.log('[OmniContext] Extracting ChatGPT messages...');

    // ChatGPT uses data-testid="conversation-turn-{index}" for each turn
    // Even turns (0, 2, 4...) are user messages, odd turns are assistant messages
    // Only search within main content area to avoid selecting elements from sidebar
    const mainContent = document.querySelector('main');
    const turnElements = mainContent
      ? this.filterOutSidebarElements(Array.from(mainContent.querySelectorAll('[data-testid^="conversation-turn-"]')))
      : this.filterOutSidebarElements(Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]')));

    console.log(`[OmniContext] ChatGPT: Found ${turnElements.length} conversation turns`);

    if (turnElements.length === 0) {
      // Fallback: try legacy class-based selectors
      return this.extractChatgptFromLegacySelectors();
    }

    turnElements.forEach((turnEl, index) => {
      // Determine role based on turn index (even = user, odd = assistant)
      const isUser = index % 2 === 0;

      // Extract content from the turn element
      const content = this.extractChatgptContent(turnEl, isUser);

      if (content && content.length >= 1) {
        messages.push({
          id: `chatgpt-msg-${index}`,
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
        console.log(`[OmniContext] ChatGPT [${index}] ${isUser ? 'USER' : 'ASSISTANT'}: "${content.slice(0, 50)}..."`);
      }
    });

    console.log(`[OmniContext] ChatGPT: Extracted ${messages.length} messages`);

    // If no messages found, try fallback
    if (messages.length === 0) {
      return this.extractChatgptFromLegacySelectors();
    }

    return messages;
  }

  private extractChatgptContent(turnEl: Element, isUser: boolean): string {
    // Try to find the message content within the turn
    // User messages are typically in simpler containers
    // Assistant messages may have more complex structure with reasoning, code blocks, etc.

    const contentSelectors = isUser
      ? [
          // User message selectors
          '[class*="user-message"]',
          '[class*="ConversationItem"] > div:last-child',
          'div > div > div',  // Nested structure
          'p',
        ]
      : [
          // Assistant message selectors
          '[class*="markdown"]',
          '[class*="prose"]',
          '[class*="assistant-message"]',
          '[class*="ConversationItem"] > div:last-child',
          'div > div > div',
        ];

    for (const selector of contentSelectors) {
      const contentEl = turnEl.querySelector(selector);
      if (contentEl?.textContent?.trim()) {
        const text = contentEl.textContent.trim();
        // Filter out button text and UI elements
        if (text.length > 0 && !this.isChatgptUIElement(text)) {
          return text;
        }
      }
    }

    // Fallback: get all text from the turn, excluding buttons and UI elements
    const clone = turnEl.cloneNode(true) as Element;

    // Remove common UI elements
    const uiSelectors = [
      'button',
      '[class*="copy"]',
      '[class*="regenerate"]',
      '[class*="feedback"]',
      '[class*="thumb"]',
      'svg',
    ];

    uiSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    const text = clone.textContent?.trim() || '';
    return this.cleanChatgptContent(text);
  }

  private isChatgptUIElement(text: string): boolean {
    const uiPatterns = [
      /^Copy$/,
      /^Regenerate$/,
      /^Good response$/,
      /^Bad response$/,
      /^Read aloud$/,
      /^( thumbs_up| thumbs_down)$/,
    ];
    return uiPatterns.some(p => p.test(text.trim()));
  }

  private cleanChatgptContent(text: string): string {
    // Remove common UI text that might be captured
    const uiTexts = [
      'Copy',
      'Regenerate',
      'Good response',
      'Bad response',
      'Read aloud',
    ];

    let cleaned = text;
    for (const uiText of uiTexts) {
      cleaned = cleaned.replace(new RegExp(`\\b${uiText}\\b`, 'g'), '');
    }

    return cleaned.trim();
  }

  private extractChatgptFromLegacySelectors(): Message[] {
    const messages: Message[] = [];

    console.log('[OmniContext] ChatGPT: Trying legacy selector extraction...');

    // Legacy: ThreadLayout__NodeWrapper and ConversationItem__ConversationItemWrapper-sc
    const container = document.querySelector('[class*="ThreadLayout__NodeWrapper"]');

    if (!container) {
      console.warn('[OmniContext] ChatGPT: No container found with legacy selectors');
      return this.extractChatgptFromDocument();
    }

    const messageItems = container.querySelectorAll('[class*="ConversationItem__ConversationItemWrapper-sc"]');
    console.log(`[OmniContext] ChatGPT legacy: Found ${messageItems.length} message items`);

    messageItems.forEach((item, index) => {
      // Try to determine role by structure or position
      // User messages typically have less complex structure
      const hasComplexStructure = !!item.querySelector('pre, code, [class*="markdown"]');
      const text = item.textContent?.trim() || '';

      // Simple heuristic: short messages without code blocks are likely user messages
      // This is not perfect but works as fallback
      const isUser = !hasComplexStructure && text.length < 200;

      const content = this.cleanChatgptContent(text);
      if (content.length >= 1) {
        messages.push({
          id: `chatgpt-legacy-${index}`,
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
      }
    });

    if (messages.length === 0) {
      return this.extractChatgptFromDocument();
    }

    return messages;
  }

  private extractChatgptFromDocument(): Message[] {
    const messages: Message[] = [];

    console.log('[OmniContext] ChatGPT: Trying fallback document extraction...');

    // Strategy 1: Look for elements with data-message-author-role
    const userByRole = document.querySelectorAll('[data-message-author-role="user"]');
    const assistantByRole = document.querySelectorAll('[data-message-author-role="assistant"]');

    console.log(`[OmniContext] ChatGPT fallback: Found ${userByRole.length} user, ${assistantByRole.length} assistant by role`);

    if (userByRole.length > 0 || assistantByRole.length > 0) {
      // Combine and sort by DOM position
      const allMessages: Array<{ el: Element; role: 'user' | 'assistant'; index: number }> = [];

      userByRole.forEach((el, i) => {
        allMessages.push({ el, role: 'user', index: i });
      });

      assistantByRole.forEach((el, i) => {
        allMessages.push({ el, role: 'assistant', index: i });
      });

      // Sort by their position in the document
      allMessages.sort((a, b) => {
        const posA = a.el.compareDocumentPosition(b.el);
        return posA & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

      allMessages.forEach((msg, index) => {
        const content = this.extractChatgptMessageContent(msg.el);
        if (content.length >= 1) {
          messages.push({
            id: `chatgpt-role-${index}`,
            role: msg.role,
            content,
            timestamp: Date.now(),
          });
        }
      });

      console.log(`[OmniContext] ChatGPT role-based: Extracted ${messages.length} messages`);
      return messages;
    }

    // Strategy 2: Look for article elements or main content containers
    // Only search within main content area to avoid sidebar elements
    const mainContent = document.querySelector('main');
    const candidates = mainContent
      ? mainContent.querySelectorAll('article, [data-testid^="conversation-turn-"], .group, [class*="conversation-item"]')
      : document.querySelectorAll('main article, [data-testid^="conversation-turn-"], .group, [class*="conversation-item"]');

    console.log(`[OmniContext] ChatGPT fallback: Found ${candidates.length} candidates`);

    // Filter and sort by position
    const messageCandidates: Array<{ el: Element; text: string }> = [];

    candidates.forEach(el => {
      const text = el.textContent?.trim() || '';
      // Skip if too short or too long
      if (text.length < 2 || text.length > 10000) return;
      // Skip if looks like UI element
      if (this.isChatgptUIElement(text)) return;

      messageCandidates.push({ el, text });
    });

    // Alternate between user and assistant based on position
    messageCandidates.forEach((candidate, index) => {
      const isUser = index % 2 === 0;
      const content = this.cleanChatgptContent(candidate.text);

      if (content.length >= 1) {
        messages.push({
          id: `chatgpt-fallback-${index}`,
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
      }
    });

    console.log(`[OmniContext] ChatGPT fallback: Extracted ${messages.length} messages`);
    return messages;
  }

  private extractChatgptMessageContent(el: Element): string {
    // Try to find the actual message content
    const contentSelectors = [
      '[class*="markdown"]',
      '[class*="prose"]',
      '.whitespace-pre-wrap',
      '[class*="text-message"]',
      'div > div',  // Nested divs often contain the content
    ];

    for (const selector of contentSelectors) {
      const contentEl = el.querySelector(selector);
      if (contentEl?.textContent?.trim()) {
        return this.cleanChatgptContent(contentEl.textContent.trim());
      }
    }

    // Fallback: get text from the element itself, removing buttons
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('button, svg, [class*="copy"], [class*="feedback"]').forEach(e => e.remove());
    return this.cleanChatgptContent(clone.textContent?.trim() || '');
  }

  private extractMessagesFromDocument(): Message[] {
    const messages: Message[] = [];

    const userElements = document.querySelectorAll(this.config.messageSelectors.user);
    const assistantElements = document.querySelectorAll(this.config.messageSelectors.assistant);

    // Merge and sort by DOM order
    const allElements: Array<{ el: Element; isUser: boolean }> = [
      ...Array.from(userElements).map(el => ({ el, isUser: true })),
      ...Array.from(assistantElements).map(el => ({ el, isUser: false })),
    ];

    // Sort by document position
    allElements.sort((a, b) => {
      const position = a.el.compareDocumentPosition(b.el);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    allElements.forEach(({ el, isUser }, index) => {
      const content = this.extractTextContent(el);
      if (content) {
        messages.push({
          id: `${this.platform}-msg-${index}`,
          role: isUser ? 'user' : 'assistant',
          content,
          timestamp: Date.now(),
        });
      }
    });

    return messages;
  }

  private extractTextContent(element: Element): string {
    // Try to find text content in common structures
    const textSelectors = [
      '.text-content',
      '.message-content',
      '.content',
      'p',
      '.text',
    ];

    for (const selector of textSelectors) {
      const textEl = element.querySelector(selector);
      if (textEl?.textContent?.trim()) {
        return textEl.textContent.trim();
      }
    }

    // Fallback to element's own text
    return element.textContent?.trim() || '';
  }
}

export function createMessageExtractor(platform: Platform): MessageExtractor {
  return new PlatformMessageExtractor(platform);
}

// Debug function to help identify selectors
export function debugPlatformElements(platform: Platform): void {
  try {
    console.log(`[OmniContext] Debugging ${platform}...`);

    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      console.log('No config found for platform:', platform);
      return;
    }

    // Check title selectors
    console.log('=== Title Selectors ===');
    for (const selector of config.titleSelectors) {
      try {
        const el = document.querySelector(selector);
        console.log(`${selector}: ${el ? '✓' : '✗'} ${el?.textContent?.slice(0, 50) || ''}`);
      } catch (e) {
        console.log(`${selector}: 选择器错误`);
      }
    }

    // Check container
    console.log('=== Message Container ===');
    const container = document.querySelector(config.messageSelectors.container);
    console.log(`Container found: ${container ? '✓' : '✗'}`);

    // Check user messages
    console.log('=== User Messages ===');
    try {
      const userMessages = document.querySelectorAll(config.messageSelectors.user);
      console.log(`Found ${userMessages.length} user messages`);
      userMessages.forEach((el, i) => {
        if (i < 3) {
          console.log(`  [${i}] ${el.className?.slice(0, 50)}: ${el.textContent?.slice(0, 50)}`);
        }
      });
    } catch (e) {
      console.log('User messages check failed:', e);
    }

    // Check assistant messages
    console.log('=== Assistant Messages ===');
    try {
      const assistantMessages = document.querySelectorAll(config.messageSelectors.assistant);
      console.log(`Found ${assistantMessages.length} assistant messages`);
      assistantMessages.forEach((el, i) => {
        if (i < 3) {
          console.log(`  [${i}] ${el.className?.slice(0, 50)}: ${el.textContent?.slice(0, 50)}`);
        }
      });
    } catch (e) {
      console.log('Assistant messages check failed:', e);
    }

    // Try to find any element containing common chat text patterns
    console.log('=== Auto-detect Attempt ===');
    try {
      const allElements = document.querySelectorAll('div');
      const candidates = Array.from(allElements).filter(el => {
        const text = el.textContent || '';
        return text.length > 20 && text.length < 500 &&
               (el.className?.toLowerCase().includes('message') ||
                el.className?.toLowerCase().includes('chat') ||
                el.className?.toLowerCase().includes('bubble'));
      }).slice(0, 5);

      console.log('Possible message elements:');
      candidates.forEach((el, i) => {
        console.log(`  [${i}] class="${el.className}" text="${el.textContent?.slice(0, 80)}"`);
      });
    } catch (e) {
      console.log('Auto-detect failed:', e);
    }

    console.log('=== End Debug ===');
  } catch (err) {
    console.error('[OmniContext] Debug function error:', err);
  }
}
