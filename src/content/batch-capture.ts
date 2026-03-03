import { sessionStorage } from '../storage/session-storage';
import { createMessageExtractor } from '../utils/extractor';
import type { Platform, Session } from '../types';

export interface DiscoveredSession {
  id: string;
  title: string;
  platform: string;
}

export interface BatchCaptureProgress {
  total: number;
  current: number;
  currentTitle: string;
  captured: number;
  status: 'scanning' | 'waiting_selection' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error';
  error?: string;
  /** 扫描阶段：已发现的会话数 */
  discovered?: number;
  /** 是否处于扫描阶段 */
  isScanning?: boolean;
  /** 预估剩余时间（秒） */
  eta?: number;
  /** 刚捕获完一个 session，需要刷新列表 */
  sessionJustCaptured?: boolean;
  /** 扫描发现的会话列表（用于用户选择） */
  discoveredSessions?: DiscoveredSession[];
  /** 当前会话已加载的消息数 */
  sessionMessagesLoaded?: number;
  /** 当前会话总消息数（加载完成后） */
  sessionMessagesTotal?: number;
  /** 新捕获的会话数 */
  newSessions?: number;
  /** 更新的会话数 */
  updatedSessions?: number;
}

type ProgressCallback = (progress: BatchCaptureProgress) => void;

const BATCH_CAPTURE_STATE_KEY = 'batch_capture_state';

export class BatchCapture {
  private platform: Platform;
  private isPaused = false;
  private isCancelled = false;
  private onProgress: ProgressCallback | null = null;
  private processedSessions: Set<string> = new Set();
  private totalCaptured = 0;
  private floatingProgress: HTMLElement | null = null;
  // ETA calculation
  private sessionTimes: number[] = []; // 最近10个会话的处理时间
  // 扫描发现的会话
  private discoveredSessions: DiscoveredSession[] = [];
  // 待捕获的会话ID列表（用户选择后）
  private selectedSessionIds: Set<string> = new Set();
  // 等待用户选择
  private waitingForSelection = false;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  async start(onProgress: ProgressCallback): Promise<void> {
    this.onProgress = onProgress;
    this.isPaused = false;
    this.isCancelled = false;
    this.processedSessions.clear();
    this.totalCaptured = 0;
    this.sessionTimes = [];
    this.discoveredSessions = [];
    this.selectedSessionIds = new Set();
    this.waitingForSelection = false;

    // 创建浮动进度条
    this.createFloatingProgress();

    try {
      // 1. 先滚动侧边栏加载所有会话（带扫描进度）
      await this.scrollToLoadAllSessions();

      // 2. 获取会话列表
      const sessionElements = await this.getSessionListElements();

      if (sessionElements.length === 0) {
        this.reportProgress({
          total: 0,
          current: 0,
          currentTitle: '',
          captured: 0,
          status: 'error',
          error: '未找到会话列表',
        });
        return;
      }

      // 3. 收集所有会话信息（不捕获，只获取标题和ID）
      for (const element of sessionElements) {
        const title = this.getSessionTitle(element);
        const id = this.getSessionIdFromElement(element) || `${this.platform}-${Date.now()}-${Math.random()}`;
        this.discoveredSessions.push({
          id,
          title,
          platform: this.platform,
        });
      }

      console.log(`[OmniContext] Discovered ${this.discoveredSessions.length} sessions`);

      // 4. 通知 popup 等待用户选择
      this.waitingForSelection = true;
      this.reportProgress({
        total: this.discoveredSessions.length,
        current: 0,
        currentTitle: '',
        captured: 0,
        status: 'waiting_selection',
        discoveredSessions: this.discoveredSessions,
      });

      // 等待用户选择（通过 setSelectedSessions 方法设置）
      while (this.waitingForSelection && !this.isCancelled) {
        await this.sleep(500);
      }

      if (this.isCancelled) {
        this.reportProgress({
          total: this.discoveredSessions.length,
          current: 0,
          currentTitle: '',
          captured: 0,
          status: 'cancelled',
        });
        return;
      }

      // 5. 开始捕获选中的会话
      await this.captureSelectedSessions(sessionElements);

    } catch (err: any) {
      this.reportProgress({
        total: 0,
        current: 0,
        currentTitle: '',
        captured: 0,
        status: 'error',
        error: err.message || '未知错误',
      });
    }
  }

