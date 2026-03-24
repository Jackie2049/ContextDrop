import type { Platform } from '../types';

/**
 * 平台 Token 限制配置
 */
export interface PlatformLimit {
  platform: Platform;
  displayName: string;
  maxTokens: number;
}

/**
 * 各平台的上下文窗口限制
 * 注：实际限制可能因模型版本和订阅类型而异，这里使用典型值
 */
export const PLATFORM_LIMITS: PlatformLimit[] = [
  { platform: 'doubao', displayName: '豆包', maxTokens: 32000 },
  { platform: 'yuanbao', displayName: '元宝', maxTokens: 32000 },
  { platform: 'claude', displayName: 'Claude', maxTokens: 200000 },
  { platform: 'deepseek', displayName: 'DeepSeek', maxTokens: 64000 },
  { platform: 'kimi', displayName: 'Kimi', maxTokens: 200000 },
  { platform: 'gemini', displayName: 'Gemini', maxTokens: 1000000 },
  { platform: 'chatgpt', displayName: 'ChatGPT', maxTokens: 128000 },
];

/**
 * 获取平台的 Token 限制
 */
export function getPlatformTokenLimit(platform: Platform): number {
  const config = PLATFORM_LIMITS.find(p => p.platform === platform);
  return config?.maxTokens || 32000; // 默认 32K
}

/**
 * 获取平台显示名称
 */
export function getPlatformDisplayName(platform: Platform): string {
  const config = PLATFORM_LIMITS.find(p => p.platform === platform);
  return config?.displayName || platform;
}

/**
 * 估算文本的 Token 数
 * 使用字符数估算，无需 API：
 * - 中文：约 1.5 字符/token
 * - 英文：约 4 字符/token
 * - 混合：取中间值
 *
 * @param text 要估算的文本
 * @returns 估算的 token 数
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  // 统计中文字符
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = text.length;
  const chineseRatio = chineseChars / totalChars;

  // 根据中文字符比例选择估算系数
  if (chineseRatio > 0.5) {
    // 中文为主：约 1.5 字符/token
    return Math.ceil(totalChars / 1.5);
  } else if (chineseRatio < 0.1) {
    // 英文为主：约 4 字符/token
    return Math.ceil(totalChars / 4);
  } else {
    // 混合：约 2.5 字符/token
    return Math.ceil(totalChars / 2.5);
  }
}

/**
 * 估算会话的 Token 数（包含格式化开销）
 * @param messages 消息列表
 * @param title 会话标题
 * @returns 估算的 token 数
 */
export function estimateSessionTokens(messages: Array<{ role: string; content: string }>, title?: string): number {
  let totalTokens = 0;

  // 格式化模板开销（约 50 tokens）
  totalTokens += 50;

  // 标题
  if (title) {
    totalTokens += estimateTokens(title);
  }

  // 每条消息（包含角色标记的开销，每条约 5 tokens）
  for (const msg of messages) {
    totalTokens += estimateTokens(msg.content) + 5;
  }

  return totalTokens;
}

/**
 * 格式化 Token 数显示
 */
export function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return String(count);
}

/**
 * 检查是否需要截断
 * @param tokenCount 当前 token 数
 * @param limit 平台限制
 * @param threshold 阈值比例（默认 0.8，即 80%）
 */
export function needsTruncation(tokenCount: number, limit: number, threshold: number = 0.8): boolean {
  return tokenCount > limit * threshold;
}

/**
 * 计算保留最近 N 条消息后的 token 数
 */
export function calculateTruncatedTokens(
  messages: Array<{ role: string; content: string }>,
  keepCount: number,
  title?: string
): number {
  const recentMessages = messages.slice(-keepCount);
  return estimateSessionTokens(recentMessages, title);
}

/**
 * 找到最适合的截断位置
 * 返回在 token 限制内可以保留的最大消息数
 */
export function findOptimalKeepCount(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  title?: string
): number {
  // 二分查找
  let left = 1;
  let right = messages.length;
  let result = messages.length;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const tokens = calculateTruncatedTokens(messages, mid, title);

    if (tokens <= maxTokens) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}
