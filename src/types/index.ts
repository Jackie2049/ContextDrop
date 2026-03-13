// 支持的平台
export type Platform = 'doubao' | 'yuanbao' | 'claude' | 'deepseek' | 'kimi' | 'gemini' | 'chatgpt';

// 数据来源类型
export type Source = 'platform' | 'api';

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
  source: Source;              // 数据来源：platform(网页捕获) 或 api(API写入)
  platform?: Platform;         // 仅 source=platform 时有值
  title: string;
  sourceUrl?: string;          // 仅 source=platform 时有值
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  messageCount: number;
  tags?: string[];
  metadata?: Record<string, any>; // API 写入可自定义扩展字段
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
