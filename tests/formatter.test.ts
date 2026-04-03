import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatSessionForInjection, formatTimestamp } from '../src/utils/formatter';
import type { Session, Platform } from '../src/types';

describe('formatter', () => {
  describe('formatTimestamp', () => {
    it('should format timestamp to readable date', () => {
      const timestamp = new Date('2024-01-15T14:30:00').getTime();
      const result = formatTimestamp(timestamp);
      expect(result).toContain('2024');
      expect(result).toContain('01');
      expect(result).toContain('15');
    });

    it('should handle current timestamp', () => {
      const now = Date.now();
      const result = formatTimestamp(now);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format with correct time', () => {
      const timestamp = new Date('2024-06-20T09:05:00').getTime();
      const result = formatTimestamp(timestamp);
      expect(result).toContain('09');
      expect(result).toContain('05');
    });

    it('should pad single digit month and day', () => {
      const timestamp = new Date('2024-01-05T08:03:00').getTime();
      const result = formatTimestamp(timestamp);
      expect(result).toContain('01-05'); // Month and day padded
      expect(result).toContain('08:03'); // Hours and minutes padded
    });
  });

  describe('formatSessionForInjection', () => {
    const mockSession: Session = {
      id: 'test-1',
      source: 'platform',
      platform: 'doubao' as Platform,
      title: 'Java学习路线',
      sourceUrl: 'https://www.doubao.com/chat/123',
      createdAt: new Date('2024-01-15T10:00:00').getTime(),
      updatedAt: new Date('2024-01-15T11:00:00').getTime(),
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: '我想学Java，有什么建议？',
          timestamp: new Date('2024-01-15T10:00:00').getTime(),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Java是一门很好的编程语言，建议从基础开始...',
          timestamp: new Date('2024-01-15T10:01:00').getTime(),
        },
        {
          id: 'msg-3',
          role: 'user',
          content: '具体需要学哪些内容？',
          timestamp: new Date('2024-01-15T10:05:00').getTime(),
        },
      ],
      messageCount: 3,
    };

    describe('full mode', () => {
      it('should format session with full messages', () => {
        const result = formatSessionForInjection(mockSession, 'full');

        expect(result).toContain('【上下文引用】');
        expect(result).toContain('豆包');
        expect(result).toContain('Java学习路线');
        expect(result).toContain('我想学Java，有什么建议？');
        expect(result).toContain('Java是一门很好的编程语言');
        expect(result).toContain('具体需要学哪些内容？');
      });

      it('should format session with role labels', () => {
        const result = formatSessionForInjection(mockSession, 'full');

        expect(result).toContain('[用户]');
        expect(result).toContain('[豆包]');
      });

      it('should handle empty messages', () => {
        const emptySession: Session = {
          ...mockSession,
          messages: [],
          messageCount: 0,
        };

        const result = formatSessionForInjection(emptySession, 'full');

        expect(result).toContain('【上下文引用】');
        expect(result).toContain('豆包');
        expect(result).toContain('Java学习路线');
      });

      it('should handle all platforms', () => {
        const platforms: Platform[] = ['doubao', 'yuanbao', 'claude', 'deepseek', 'kimi'];

        for (const platform of platforms) {
          const session: Session = {
            ...mockSession,
            platform,
          };

          const result = formatSessionForInjection(session, 'full');
          expect(result).toContain('【上下文引用】');
        }
      });

      it('should handle missing platform gracefully', () => {
        const noPlatformSession: Session = {
          ...mockSession,
          platform: undefined as unknown as Platform,
        };

        const result = formatSessionForInjection(noPlatformSession, 'full');
        expect(result).toContain('AI'); // Should use 'AI' as fallback
      });

      it('should include message count', () => {
        const result = formatSessionForInjection(mockSession, 'full');
        expect(result).toContain('消息数: 3');
      });

      it('should include source URL', () => {
        const result = formatSessionForInjection(mockSession, 'full');
        expect(result).toContain('基于以上背景');
      });
    });

    describe('summary mode', () => {
      it('should format session in summary mode', () => {
        const result = formatSessionForInjection(mockSession, 'summary');

        expect(result).toContain('【上下文引用】');
        expect(result).toContain('我想学Java，有什么建议？');
        // Should be truncated to 100 chars
        expect(result).not.toContain('具体需要学哪些内容？');
      });

      it('should show "无内容" when no user messages', () => {
        const assistantOnlySession: Session = {
          ...mockSession,
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'AI response only',
              timestamp: Date.now(),
            },
          ],
        };

        const result = formatSessionForInjection(assistantOnlySession, 'summary');
        expect(result).toContain('无内容');
      });

      it('should truncate long content in summary mode', () => {
        const longSession: Session = {
          ...mockSession,
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              content: 'a'.repeat(200),
              timestamp: Date.now(),
            },
          ],
        };

        const result = formatSessionForInjection(longSession, 'summary');
        expect(result).toContain('...');
        expect(result).toContain('a'.repeat(100)); // First 100 chars
      });

      it('should not add ellipsis for short content in summary', () => {
        const shortSession: Session = {
          ...mockSession,
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              content: 'Short message',
              timestamp: Date.now(),
            },
          ],
        };

        const result = formatSessionForInjection(shortSession, 'summary');
        expect(result).toContain('Short message');
        // Note: "..." may appear in other parts of the template (e.g. ending)
        // but should NOT appear right after "Short message" since it's < 100 chars
        expect(result).not.toMatch(/Short message\.\.\./);
      });

      it('should find first user message in mixed messages', () => {
        const mixedSession: Session = {
          ...mockSession,
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'First assistant',
              timestamp: Date.now(),
            },
            {
              id: 'msg-2',
              role: 'user',
              content: 'First user message',
              timestamp: Date.now(),
            },
            {
              id: 'msg-3',
              role: 'user',
              content: 'Second user message',
              timestamp: Date.now(),
            },
          ],
        };

        const result = formatSessionForInjection(mixedSession, 'summary');
        expect(result).toContain('First user message');
        expect(result).not.toContain('Second user message');
      });
    });
  });
});
