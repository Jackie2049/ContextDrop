import { sessionStorage } from '../storage/session-storage';
import { createMessageExtractor, extractSessionIdFromDOM } from '../utils/extractor';
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

      // 检查取消
      if (this.checkCancelled()) return;

      // 2. 获取会话列表
      const sessionElements = await this.getSessionListElements();

      // 检查取消
      if (this.checkCancelled()) return;

      if (sessionElements.length === 0) {
        this.reportProgress({
          total: 0,
          current: 0,
          currentTitle: '',
          captured: 0,
          status: 'error',
          error: '请打开会话列表侧边栏',
        });
        return;
      }

      // 3. 收集所有会话信息（不捕获，只获取标题和ID）
      for (const element of sessionElements) {
        // 检查取消
        if (this.checkCancelled()) return;

        const title = this.getSessionTitle(element);
        const id = this.getSessionIdFromElement(element) || `${this.platform}-${Date.now()}-${Math.random()}`;
        this.discoveredSessions.push({
          id,
          title,
          platform: this.platform,
        });
      }

      console.log(`[ContextDrop] Discovered ${this.discoveredSessions.length} sessions`);

      // 检查取消
      if (this.checkCancelled(this.discoveredSessions.length)) return;

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

      if (this.checkCancelled(this.discoveredSessions.length)) return;

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
    console.log(`[ContextDrop] User selected ${sessionIds.length} sessions to capture`);
  }

  /**
   * 捕获选中的会话
   */
  private async captureSelectedSessions(sessionElements: Element[]): Promise<void> {
    const total = this.selectedSessionIds.size;
    console.log(`[ContextDrop] Starting capture of ${total} selected sessions out of ${sessionElements.length} total elements`);

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

    // DeepSeek 特殊处理：使用 URL 导航而不是点击
    if (this.platform === 'deepseek') {
      await this.captureDeepseekSessions();
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
        // console.log(`[ContextDrop] Skipping session (not selected): ${title}`);
        continue;
      }

      // 去重检查
      if (this.processedSessions.has(preSessionId)) {
        console.log(`[ContextDrop] Skipping duplicate session: ${title}`);
        continue;
      }

      console.log(`[ContextDrop] Processing session ${captured + 1}/${total}: ${title}`);

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
        if (this.checkCancelled(total, captured)) return;

        // 等待加载
        await this.waitForSessionLoad();

        // 检查取消
        if (this.checkCancelled(total, captured)) return;

        // 滚动加载历史，获取消息总数
        const sessionMessageTotal = await this.scrollToLoadHistory();

        // 检查取消
        if (this.checkCancelled(total, captured)) return;

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
        console.error(`[ContextDrop] Failed to capture session: ${title}`, err);
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
    console.log('[ContextDrop] Cancel called - stopping batch capture');
    this.isCancelled = true;
    this.waitingForSelection = false; // 跳出等待选择循环
    this.isPaused = false;
    this.removeFloatingProgress();
    // 清理存储的状态
    chrome.storage.local.remove(BATCH_CAPTURE_STATE_KEY).catch(() => {});
  }

  /**
   * 检查是否已取消，如果是则报告进度并返回 true
   */
  private checkCancelled(total: number = 0, current: number = 0): boolean {
    if (this.isCancelled) {
      this.reportProgress({
        total,
        current,
        currentTitle: '',
        captured: this.totalCaptured,
        status: 'cancelled',
      });
      return true;
    }
    return false;
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
    container.id = 'contextdrop-batch-progress';
    container.innerHTML = `
      <div class="oc-progress-header">
        <span>📦 ContextDrop 批量捕获</span>
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
      #contextdrop-batch-progress {
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
      #contextdrop-batch-progress .oc-progress-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        font-weight: 600;
      }
      #contextdrop-batch-progress .oc-progress-close {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #999;
      }
      /* 扫描状态样式 */
      #contextdrop-batch-progress .oc-scan-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        background: linear-gradient(135deg, #f0f7ff 0%, #e8f4ff 100%);
        border-radius: 8px;
        margin-bottom: 12px;
      }
      #contextdrop-batch-progress .oc-scan-dots {
        display: inline-flex;
        gap: 2px;
      }
      #contextdrop-batch-progress .oc-scan-dots span {
        animation: oc-bounce 1.4s infinite ease-in-out both;
        color: #667eea;
        font-weight: bold;
      }
      #contextdrop-batch-progress .oc-scan-dots span:nth-child(1) { animation-delay: -0.32s; }
      #contextdrop-batch-progress .oc-scan-dots span:nth-child(2) { animation-delay: -0.16s; }
      #contextdrop-batch-progress .oc-scan-dots span:nth-child(3) { animation-delay: 0s; }
      @keyframes oc-bounce {
        0%, 80%, 100% { opacity: 0.3; }
        40% { opacity: 1; }
      }
      #contextdrop-batch-progress .oc-scan-text {
        color: #555;
        font-weight: 500;
      }
      #contextdrop-batch-progress .oc-scan-count {
        margin-left: auto;
        color: #667eea;
        font-size: 12px;
      }
      #contextdrop-batch-progress .oc-scan-count strong {
        font-size: 16px;
        font-weight: 600;
      }
      /* 捕获状态样式 */
      #contextdrop-batch-progress .oc-progress-bar {
        height: 6px;
        background: #e8e8e8;
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 10px;
      }
      #contextdrop-batch-progress .oc-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #667eea, #764ba2);
        border-radius: 3px;
        transition: width 0.3s;
        width: 0%;
      }
      #contextdrop-batch-progress .oc-progress-info {
        display: flex;
        justify-content: space-between;
        margin-bottom: 6px;
      }
      #contextdrop-batch-progress .oc-progress-title {
        color: #666;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #contextdrop-batch-progress .oc-progress-captured {
        color: #888;
        font-size: 12px;
        margin-bottom: 10px;
      }
      #contextdrop-batch-progress .oc-progress-cancel {
        width: 100%;
        padding: 8px;
        background: #f5f5f5;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
      }
      #contextdrop-batch-progress .oc-progress-cancel:hover {
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
      deepseek: 'DeepSeek',
      kimi: 'Kimi',
      gemini: 'Gemini',
      chatgpt: 'ChatGPT',
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
    if (this.platform === 'yuanbao') {
      return this.getYuanbaoSessionListElements();
    }
    if (this.platform === 'deepseek') {
      return this.getDeepseekSessionListElements();
    }
    if (this.platform === 'kimi') {
      return this.getKimiSessionListElements();
    }
    if (this.platform === 'gemini') {
      return this.getGeminiSessionListElements();
    }
    if (this.platform === 'chatgpt') {
      return this.getChatgptSessionListElements();
    }
    if (this.platform === 'claude') {
      return this.getClaudeSessionListElements();
    }
    // 其他平台待实现
    return [];
  }

  protected getSessionTitle(element: Element): string {
    if (this.platform === 'doubao') {
      return this.getDoubaoSessionTitle(element);
    }
    if (this.platform === 'yuanbao') {
      return this.getYuanbaoSessionTitle(element);
    }
    if (this.platform === 'deepseek') {
      return this.getDeepseekSessionTitle(element);
    }
    if (this.platform === 'kimi') {
      return this.getKimiSessionTitle(element);
    }
    if (this.platform === 'gemini') {
      return this.getGeminiSessionTitle(element);
    }
    if (this.platform === 'chatgpt') {
      return this.getChatgptSessionTitle(element);
    }
    if (this.platform === 'claude') {
      return this.getClaudeSessionTitle(element);
    }
    return '未知会话';
  }

  protected getSessionIdFromElement(element: Element): string | null {
    if (this.platform === 'doubao') {
      return this.getDoubaoSessionIdFromElement(element);
    }
    if (this.platform === 'yuanbao') {
      return this.getYuanbaoSessionIdFromElement(element);
    }
    if (this.platform === 'deepseek') {
      return this.getDeepseekSessionIdFromElement(element);
    }
    if (this.platform === 'kimi') {
      return this.getKimiSessionIdFromElement(element);
    }
    if (this.platform === 'gemini') {
      return this.getGeminiSessionIdFromElement(element);
    }
    if (this.platform === 'chatgpt') {
      return this.getChatgptSessionIdFromElement(element);
    }
    if (this.platform === 'claude') {
      return this.getClaudeSessionIdFromElement(element);
    }
    return null;
  }

  /**
   * 统计侧边栏中的会话数量（使用与 getSessionListElements 相同的选择器）
   */
  private countSessionsInSidebar(sidebar: Element): number {
    // 根据平台使用不同的选择器
    if (this.platform === 'yuanbao') {
      // 元宝平台：查找 .yb-recent-conv-list__item
      const items = sidebar.querySelectorAll('.yb-recent-conv-list__item');
      // 过滤：需要有会话ID标识
      let count = 0;
      items.forEach(item => {
        const hasId = item.querySelector('[data-item-id]') || item.hasAttribute('dt-cid');
        if (hasId) count++;
      });
      return count;
    }

    if (this.platform === 'chatgpt') {
      // ChatGPT: 查找会话链接
      const items = sidebar.querySelectorAll('a[href^="/c/"]');
      // 过滤：排除 New chat 等
      let count = 0;
      items.forEach(item => {
        const href = item.getAttribute('href') || '';
        const text = item.textContent?.trim() || '';
        if (href.length > 3 &&
            !text.toLowerCase().includes('new chat') &&
            !text.toLowerCase().includes('new conversation')) {
          count++;
        }
      });
      return count;
    }

    if (this.platform === 'claude') {
      // Claude: 查找 /chat/ 链接
      const items = sidebar.querySelectorAll('a[href^="/chat/"]');
      let count = 0;
      items.forEach(item => {
        const href = item.getAttribute('href') || '';
        // 只计数有效的会话链接（UUID格式）
        if (/^\/chat\/[0-9a-f-]{8,}/i.test(href)) {
          count++;
        }
      });
      console.log(`[OmniContext] Claude countSessionsInSidebar: ${count} sessions`);
      return count;
    }

    // 豆包平台：使用精确的选择器，只匹配侧边栏内的会话项
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
    if (this.platform === 'yuanbao') {
      // 元宝：点击 item-name 子元素
      const itemName = element.querySelector('.yb-recent-conv-list__item-name');
      if (itemName) {
        const sessionTitle = itemName.textContent;
        console.log('[ContextDrop] Clicking Yuanbao session:', sessionTitle);
        (itemName as HTMLElement).click();
      } else {
        console.log('[ContextDrop] Clicking Yuanbao session element directly');
        (element as HTMLElement).click();
      }
    } else if (this.platform === 'deepseek') {
      // DeepSeek: 会话是链接，点击前记录当前 URL
      const currentUrl = window.location.href;
      const href = element.getAttribute('href') || '';
      console.log('[ContextDrop] DeepSeek: Clicking session with href:', href);

      // 如果是链接，直接点击即可
      (element as HTMLElement).click();

      // 等待 URL 变化
      let urlChanged = false;
      for (let i = 0; i < 20; i++) {
        await this.sleep(200);
        if (window.location.href !== currentUrl) {
          console.log('[ContextDrop] DeepSeek: URL changed to', window.location.href);
          urlChanged = true;
          break;
        }
      }

      if (!urlChanged) {
        console.warn('[ContextDrop] DeepSeek: URL did not change after click');
      }
    } else if (this.platform === 'kimi') {
      // Kimi: 会话是链接，点击后等待 URL 变化
      const currentUrl = window.location.href;
      const href = element.getAttribute('href') || '';
      console.log('[ContextDrop] Kimi: Clicking session with href:', href);

      // 直接点击链接
      (element as HTMLElement).click();

      // 等待 URL 变化
      for (let i = 0; i < 20; i++) {
        await this.sleep(200);
        if (window.location.href !== currentUrl) {
          console.log('[ContextDrop] Kimi: URL changed to', window.location.href);
          break;
        }
      }
    } else if (this.platform === 'gemini') {
      // Gemini: 会话是链接，点击后等待 URL 变化
      const currentUrl = window.location.href;
      const href = element.getAttribute('href') || '';
      console.log('[ContextDrop] Gemini: Clicking session with href:', href);

      // 直接点击链接
      (element as HTMLElement).click();

      // 等待 URL 变化
      for (let i = 0; i < 20; i++) {
        await this.sleep(200);
        if (window.location.href !== currentUrl) {
          console.log('[ContextDrop] Gemini: URL changed to', window.location.href);
          break;
        }
      }
    } else if (this.platform === 'chatgpt') {
      // ChatGPT: 会话是链接，点击后等待 URL 变化
      const currentUrl = window.location.href;
      const href = element.getAttribute('href') || '';
      console.log('[ContextDrop] ChatGPT: Clicking session with href:', href);

      // 直接点击链接
      (element as HTMLElement).click();

      // 等待 URL 变化
      for (let i = 0; i < 20; i++) {
        await this.sleep(200);
        if (window.location.href !== currentUrl) {
          console.log('[ContextDrop] ChatGPT: URL changed to', window.location.href);
          break;
        }
      }
    } else if (this.platform === 'claude') {
      // Claude: 会话是链接，点击后等待 URL 变化
      const currentUrl = window.location.href;
      console.log('[OmniContext] Claude: Clicking session with href:', element.getAttribute('href'));
      (element as HTMLElement).click();
      for (let i = 0; i < 20; i++) {
        await this.sleep(200);
        if (window.location.href !== currentUrl) break;
      }
    } else {
      (element as HTMLElement).click();
    }
  }

  protected async waitForSessionLoad(): Promise<void> {
    if (this.platform === 'yuanbao') {
      // 元宝：等待 active 类变化和消息加载
      await this.sleep(800); // 初始等待

      // 等待消息区域更新（最多5秒）
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        const messages = document.querySelectorAll('.agent-chat__list__item');
        if (messages.length > 0) {
          console.log('[ContextDrop] Yuanbao messages loaded:', messages.length);
          break;
        }
        await this.sleep(500);
        attempts++;
      }

      // 等待 active 类更新
      const activeItem = document.querySelector('.yb-recent-conv-list__item.active [data-item-id]');
      if (activeItem) {
        const activeId = activeItem.getAttribute('data-item-id');
        console.log('[ContextDrop] Current active sidebar item:', activeId);
      }

      // 额外等待确保内容完全加载
      await this.sleep(800);
    } else if (this.platform === 'deepseek') {
      // DeepSeek: 等待消息元素加载
      await this.sleep(500); // 初始等待

      // 等待 ds-message 元素出现（最多5秒）
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        const messages = document.querySelectorAll('[class*="ds-message"]');
        if (messages.length > 0) {
          console.log('[ContextDrop] DeepSeek messages loaded:', messages.length);
          break;
        }
        await this.sleep(500);
        attempts++;
      }

      // 额外等待确保内容完全渲染
      await this.sleep(800);
    } else if (this.platform === 'kimi') {
      // Kimi: 等待消息元素加载
      await this.sleep(500); // 初始等待

      // 等待 chat-content-item 元素出现（最多5秒）
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        const userMessages = document.querySelectorAll('.chat-content-item-user');
        const assistantMessages = document.querySelectorAll('.chat-content-item-assistant');
        if (userMessages.length > 0 || assistantMessages.length > 0) {
          console.log(`[ContextDrop] Kimi messages loaded: ${userMessages.length} user, ${assistantMessages.length} assistant`);
          break;
        }
        await this.sleep(500);
        attempts++;
      }

      // 额外等待确保内容完全渲染
      await this.sleep(800);
    } else if (this.platform === 'gemini') {
      // Gemini: 等待消息元素加载
      await this.sleep(500); // 初始等待

      // 等待消息元素出现（最多5秒）
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        const userMessages = document.querySelectorAll('[class*="user-query"]');
        const assistantMessages = document.querySelectorAll('[class*="response-container"], [class*="model-response"]');
        if (userMessages.length > 0 || assistantMessages.length > 0) {
          console.log(`[ContextDrop] Gemini messages loaded: ${userMessages.length} user, ${assistantMessages.length} assistant`);
          break;
        }
        await this.sleep(500);
        attempts++;
      }

      // 额外等待确保内容完全渲染
      await this.sleep(800);
    } else if (this.platform === 'chatgpt') {
      // ChatGPT: 等待消息元素加载
      console.log('[ContextDrop] ChatGPT: Waiting for session to load...');
      await this.sleep(800); // 初始等待，给页面更多时间加载

      // 首先等待主容器出现
      let containerAttempts = 0;
      while (containerAttempts < 10) {
        const main = document.querySelector('main');
        const chatContainer = document.querySelector('[class*="conversation-container"]');
        const article = document.querySelector('article');
        if (main || chatContainer || article) {
          console.log('[ContextDrop] ChatGPT: Main container found');
          break;
        }
        await this.sleep(300);
        containerAttempts++;
      }

      // 等待消息元素出现（最多8秒）
      let attempts = 0;
      const maxAttempts = 16;
      let foundMessages = false;

      while (attempts < maxAttempts && !foundMessages) {
        const turnElements = document.querySelectorAll('[data-testid^="conversation-turn-"]');
        const userMessages = document.querySelectorAll('[data-message-author-role="user"]');
        const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
        const allText = document.querySelectorAll('main [class*="markdown"], main [class*="prose"]');

        if (turnElements.length > 0 || userMessages.length > 0 || assistantMessages.length > 0 || allText.length > 0) {
          console.log(`[ContextDrop] ChatGPT messages loaded: ${turnElements.length} turns, ${userMessages.length} user, ${assistantMessages.length} assistant, ${allText.length} text blocks`);
          foundMessages = true;
          break;
        }

        // 检查是否还在加载中
        const loadingElements = document.querySelectorAll('[class*="loading"], [class*="spinner"], [aria-busy="true"]');
        if (loadingElements.length > 0) {
          console.log(`[ContextDrop] ChatGPT: Still loading... (${attempts})`);
        }

        await this.sleep(500);
        attempts++;
      }

      if (!foundMessages) {
        console.warn('[ContextDrop] ChatGPT: No messages found after waiting, page might be empty or structure changed');
      }

      // 额外等待确保内容完全渲染
      await this.sleep(1000);
    } else if (this.platform === 'claude') {
      // Claude: 等待消息元素加载
      console.log('[OmniContext] Claude: Waiting for session to load...');
      await this.sleep(800);
      // 等待 user-message 或 font-claude-message 出现
      let attempts = 0;
      while (attempts < 10) {
        const msgs = document.querySelectorAll('[data-testid="user-message"], .font-claude-message.leading-relaxed');
        if (msgs.length > 0) break;
        await this.sleep(500);
        attempts++;
      }
      await this.sleep(500); // 额外等待渲染
      console.log('[OmniContext] Claude: Session loaded');
    } else {
      await this.sleep(1500);
    }
  }

  /**
   * 滚动加载历史消息，返回总消息数
   */
  protected async scrollToLoadHistory(): Promise<number> {
    if (this.platform === 'doubao') {
      return this.doubaoScrollToLoadHistory();
    }
    if (this.platform === 'yuanbao') {
      return this.yuanbaoScrollToLoadHistory();
    }
    if (this.platform === 'deepseek') {
      return this.deepseekScrollToLoadHistory();
    }
    if (this.platform === 'gemini') {
      return this.geminiScrollToLoadHistory();
    }
    if (this.platform === 'chatgpt') {
      return this.chatgptScrollToLoadHistory();
    }
    return 0;
  }

  /**
   * 统计当前页面的消息数
   */
  protected countMessages(): number {
    // Kimi 专用统计
    if (this.platform === 'kimi') {
      return this.countKimiMessages();
    }
    // ChatGPT 专用统计
    if (this.platform === 'chatgpt') {
      return this.countChatgptMessages();
    }

    // Gemini 专用统计
    if (this.platform === 'gemini') {
      return this.countGeminiMessages();
    }

    // Claude 专用统计
    if (this.platform === 'claude') {
      const userMsgs = document.querySelectorAll('[data-testid="user-message"]');
      // 尝试多种助手消息选择器
      let assistantMsgs: NodeListOf<Element> | null = null;
      for (const sel of ['.font-claude-message', '[class*="font-claude-message"]', '[class*="leading-relaxed"]']) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) { assistantMsgs = found; break; }
      }
      return userMsgs.length + (assistantMsgs?.length || 0);
    }

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
      const url = window.location.href;

      // ChatGPT: 跳过 "新聊天" 页面
      if (this.platform === 'chatgpt') {
        if (url.includes('/c/new') || url.endsWith('/chat') || url.endsWith('/chat/')) {
          console.log('[ContextDrop] Skipping ChatGPT new chat page:', url);
          return null;
        }
      }

      // Claude: 跳过 "新聊天" 页面
      if (this.platform === 'claude') {
        if (url.includes('/chat/new') || url.endsWith('/chat') || url.endsWith('/chat/')) {
          console.log('[OmniContext] Skipping Claude new chat page:', url);
          return null;
        }
      }

      const extractor = createMessageExtractor(this.platform);
      const messages = extractor.extractMessages();
      const title = extractor.extractTitle();

      console.log('[ContextDrop] captureCurrentSession: platform=', this.platform, 'messages=', messages.length, 'title=', title);

      if (messages.length === 0) {
        console.warn('[ContextDrop] No messages found, skipping');
        return null;
      }

      // 提取 session ID
      let sessionId: string;

      // 对于元宝，使用 DOM 提取会话ID（URL 不包含会话ID）
      if (this.platform === 'yuanbao') {
        const domSessionId = extractSessionIdFromDOM(this.platform);
        sessionId = domSessionId || this.extractSessionId(url);
        console.log('[ContextDrop] Yuanbao session ID from DOM:', sessionId);
      } else {
        sessionId = this.extractSessionId(url);
      }

      console.log('[ContextDrop] Final session ID:', sessionId);

      const session: Session = {
        id: sessionId,
        source: 'platform',
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
        console.log('[ContextDrop] Session exists, isNew=', isNew, 'isUpdated=', isUpdated);
      } else {
        console.log('[ContextDrop] New session');
      }

      await sessionStorage.saveSessionOptimized(session);
      console.log('[ContextDrop] ✓ Session saved:', sessionId, title);

      // Verify save
      const saved = await sessionStorage.getSession(sessionId);
      console.log('[ContextDrop] Verification - session exists in storage:', !!saved);

      return { session, isNew, isUpdated, oldCount };

    } catch (err) {
      console.error('[ContextDrop] Capture failed:', err);
      return null;
    }
  }

  protected extractSessionId(url: string): string {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);

    for (const part of pathParts) {
      if (part && part !== 'chat' && part !== 'c' && part !== 'new' && part.length >= 4) {
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

    // 2. 查找侧边栏滚动容器（平台特定）
    let sidebarSelectors: string[];

    if (this.platform === 'yuanbao') {
      sidebarSelectors = [
        '.yb-nav__content',
        '.yb-common-nav',
        '.yb-nav',
        '[class*="recent-conv-list"]',
      ];
    } else if (this.platform === 'chatgpt') {
      // ChatGPT: 侧边栏选择器
      sidebarSelectors = [
        'nav',
        'aside',
        '[class*="sidebar"]',
        '[class*="history"]',
        '[data-testid="history-sidebar"]',
        '[class*="conversation-list"]',
      ];
    } else if (this.platform === 'claude') {
      // Claude: 侧边栏选择器（不依赖 data-testid）
      sidebarSelectors = [
        'nav',
        'aside',
        '[class*="sidebar"]',
        '[class*="Sidebar"]',
        '[aria-label*="history"]',
        '[aria-label*="chat"]',
      ];
    } else {
      // 豆包及其他平台
      sidebarSelectors = [
        '#flow_chat_sidebar',
        '[data-testid="flow_chat_sidebar"]',
        '[class*="sidebar"]',
      ];
    }

    let sidebar: Element | null = null;
    for (const selector of sidebarSelectors) {
      sidebar = document.querySelector(selector);
      if (sidebar) {
        console.log(`[ContextDrop] Found sidebar: ${selector}`);
        break;
      }
    }

    if (!sidebar) {
      console.warn('[ContextDrop] Sidebar not found for scrolling');
      return;
    }

    // 3. 查找真正可滚动的元素（可能是sidebar内部的子元素）
    const scrollContainer = this.findScrollableContainer(sidebar);

    if (!scrollContainer) {
      console.warn('[ContextDrop] No scrollable container found');
      return;
    }

    console.log(`[ContextDrop] Using scroll container:`, scrollContainer.tagName, scrollContainer.className);

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

    while (noChangeCount < 3 && !this.isCancelled) {
      // 滚动到底部
      (scrollContainer as HTMLElement).scrollTop = scrollContainer.scrollHeight;
      await this.sleep(800);

      // 检查取消
      if (this.isCancelled) {
        console.log('[ContextDrop] Sidebar scan cancelled');
        return;
      }

      // 检查会话数量是否增加
      // 使用更精确的选择器，避免匹配到消息区域的元素
      const currentCount = this.countSessionsInSidebar(sidebar!);
      console.log(`[ContextDrop] Sessions loaded: ${currentCount}, scrollTop: ${(scrollContainer as HTMLElement).scrollTop}, scrollHeight: ${scrollContainer.scrollHeight}`);

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

    // 检查取消
    if (this.isCancelled) {
      console.log('[ContextDrop] Sidebar scan cancelled after loop');
      return;
    }

    // 扫描完成
    console.log(`[ContextDrop] Finished loading sessions, total: ${lastCount}`);
  }

  /**
   * 查找真正可滚动的容器
   * 在现代Web应用中，滚动容器通常是sidebar内部的某个子元素
   */
  private findScrollableContainer(root: Element): Element | null {
    // 首先检查root本身是否可滚动
    const rootStyle = window.getComputedStyle(root);
    if (this.isScrollable(root, rootStyle)) {
      console.log(`[ContextDrop] Root element is scrollable`);
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
      console.log(`[ContextDrop] Found ${candidates.length} scrollable candidates`);
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
    if (this.platform === 'doubao') {
      return this.ensureDoubaoSidebarOpen();
    }
    if (this.platform === 'yuanbao') {
      return this.ensureYuanbaoSidebarOpen();
    }
    if (this.platform === 'chatgpt') {
      return this.ensureChatgptSidebarOpen();
    }
    if (this.platform === 'gemini') {
      return this.ensureGeminiSidebarOpen();
    }
    if (this.platform === 'deepseek') {
      return this.ensureDeepseekSidebarOpen();
    }
    if (this.platform === 'kimi') {
      return this.ensureKimiSidebarOpen();
    }
    if (this.platform === 'claude') {
      return this.ensureClaudeSidebarOpen();
    }
  }

  private async ensureChatgptSidebarOpen(): Promise<void> {
    // ChatGPT: 检查侧边栏是否存在
    const sidebar = document.querySelector('nav') ||
                    document.querySelector('aside') ||
                    document.querySelector('[class*="sidebar"]') ||
                    document.querySelector('[class*="history"]');

    if (sidebar) {
      console.log('[ContextDrop] ChatGPT sidebar found');
      // 等待侧边栏内容加载
      await this.sleep(500);
      return;
    }

    console.warn('[ContextDrop] ChatGPT sidebar not found');
  }

  private async ensureGeminiSidebarOpen(): Promise<void> {
    // Gemini: 检查侧边栏是否存在
    const sidebar = document.querySelector('nav') ||
                    document.querySelector('aside') ||
                    document.querySelector('[class*="conversation-list"]');

    if (sidebar) {
      console.log('[ContextDrop] Gemini sidebar found');
      await this.sleep(500);
      return;
    }

    console.warn('[ContextDrop] Gemini sidebar not found');
  }

  private async ensureDeepseekSidebarOpen(): Promise<void> {
    // DeepSeek: 侧边栏可能需要点击历史记录按钮打开
    const sidebar = document.querySelector('[class*="ds-sidebar"]') ||
                    document.querySelector('[class*="chat-list"]');

    if (sidebar) {
      console.log('[ContextDrop] DeepSeek sidebar found');
      return;
    }

    // 尝试打开历史记录面板
    console.log('[ContextDrop] DeepSeek sidebar not found, trying to open history panel');
    const historyButton = document.querySelector('[class*="history"]') ||
                          document.querySelector('button[aria-label*="history"]') ||
                          document.querySelector('[class*="menu"]');

    if (historyButton) {
      (historyButton as HTMLElement).click();
      await this.sleep(1000);
    }
  }

  private async ensureKimiSidebarOpen(): Promise<void> {
    // Kimi: 检查侧边栏是否存在
    const sidebar = document.querySelector('[class*="chat-list"]') ||
                    document.querySelector('[class*="sidebar"]');

    if (sidebar) {
      console.log('[ContextDrop] Kimi sidebar found');
      return;
    }

    console.warn('[ContextDrop] Kimi sidebar not found');
  }

  private async ensureDoubaoSidebarOpen(): Promise<void> {
    // 检查侧边栏是否存在且可见
    const sidebar = document.querySelector('#flow_chat_sidebar');

    if (sidebar) {
      // 检查是否隐藏（豆包可能使用 translate 来隐藏）
      const style = window.getComputedStyle(sidebar);
      const transform = style.transform;
      const rect = sidebar.getBoundingClientRect();

      // 如果侧边栏被移出视图（translateX(-100%) 或类似）
      if (transform.includes('translate') && rect.x < 0) {
        console.log('[ContextDrop] Doubao sidebar is hidden, trying to open it');

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
            console.log(`[ContextDrop] Found open button: ${selector}`);
            (button as HTMLElement).click();
            await this.sleep(1000);

            // 检查是否成功打开
            const newRect = sidebar.getBoundingClientRect();
            if (newRect.x >= 0) {
              console.log('[ContextDrop] Doubao sidebar opened successfully');
              return;
            }
          }
        }

        console.warn('[ContextDrop] Could not find button to open Doubao sidebar');
      } else {
        console.log('[ContextDrop] Doubao sidebar is already visible');
      }
    } else {
      console.warn('[ContextDrop] Doubao sidebar element not found');
    }
  }

  private async ensureYuanbaoSidebarOpen(): Promise<void> {
    // 元宝的侧边栏选择器
    let sidebar = document.querySelector('.yb-nav') ||
                    document.querySelector('.yb-common-nav');

    // 如果侧边栏不存在，尝试点击打开按钮
    if (!sidebar) {
      console.log('[ContextDrop] Yuanbao sidebar not found, trying to open it');

      const openButtonSelectors = [
        '.yb-nav-fixed__trigger',
        '.yb-common-nav__trigger',
        '[class*="sidebar-trigger"]',
        'button[class*="nav-trigger"]',
        '[class*="menu-button"]',
        'button[aria-label*="菜单"]',
        'button[aria-label*="导航"]',
      ];

      for (const selector of openButtonSelectors) {
        const button = document.querySelector(selector);
        if (button) {
          console.log(`[ContextDrop] Found Yuanbao open button: ${selector}`);
          (button as HTMLElement).click();
          await this.sleep(1000);

          // 重新查找侧边栏
          sidebar = document.querySelector('.yb-nav') ||
                    document.querySelector('.yb-common-nav');
          if (sidebar) {
            console.log('[ContextDrop] Yuanbao sidebar opened');
            break;
          }
        }
      }
    }

    if (!sidebar) {
      console.warn('[ContextDrop] Yuanbao sidebar element not found after trying to open');
      return;
    }

    // 检查侧边栏是否可见
    const rect = sidebar.getBoundingClientRect();
    const style = window.getComputedStyle(sidebar);
    if (rect.width === 0 || style.visibility === 'hidden') {
      console.log('[ContextDrop] Yuanbao sidebar is hidden, trying to open it');

      const openButtonSelectors = [
        '.yb-nav-fixed__trigger',
        '.yb-common-nav__trigger',
        '[class*="sidebar-trigger"]',
        'button[class*="nav-trigger"]',
      ];

      for (const selector of openButtonSelectors) {
        const button = document.querySelector(selector);
        if (button) {
          console.log(`[ContextDrop] Found Yuanbao open button: ${selector}`);
          (button as HTMLElement).click();
          await this.sleep(1000);

          // 检查是否成功打开
          const newRect = sidebar.getBoundingClientRect();
          if (newRect.width > 0) {
            console.log('[ContextDrop] Yuanbao sidebar opened successfully');
            break;
          }
        }
      }
    } else {
      console.log('[ContextDrop] Yuanbao sidebar is already visible');
    }

    // 关键：确保会话列表区域已展开（可能需要点击"历史会话"或"最近对话"）
    await this.ensureYuanbaoSessionListExpanded();
  }

  /**
   * 确保元宝的会话列表区域已展开
   */
  private async ensureYuanbaoSessionListExpanded(): Promise<void> {
    // 检查会话列表是否已存在且有内容
    const sessionList = document.querySelector('.yb-recent-conv-list');
    const sessionItems = document.querySelectorAll('.yb-recent-conv-list__item');

    if (sessionList && sessionItems.length > 0) {
      console.log('[ContextDrop] Yuanbao session list already has items');
      return;
    }

    console.log('[ContextDrop] Yuanbao session list is empty, trying to expand it');

    // 尝试找到展开会话列表的按钮
    // 元宝可能有"历史会话"、"最近对话"等展开按钮
    const expandButtonSelectors = [
      '[class*="recent-conv"]',
      '[class*="history"]',
      '[class*="session-list"]',
      '[class*="conversation-list"]',
      'button[aria-expanded="false"]',
      '[class*="expand"]',
      '[class*="collapse"]',
      '.yb-nav__item',
      '.yb-common-nav__item',
    ];

    for (const selector of expandButtonSelectors) {
      const buttons = document.querySelectorAll(selector);
      for (const button of buttons) {
        const text = button.textContent?.toLowerCase() || '';
        // 检查按钮文本是否包含相关关键词
        if (text.includes('历史') || text.includes('最近') || text.includes('会话') ||
            text.includes('对话') || text.includes('history') || text.includes('recent')) {
          console.log(`[ContextDrop] Found expand button: ${selector}, text: ${text}`);
          (button as HTMLElement).click();
          await this.sleep(800);

          // 检查是否成功展开
          const newItems = document.querySelectorAll('.yb-recent-conv-list__item');
          if (newItems.length > 0) {
            console.log(`[ContextDrop] Session list expanded, found ${newItems.length} items`);
            return;
          }
        }
      }
    }

    // 备选：尝试点击侧边栏中的任何可展开元素
    const sidebar = document.querySelector('.yb-nav') || document.querySelector('.yb-common-nav');
    if (sidebar) {
      const clickableItems = sidebar.querySelectorAll('[role="button"], button, [class*="item"]');
      for (const item of clickableItems) {
        const className = item.className || '';
        // 跳过已经是会话项的元素
        if (className.includes('conv-list__item')) continue;

        console.log(`[ContextDrop] Trying to click sidebar item: ${className}`);
        (item as HTMLElement).click();
        await this.sleep(500);

        const newItems = document.querySelectorAll('.yb-recent-conv-list__item');
        if (newItems.length > 0) {
          console.log(`[ContextDrop] Session list appeared after click, found ${newItems.length} items`);
          return;
        }
      }
    }

    console.warn('[ContextDrop] Could not expand Yuanbao session list');
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
        console.log(`[ContextDrop] Found ${elements.length} sessions with: ${selector}`);
        // 进一步过滤：排除看起来像消息的元素（文本内容太长）
        const filtered = Array.from(elements).filter(el => {
          const textLength = el.textContent?.length || 0;
          // 会话标题通常较短（<200字符）
          return textLength < 200;
        });
        console.log(`[ContextDrop] After filtering: ${filtered.length} sessions`);
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
      console.log(`[ContextDrop] Fallback: found ${items.length}, filtered to ${filtered.length}`);
      return filtered;
    }

    console.warn('[ContextDrop] No session list found');
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
        console.log(`[ContextDrop] Found message root: ${selector}`);
        break;
      }
    }

    if (!root) {
      console.warn('[ContextDrop] Message container not found');
      return 0;
    }

    // 查找真正可滚动的容器
    const container = this.findScrollableContainer(root);

    if (!container) {
      console.warn('[ContextDrop] No scrollable message container found, trying root itself');
      // 如果找不到可滚动容器，尝试直接使用root
      const rootStyle = window.getComputedStyle(root);
      if (root.scrollHeight <= root.clientHeight &&
          (rootStyle.overflowY === 'auto' || rootStyle.overflowY === 'scroll')) {
        return this.countDoubaoMessages(root);
      }
    }

    const scrollTarget = container || root;
    console.log(`[ContextDrop] Scrolling message container:`, scrollTarget.className);

    // 滚动到顶部加载历史
    let lastHeight = scrollTarget.scrollHeight;
    let noChangeCount = 0;
    let messageCount = this.countDoubaoMessages(root);

    while (noChangeCount < 3 && !this.isCancelled) {
      (scrollTarget as HTMLElement).scrollTop = 0;
      await this.sleep(500);

      // 检查取消
      if (this.isCancelled) {
        console.log('[ContextDrop] Scroll cancelled');
        return messageCount;
      }

      if (scrollTarget.scrollHeight === lastHeight) {
        noChangeCount++;
      } else {
        lastHeight = scrollTarget.scrollHeight;
        noChangeCount = 0;
        // 更新消息计数
        messageCount = this.countDoubaoMessages(root);
        console.log(`[ContextDrop] History loaded, scrollHeight: ${lastHeight}, messages: ${messageCount}`);
      }
    }

    // 返回最终消息数
    return this.countDoubaoMessages(root);
  }

  // ========== 元宝平台特定实现 ==========

  private getYuanbaoSessionListElements(): Element[] {
    // 元宝的会话列表选择器
    // 先检查侧边栏是否存在
    const sidebar = document.querySelector('.yb-nav') ||
                    document.querySelector('.yb-common-nav') ||
                    document.querySelector('.yb-nav__content');

    if (!sidebar) {
      console.warn('[ContextDrop] Yuanbao sidebar not found');
      return [];
    }

    console.log('[ContextDrop] Found Yuanbao sidebar');

    // 多种选择器尝试
    const selectors = [
      // 最精确：在侧边栏内的会话项
      '.yb-nav .yb-recent-conv-list .yb-recent-conv-list__item',
      '.yb-common-nav .yb-recent-conv-list .yb-recent-conv-list__item',
      '.yb-nav__content .yb-recent-conv-list .yb-recent-conv-list__item',
      // 直接选择器
      '.yb-recent-conv-list .yb-recent-conv-list__item',
      '.yb-recent-conv-list__item',
    ];

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`[ContextDrop] Found ${elements.length} Yuanbao sessions with: ${selector}`);
          // 过滤掉分隔符等非会话项
          const filtered = Array.from(elements).filter(el => {
            // 确保有会话ID标识
            const hasId = el.querySelector('[data-item-id]') ||
                          el.hasAttribute('dt-cid');
            return hasId;
          });
          console.log(`[ContextDrop] After filtering: ${filtered.length} valid sessions`);
          return filtered;
        }
      } catch (e) {
        console.warn(`[ContextDrop] Selector failed: ${selector}`, e);
      }
    }

    // 降级：直接在侧边栏内搜索
    if (sidebar) {
      const items = sidebar.querySelectorAll('[class*="conv-list__item"]');
      console.log(`[ContextDrop] Fallback: found ${items.length} items in sidebar`);
      return Array.from(items).filter(el => {
        return el.querySelector('[data-item-id]') || el.hasAttribute('dt-cid');
      });
    }

    console.warn('[ContextDrop] No Yuanbao session list found');
    return [];
  }

  private getYuanbaoSessionTitle(element: Element): string {
    // 元宝会话标题在 data-item-name 属性或 .yb-recent-conv-list__item-name 元素中
    const dataName = element.querySelector('[data-item-name]');
    if (dataName) {
      const name = dataName.getAttribute('data-item-name');
      if (name) return name;
    }

    // 备选：从 item-name 元素获取
    const titleEl = element.querySelector('.yb-recent-conv-list__item-name');
    return titleEl?.textContent?.trim() || '未命名会话';
  }

  private getYuanbaoSessionIdFromElement(element: Element): string | null {
    // 元宝会话ID在 data-item-id 属性中
    const nameEl = element.querySelector('[data-item-id]');
    if (nameEl) {
      const id = nameEl.getAttribute('data-item-id');
      if (id) return id;
    }

    // 备选：从 dt-cid 属性获取（跟踪属性）
    const cid = element.getAttribute('dt-cid');
    if (cid) return cid;

    return null;
  }

  // ========== DeepSeek 平台方法 ==========

  private getDeepseekSessionListElements(): Element[] {
    console.log('[ContextDrop] === DeepSeek Session List Debug ===');

    // DeepSeek 会话列表项的类名（基于调试发现的模式）
    // 1. 首先尝试使用已知的会话列表项类名
    const knownSelectors = [
      '._546d736', // 已发现的会话列表项类名
      '[class*="_546d736"]',
      '[class*="ds-chat"]',
      '[class*="ds-history"]',
      '[class*="ds-session"]',
      'a[href^="/chat/"]',
    ];

    for (const selector of knownSelectors) {
      try {
        const items = document.querySelectorAll(selector);
        if (items.length > 0) {
          // 过滤：排除非会话项
          const sessionItems = Array.from(items).filter(el => {
            const text = el.textContent?.trim() || '';
            const href = el.getAttribute('href') || '';
            // 会话项特征：有链接到 /chat/ 或文本内容适中
            return (href.includes('/chat/') ||
                   (text.length > 0 && text.length < 100 &&
                    !text.includes('DeepSeek') &&
                    !text.includes('探索未至之境') &&
                    !text.includes('发送消息') &&
                    !text.includes('深度思考') &&
                    !text.includes('智能搜索')));
          });

          if (sessionItems.length > 0) {
            console.log(`[ContextDrop] DeepSeek: Found ${sessionItems.length} sessions with selector: ${selector}`);
            sessionItems.slice(0, 3).forEach((el, i) => {
              console.log(`[ContextDrop]   [${i}] class="${el.className}" text="${el.textContent?.slice(0, 30)}"`);
            });
            return sessionItems;
          }
        }
      } catch (e) {
        console.warn(`[ContextDrop] DeepSeek: Selector error: ${selector}`, e);
      }
    }

    // 2. 回退方案：分析页面结构
    console.log('[ContextDrop] DeepSeek: Trying fallback session detection...');

    // 检查是否有历史会话按钮需要点击
    const historyButtonSelectors = [
      '[class*="history"]',
      '[class*="session"]',
      '[class*="chat-list"]',
      '[aria-label*="历史"]',
      '[aria-label*="会话"]',
      'button[class*="menu"]',
    ];

    for (const selector of historyButtonSelectors) {
      const btn = document.querySelector(selector);
      if (btn) {
        console.log(`[ContextDrop] DeepSeek: Found potential history button: ${selector}`);
        console.log(`[ContextDrop]   class: ${btn.className}`);
        console.log(`[ContextDrop]   text: ${btn.textContent?.slice(0, 50)}`);
      }
    }

    // 3. 检查所有可能是会话列表的元素
    const allClickable = document.querySelectorAll('a, button, [role="button"], [tabindex]');
    const potentialSessionItems: Element[] = [];

    allClickable.forEach(el => {
      const text = el.textContent?.trim() || '';
      const href = el.getAttribute('href') || '';

      // 检查是否可能是会话项
      if ((href.includes('/chat/') || (text.length > 0 && text.length < 100)) &&
          !text.includes('DeepSeek') &&
          !text.includes('探索未至之境') &&
          !text.includes('发送消息') &&
          !text.includes('深度思考') &&
          !text.includes('智能搜索')) {
        potentialSessionItems.push(el);
      }
    });

    console.log(`[ContextDrop] Found ${potentialSessionItems.length} potential session items`);

    if (potentialSessionItems.length > 0) {
      potentialSessionItems.slice(0, 5).forEach((el, i) => {
        console.log(`[ContextDrop] [${i}] class="${el.className}"`);
        console.log(`[ContextDrop]     text="${el.textContent?.slice(0, 50)}"`);
      });

      return potentialSessionItems;
    }

    console.warn('[ContextDrop] DeepSeek: No session list found');
    console.warn('[ContextDrop] DeepSeek may require manually opening the history panel first');
    return [];
  }

  private getDeepseekSessionTitle(element: Element): string {
    // 尝试从元素或其子元素获取标题
    const text = element.textContent?.trim() || '';
    // 清理标题
    return text.replace(/\s+/g, ' ').slice(0, 50) || '未命名会话';
  }

  private getDeepseekSessionIdFromElement(element: Element): string | null {
    // 尝试从 href 获取 ID
    // DeepSeek URL 格式: /a/chat/s/{sessionId}
    const href = element.getAttribute('href');
    if (href) {
      // 首先尝试匹配 /s/{sessionId} 格式
      const sMatch = href.match(/\/s\/([a-zA-Z0-9_-]+)/);
      if (sMatch) {
        console.log(`[ContextDrop] DeepSeek: Extracted session ID from href (s format): ${sMatch[1]}`);
        return sMatch[1];
      }

      // 回退：匹配 /chat/{sessionId} 格式
      const chatMatch = href.match(/\/chat\/([a-zA-Z0-9_-]+)/);
      if (chatMatch) {
        console.log(`[ContextDrop] DeepSeek: Extracted session ID from href (chat format): ${chatMatch[1]}`);
        return chatMatch[1];
      }
    }

    // 尝试 data 属性
    const dataId = element.getAttribute('data-id') ||
                   element.getAttribute('data-session-id') ||
                   element.getAttribute('data-chat-id');
    if (dataId) {
      console.log(`[ContextDrop] DeepSeek: Extracted session ID from data attribute: ${dataId}`);
      return dataId;
    }

    // 使用文本内容的 hash 作为 ID
    const text = element.textContent?.trim() || '';
    if (text) {
      return `deepseek-${this.simpleHash(text)}`;
    }

    return null;
  }

  private countYuanbaoMessages(root: Element): number {
    // 元宝消息选择器
    const selectors = [
      '.agent-chat__list__item',
      '.agent-chat__bubble--human',
      '.agent-chat__bubble--ai',
    ];

    let maxCount = 0;
    for (const selector of selectors) {
      const elements = root.querySelectorAll(selector);
      if (elements.length > maxCount) {
        maxCount = elements.length;
      }
    }
    return maxCount;
  }

  private async yuanbaoScrollToLoadHistory(): Promise<number> {
    // 查找消息区域的根容器
    const rootSelectors = [
      '.agent-chat__list',
      '.agent-dialogue__content',
      '[class*="chat-list"]',
    ];

    let root: Element | null = null;
    for (const selector of rootSelectors) {
      root = document.querySelector(selector);
      if (root) {
        console.log(`[ContextDrop] Found Yuanbao message root: ${selector}`);
        break;
      }
    }

    if (!root) {
      console.warn('[ContextDrop] Yuanbao message container not found');
      return 0;
    }

    // 查找真正可滚动的容器
    const container = this.findScrollableContainer(root);

    if (!container) {
      console.warn('[ContextDrop] No scrollable Yuanbao message container found');
      return this.countYuanbaoMessages(root);
    }

    console.log(`[ContextDrop] Scrolling Yuanbao message container`);

    // 滚动到顶部加载历史
    let lastHeight = container.scrollHeight;
    let noChangeCount = 0;
    let messageCount = this.countYuanbaoMessages(root);

    while (noChangeCount < 3 && !this.isCancelled) {
      (container as HTMLElement).scrollTop = 0;
      await this.sleep(500);

      if (this.isCancelled) {
        console.log('[ContextDrop] Yuanbao scroll cancelled');
        return messageCount;
      }

      if (container.scrollHeight === lastHeight) {
        noChangeCount++;
      } else {
        lastHeight = container.scrollHeight;
        noChangeCount = 0;
        messageCount = this.countYuanbaoMessages(root);
        console.log(`[ContextDrop] Yuanbao history loaded, scrollHeight: ${lastHeight}, messages: ${messageCount}`);
      }
    }

    return this.countYuanbaoMessages(root);
  }

  private async deepseekScrollToLoadHistory(): Promise<number> {
    // 查找 DeepSeek 消息区域的根容器
    const rootSelectors = [
      '[class*="ds-scroll-area"]',
      '[class*="chat-container"]',
      '[class*="conversation"]',
      'main',
    ];

    let root: Element | null = null;
    for (const selector of rootSelectors) {
      root = document.querySelector(selector);
      if (root) {
        console.log(`[ContextDrop] Found DeepSeek message root: ${selector}`);
        break;
      }
    }

    if (!root) {
      console.warn('[ContextDrop] DeepSeek message container not found');
      return this.countDeepseekMessages();
    }

    // 查找真正可滚动的容器
    const container = this.findScrollableContainer(root);

    if (!container) {
      console.warn('[ContextDrop] No scrollable DeepSeek message container found');
      return this.countDeepseekMessages();
    }

    console.log(`[ContextDrop] Scrolling DeepSeek message container`);

    // 滚动到顶部加载历史
    let lastHeight = container.scrollHeight;
    let noChangeCount = 0;
    let messageCount = this.countDeepseekMessages();

    while (noChangeCount < 3 && !this.isCancelled) {
      (container as HTMLElement).scrollTop = 0;
      await this.sleep(500);

      if (this.isCancelled) {
        console.log('[ContextDrop] DeepSeek scroll cancelled');
        return messageCount;
      }

      if (container.scrollHeight === lastHeight) {
        noChangeCount++;
      } else {
        lastHeight = container.scrollHeight;
        noChangeCount = 0;
        messageCount = this.countDeepseekMessages();
        console.log(`[ContextDrop] DeepSeek history loaded, scrollHeight: ${lastHeight}, messages: ${messageCount}`);
      }
    }

    return this.countDeepseekMessages();
  }

  /**
   * DeepSeek 专用：通过点击链接并刷新会话列表来捕获会话
   * 每次点击后需要重新获取会话列表，因为 DOM 会更新
   */
  private async captureDeepseekSessions(): Promise<void> {
    const total = this.selectedSessionIds.size;
    console.log(`[ContextDrop] DeepSeek: Starting click-based capture of ${total} sessions`);

    let captured = 0;
    let newCount = 0;
    let updatedCount = 0;

    // 将选中的会话 ID 转换为数组，以便按顺序处理
    const sessionIdsToCapture = Array.from(this.selectedSessionIds);

    for (const sessionId of sessionIdsToCapture) {
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

      // 去重检查
      if (this.processedSessions.has(sessionId)) {
        console.log(`[ContextDrop] DeepSeek: Skipping duplicate session: ${sessionId}`);
        continue;
      }

      // 查找会话信息
      const sessionInfo = this.discoveredSessions.find(s => s.id === sessionId);
      if (!sessionInfo) {
        console.warn(`[ContextDrop] DeepSeek: Session info not found for ${sessionId}`);
        continue;
      }

      console.log(`[ContextDrop] DeepSeek: Processing session ${captured + 1}/${total}: ${sessionInfo.title}`);

      const sessionStart = Date.now();

      // 报告进度
      this.reportProgress({
        total,
        current: captured + 1,
        currentTitle: sessionInfo.title,
        captured: this.totalCaptured,
        status: 'running',
        eta: this.calculateETA(captured, total),
      });

      try {
        // 重新获取会话列表元素（因为每次导航后 DOM 会更新）
        const sessionElements = await this.getSessionListElements();

        // 找到对应的会话元素
        let targetElement: Element | null = null;
        for (const element of sessionElements) {
          const elementId = this.getSessionIdFromElement(element);
          if (elementId === sessionId) {
            targetElement = element;
            break;
          }
        }

        if (!targetElement) {
          console.warn(`[ContextDrop] DeepSeek: Session element not found for ${sessionId}, trying direct navigation`);
          // 尝试直接点击链接
          const directLink = document.querySelector(`a[href*="/s/${sessionId}"]`) as HTMLAnchorElement;
          if (directLink) {
            targetElement = directLink;
          } else {
            console.warn(`[ContextDrop] DeepSeek: Could not find session link, skipping`);
            continue;
          }
        }

        // 点击会话
        const currentUrl = window.location.href;
        (targetElement as HTMLElement).click();
        console.log(`[ContextDrop] DeepSeek: Clicked on session element`);

        // 等待 URL 变化或消息加载
        for (let i = 0; i < 20; i++) {
          await this.sleep(200);
          if (window.location.href !== currentUrl) {
            console.log(`[ContextDrop] DeepSeek: URL changed to ${window.location.href}`);
            break;
          }
        }

        // 等待消息加载
        await this.sleep(500);
        let attempts = 0;
        const maxAttempts = 15;
        while (attempts < maxAttempts) {
          const messages = document.querySelectorAll('[class*="ds-message"]');
          if (messages.length > 0) {
            console.log(`[ContextDrop] DeepSeek: Messages loaded: ${messages.length}`);
            break;
          }
          await this.sleep(400);
          attempts++;
        }

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

        // 滚动加载历史
        console.log(`[ContextDrop] DeepSeek: Starting to scroll and load history...`);
        const sessionMessageTotal = await this.scrollToLoadHistory();
        console.log(`[ContextDrop] DeepSeek: Total messages after scroll: ${sessionMessageTotal}`);

        // 报告进度
        this.reportProgress({
          total,
          current: captured + 1,
          currentTitle: sessionInfo.title,
          captured: this.totalCaptured,
          status: 'running',
          eta: this.calculateETA(captured, total),
          sessionMessagesTotal: sessionMessageTotal,
        });

        // 捕获当前会话
        const captureResult = await this.captureCurrentSession();

        if (captureResult) {
          const { session, isNew, isUpdated } = captureResult;
          this.processedSessions.add(sessionId);
          this.totalCaptured += session.messageCount;

          if (isNew) {
            newCount++;
          } else if (isUpdated) {
            updatedCount++;
          }
        }

        captured++;
        const sessionTime = Date.now() - sessionStart;
        this.sessionTimes.push(sessionTime);
        console.log(`[ContextDrop] DeepSeek: Captured session in ${sessionTime}ms`);

      } catch (err: any) {
        console.error(`[ContextDrop] DeepSeek: Error capturing session ${sessionInfo.title}:`, err);
      }
    }

    // 完成
    console.log(`[ContextDrop] DeepSeek: Batch capture completed. Captured: ${captured}, New: ${newCount}, Updated: ${updatedCount}`);

    this.reportProgress({
      total,
      current: captured,
      currentTitle: '',
      captured: this.totalCaptured,
      status: 'completed',
    });

    setTimeout(() => this.removeFloatingProgress(), 3000);
  }

  private countDeepseekMessages(): number {
    // DeepSeek 消息选择器
    const messages = document.querySelectorAll('[class*="ds-message"]');
    return messages.length;
  }

  // ========== Kimi 平台方法 ==========

  private getKimiSessionListElements(): Element[] {
    console.log('[ContextDrop] === Kimi Session List Debug ===');

    // Kimi 会话列表选择器
    // 会话项在 .chat-info-item 中，带有链接到 /chat/{sessionId}
    const sessionItems = document.querySelectorAll('.chat-info-item a[href*="/chat/"]');
    console.log(`[ContextDrop] Kimi: Found ${sessionItems.length} session items with .chat-info-item a[href*="/chat/"]`);

    if (sessionItems.length > 0) {
      sessionItems.forEach((item, i) => {
        if (i < 5) {
          console.log(`[ContextDrop] Kimi [${i}] class="${item.className}" href="${item.getAttribute('href')}"`);
        }
      });
      return Array.from(sessionItems);
    }

    // 备用：直接查找所有会话链接
    const allChatLinks = document.querySelectorAll('a[href^="/chat/"]');
    console.log(`[ContextDrop] Kimi: Fallback found ${allChatLinks.length} links with href^="/chat/"`);

    if (allChatLinks.length > 0) {
      return Array.from(allChatLinks).filter(link => {
        const href = link.getAttribute('href') || '';
        // 排除历史记录页面链接
        return !href.includes('/history');
      });
    }

    console.warn('[ContextDrop] Kimi: No session list found');
    return [];
  }

  private getKimiSessionTitle(element: Element): string {
    // Kimi 会话标题在 .chat-name 或元素文本中
    const chatName = element.querySelector('.chat-name');
    if (chatName?.textContent?.trim()) {
      return chatName.textContent.trim();
    }

    // 备用：使用链接文本
    const text = element.textContent?.trim() || '';
    return text.replace(/\s+/g, ' ').slice(0, 50) || '未命名会话';
  }

  private getKimiSessionIdFromElement(element: Element): string | null {
    // Kimi URL 格式: /chat/{sessionId}
    const href = element.getAttribute('href');
    if (href) {
      const match = href.match(/\/chat\/([a-zA-Z0-9_-]+)/);
      if (match) {
        console.log(`[ContextDrop] Kimi: Extracted session ID: ${match[1]}`);
        return match[1];
      }
    }

    // 尝试 data 属性
    const dataId = element.getAttribute('data-id') ||
                   element.getAttribute('data-session-id') ||
                   element.getAttribute('data-chat-id');
    if (dataId) {
      console.log(`[ContextDrop] Kimi: Extracted session ID from data attribute: ${dataId}`);
      return dataId;
    }

    // 使用文本内容的 hash 作为 ID
    const text = element.textContent?.trim() || '';
    if (text) {
      return `kimi-${this.simpleHash(text)}`;
    }

    return null;
  }

  private countKimiMessages(): number {
    // Kimi 消息选择器
    const userMessages = document.querySelectorAll('.chat-content-item-user');
    const assistantMessages = document.querySelectorAll('.chat-content-item-assistant');
    return Math.max(userMessages.length, assistantMessages.length);
  }

  // ========== ChatGPT 平台方法 ==========

  private countChatgptMessages(): number {
    // ChatGPT uses data-testid="conversation-turn-{index}" for each turn
    const turnElements = document.querySelectorAll('[data-testid^="conversation-turn-"]');
    if (turnElements.length > 0) {
      return turnElements.length;
    }
    // Fallback: use message author role selectors
    const userMessages = document.querySelectorAll('[data-message-author-role="user"]');
    const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
    return Math.max(userMessages.length, assistantMessages.length);
  }

  // ========== Gemini 平台方法 ==========

  private getGeminiSessionListElements(): Element[] {
    console.log('[ContextDrop] === Gemini Session List Debug ===');

    // Gemini 会话列表选择器
    // 会话项在侧边栏，链接格式为 /app/{sessionId}
    const sessionItems = document.querySelectorAll('a[href^="/app/"]');
    console.log(`[ContextDrop] Gemini: Found ${sessionItems.length} session items with a[href^="/app/"]`);

    if (sessionItems.length > 0) {
      sessionItems.forEach((item, i) => {
        if (i < 5) {
          console.log(`[ContextDrop] Gemini [${i}] class="${item.className}" href="${item.getAttribute('href')}"`);
        }
      });
      return Array.from(sessionItems);
    }

    // 备用：查找侧边栏中的会话项
    const sidebarSelectors = [
      '[class*="conversation-list"]',
      '[class*="history-list"]',
      '[class*="session-list"]',
      'nav a',
      'aside a',
    ];

    for (const selector of sidebarSelectors) {
      const items = document.querySelectorAll(selector);
      if (items.length > 0) {
        // 过滤出会话链接
        const sessionLinks = Array.from(items).filter(el => {
          const href = el.getAttribute('href') || '';
          return href.startsWith('/app/') && href.length > 5;
        });
        if (sessionLinks.length > 0) {
          console.log(`[ContextDrop] Gemini: Fallback found ${sessionLinks.length} sessions with ${selector}`);
          return sessionLinks;
        }
      }
    }

    console.warn('[ContextDrop] Gemini: No session list found');
    return [];
  }

  private getGeminiSessionTitle(element: Element): string {
    // Gemini 会话标题可能在链接内或子元素中
    const titleEl = element.querySelector('[class*="title"], [class*="name"], [class*="label"]');
    if (titleEl?.textContent?.trim()) {
      return titleEl.textContent.trim();
    }

    // 备用：使用链接文本
    const text = element.textContent?.trim() || '';
    return text.replace(/\s+/g, ' ').slice(0, 50) || '未命名会话';
  }

  private getGeminiSessionIdFromElement(element: Element): string | null {
    // Gemini URL 格式: /app/{sessionId}
    const href = element.getAttribute('href');
    if (href) {
      const match = href.match(/\/app\/([a-zA-Z0-9_-]+)/);
      if (match) {
        console.log(`[ContextDrop] Gemini: Extracted session ID: ${match[1]}`);
        return match[1];
      }
    }

    // 尝试 data 属性
    const dataId = element.getAttribute('data-id') ||
                   element.getAttribute('data-session-id') ||
                   element.getAttribute('data-conversation-id');
    if (dataId) {
      console.log(`[ContextDrop] Gemini: Extracted session ID from data attribute: ${dataId}`);
      return dataId;
    }

    // 使用文本内容的 hash 作为 ID
    const text = element.textContent?.trim() || '';
    if (text) {
      return `gemini-${this.simpleHash(text)}`;
    }

    return null;
  }

  private countGeminiMessages(): number {
    // Gemini 消息选择器
    const userMessages = document.querySelectorAll('[class*="user-query"]');
    const assistantMessages = document.querySelectorAll('[class*="response-container"], [class*="model-response"]');
    return Math.max(userMessages.length, assistantMessages.length);
  }

  private async geminiScrollToLoadHistory(): Promise<number> {
    // 查找 Gemini 消息区域的根容器
    const rootSelectors = [
      'main',
      '[class*="conversation-container"]',
      '[class*="chat-container"]',
      '[data-test-id="conversation-panel"]',
    ];

    let root: Element | null = null;
    for (const selector of rootSelectors) {
      root = document.querySelector(selector);
      if (root) {
        console.log(`[ContextDrop] Found Gemini message root: ${selector}`);
        break;
      }
    }

    if (!root) {
      console.warn('[ContextDrop] Gemini message container not found');
      return this.countGeminiMessages();
    }

    // 查找真正可滚动的容器
    const container = this.findScrollableContainer(root);

    if (!container) {
      console.warn('[ContextDrop] No scrollable Gemini message container found');
      return this.countGeminiMessages();
    }

    console.log(`[ContextDrop] Scrolling Gemini message container`);

    // 滚动到顶部加载历史
    let lastHeight = container.scrollHeight;
    let noChangeCount = 0;
    let messageCount = this.countGeminiMessages();

    while (noChangeCount < 3 && !this.isCancelled) {
      (container as HTMLElement).scrollTop = 0;
      await this.sleep(500);

      if (this.isCancelled) {
        console.log('[ContextDrop] Gemini scroll cancelled');
        return messageCount;
      }

      if (container.scrollHeight === lastHeight) {
        noChangeCount++;
      } else {
        lastHeight = container.scrollHeight;
        noChangeCount = 0;
        messageCount = this.countGeminiMessages();
        console.log(`[ContextDrop] Gemini history loaded, scrollHeight: ${lastHeight}, messages: ${messageCount}`);
      }
    }

    return this.countGeminiMessages();
  }

  // ========== ChatGPT 平台特定方法 ==========

  private getChatgptSessionListElements(): Element[] {
    console.log('[ContextDrop] === ChatGPT Session List Debug ===');

    // ChatGPT 会话链接格式: /c/{conversation_id} 或 /chat/{conversation_id}
    // 主要选择器：查找以 /c/ 开头的链接
    const sessionItems = document.querySelectorAll('a[href^="/c/"]');
    console.log(`[ContextDrop] ChatGPT: Found ${sessionItems.length} session items with a[href^="/c/"]`);

    if (sessionItems.length > 0) {
      // 过滤：排除非会话项（如设置、帮助等）
      const sessionLinks = Array.from(sessionItems).filter(el => {
        const href = el.getAttribute('href') || '';
        const text = el.textContent?.trim() || '';
        // 排除 New chat 按钮和一些特殊页面
        return href.length > 3 && // /c/ + at least one char
               !text.toLowerCase().includes('new chat') &&
               !text.toLowerCase().includes('new conversation') &&
               !href.includes('/c/new');
      });

      if (sessionLinks.length > 0) {
        console.log(`[ContextDrop] ChatGPT: Filtered to ${sessionLinks.length} valid sessions`);
        sessionLinks.slice(0, 5).forEach((item, i) => {
          console.log(`[ContextDrop] ChatGPT [${i}] class="${item.className}" href="${item.getAttribute('href')}" text="${item.textContent?.slice(0, 30)}"`);
        });
        return sessionLinks;
      }
    }

    // 备用选择器：尝试 /chat/ 格式
    const chatItems = document.querySelectorAll('a[href^="/chat/"]');
    if (chatItems.length > 0) {
      const sessionLinks = Array.from(chatItems).filter(el => {
        const href = el.getAttribute('href') || '';
        const text = el.textContent?.trim() || '';
        return href.length > 6 &&
               !text.toLowerCase().includes('new chat');
      });
      if (sessionLinks.length > 0) {
        console.log(`[ContextDrop] ChatGPT: Found ${sessionLinks.length} sessions with /chat/ format`);
        return sessionLinks;
      }
    }

    // 回退方案：查找侧边栏中的会话项
    const sidebarSelectors = [
      '[class*="conversation-list"] a',
      '[class*="history-list"] a',
      '[class*="session-list"] a',
      '[class*="chat-list"] a',
      'nav a[href*="/c/"]',
      'aside a[href*="/c/"]',
      'nav a[href*="/chat/"]',
      'aside a[href*="/chat/"]',
    ];

    for (const selector of sidebarSelectors) {
      const items = document.querySelectorAll(selector);
      if (items.length > 0) {
        const sessionLinks = Array.from(items).filter(el => {
          const href = el.getAttribute('href') || '';
          const text = el.textContent?.trim() || '';
          return (href.startsWith('/c/') || href.startsWith('/chat/')) &&
                 href.length > 3 &&
                 !text.toLowerCase().includes('new chat');
        });
        if (sessionLinks.length > 0) {
          console.log(`[ContextDrop] ChatGPT: Fallback found ${sessionLinks.length} sessions with ${selector}`);
          return sessionLinks;
        }
      }
    }

    console.warn('[ContextDrop] ChatGPT: No session list found');
    return [];
  }

  private getChatgptSessionTitle(element: Element): string {
    // 首先尝试从子元素获取标题
    const titleSelectors = [
      '[class*="title"]',
      '[class*="text"]',
      '[class*="label"]',
      '[class*="name"]',
      'div[class*="truncate"]',
      'span[class*="truncate"]',
    ];

    for (const selector of titleSelectors) {
      const titleEl = element.querySelector(selector);
      if (titleEl?.textContent?.trim()) {
        const title = titleEl.textContent.trim();
        if (title && title.toLowerCase() !== 'new chat') {
          return title.replace(/\s+/g, ' ').slice(0, 50);
        }
      }
    }

    // 备用：使用链接文本
    const text = element.textContent?.trim() || '';
    const cleaned = text.replace(/\s+/g, ' ').slice(0, 50);
    return cleaned || '未命名会话';
  }

  private getChatgptSessionIdFromElement(element: Element): string | null {
    // ChatGPT URL 格式: /c/{conversation_id} 或 /chat/{conversation_id}
    const href = element.getAttribute('href');
    if (href) {
      // 匹配 /c/{id} 格式
      const cMatch = href.match(/\/c\/([a-zA-Z0-9-]+)/);
      if (cMatch) {
        const sessionId = cMatch[1];
        // 过滤掉无效ID（如 "new"）
        if (sessionId && sessionId !== 'new' && sessionId.length > 4) {
          console.log(`[ContextDrop] ChatGPT: Extracted session ID from href (c format): ${sessionId}`);
          return sessionId;
        }
      }

      // 匹配 /chat/{id} 格式
      const chatMatch = href.match(/\/chat\/([a-zA-Z0-9-]+)/);
      if (chatMatch) {
        const sessionId = chatMatch[1];
        // 过滤掉无效ID
        if (sessionId && sessionId !== 'new' && sessionId.length > 4) {
          console.log(`[ContextDrop] ChatGPT: Extracted session ID from href (chat format): ${sessionId}`);
          return sessionId;
        }
      }
    }

    // 尝试 data 属性
    const dataId = element.getAttribute('data-id') ||
                   element.getAttribute('data-session-id') ||
                   element.getAttribute('data-conversation-id');
    if (dataId && dataId.length > 4) {
      console.log(`[ContextDrop] ChatGPT: Extracted session ID from data attribute: ${dataId}`);
      return dataId;
    }

    // 使用文本内容的 hash 作为 ID
    const text = element.textContent?.trim() || '';
    if (text) {
      return `chatgpt-${this.simpleHash(text)}`;
    }

    return null;
  }

  // ========== Claude 平台特定方法 ==========

  private getClaudeSessionListElements(): Element[] {
    console.log('[OmniContext] === Claude Session List Debug ===');

    // Claude 的侧边栏没有 data-testid 属性，使用通用选择器
    // 策略1: 直接查找所有 /chat/ 链接
    let allLinks = document.querySelectorAll('a[href^="/chat/"]');
    console.log(`[OmniContext] Claude: Found ${allLinks.length} total /chat/ links`);

    // 策略2: 如果没找到，尝试在 nav 或 aside 中查找
    if (allLinks.length === 0) {
      const navOrAside = document.querySelector('nav, aside');
      if (navOrAside) {
        allLinks = navOrAside.querySelectorAll('a[href^="/chat/"]');
        console.log(`[OmniContext] Claude: Found ${allLinks.length} links in nav/aside`);
      }
    }

    // 策略3: 查找包含 sidebar 类名的容器
    if (allLinks.length === 0) {
      const sidebar = document.querySelector('[class*="sidebar"], [class*="Sidebar"]');
      if (sidebar) {
        allLinks = sidebar.querySelectorAll('a[href^="/chat/"]');
        console.log(`[OmniContext] Claude: Found ${allLinks.length} links in sidebar container`);
      }
    }

    // 过滤：只保留有效的会话链接（UUID格式）
    const sessionLinks = Array.from(allLinks).filter(link => {
      const href = link.getAttribute('href') || '';
      // 排除 /chat/new 等非对话链接，只匹配 UUID 格式
      const isValid = /^\/chat\/[0-9a-f-]{8,}/i.test(href);
      return isValid;
    });

    console.log(`[OmniContext] Claude: Found ${sessionLinks.length} valid sessions (UUID format)`);

    // 打印调试信息
    sessionLinks.slice(0, 5).forEach((item, i) => {
      console.log(`[OmniContext] Claude [${i}] href="${item.getAttribute('href')}" text="${item.textContent?.trim().slice(0, 50)}"`);
    });

    return sessionLinks;
  }

  private getClaudeSessionTitle(element: Element): string {
    // Claude 链接内的标题可能在多个位置
    // 尝试1: truncate 类
    const titleEl = element.querySelector('.truncate');
    if (titleEl?.textContent?.trim()) {
      return titleEl.textContent.trim();
    }
    // 尝试2: 直接取链接文本
    const text = element.textContent?.trim();
    if (text && text.length < 200) {
      return text;
    }
    return '未命名对话';
  }

  private getClaudeSessionIdFromElement(element: Element): string | null {
    const href = element.getAttribute('href') || '';
    const match = href.match(/\/chat\/([0-9a-f-]{8,})/i);
    return match?.[1] || null;
  }

  private async ensureClaudeSidebarOpen(): Promise<void> {
    console.log('[OmniContext] === Claude Sidebar Check ===');

    // Claude 侧边栏选择器（不依赖 data-testid）
    const sidebarSelectors = [
      'nav',
      'aside',
      '[class*="sidebar"]',
      '[class*="Sidebar"]',
      '[aria-label*="history"]',
      '[aria-label*="chat"]',
    ];

    let sidebar: Element | null = null;
    for (const selector of sidebarSelectors) {
      sidebar = document.querySelector(selector);
      if (sidebar) {
        const links = sidebar.querySelectorAll('a[href^="/chat/"]');
        if (links.length > 0) {
          console.log(`[OmniContext] Claude sidebar found via: ${selector} with ${links.length} chat links`);
          break;
        }
      }
    }

    if (sidebar) {
      // 检查侧边栏是否可见
      const rect = sidebar.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log('[OmniContext] Claude sidebar is visible');
        await this.sleep(300);
        return;
      }
    }

    // 尝试点击打开侧边栏的按钮
    const toggleSelectors = [
      'button[aria-label*="sidebar"]',
      'button[aria-label*="menu"]',
      'button[class*="sidebar"]',
      '[class*="sidebar-toggle"]',
    ];

    for (const selector of toggleSelectors) {
      const toggleBtn = document.querySelector(selector);
      if (toggleBtn) {
        console.log(`[OmniContext] Clicking sidebar toggle: ${selector}`);
        (toggleBtn as HTMLElement).click();
        await this.sleep(800);
        break;
      }
    }
  }

  private async chatgptScrollToLoadHistory(): Promise<number> {
    // 查找 ChatGPT 消息区域的根容器
    const rootSelectors = [
      'main',
      '[class*="conversation-container"]',
      '[class*="chat-container"]',
      '[data-testid="conversation-turn-0"]',
    ];

    let root: Element | null = null;
    for (const selector of rootSelectors) {
      root = document.querySelector(selector);
      if (root) {
        console.log(`[ContextDrop] Found ChatGPT message root: ${selector}`);
        break;
      }
    }

    if (!root) {
      console.warn('[ContextDrop] ChatGPT message container not found');
      return this.countChatgptMessages();
    }

    // 查找真正可滚动的容器
    const container = this.findScrollableContainer(root);

    if (!container) {
      console.warn('[ContextDrop] No scrollable ChatGPT message container found');
      return this.countChatgptMessages();
    }

    console.log(`[ContextDrop] Scrolling ChatGPT message container`);

    // 滚动到顶部加载历史
    let lastHeight = container.scrollHeight;
    let noChangeCount = 0;
    let messageCount = this.countChatgptMessages();

    while (noChangeCount < 3 && !this.isCancelled) {
      (container as HTMLElement).scrollTop = 0;
      await this.sleep(500);

      if (this.isCancelled) {
        console.log('[ContextDrop] ChatGPT scroll cancelled');
        return messageCount;
      }

      if (container.scrollHeight === lastHeight) {
        noChangeCount++;
      } else {
        lastHeight = container.scrollHeight;
        noChangeCount = 0;
        messageCount = this.countChatgptMessages();
        console.log(`[ContextDrop] ChatGPT history loaded, scrollHeight: ${lastHeight}, messages: ${messageCount}`);
      }
    }

    return this.countChatgptMessages();
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
