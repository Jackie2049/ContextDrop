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
      container: '[class*="message-list"], [class*="chat-container"], [class*="conversation-content"], [class*="message-container"], main',
      user: '[class*="user-message"], [data-role="user"], [class*="message-block-container"]',
      assistant: '[class*="assistant-message"], [class*="bot-message"], [class*="ai-message"], [data-role="assistant"]',
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
      '.conversation-title',
      '[aria-selected="true"] .title',
      '.chat-title',
      '[class*="conversation-title"]',
      '[class*="chat-title"]',
      'h1',
      'title',
    ],
    messageSelectors: {
      container: '.conversation-content, .messages-container, [class*="conversation"], [class*="messages"]',
      user: '.human-message, .message.human, [data-testid="human-message"], [class*="human"], [class*="user-message"]',
      assistant: '.assistant-message, .message.assistant, [data-testid="assistant-message"], [class*="assistant"], [class*="claude-message"]',
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
      // Use semantic partial matches instead of hardcoded hashes
      // The d29f3d7d hash may change when DeepSeek updates their frontend
      container: '[class*="ds-scroll-area"], main, [class*="chat-container"]',
      user: '[class*="ds-chat-message--user"], [data-role="user"], [class*="user-message"], [class*="ds-message"]',
      assistant: '[class*="ds-chat-message--assistant"], [data-role="assistant"], [class*="assistant-message"]',
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
};