  /**
   * 设置用户选择的会话ID列表
   */
  setSelectedSessions(sessionIds: string[]): void {
    this.selectedSessionIds = new Set(sessionIds);
    this.waitingForSelection = false;
    console.log(`[OmniContext] User selected ${sessionIds.length} sessions to capture`);
  }

  /**
   * 捕获选中的会话
   */
  private async captureSelectedSessions(sessionElements: Element[]): Promise<void> {
    const total = this.selectedSessionIds.size;
    console.log(`[OmniContext] Starting capture of ${total} selected sessions out of ${sessionElements.length} total elements`);

    if (total === 0) {
      this.reportProgress({
        total: this.discoveredSessions.length,
        current: 0,
        currentTitle: '',
        captured: 0,
        status: 'completed',
      });
      setTimeout(() => this.removeFloatingProgress(), 3000);
      return;
    }

    let captured = 0;
    let newCount = 0;      // 新捕获的会话数
    let updatedCount = 0;  // 更新的会话数

    for (let i = 0; i < sessionElements.length; i++) {
      // 检查暂停/取消
      while (this.isPaused && !this.isCancelled) {
        await this.sleep(500);
      }
      if (this.isCancelled) {
        this.reportProgress({
          total,
          current: captured,
          currentTitle: '',
          captured: this.totalCaptured,
          status: 'cancelled',
        });
        return;
      }

      const element = sessionElements[i];
      const title = this.getSessionTitle(element);
      const preSessionId = this.getSessionIdFromElement(element);

      // 如果这个会话不在用户选择列表中，跳过
      if (!preSessionId || !this.selectedSessionIds.has(preSessionId)) {
        // console.log(`[OmniContext] Skipping session (not selected): ${title}`);
        continue;
      }

      // 去重检查
      if (this.processedSessions.has(preSessionId)) {
        console.log(`[OmniContext] Skipping duplicate session: ${title}`);
        continue;
      }

      console.log(`[OmniContext] Processing session ${captured + 1}/${total}: ${title}`);

      const sessionStart = Date.now();

      // 确保进度不超过总数
      const progressCurrent = Math.min(captured + 1, total);
      this.reportProgress({
        total,
        current: progressCurrent,
        currentTitle: title,
        captured: this.totalCaptured,
        status: 'running',
        eta: this.calculateETA(captured, total),
      });

      try {
        // 点击会话
        await this.clickSession(element);

        // 检查取消
        if (this.isCancelled) {
          this.reportProgress({
            total,
            current: captured,
            currentTitle: '',
            captured: this.totalCaptured,
            status: 'cancelled',
          });
          return;
        }

        // 等待加载
        await this.waitForSessionLoad();

        // 检查取消
        if (this.isCancelled) {
          this.reportProgress({
            total,
            current: captured,
            currentTitle: '',
            captured: this.totalCaptured,
            status: 'cancelled',
          });
          return;
        }

        // 滚动加载历史，获取消息总数
        const sessionMessageTotal = await this.scrollToLoadHistory();

        // 检查取消
        if (this.isCancelled) {
          this.reportProgress({
            total,
            current: captured,
            currentTitle: '',
            captured: this.totalCaptured,
            status: 'cancelled',
          });
          return;
        }

        // 报告进度：正在捕获（显示消息数）
        this.reportProgress({
          total,
          current: captured + 1,
          currentTitle: title,
          captured: this.totalCaptured,
          status: 'running',
          eta: this.calculateETA(captured, total),
          sessionMessagesTotal: sessionMessageTotal,
        });

        // 捕获当前会话
        const captureResult = await this.captureCurrentSession();

        if (captureResult) {
          const { session, isNew, isUpdated } = captureResult;
          // 使用 preSessionId 而不是 session.id，确保与去重检查一致
          this.processedSessions.add(preSessionId);
          this.totalCaptured += session.messageCount;

          // 统计新捕获和更新的会话
          if (isNew) {
            newCount++;
          } else if (isUpdated) {
            updatedCount++;
          }
        }

        // 记录处理时间
        const sessionTime = Date.now() - sessionStart;
        this.sessionTimes.push(sessionTime);
        if (this.sessionTimes.length > 10) {
          this.sessionTimes.shift();
        }

        captured++;

        // 报告进度（确保不超过总数）
        const postProgressCurrent = Math.min(captured, total);
        this.reportProgress({
          total,
          current: postProgressCurrent,
          currentTitle: title,
          captured: this.totalCaptured,
          status: 'running',
          eta: this.calculateETA(captured, total),
          sessionJustCaptured: true,
          sessionMessagesTotal: sessionMessageTotal,
        });

        await this.sleep(300);

      } catch (err) {
        console.error(`[OmniContext] Failed to capture session: ${title}`, err);
      }
    }

    this.reportProgress({
      total,
      current: captured,
      currentTitle: '',
      captured: this.totalCaptured,
      status: 'completed',
      newSessions: newCount,
      updatedSessions: updatedCount,
    });

    setTimeout(() => this.removeFloatingProgress(), 3000);
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  cancel(): void {
    this.isCancelled = true;
    this.removeFloatingProgress();
  }

  /**
   * 计算预估剩余时间（秒）
   */
  private calculateETA(current: number, total: number): number | undefined {
    if (this.sessionTimes.length < 2) {
      return undefined; // 至少需要2个样本
    }

    // 计算平均处理时间
    const avgTime = this.sessionTimes.reduce((a, b) => a + b, 0) / this.sessionTimes.length;
    const remaining = total - current; // 剩余会话数

    // 如果没有剩余会话，返回 undefined
    if (remaining <= 0) {
      return undefined;
    }

    return Math.round((avgTime * remaining) / 1000); // 转换为秒
  }

  private reportProgress(progress: BatchCaptureProgress): void {
    // 1. 保存状态到 storage（用于恢复）
    this.saveState(progress);

    // 2. 回调给 popup
    if (this.onProgress) {
      this.onProgress(progress);
    }

    // 3. 更新浮动进度条
    this.updateFloatingProgress(progress);
  }

  private async saveState(progress: BatchCaptureProgress): Promise<void> {
    try {
      await chrome.storage.local.set({
        [BATCH_CAPTURE_STATE_KEY]: {
          ...progress,
          platform: this.platform,
          timestamp: Date.now(),
        }
      });
    } catch (err) {
      // 忽略存储错误
    }
  }

  // ========== 浮动进度条 ==========

  private createFloatingProgress(): void {
    if (this.floatingProgress) return;

    const container = document.createElement('div');
    container.id = 'omnicontext-batch-progress';
    container.innerHTML = `
      <div class="oc-progress-header">
        <span>📦 OmniContext 批量捕获</span>
        <div class="oc-progress-header-btns">
          <button class="oc-progress-minimize" title="最小化">−</button>
          <button class="oc-progress-close" title="关闭">×</button>
        </div>
      </div>
      <div class="oc-scan-status" style="display: none;">
        <span class="oc-scan-text">正在扫描 <strong class="oc-scan-platform"></strong> 的会话列表</span>
        <span class="oc-scan-dots"><span>.</span><span>.</span><span>.</span></span>
        <span class="oc-scan-count">已找到 <strong>0</strong> 个</span>
      </div>
      <div class="oc-capture-status">
        <div class="oc-progress-bar">
          <div class="oc-progress-fill"></div>
        </div>
        <div class="oc-progress-info">
          <span class="oc-progress-count">0/?</span>
          <span class="oc-progress-eta"></span>
        </div>
        <div class="oc-progress-title">准备中...</div>
      </div>
      <button class="oc-progress-cancel">取消</button>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      #omnicontext-batch-progress {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 300px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        padding: 16px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
      }
      #omnicontext-batch-progress .oc-progress-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        font-weight: 600;
      }
      #omnicontext-batch-progress .oc-progress-close {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #999;
      }
      /* 扫描状态样式 */
      #omnicontext-batch-progress .oc-scan-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        background: linear-gradient(135deg, #f0f7ff 0%, #e8f4ff 100%);
        border-radius: 8px;
        margin-bottom: 12px;
      }
      #omnicontext-batch-progress .oc-scan-dots {
        display: inline-flex;
        gap: 2px;
      }
      #omnicontext-batch-progress .oc-scan-dots span {
        animation: oc-bounce 1.4s infinite ease-in-out both;
        color: #667eea;
        font-weight: bold;
      }
      #omnicontext-batch-progress .oc-scan-dots span:nth-child(1) { animation-delay: -0.32s; }
      #omnicontext-batch-progress .oc-scan-dots span:nth-child(2) { animation-delay: -0.16s; }
      #omnicontext-batch-progress .oc-scan-dots span:nth-child(3) { animation-delay: 0s; }
      @keyframes oc-bounce {
        0%, 80%, 100% { opacity: 0.3; }
        40% { opacity: 1; }
      }
      #omnicontext-batch-progress .oc-scan-text {
        color: #555;
        font-weight: 500;
      }
      #omnicontext-batch-progress .oc-scan-count {
        margin-left: auto;
        color: #667eea;
        font-size: 12px;
      }
      #omnicontext-batch-progress .oc-scan-count strong {
        font-size: 16px;
        font-weight: 600;
      }
      /* 捕获状态样式 */
      #omnicontext-batch-progress .oc-progress-bar {
        height: 6px;
        background: #e8e8e8;
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 10px;
      }
      #omnicontext-batch-progress .oc-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #667eea, #764ba2);
        border-radius: 3px;
        transition: width 0.3s;
        width: 0%;
      }
      #omnicontext-batch-progress .oc-progress-info {
        display: flex;
        justify-content: space-between;
        margin-bottom: 6px;
      }
      #omnicontext-batch-progress .oc-progress-title {
        color: #666;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #omnicontext-batch-progress .oc-progress-captured {
        color: #888;
        font-size: 12px;
        margin-bottom: 10px;
      }
      #omnicontext-batch-progress .oc-progress-cancel {
        width: 100%;
        padding: 8px;
        background: #f5f5f5;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
      }
      #omnicontext-batch-progress .oc-progress-cancel:hover {
        background: #ff4d4f;
        color: white;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(container);
    this.floatingProgress = container;

    // 绑定事件
    container.querySelector('.oc-progress-close')?.addEventListener('click', () => {
      this.removeFloatingProgress();
    });
    container.querySelector('.oc-progress-cancel')?.addEventListener('click', () => {
      this.cancel();
    });
  }

  private updateFloatingProgress(progress: BatchCaptureProgress): void {
    if (!this.floatingProgress) return;

    const scanStatus = this.floatingProgress.querySelector('.oc-scan-status');
    const captureStatus = this.floatingProgress.querySelector('.oc-capture-status');
    const scanPlatformEl = this.floatingProgress.querySelector('.oc-scan-platform');
    const scanCount = this.floatingProgress.querySelector('.oc-scan-count strong');
    const countEl = this.floatingProgress.querySelector('.oc-progress-count');
    const etaEl = this.floatingProgress.querySelector('.oc-progress-eta');
    const fillEl = this.floatingProgress.querySelector('.oc-progress-fill');
    const titleEl = this.floatingProgress.querySelector('.oc-progress-title');

    // 切换扫描/捕获状态显示
    if (progress.isScanning || progress.status === 'scanning') {
      // 扫描模式
      if (scanStatus) (scanStatus as HTMLElement).style.display = 'flex';
      if (captureStatus) (captureStatus as HTMLElement).style.display = 'none';
      // 设置平台名称
      if (scanPlatformEl) {
        scanPlatformEl.textContent = this.getPlatformName(this.platform);
      }
      if (scanCount && progress.discovered !== undefined) {
        scanCount.textContent = String(progress.discovered);
      }
    } else {
      // 捕获模式
      if (scanStatus) (scanStatus as HTMLElement).style.display = 'none';
      if (captureStatus) (captureStatus as HTMLElement).style.display = 'block';

      if (countEl) {
        countEl.textContent = `${progress.current}/${progress.total || '?'}`;
      }
      if (etaEl && progress.eta !== undefined && progress.eta > 0) {
        (etaEl as HTMLElement).textContent = `· 预计 ${this.formatETA(progress.eta)}`;
      } else if (etaEl) {
        (etaEl as HTMLElement).textContent = '';
      }
      if (fillEl && progress.total > 0) {
        (fillEl as HTMLElement).style.width = `${(progress.current / progress.total) * 100}%`;
      }
      // 更新标题：显示当前会话的消息数和已捕获的总消息数
      if (titleEl) {
        const title = progress.currentTitle || '处理中';
        const sessionMsgTotal = progress.sessionMessagesTotal;
        if (sessionMsgTotal && sessionMsgTotal > 0) {
          titleEl.textContent = `正在处理 ${title} (${sessionMsgTotal}条)`;
        } else {
          titleEl.textContent = `正在处理 ${title}`;
        }
      }
    }
  }

  /**
   * 格式化 ETA 显示
   */
  private formatETA(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}秒`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
    }
  }

