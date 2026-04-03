import type { Session } from '../types';
import { formatPlatformName } from './extractor';

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function formatSessionForInjection(
  session: Session,
  mode: 'full' | 'summary'
): string {
  const platformName = session.platform ? formatPlatformName(session.platform) : 'AI';
  const timestamp = formatTimestamp(session.createdAt);

  let content = '';

  if (mode === 'full') {
    content = session.messages
      .map((msg) => {
        const role = msg.role === 'user' ? '用户' : platformName;
        return `[${role}] ${msg.content}`;
      })
      .join('\n\n');
  } else {
    // Summary mode - use first user message as summary
    const firstUserMsg = session.messages.find((m) => m.role === 'user');
    content = firstUserMsg
      ? firstUserMsg.content.slice(0, 100) + (firstUserMsg.content.length > 100 ? '...' : '')
      : '无内容';
  }

  return `【上下文引用】
以下是我之前在${platformName}的对话记录：

---
会话: ${session.title}
来源: ${platformName}
日期: ${timestamp}
消息数: ${session.messageCount}

${content}
---

基于以上背景，请帮我继续...
`;
}