export function detectPlatform(url: string): Platform | null {
  const hostname = new URL(url).hostname;

  if (hostname.includes('doubao.com')) return 'doubao';
  if (hostname.includes('yuanbao.tencent.com')) return 'yuanbao';
  if (hostname.includes('claude.ai')) return 'claude';
  if (hostname.includes('deepseek.com')) return 'deepseek';
  if (hostname.includes('kimi.com')) return 'kimi';

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

  // Default: try to find UUID or ID in path
  for (const part of pathParts) {
    // Special case: 'new' indicates a new chat session
    if (part === 'new') {
      return `new-${Date.now()}`;
    }
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

export function formatPlatformName(platform: Platform): string {
  const names: Record<Platform, string> = {
    doubao: '豆包',
    yuanbao: '元宝',
    claude: 'Claude',
    deepseek: 'DeepSeek',
    kimi: 'Kimi',
  };
  return names[platform];
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

    // 尝试多种选择器找到消息块（从最具体到最通用）
    const selectors = [
      '[class*="message-block-container"]',
      '[class*="message-block"]',
      '[class*="chat-message"]',
      '[class*="message-item"]',
      '[class*="msg-container"]',
      '[class*="bubble"]',
      '[class*="chat-bubble"]',
      '[class*="conversation-item"]',
      '[data-session-id] > div',
      'main [class*="content"] > div',
    ];

    console.log('[OmniContext] Doubao: Trying selectors...');

    let messageBlocks: NodeListOf<Element> | Element[] = [];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`[OmniContext] Doubao: ${selector} -> ${elements.length} elements`);
      if (elements.length > 0) {
        messageBlocks = elements;
        break;
      }
    }

    // 如果常规选择器都失败，尝试基于DOM结构查找
    if (messageBlocks.length === 0) {
      console.log('[OmniContext] Doubao: Trying DOM-based fallback...');
      messageBlocks = this.findDoubaoMessageBlocks();
    }

    if (messageBlocks.length === 0) {
      console.warn('[OmniContext] Doubao: No message blocks found even with fallback');
      return this.extractMessagesFromDocument();
    }

    console.log(`[OmniContext] Doubao: Found ${messageBlocks.length} message blocks`);

    messageBlocks.forEach((block, index) => {
      const fullText = block.textContent || '';
      const className = (block as Element).className || '';
      const classListLower = className.toLowerCase();

      // 多重检测用户消息的方式
      // 1. 检查 bg-s-color-bg-trans 类（豆包用户消息标志，可能已失效）
      const hasTransBgClass = !!block.querySelector('[class*="bg-s-color-bg-trans"]');

      // 2. 检查语义化的用户标识（扩展列表）
      const hasUserRole = !!block.querySelector('[data-role="user"]');
      const hasUserClassName = classListLower.includes('user-message') ||
                               classListLower.includes('user') ||
                               classListLower.includes('self');

      // 3. 检查布局特征（用户消息通常在右侧或有特定flex方向）
      const computedStyle = window.getComputedStyle(block as Element);
      const hasUserAlignment = computedStyle.justifyContent === 'flex-end' ||
                               computedStyle.alignSelf === 'flex-end';

      // 4. 检查是否有助手特有的元素
      const hasAssistantAvatar = !!block.querySelector('[class*="avatar"]:not([class*="user"]), [class*="bot-avatar"], [class*="ai-avatar"]');
      const hasThinkingSection = !!block.querySelector('[class*="thinking"], [class*="thought"], [class*="reasoning"]');
      const hasAssistantRole = !!block.querySelector('[data-role="assistant"]');

      // 5. 基于内容特征判断（用户消息通常较短，无代码块）
      const textLength = fullText.length;
      const hasCodeBlock = !!block.querySelector('pre, code');

      // 6. 根据助手内容特征判断
      const hasAssistantMarkers = fullText.includes('已完成思考') ||
                                   fullText.includes('思考过程') ||
                                   fullText.includes('让我来') ||
                                   fullText.includes('我来帮你') ||
                                   fullText.includes('我来分析') ||
                                   fullText.includes('以下是') ||
                                   (textLength > 500 && hasCodeBlock); // 长回复且有代码块

      // 综合判断：用户消息的判断条件
      // 策略：使用评分系统，综合考虑多种因素
      const userIndicators = [hasTransBgClass, hasUserRole, hasUserClassName, hasUserAlignment];
      const assistantIndicators = [hasAssistantAvatar, hasThinkingSection, hasAssistantRole, hasAssistantMarkers];

      const userScore = userIndicators.filter(Boolean).length;
      const assistantScore = assistantIndicators.filter(Boolean).length;

      // 用户消息：有用户特征且助手特征很少
      // 如果都没有明显特征，使用交替模式判断
      let isUserMessage: boolean;
      if (userScore > 0 && assistantScore === 0) {
        isUserMessage = true;
      } else if (assistantScore > 0 && userScore === 0) {
        isUserMessage = false;
      } else {
        // 模糊情况：使用交替模式（第一条通常是用户，然后交替）
        // 但这需要全局上下文，这里简化处理
        isUserMessage = userScore >= assistantScore;
      }

      // 调试输出前5个消息块
      if (index < 5) {
        console.log(`[OmniContext] Doubao [${index}] class="${className.slice(0, 50)}..."`);
        console.log(`[OmniContext]   userScore=${userScore} asstScore=${assistantScore} -> ${isUserMessage ? 'USER' : 'ASSISTANT'}`);
        console.log(`[OmniContext]   user indicators: transBg=${hasTransBgClass} role=${hasUserRole} userClass=${hasUserClassName} alignment=${hasUserAlignment}`);
        console.log(`[OmniContext]   asst indicators: avatar=${hasAssistantAvatar} thinking=${hasThinkingSection} asstRole=${hasAssistantRole}`);
        console.log(`[OmniContext]   text preview: "${fullText.slice(0, 50)}..."`);
      }

      if (isUserMessage) {
        // User message - try multiple content selectors
        const contentSelectors = [
          '[class*="container-"]',
          '[class*="message-content"]',
          '[class*="content"]',
          '[class*="text"]',
          '[class*="message-body"]',
          '[class*="bubble"]',
        ];

        let contentElement: Element | null = null;
        for (const sel of contentSelectors) {
          contentElement = block.querySelector(sel);
          if (contentElement) break;
        }

        const content = this.extractTextContent(contentElement || block);
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
        const contentSelectors = [
          '[class*="container-"]',
          '[class*="message-content"]',
          '[class*="content"]',
          '[class*="text"]',
          '[class*="message-body"]',
          '[class*="bubble"]',
        ];

        let contentElement: Element | null = null;
        for (const sel of contentSelectors) {
          contentElement = block.querySelector(sel);
          if (contentElement) break;
        }

        const content = this.extractDoubaoAssistantContent(contentElement || block);
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

    return messages;
  }

  /**
   * 基于DOM结构查找豆包消息块（当常规选择器失效时使用）
   */
  private findDoubaoMessageBlocks(): Element[] {
    const blocks: Element[] = [];

    // 方法1: 查找main区域内的直接子元素
    const main = document.querySelector('main');
    if (main) {
      const children = main.querySelectorAll(':scope > div > div');
      console.log(`[OmniContext] Doubao fallback: main > div > div -> ${children.length} elements`);
      if (children.length > 0) {
        children.forEach(child => {
          const text = child.textContent?.trim() || '';
          if (text.length > 5) {
            blocks.push(child);
          }
        });
        if (blocks.length > 0) return blocks;
      }
    }

    // 方法2: 查找带有滚动区域的消息容器
    const scrollContainers = document.querySelectorAll('[class*="scroll"]');
    for (const container of scrollContainers) {
      const children = container.querySelectorAll(':scope > div');
      if (children.length >= 2) { // 至少要有2条消息
        children.forEach(child => {
          const text = child.textContent?.trim() || '';
          if (text.length > 5) {
            blocks.push(child);
          }
        });
        if (blocks.length > 0) {
          console.log(`[OmniContext] Doubao fallback: scroll container -> ${blocks.length} elements`);
          return blocks;
        }
      }
    }

    // 方法3: 查找具有flex布局的消息区域
    const flexContainers = document.querySelectorAll('[class*="flex-col"], [class*="flexColumn"], [style*="flex-direction: column"]');
    for (const container of flexContainers) {
      const directChildren = Array.from(container.children).filter(child => {
        const text = child.textContent?.trim() || '';
        // 消息元素通常有合理长度的文本
        return text.length > 10 && text.length < 10000;
      });

      if (directChildren.length >= 2) {
        console.log(`[OmniContext] Doubao fallback: flex container -> ${directChildren.length} elements`);
        return directChildren;
      }
    }

    // 方法4: 查找所有可能的消息容器
    const messageContainers = document.querySelectorAll('[class*="conversation"] [class*="content"], [class*="chat"] [class*="content"]');
    for (const container of messageContainers) {
      const children = container.children;
      if (children.length >= 2) {
        const validChildren = Array.from(children).filter(child => {
          const text = child.textContent?.trim() || '';
          return text.length > 5;
        });
        if (validChildren.length > 0) {
          console.log(`[OmniContext] Doubao fallback: conversation content -> ${validChildren.length} elements`);
          return validChildren;
        }
      }
    }

    // 方法5: 查找包含对话内容的区域（改进版）
    const allDivs = document.querySelectorAll('div');
    const candidates = new Map<Element, number>();

    allDivs.forEach(div => {
      const text = div.textContent?.trim() || '';
      // 跳过太短或太长的内容
      if (text.length < 20 || text.length > 20000) return;

      // 检查子元素数量 - 消息块通常子元素较少
      const childCount = div.children.length;
      if (childCount > 10) return; // 太多子元素，可能是容器

      // 检查是否包含消息特征
      const classList = (div.className || '').toLowerCase();
      const hasMessageClass = classList.includes('message') ||
                              classList.includes('chat') ||
                              classList.includes('bubble') ||
                              classList.includes('content');

      if (hasMessageClass) {
        candidates.set(div, text.length);
      }
    });

    if (candidates.size > 0) {
      // 按文本长度排序，取前几个
      const sorted = Array.from(candidates.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, 20)
        .map(([el]) => el);
      console.log(`[OmniContext] Doubao fallback: generic search -> ${sorted.length} elements`);
      return sorted;
    }

    return blocks;
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

    // Claude.ai specific selectors
    const containerSelectors = [
      '[class*="conversation"]',
      '[class*="messages"]',
      '[data-testid="conversation"]',
      '.prose',
      'main',
    ];

    let container: Element | null = null;
    for (const selector of containerSelectors) {
      container = document.querySelector(selector);
      if (container) break;
    }

    if (!container) {
      return this.extractClaudeFromDocument();
    }

    // Find message blocks - Claude uses various patterns
    const messageBlocks = container.querySelectorAll(
      '[class*="message"], [data-testid*="message"], [class*="turn"]'
    );

    if (messageBlocks.length === 0) {
      return this.extractClaudeFromDocument();
    }

    messageBlocks.forEach((block, index) => {
      const className = block.className || '';
      const dataTestId = block.getAttribute('data-testid') || '';

      // Determine if user or assistant
      const isUser = /human|user/i.test(className + dataTestId) ||
                     block.querySelector('[class*="human"], [class*="user"]');

      if (isUser) {
        const content = this.extractClaudeUserContent(block);
        if (content) {
          messages.push({
            id: `claude-msg-${index}`,
            role: 'user',
            content,
            timestamp: Date.now(),
          });
        }
      } else {
        // Assistant message - handle Extended Thinking
        const content = this.extractClaudeAssistantContent(block);
        if (content) {
          messages.push({
            id: `claude-msg-${index}`,
            role: 'assistant',
            content,
            timestamp: Date.now(),
          });
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
    document.querySelectorAll('[class*="assistant"], [class*="claude-message"]').forEach(el => {
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
    // Claude user messages are usually straightforward
    const contentSelectors = [
      '[class*="content"]',
      '[class*="text"]',
      '.prose',
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

  private extractClaudeAssistantContent(element: Element): string {
    // Claude's Extended Thinking feature puts thinking in special sections
    // We want to extract only the final response, not the thinking

    // Try to find the main response content (after thinking)
    const responseSelectors = [
      '[class*="response"]',
      '[class*="answer"]',
      '[class*="content"]:not([class*="thinking"])',
      '.prose',
    ];

    for (const selector of responseSelectors) {
      const responseEl = element.querySelector(selector);
      if (responseEl?.textContent?.trim()) {
        const text = responseEl.textContent.trim();
        if (!this.isClaudeThinkingContent(text)) {
          return text;
        }
      }
    }

    // Check for thinking block that needs to be filtered
    const thinkingBlock = element.querySelector(
      '[class*="thinking"], [class*="thought"], [data-thinking]'
    );

    if (thinkingBlock) {
      // Remove thinking block and get remaining content
      const clone = element.cloneNode(true) as Element;
      const thinkingInClone = clone.querySelector(
        '[class*="thinking"], [class*="thought"], [data-thinking]'
      );
      if (thinkingInClone) {
        thinkingInClone.remove();
      }
      const remainingText = clone.textContent?.trim();
      if (remainingText && remainingText.length > 10) {
        return remainingText;
      }
    }

    // Fallback: clean the content
    return this.cleanClaudeContent(element.textContent || '');
  }

  private isClaudeThinkingContent(text: string): boolean {
    // Claude Extended Thinking markers
    const thinkingPatterns = [
      /^Thinking[:：]/i,
      /^Extended thinking/i,
      /^Let me think/i,
      /^I need to think/i,
    ];

    return thinkingPatterns.some(p => p.test(text.trim().slice(0, 50)));
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

      // 判断是否为用户消息 - 使用多种启发式方法
      const hasThinkingContent = !!msgEl.querySelector('[class*="ds-think-content"], [class*="think"], [class*="reasoning"]');

      // 检查语义化的用户标识（不依赖CSS Modules哈希）
      const hasUserClass = className.toLowerCase().includes('user') ||
                          className.toLowerCase().includes('human') ||
                          className.toLowerCase().includes('me') ||
                          msgEl.hasAttribute('data-user') ||
                          msgEl.hasAttribute('data-role') && msgEl.getAttribute('data-role') === 'user';

      // 检查是否有助手特有的元素
      const hasAssistantAvatar = !!msgEl.querySelector('[class*="avatar"]:not([class*="user"])');
      const hasCodeBlock = !!msgEl.querySelector('pre, code');
      const hasMarkdownContent = fullText.includes('```') || fullText.includes('###');

      // 基于结构特征判断用户消息
      // 用户消息通常：较短、没有代码块、没有 Markdown 格式
      const isShortMessage = fullText.length < 300;
      const isLikelyUser = hasUserClass ||
                          (isShortMessage && !hasCodeBlock && !hasMarkdownContent && index % 2 === 0);

      // 如果有思考内容或助手特征，则不是用户消息
      const isUserMessage = isLikelyUser && !hasThinkingContent && !hasAssistantAvatar;

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