  private getPlatformName(platform: Platform): string {
    const names: Record<Platform, string> = {
      doubao: '豆包',
      yuanbao: '元宝',
      claude: 'Claude',
    };
    return names[platform] || platform;
  }

  private removeFloatingProgress(): void {
    if (this.floatingProgress) {
      this.floatingProgress.remove();
      this.floatingProgress = null;
    }
    // 清除保存的状态
    chrome.storage.local.remove(BATCH_CAPTURE_STATE_KEY);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ========== 平台特定方法（由子类实现） ==========

  protected async getSessionListElements(): Promise<Element[]> {
    if (this.platform === 'doubao') {
      return this.getDoubaoSessionListElements();
    }
    // 其他平台待实现
    return [];
  }

  protected getSessionTitle(element: Element): string {
    if (this.platform === 'doubao') {
      return this.getDoubaoSessionTitle(element);
    }
    return '未知会话';
  }

  protected getSessionIdFromElement(element: Element): string | null {
    if (this.platform === 'doubao') {
      return this.getDoubaoSessionIdFromElement(element);
    }
    return null;
  }

  /**
   * 统计侧边栏中的会话数量（使用与 getSessionListElements 相同的选择器）
   */
  private countSessionsInSidebar(sidebar: Element): number {
    // 使用精确的选择器，只匹配侧边栏内的会话项
    const selectors = [
      '#flow_chat_sidebar [class*="chat-item"]',
      '[data-testid="flow_chat_sidebar"] [class*="chat-item"]',
    ];

    for (const selector of selectors) {
      // 检查 sidebar 本身是否匹配选择器的前缀
      const baseSelector = selector.split(' ')[0];
      if (sidebar.matches(baseSelector) || sidebar.querySelector(baseSelector)) {
        const items = sidebar.querySelectorAll('[class*="chat-item"]');
        // 进一步过滤：只保留看起来像会话的元素（排除消息）
        let count = 0;
        items.forEach(item => {
          // 会话项通常是可点击的，并且不包含大量文本内容
          const textLength = item.textContent?.length || 0;
          // 会话标题通常比较短（<200字符），消息内容会很长
          if (textLength < 200) {
            count++;
          }
        });
        return count;
      }
    }

    // 降级方案：直接统计
    return sidebar.querySelectorAll('[class*="chat-item"]').length;
  }

  private getDoubaoSessionIdFromElement(element: Element): string | null {
    // 豆包会话元素可能有 data 属性或 href
    // 尝试多种方式获取 ID

    // 方式1: data-session-id 或类似属性
    const dataId = element.getAttribute('data-session-id') ||
                   element.getAttribute('data-id') ||
                   element.getAttribute('data-chat-id');
    if (dataId) return dataId;

    // 方式2: 从子元素的 href 提取
    const linkEl = element.querySelector('a[href*="/chat/"]');
    if (linkEl) {
      const href = linkEl.getAttribute('href');
      if (href) {
        const match = href.match(/\/chat\/([^/?]+)/);
        if (match) return match[1];
      }
    }

    // 方式3: 使用标题+内容的 hash 作为唯一标识
    const title = this.getDoubaoSessionTitle(element);
    const preview = element.textContent?.trim().slice(0, 100) || '';
    return `doubao-${this.simpleHash(title + preview)}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  protected async clickSession(element: Element): Promise<void> {
    (element as HTMLElement).click();
  }

  protected async waitForSessionLoad(): Promise<void> {
    await this.sleep(1500); // 等待页面加载
  }

  /**
   * 滚动加载历史消息，返回总消息数
   */
  protected async scrollToLoadHistory(): Promise<number> {
    if (this.platform === 'doubao') {
      return this.doubaoScrollToLoadHistory();
    }
    return 0;
  }

  /**
   * 统计当前页面的消息数
   */
  protected countMessages(): number {
    const selectors = [
      '[class*="message-item"]',
      '[class*="chat-message"]',
      '[data-message-id]',
      '[class*="message-content"]',
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        return elements.length;
      }
    }
    return 0;
  }

  protected async captureCurrentSession(): Promise<{ session: Session; isNew: boolean; isUpdated: boolean; oldCount: number } | null> {
    try {
      const extractor = createMessageExtractor(this.platform);
      const messages = extractor.extractMessages();
      const title = extractor.extractTitle();

      if (messages.length === 0) return null;

      // 从 URL 提取 session ID
      const url = window.location.href;
      const sessionId = this.extractSessionId(url);

      const session: Session = {
        id: sessionId,
        platform: this.platform,
        title: title || '未命名对话',
        sourceUrl: url,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages,
        messageCount: messages.length,
      };

      // 检查是否已存在
      const existing = await sessionStorage.getSession(sessionId);
      let isNew = true;
      let isUpdated = false;
      let oldCount = 0;

      if (existing) {
        session.createdAt = existing.createdAt;
        isNew = false;
        oldCount = existing.messageCount;
        // 检查消息数量是否变化
        if (existing.messageCount !== messages.length) {
          isUpdated = true;
        }
      }

      await sessionStorage.saveSessionOptimized(session);
      return { session, isNew, isUpdated, oldCount };

    } catch (err) {
      console.error('[OmniContext] Capture failed:', err);
      return null;
    }
  }

  protected extractSessionId(url: string): string {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);

    for (const part of pathParts) {
      if (part && part !== 'chat' && part !== 'c' && part.length >= 4) {
        return part;
      }
    }

    // Fallback
    return `${this.platform}-${Date.now()}`;
  }

  // ========== 豆包平台特定实现 ==========

  private async scrollToLoadAllSessions(): Promise<void> {
    // 1. 首先确保侧边栏打开
    await this.ensureSidebarOpen();

    // 2. 查找侧边栏滚动容器
    const sidebarSelectors = [
      '#flow_chat_sidebar',
      '[data-testid="flow_chat_sidebar"]',
      '[class*="sidebar"]',
    ];

    let sidebar: Element | null = null;
    for (const selector of sidebarSelectors) {
      sidebar = document.querySelector(selector);
      if (sidebar) {
        console.log(`[OmniContext] Found sidebar: ${selector}`);
        break;
      }
    }

    if (!sidebar) {
      console.warn('[OmniContext] Sidebar not found for scrolling');
      return;
    }

    // 3. 查找真正可滚动的元素（可能是sidebar内部的子元素）
    const scrollContainer = this.findScrollableContainer(sidebar);

    if (!scrollContainer) {
      console.warn('[OmniContext] No scrollable container found');
      return;
    }

    console.log(`[OmniContext] Using scroll container:`, scrollContainer.tagName, scrollContainer.className);

    // 初始扫描进度
    this.reportProgress({
      total: 0,
      current: 0,
      currentTitle: '',
      captured: 0,
      status: 'scanning',
      isScanning: true,
      discovered: 0,
    });

    // 4. 滚动到底部加载所有会话
    let lastCount = 0;
    let noChangeCount = 0;

    while (noChangeCount < 3) {
      // 滚动到底部
      (scrollContainer as HTMLElement).scrollTop = scrollContainer.scrollHeight;
      await this.sleep(800);

      // 检查会话数量是否增加
      // 使用更精确的选择器，避免匹配到消息区域的元素
      const currentCount = this.countSessionsInSidebar(sidebar!);
      console.log(`[OmniContext] Sessions loaded: ${currentCount}, scrollTop: ${(scrollContainer as HTMLElement).scrollTop}, scrollHeight: ${scrollContainer.scrollHeight}`);

      // 更新扫描进度
      if (currentCount !== lastCount) {
        this.reportProgress({
          total: 0,
          current: 0,
          currentTitle: '',
          captured: 0,
          status: 'running',
          isScanning: true,
          discovered: currentCount,
        });
      }

      if (currentCount === lastCount) {
        noChangeCount++;
      } else {
        lastCount = currentCount;
        noChangeCount = 0;
      }
    }

    // 扫描完成
    console.log(`[OmniContext] Finished loading sessions, total: ${lastCount}`);
  }

  /**
   * 查找真正可滚动的容器
   * 在现代Web应用中，滚动容器通常是sidebar内部的某个子元素
   */
  private findScrollableContainer(root: Element): Element | null {
    // 首先检查root本身是否可滚动
    const rootStyle = window.getComputedStyle(root);
    if (this.isScrollable(root, rootStyle)) {
      console.log(`[OmniContext] Root element is scrollable`);
      return root;
    }

    // 递归查找子元素中的可滚动容器
    // 优先查找overflow-y为auto或scroll的元素
    const candidates: { element: Element; priority: number }[] = [];

    const traverse = (element: Element, depth: number) => {
      if (depth > 10) return; // 限制递归深度

      const style = window.getComputedStyle(element);
      const overflowY = style.overflowY;

      // 检查是否可滚动
      if (this.isScrollable(element, style)) {
        // 计算优先级：overflow:scroll/auto优先，更深的元素优先
        let priority = depth;
        if (overflowY === 'auto' || overflowY === 'scroll') {
          priority += 100;
        }
        // 带有特定class名的优先
        if (element.className && (
          element.className.includes('list') ||
          element.className.includes('scroll') ||
          element.className.includes('content')
        )) {
          priority += 50;
        }

        candidates.push({ element, priority });
      }

      // 递归遍历子元素
      for (const child of element.children) {
        traverse(child, depth + 1);
      }
    };

    traverse(root, 0);

    // 按优先级排序，选择最高优先级的元素
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.priority - a.priority);
      console.log(`[OmniContext] Found ${candidates.length} scrollable candidates`);
      return candidates[0].element;
    }

    return null;
  }

  /**
   * 检查元素是否可滚动
   */
  private isScrollable(element: Element, style?: CSSStyleDeclaration): boolean {
    const computedStyle = style || window.getComputedStyle(element);
    const overflowY = computedStyle.overflowY;

    // 检查overflow属性
    const hasScrollableOverflow = overflowY === 'auto' ||
                                   overflowY === 'scroll' ||
                                   overflowY === 'overlay';

    if (!hasScrollableOverflow) return false;

    // 检查是否有实际滚动空间
    return element.scrollHeight > element.clientHeight;
  }

  private async ensureSidebarOpen(): Promise<void> {
    // 检查侧边栏是否存在且可见
    const sidebar = document.querySelector('#flow_chat_sidebar');

    if (sidebar) {
      // 检查是否隐藏（豆包可能使用 translate 来隐藏）
      const style = window.getComputedStyle(sidebar);
      const transform = style.transform;
      const rect = sidebar.getBoundingClientRect();

      // 如果侧边栏被移出视图（translateX(-100%) 或类似）
      if (transform.includes('translate') && rect.x < 0) {
        console.log('[OmniContext] Sidebar is hidden, trying to open it');

        // 尝试找到打开侧边栏的按钮
        const openButtonSelectors = [
          '[class*="menu-button"]',
          '[class*="sidebar-toggle"]',
          '[class*="hamburger"]',
          '[data-testid="sidebar-toggle"]',
          'button[aria-label*="菜单"]',
          'button[aria-label*="侧边栏"]',
        ];

        for (const selector of openButtonSelectors) {
          const button = document.querySelector(selector);
          if (button) {
            console.log(`[OmniContext] Found open button: ${selector}`);
            (button as HTMLElement).click();
            await this.sleep(1000);

            // 检查是否成功打开
            const newRect = sidebar.getBoundingClientRect();
            if (newRect.x >= 0) {
              console.log('[OmniContext] Sidebar opened successfully');
              return;
            }
          }
        }

        console.warn('[OmniContext] Could not find button to open sidebar');
      } else {
        console.log('[OmniContext] Sidebar is already visible');
      }
    } else {
      console.warn('[OmniContext] Sidebar element not found');
    }
  }

  private getDoubaoSessionListElements(): Element[] {
    // 豆包的实际选择器 - 只匹配侧边栏中的会话项
    // 优先使用更精确的选择器，避免匹配消息区域
    const selectors = [
      // 最精确：在侧边栏容器内的会话项
      '#flow_chat_sidebar [class*="chat-item"]:not([class*="message"])',
      '[data-testid="flow_chat_sidebar"] [class*="chat-item"]:not([class*="message"])',
      // 侧边栏内的链接项（会话通常是可点击的链接）
      '#flow_chat_sidebar a[class*="chat-item"]',
      '[data-testid="flow_chat_sidebar"] a[class*="chat-item"]',
      // 侧边栏内的列表项
      '#flow_chat_sidebar li[class*="chat-item"]',
      '[data-testid="flow_chat_sidebar"] li[class*="chat-item"]',
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`[OmniContext] Found ${elements.length} sessions with: ${selector}`);
        // 进一步过滤：排除看起来像消息的元素（文本内容太长）
        const filtered = Array.from(elements).filter(el => {
          const textLength = el.textContent?.length || 0;
          // 会话标题通常较短（<200字符）
          return textLength < 200;
        });
        console.log(`[OmniContext] After filtering: ${filtered.length} sessions`);
        return filtered;
      }
    }

    // 降级方案：使用侧边栏限定，但需要更严格的过滤
    const sidebar = document.querySelector('#flow_chat_sidebar') ||
                    document.querySelector('[data-testid="flow_chat_sidebar"]');
    if (sidebar) {
      const items = sidebar.querySelectorAll('[class*="chat-item"]');
      const filtered = Array.from(items).filter(el => {
        const textLength = el.textContent?.length || 0;
        return textLength < 200;
      });
      console.log(`[OmniContext] Fallback: found ${items.length}, filtered to ${filtered.length}`);
      return filtered;
    }

    console.warn('[OmniContext] No session list found');
    return [];
  }

  private getDoubaoSessionTitle(element: Element): string {
    // 豆包会话标题 - 尝试多种选择器
    const titleEl = element.querySelector('[class*="title"]') ||
                    element.querySelector('[class*="name"]') ||
                    element.querySelector('span[class*="text"]') ||
                    element.querySelector('span');
    return titleEl?.textContent?.trim() || '未命名会话';
  }

  /**
   * 统计豆包页面的消息数
   */
  private countDoubaoMessages(root: Element): number {
    const selectors = [
      '[class*="message-item"]',
      '[class*="chat-message"]',
      '[data-message-id]',
      '[class*="message-content"]',
    ];

    for (const selector of selectors) {
      const elements = root.querySelectorAll(selector);
      if (elements.length > 0) {
        return elements.length;
      }
    }
    return 0;
  }

  private async doubaoScrollToLoadHistory(): Promise<number> {
    // 查找消息区域的根容器
    const rootSelectors = [
      '[class*="message-list"]',
      '[class*="chat-container"]',
      '[class*="conversation-content"]',
      '[class*="chat-main"]',
      'main',
    ];

    let root: Element | null = null;
    for (const selector of rootSelectors) {
      root = document.querySelector(selector);
      if (root) {
        console.log(`[OmniContext] Found message root: ${selector}`);
        break;
      }
    }

    if (!root) {
      console.warn('[OmniContext] Message container not found');
      return 0;
    }

    // 查找真正可滚动的容器
    const container = this.findScrollableContainer(root);

    if (!container) {
      console.warn('[OmniContext] No scrollable message container found, trying root itself');
      // 如果找不到可滚动容器，尝试直接使用root
      const rootStyle = window.getComputedStyle(root);
      if (root.scrollHeight <= root.clientHeight &&
          (rootStyle.overflowY === 'auto' || rootStyle.overflowY === 'scroll')) {
        return this.countDoubaoMessages(root);
      }
    }

    const scrollTarget = container || root;
    console.log(`[OmniContext] Scrolling message container:`, scrollTarget.className);

    // 滚动到顶部加载历史
    let lastHeight = scrollTarget.scrollHeight;
    let noChangeCount = 0;
    let messageCount = this.countDoubaoMessages(root);

    while (noChangeCount < 3 && !this.isCancelled) {
      (scrollTarget as HTMLElement).scrollTop = 0;
      await this.sleep(500);

      // 检查取消
      if (this.isCancelled) {
        console.log('[OmniContext] Scroll cancelled');
        return messageCount;
      }

      if (scrollTarget.scrollHeight === lastHeight) {
        noChangeCount++;
      } else {
        lastHeight = scrollTarget.scrollHeight;
        noChangeCount = 0;
        // 更新消息计数
        messageCount = this.countDoubaoMessages(root);
        console.log(`[OmniContext] History loaded, scrollHeight: ${lastHeight}, messages: ${messageCount}`);
      }
    }

    // 返回最终消息数
    return this.countDoubaoMessages(root);
  }
}

// 单例实例
let batchCaptureInstance: BatchCapture | null = null;
let lastProgress: BatchCaptureProgress | null = null;

export function startBatchCapture(platform: Platform, onProgress: ProgressCallback): void {
  if (batchCaptureInstance) {
    batchCaptureInstance.cancel();
  }
  batchCaptureInstance = new BatchCapture(platform);
  lastProgress = null;
  batchCaptureInstance.start((progress) => {
    lastProgress = progress;
    onProgress(progress);
  });
}

export function pauseBatchCapture(): void {
  batchCaptureInstance?.pause();
}

export function resumeBatchCapture(): void {
  batchCaptureInstance?.resume();
}

export function cancelBatchCapture(): void {
  batchCaptureInstance?.cancel();
  batchCaptureInstance = null;
  lastProgress = null;
}

export function isBatchCaptureRunning(): boolean {
  return batchCaptureInstance !== null;
}

export function getBatchCaptureProgress(): BatchCaptureProgress | null {
  return lastProgress;
}

export function setSelectedSessions(sessionIds: string[]): void {
  batchCaptureInstance?.setSelectedSessions(sessionIds);
}
