// 支持的平台
export type Platform = 'doubao' | 'yuanbao' | 'claude' | 'deepseek' | 'kimi';

// 消息
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Session
export interface Session {
  id: string;
  platform: Platform;
  title: string;
  sourceUrl: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  messageCount: number;
}

// 注入配置
export interface InjectionConfig {
  sourceSessionId: string;
  sourcePlatform: Platform;
  targetPlatform: Platform;
  targetSessionId?: string;
  mode: 'full' | 'summary';
  injectedAt: number;
}

// 平台配置
export interface PlatformConfig {
  name: Platform;
  displayName: string;
  hostname: string;
  selectors: {
    messageContainer: string;
    userMessage: string;
    assistantMessage: string;
    title: string[];
  };
}

// 标签
export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

// Session 标签关联
export interface SessionTag {
  sessionId: string;
  tagIds: string[];
}
