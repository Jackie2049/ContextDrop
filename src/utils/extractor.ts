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
};

export function detectPlatform(url: string): Platform | null {
  const hostname = new URL(url).hostname;

  if (hostname.includes('doubao.com')) return 'doubao';
  if (hostname.includes('yuanbao.tencent.com')) return 'yuanbao';
  if (hostname.includes('claude.ai')) return 'claude';

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

    // 尝试多种选择器找到消息块
    const selectors = [
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
        console.log(`[OmniContext] Found ${elements.length} message blocks with: ${selector}`);
        break;
      }
    }

    if (messageBlocks.length === 0) {
      console.warn('[OmniContext] No message blocks found, trying fallback extraction');
      return this.extractMessagesFromDocument();
    }

    messageBlocks.forEach((block, index) => {
      const fullText = block.textContent || '';
      console.log(`[OmniContext] Block ${index}: "${fullText.substring(0, 50)}..."`);

      // 多重检测用户消息的方式
      // 1. 检查 bg-s-color-bg-trans 类（豆包用户消息标志）
      const hasUserClass = !!block.querySelector('[class*="bg-s-color-bg-trans"]');

      // 2. 检查是否有助手特有的元素（头像、thinking等）
      const hasAssistantAvatar = !!block.querySelector('[class*="avatar"], [class*="bot-avatar"], [class*="ai-avatar"], img');
      const hasThinkingSection = !!block.querySelector('[class*="thinking"], [class*="thought"], [class*="reasoning"]');

      // 3. 根据内容特征判断
      const hasAssistantMarkers = fullText.includes('已完成思考') ||
                                   fullText.includes('思考过程') ||
                                   fullText.includes('让我来') ||
                                   fullText.includes('我来帮你') ||
                                   fullText.includes('我来分析') ||
                                   fullText.includes('好的') ||
                                   fullText.includes('以下是') ||
                                   fullText.length > 200; // 助手回复通常较长

      console.log(`[OmniContext] Block ${index}: hasUserClass=${hasUserClass}, hasAssistantAvatar=${hasAssistantAvatar}, hasThinkingSection=${hasThinkingSection}, hasAssistantMarkers=${hasAssistantMarkers}`);

      // 综合判断：如果有助手特征，则不是用户消息
      const isUserMessage = hasUserClass && !hasAssistantAvatar && !hasThinkingSection && !hasAssistantMarkers;

      if (isUserMessage) {
        // User message - extract normally
        const contentElement = block.querySelector('[class*="container-"]') ||
                               block.querySelector('[class*="message-content"]') ||
                               block.querySelector('[class*="content"]') ||
                               block;
        const content = this.extractTextContent(contentElement);
        console.log(`[OmniContext] Block ${index} -> USER: "${content?.substring(0, 50)}..."`);
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
        const contentElement = block.querySelector('[class*="container-"]') ||
                               block.querySelector('[class*="message-content"]') ||
                               block.querySelector('[class*="content"]') ||
                               block;
        const content = this.extractDoubaoAssistantContent(contentElement);
        console.log(`[OmniContext] Block ${index} -> ASSISTANT: "${content?.substring(0, 50)}..."`);
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

    console.log(`[OmniContext] Extracted ${messages.length} messages from Doubao, user: ${messages.filter(m => m.role === 'user').length}, assistant: ${messages.filter(m => m.role === 'assistant').length}`);

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
