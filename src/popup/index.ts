import { sessionStorage } from '../storage/session-storage';
import { tagStorage } from '../storage/tag-storage';
import { formatSessionForInjection } from '../utils/formatter';
import { formatPlatformName, detectPlatform } from '../utils/extractor';
import type { Platform, Session, Tag } from '../types';

// Export data structure
interface ExportData {
  version: string;
  exportedAt: string;
  sessions: Session[];
  tags: Tag[];
  sessionTags: Record<string, string[]>;
}

// Platform icons - use img tags with chrome.runtime.getURL
interface IconOptions {
  size?: number;
  className?: string;
  extraStyle?: string;
}

function getPlatformIcon(platform: Platform | undefined, options: IconOptions = {}): string {
  const { size = 16, className = 'platform-logo', extraStyle = '' } = options;
  const iconUrls: Record<Platform, string> = {
    doubao: chrome.runtime.getURL('icons/platforms/doubao.svg'),
    yuanbao: chrome.runtime.getURL('icons/platforms/yuanbao.svg'),
    claude: chrome.runtime.getURL('icons/platforms/claude.svg'),
    deepseek: chrome.runtime.getURL('icons/platforms/deepseek.svg'),
    kimi: chrome.runtime.getURL('icons/platforms/kimi.svg'),
    gemini: chrome.runtime.getURL('icons/platforms/gemini.svg'),
    chatgpt: chrome.runtime.getURL('icons/platforms/chatgpt.svg'),
  };
  const style = extraStyle ? ` style="${extraStyle}"` : '';
  const defaultIcon = '🤖'; // Fallback for unknown platforms
  if (!platform || !iconUrls[platform]) {
    return `<span class="${className}" style="font-size: ${size}px; line-height: ${size}px;${style}">${defaultIcon}</span>`;
  }
  return `<img class="${className} ${platform}" src="${iconUrls[platform]}" width="${size}" height="${size}" alt="${formatPlatformName(platform)}"${style}>`;
}

const PLATFORM_ICONS: Record<Platform, string> = {
  doubao: getPlatformIcon('doubao'),
  yuanbao: getPlatformIcon('yuanbao'),
  claude: getPlatformIcon('claude'),
  deepseek: getPlatformIcon('deepseek'),
  kimi: getPlatformIcon('kimi'),
  gemini: getPlatformIcon('gemini'),
  chatgpt: getPlatformIcon('chatgpt'),
};

// Icon URLs for current assistant card
const PLATFORM_ICON_URLS: Record<Platform, string> = {
  doubao: chrome.runtime.getURL('icons/platforms/doubao.svg'),
  yuanbao: chrome.runtime.getURL('icons/platforms/yuanbao.svg'),
  deepseek: chrome.runtime.getURL('icons/platforms/deepseek.svg'),
  kimi: chrome.runtime.getURL('icons/platforms/kimi.svg'),
  gemini: chrome.runtime.getURL('icons/platforms/gemini.svg'),
  chatgpt: chrome.runtime.getURL('icons/platforms/chatgpt.svg'),
  claude: chrome.runtime.getURL('icons/platforms/claude.svg'),
};

// 平台排序顺序
const PLATFORM_ORDER: Platform[] = ['doubao', 'chatgpt', 'gemini', 'deepseek', 'claude', 'yuanbao', 'kimi'];

// DOM Elements
const sessionListEl = document.getElementById('session-list')!;
const exportBtn = document.getElementById('export-btn')!;
const importBtn = document.getElementById('import-btn')!;
const refreshBtn = document.getElementById('refresh-btn')!;
const manageBtn = document.getElementById('manage-btn')!;
const toastEl = document.getElementById('toast')!;
const searchInput = document.getElementById('search-input')! as HTMLInputElement;
const searchClear = document.getElementById('search-clear')! as HTMLButtonElement;
const filterPlatform = document.getElementById('filter-platform')!;

// Import dialog elements
const importDialog = document.getElementById('import-dialog')!;

// Session selection dialog elements
const sessionSelectDialog = document.getElementById('session-select-dialog')!;
const sessionSelectList = document.getElementById('session-select-list')!;
const sessionSelectAll = document.getElementById('session-select-all')! as HTMLInputElement;
const sessionSelectCount = document.getElementById('session-select-count')!;
const sessionSelectCancelBtn = document.getElementById('session-select-cancel')! as HTMLButtonElement;
const sessionSelectConfirmBtn = document.getElementById('session-select-confirm')! as HTMLButtonElement;
const importFileInput = document.getElementById('import-file-input')! as HTMLInputElement;
const importFilename = document.getElementById('import-filename')!;
const importSessionCount = document.getElementById('import-session-count')!;
const importTagCount = document.getElementById('import-tag-count')!;
const importCancel = document.getElementById('import-cancel')!;
const importConfirm = document.getElementById('import-confirm')!;

// Current assistant card elements
const currentAssistantCard = document.getElementById('current-assistant-card')!;
const assistantPlatformThumb = document.getElementById('assistant-platform-thumb')! as HTMLElement;
const assistantPlatformIcon = document.getElementById('assistant-platform-icon')! as HTMLImageElement;
const assistantPlatformName = document.getElementById('assistant-platform-name')!;
const assistantStatusDot = document.getElementById('assistant-status-dot')!;
const assistantStatusText = document.getElementById('assistant-status-text')!;
// Current assistant card buttons
const batchCaptureBtn = document.getElementById('batch-capture-btn')! as HTMLButtonElement;
const autoCaptureBtn = document.getElementById('auto-capture-btn')! as HTMLButtonElement;
const autoCaptureText = document.getElementById('auto-capture-text')!;
const batchScanning = document.getElementById('batch-scanning')!;
const batchScanningPlatform = document.getElementById('batch-scan-platform')!;
const batchScanningCount = batchScanning.querySelector('.batch-scanning-count strong')!;
const batchScanCancelBtn = document.getElementById('batch-scan-cancel-btn')! as HTMLButtonElement;
const batchProgress = document.getElementById('batch-progress')!;
const batchProgressCount = document.getElementById('batch-progress-count')!;
const batchProgressFill = document.getElementById('batch-progress-fill')!;
const batchProgressTitle = document.getElementById('batch-progress-title')!;
const batchCancelBtn = document.getElementById('batch-cancel-btn')! as HTMLButtonElement;

// Tag dialog elements
const tagDialog = document.getElementById('tag-dialog')!;
const tagDialogTitle = document.getElementById('tag-dialog-title')!;
const tagList = document.getElementById('tag-list')!;
const tagNewInput = document.getElementById('tag-new-input')! as HTMLInputElement;
const tagAddBtn = document.getElementById('tag-add-btn')! as HTMLButtonElement;
const tagCancelBtn = document.getElementById('tag-cancel')! as HTMLButtonElement;

// Session view dialog elements
const sessionViewDialog = document.getElementById('session-view-dialog')!;
const sessionViewTitle = document.getElementById('session-view-title')!;
const sessionViewMeta = document.getElementById('session-view-meta')!;
const sessionViewMessages = document.getElementById('session-view-messages')!;
const sessionViewCopyBtn = document.getElementById('session-view-copy')! as HTMLButtonElement;
const sessionViewCloseBtn = document.getElementById('session-view-close')! as HTMLButtonElement;

// Delete mode elements
const deleteModeBar = document.getElementById('delete-mode-bar')!;
const deleteSelectedCount = document.getElementById('delete-selected-count')!;
const deleteSelectAllCheckbox = document.getElementById('delete-select-all-checkbox')! as HTMLInputElement;
const deleteCancelBtn = document.getElementById('delete-cancel-btn')! as HTMLButtonElement;
const deleteConfirmBtn = document.getElementById('delete-confirm-btn')! as HTMLButtonElement;

// Onboarding dialog elements
const onboardingDialog = document.getElementById('onboarding-dialog')!;
const onboardingStartBtn = document.getElementById('onboarding-start-btn')! as HTMLButtonElement;
const dontShowAgainCheckbox = document.getElementById('dont-show-again')! as HTMLInputElement;

// State
let currentPlatform: Platform | null = null;
let allTags: Tag[] = [];
let allSessions: Session[] = [];
let pendingImportData: ExportData | null = null;

// Search state
let searchKeyword = '';
let selectedPlatform: Platform | '' = '';
let selectedTagIds: string[] = [];

// Delete mode state
let isDeleteMode = false;
let selectedSessionIds = new Set<string>();

// Batch capture state
let isBatchCapturing = false;
let discoveredSessions: Array<{ id: string; title: string; platform: string }> = [];
let captureSelectedIds = new Set<string>();

// Tag dialog state
let currentTagSessionId: string | null = null;

// Track collapsed state of each platform (persisted in chrome.storage.local)
const collapsedPlatforms = new Set<string>();

// Server status
interface ServerStatus {
  nativeHost: boolean;
  server: boolean;
}
let serverStatus: ServerStatus = { nativeHost: false, server: false };
let useServerData = false; // Toggle for reading from server

// Load collapsed state from storage
async function loadCollapsedState(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('collapsedPlatforms');
    if (result.collapsedPlatforms && Array.isArray(result.collapsedPlatforms)) {
      result.collapsedPlatforms.forEach((p: string) => collapsedPlatforms.add(p));
    }
  } catch (e) {
    console.error('Failed to load collapsed state:', e);
  }
}

// Save collapsed state to storage
async function saveCollapsedState(): Promise<void> {
  try {
    await chrome.storage.local.set({ collapsedPlatforms: Array.from(collapsedPlatforms) });
  } catch (e) {
    console.error('Failed to save collapsed state:', e);
  }
}

// Check server status and update UI
async function checkServerStatus(): Promise<ServerStatus> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_SERVER_STATUS' });
    serverStatus = response || { nativeHost: false, server: false };
    updateServerStatusUI();
    return serverStatus;
  } catch (e) {
    console.error('Failed to check server status:', e);
    serverStatus = { nativeHost: false, server: false };
    updateServerStatusUI();
    return serverStatus;
  }
}

// Update server status indicator in UI
function updateServerStatusUI() {
  const statusEl = document.getElementById('server-status');
  if (!statusEl) return;

  if (serverStatus.server) {
    statusEl.textContent = '●';
    statusEl.className = 'server-status server-online';
    statusEl.title = '本地服务器已连接';
  } else if (serverStatus.nativeHost) {
    statusEl.textContent = '◐';
    statusEl.className = 'server-status server-partial';
    statusEl.title = 'Native Host 已连接，但服务器未运行';
  } else {
    statusEl.textContent = '○';
    statusEl.className = 'server-status server-offline';
    statusEl.title = '本地服务器未连接';
  }
}

// Current assistant card state
let isAutoCaptureEnabled = false;
let isConnectedToContentScript = false;

// Load auto capture state from storage
async function loadAutoCaptureState(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('autoCaptureEnabled');
    isAutoCaptureEnabled = (result.autoCaptureEnabled as boolean | undefined) ?? false;
    updateAutoCaptureToggleUI();
  } catch (e) {
    console.error('Failed to load auto capture state:', e);
  }
}

// Save auto capture state to storage
async function saveAutoCaptureState(enabled: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ autoCaptureEnabled: enabled });
  } catch (e) {
    console.error('Failed to save auto capture state:', e);
  }
}

// Update auto capture toggle UI
function updateAutoCaptureToggleUI(): void {
  // 只有当没有检测到平台时才禁用按钮
  if (!currentPlatform) {
    autoCaptureBtn.classList.remove('active');
    autoCaptureBtn.classList.add('disabled');
    autoCaptureText.textContent = '自动捕获：关';
    return;
  }

  // 平台已检测到，按钮可用
  autoCaptureBtn.classList.remove('disabled');

  if (isAutoCaptureEnabled) {
    autoCaptureBtn.classList.add('active');
    autoCaptureText.textContent = '自动捕获：开';
  } else {
    autoCaptureBtn.classList.remove('active');
    autoCaptureText.textContent = '自动捕获：关';
  }
}

// Toggle auto capture state
async function toggleAutoCapture(): Promise<void> {
  // 只有当没有检测到平台时才拒绝操作
  if (!currentPlatform) {
    showToast('💡 请先打开支持的AI平台');
    return;
  }

  isAutoCaptureEnabled = !isAutoCaptureEnabled;
  updateAutoCaptureToggleUI();
  await saveAutoCaptureState(isAutoCaptureEnabled);

  // Update current assistant card to reflect connection status
  updateCurrentAssistantCard(currentPlatform, isAutoCaptureEnabled);

  // Notify content script about the change
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && currentPlatform) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'AUTO_CAPTURE_TOGGLE',
        enabled: isAutoCaptureEnabled
      });
    }
  } catch (e) {
    // Content script may not be available
  }

  showToast(isAutoCaptureEnabled ? '✅ 已开启自动捕获' : '⏸️ 已关闭自动捕获');
}

// Update current assistant card display
function updateCurrentAssistantCard(platform: Platform | null, isConnected: boolean = false): void {
  // 更新连接状态
  const wasConnected = isConnectedToContentScript;
  isConnectedToContentScript = isConnected;

  // Always show the card
  currentAssistantCard.style.display = 'block';

  if (!platform) {
    // Show unknown state
    assistantPlatformThumb.style.background = 'rgba(0,0,0,0.05)';
    assistantPlatformIcon.src = chrome.runtime.getURL('icons/unknown.svg');
    assistantPlatformIcon.alt = '未检测到';
    assistantPlatformName.textContent = '未检测到AI助手';
    assistantStatusDot.classList.remove('connected');
    assistantStatusText.classList.remove('connected');
    assistantStatusText.textContent = '请打开支持的AI平台';
    // 重置状态点颜色为默认灰色
    assistantStatusDot.style.backgroundColor = '';
    // 更新自动捕获按钮状态
    updateAutoCaptureToggleUI();
    return;
  }

  // Update platform icon (transparent background)
  assistantPlatformThumb.style.background = 'transparent';
  assistantPlatformIcon.src = PLATFORM_ICON_URLS[platform] || '';
  assistantPlatformIcon.alt = formatPlatformName(platform);

  // Update platform name
  assistantPlatformName.textContent = formatPlatformName(platform);

  // 重置状态点内联样式，让CSS类控制颜色
  assistantStatusDot.style.backgroundColor = '';
  assistantStatusText.style.color = '';

  // Update status based on auto-capture state
  if (isConnected) {
    assistantStatusDot.classList.add('connected');
    assistantStatusText.classList.add('connected');
    assistantStatusText.textContent = '已连接';
  } else {
    assistantStatusDot.classList.remove('connected');
    assistantStatusText.classList.remove('connected');
    assistantStatusText.textContent = '已断开：请刷新AI平台，并打开自动捕获开关';
  }

  // 如果连接状态发生变化，更新自动捕获按钮
  if (wasConnected !== isConnected) {
    updateAutoCaptureToggleUI();
  }
}

// Debounce helper
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

// Initialize
// Refresh current platform detection
async function refreshCurrentPlatform(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      currentPlatform = detectPlatform(tab.url);

      // Check real connection status with content script
      let isReallyConnected = false;
      if (tab.id && currentPlatform) {
        try {
          // First sync the auto-capture state to content script
          await chrome.tabs.sendMessage(tab.id, {
            type: 'AUTO_CAPTURE_TOGGLE',
            enabled: isAutoCaptureEnabled
          });

          // Then query the real status
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_CAPTURE_STATUS' });
          console.log('[OmniContext] Auto capture status from content script:', response);

          // Only consider connected if:
          // 1. Content script reports enabled
          // 2. Has detected platform
          // 3. Has session ID
          isReallyConnected = response?.isConnected === true;

          // Also check batch capture status
          const batchResponse = await chrome.tabs.sendMessage(tab.id, { type: 'BATCH_CAPTURE_STATUS' });
          if (batchResponse?.isRunning && batchResponse?.progress) {
            isBatchCapturing = true;
            updateBatchCaptureProgress(batchResponse.progress);
          }
        } catch (e) {
          console.log('[OmniContext] Content script not ready or no connection:', e);
          isReallyConnected = false;
        }
      }

      // Update current assistant card with real connection status
      updateCurrentAssistantCard(currentPlatform, isReallyConnected);
    }
  } catch (e) {
    console.error('Failed to detect platform:', e);
  }
}

async function init() {
  // Show assistant card immediately with "未检测到" state
  updateCurrentAssistantCard(null, false);

  // Check server status
  await checkServerStatus();

  // Load auto capture state
  await loadAutoCaptureState();

  // Detect current platform
  await refreshCurrentPlatform();

  // Load collapsed state before loading sessions
  await loadCollapsedState();

  // Load sessions
  await loadSessions();

  // Bind events
  exportBtn.addEventListener('click', handleExport);
  importBtn.addEventListener('click', () => importFileInput.click());
  refreshBtn.addEventListener('click', loadSessions);

  // Import events
  importFileInput.addEventListener('change', handleImportFileSelect);
  importCancel.addEventListener('click', hideImportDialog);
  importConfirm.addEventListener('click', handleImportConfirm);
  importDialog.addEventListener('click', (e) => {
    if (e.target === importDialog) hideImportDialog();
  });

  // Batch capture events
  batchCaptureBtn.addEventListener('click', handleBatchCaptureStart);
  batchCancelBtn.addEventListener('click', handleBatchCaptureCancel);
  batchScanCancelBtn.addEventListener('click', handleBatchCaptureCancel);

  // Delete mode events
  manageBtn.addEventListener('click', toggleDeleteMode);
  deleteCancelBtn.addEventListener('click', exitDeleteMode);
  deleteConfirmBtn.addEventListener('click', handleDeleteSelected);
  deleteSelectAllCheckbox.addEventListener('change', handleSelectAll);

  // Session selection dialog events
  sessionSelectAll.addEventListener('change', handleSessionSelectAll);
  sessionSelectCancelBtn.addEventListener('click', handleSessionSelectCancel);
  sessionSelectConfirmBtn.addEventListener('click', handleSessionSelectConfirm);
  sessionSelectDialog.addEventListener('click', (e) => {
    if (e.target === sessionSelectDialog) handleSessionSelectCancel();
  });

  // Tag dialog events
  tagAddBtn.addEventListener('click', handleAddNewTag);
  tagNewInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAddNewTag();
  });
  tagCancelBtn.addEventListener('click', hideTagDialog);
  tagDialog.addEventListener('click', (e) => {
    if (e.target === tagDialog) hideTagDialog();
  });

  // Session view dialog events
  sessionViewCopyBtn.addEventListener('click', handleSessionViewCopy);
  sessionViewCloseBtn.addEventListener('click', hideSessionViewDialog);
  sessionViewDialog.addEventListener('click', (e) => {
    if (e.target === sessionViewDialog) hideSessionViewDialog();
  });

  // Listen for batch capture progress from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'BATCH_CAPTURE_PROGRESS') {
      updateBatchCaptureProgress(message.progress);
      // Reload sessions when a new session is captured
      if (message.progress.sessionJustCaptured) {
        // 保存滚动位置，避免刷新时跳回顶部
        const scrollPos = saveScrollPosition();
        loadSessions().then(() => {
          restoreScrollPosition(scrollPos);
        });
      }
    }
  });

  // Auto capture button event
  autoCaptureBtn.addEventListener('click', toggleAutoCapture);

  // Search events
  searchInput.addEventListener('input', debounce(handleSearch, 300));
  searchClear.addEventListener('click', clearSearch);
  filterPlatform.addEventListener('click', handleFilterChange);

  // Listen for side panel becoming visible (user reopens side panel)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[OmniContext] Side panel visible, refreshing platform detection');
      refreshCurrentPlatform();
    }
  });

  // Listen for tab changes (user switches to different tab)
  chrome.tabs.onActivated.addListener(() => {
    console.log('[OmniContext] Tab changed, refreshing platform detection');
    refreshCurrentPlatform();
  });

  // Listen for URL changes in current tab
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.active) {
      console.log('[OmniContext] URL changed, refreshing platform detection');
      refreshCurrentPlatform();
    }
  });

  // Onboarding events
  onboardingStartBtn.addEventListener('click', async () => {
    const dontShowAgain = dontShowAgainCheckbox.checked;
    await closeOnboardingDialog(dontShowAgain);
  });
  onboardingDialog.addEventListener('click', (e) => {
    if (e.target === onboardingDialog) {
      closeOnboardingDialog(dontShowAgainCheckbox.checked);
    }
  });

  // Check and show onboarding
  if (await checkAndShowOnboarding()) {
    showOnboardingDialog();
  }
}

function handleSearch() {
  searchKeyword = searchInput.value.trim();
  searchClear.style.display = searchKeyword ? 'flex' : 'none';
  renderSessions();
}

function clearSearch() {
  searchInput.value = '';
  searchKeyword = '';
  searchClear.style.display = 'none';
  renderSessions();
}

function handleFilterChange(e: Event) {
  const chip = (e.target as HTMLElement).closest('.platform-chip');
  if (!chip) return;

  // Update selection state
  filterPlatform.querySelectorAll('.platform-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');

  // Get selected platform
  selectedPlatform = (chip as HTMLElement).dataset.platform as Platform | '' || '';
  renderSessions();
}

function highlightText(text: string, keyword: string): string {
  if (!keyword) return escapeHtml(text);

  const escaped = escapeHtml(text);
  const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi');
  return escaped.replace(regex, '<span class="highlight">$1</span>');
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadSessions() {
  sessionListEl.innerHTML = '<div class="loading">加载中...</div>';

  // Load all tags from local storage
  allTags = await tagStorage.getAllTags();

  // Try to load from server if available, otherwise use local storage
  let sessions: Session[] = [];

  if (serverStatus.server && useServerData) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SESSIONS_FROM_SERVER',
        source: 'platform',
        limit: 1000,
      });

      if (response.success && response.data?.sessions) {
        // Convert server format to local format
        sessions = response.data.sessions.map((s: any) => ({
          id: s.id,
          source: s.source || 'platform',
          platform: s.platform,
          title: s.title,
          sourceUrl: s.metadata?.sourceUrl,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          messages: s.messages || [],
          messageCount: s.messages?.length || 0,
          tags: s.tags,
        }));
        console.log('[OmniContext] Loaded sessions from server:', sessions.length);
      } else {
        console.warn('[OmniContext] Failed to load from server, falling back to local');
        sessions = await sessionStorage.getAllSessions();
      }
    } catch (e) {
      console.error('[OmniContext] Error loading from server:', e);
      sessions = await sessionStorage.getAllSessions();
    }
  } else {
    sessions = await sessionStorage.getAllSessions();
    console.log('[OmniContext] Loaded sessions from local storage:', sessions.length);
  }

  // 规范化 platform 值（统一转为小写，解决历史数据大小写不一致问题）
  const rawPlatforms = new Set(sessions.map(s => s.platform));
  console.log('[OmniContext] Raw platforms before normalization:', Array.from(rawPlatforms));

  sessions = sessions.map(s => ({
    ...s,
    platform: (s.platform?.toLowerCase() as Platform) || 'unknown'
  }));

  const normalizedPlatforms = new Set(sessions.map(s => s.platform));
  console.log('[OmniContext] Platforms after normalization:', Array.from(normalizedPlatforms));

  allSessions = sessions;

  // Update debug info
  updateDebugInfo(sessions.length);

  renderSessions();
}

// 保存滚动位置（用于批量捕获时刷新列表）
function saveScrollPosition(): number {
  return sessionListEl.scrollTop;
}

function restoreScrollPosition(position: number) {
  sessionListEl.scrollTop = position;
}

async function updateDebugInfo(sessionCount: number) {
  const debugInfo = document.getElementById('debug-info');
  const debugSessions = document.getElementById('debug-sessions');
  const debugStorage = document.getElementById('debug-storage');

  if (!debugInfo || !debugSessions || !debugStorage) return;

  // Show debug info
  debugInfo.style.display = 'flex';
  debugSessions.textContent = `会话: ${sessionCount}`;

  // Get storage size
  try {
    chrome.storage.local.getBytesInUse('sessions', (bytes) => {
      const kb = (bytes / 1024).toFixed(1);
      const mb = (bytes / 1024 / 1024).toFixed(2);
      debugStorage.textContent = bytes > 1024 * 1024
        ? `存储: ${mb} MB`
        : `存储: ${kb} KB`;
    });
  } catch {
    debugStorage.textContent = '存储: -';
  }
}

async function renderSessions() {
  if (allSessions.length === 0) {
    sessionListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <p>还没有保存的会话</p>
      </div>
    `;
    return;
  }

  // Filter sessions
  let filtered = [...allSessions];

  // Platform filter
  if (selectedPlatform) {
    filtered = filtered.filter(s => s.platform === selectedPlatform);
  }

  // Tag filter (multi-select) - session must have ALL selected tags
  if (selectedTagIds.length > 0) {
    const sessionWithTagPromises = filtered.map(async session => {
    const sessionTagIds = await tagStorage.getSessionTags(session.id);
    return { session, sessionTagIds };
  });

  const sessionsWithTags = await Promise.all(sessionWithTagPromises);
  filtered = sessionsWithTags
    .filter(item => selectedTagIds.every(tagId => item.sessionTagIds.includes(tagId)))
    .map(item => item.session);
  }

  // Keyword search
  if (searchKeyword) {
    const keyword = searchKeyword.toLowerCase();
    filtered = filtered.filter(session => {
      const titleMatch = session.title.toLowerCase().includes(keyword);
      const contentMatch = session.messages.some(m =>
        m.content.toLowerCase().includes(keyword)
      );
      return titleMatch || contentMatch;
    });
  }

  // Render results
  if (filtered.length === 0 && (searchKeyword || selectedPlatform || selectedTagIds.length > 0)) {
    sessionListEl.innerHTML = `
      <div class="search-empty">
        <div class="search-empty-icon">🔍</div>
        <p>没有找到匹配的会话</p>
        <p style="font-size: 12px; margin-top: 8px;">试试其他关键词或筛选条件</p>
      </div>
    `;
    return;
  }

  // Group by platform (preserving collapse state)
  const grouped = filtered.reduce((acc, session) => {
    const platform = session.platform || 'unknown';
    if (!acc[platform]) {
      acc[platform] = [];
    }
    acc[platform].push(session);
    return acc;
  }, {} as Record<string, Session[]>);

  // Render
  const sortedPlatforms = Object.keys(grouped).sort((a, b) => {
    const indexA = PLATFORM_ORDER.indexOf(a as Platform);
    const indexB = PLATFORM_ORDER.indexOf(b as Platform);
    // 未知平台排在最后
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  const platformHtmls = await Promise.all(
    sortedPlatforms.map(async (platform) => {
      const platformSessions = grouped[platform];
      const sessionHtmls = await Promise.all(
        platformSessions.map(session => renderSessionItemWithTags(session))
      );
      return renderPlatformGroupWithHtml(platform as Platform, sessionHtmls);
    })
  );

  sessionListEl.innerHTML = platformHtmls.join('');

  // Bind events
  bindSessionEvents();
}

async function renderSessionItemWithTags(session: Session): Promise<string> {
  const sessionTags = await tagStorage.getSessionTags(session.id);
  const tagObjects = allTags.filter(t => sessionTags.includes(t.id));
  return renderSessionItemWithHighlight(session, tagObjects);
}

function renderSessionItemWithHighlight(session: Session, tags: Tag[]): string {
  const date = new Date(session.updatedAt).toLocaleDateString('zh-CN');
  const tagsHtml = tags.map(tag =>
    `<span class="tag" style="background: ${tag.color}">${escapeHtml(tag.name)}</span>`
  ).join('');

  // Highlight title if searching
  const titleHtml = highlightText(session.title, searchKeyword);

  // Checkbox for delete mode
  const checkboxHtml = isDeleteMode
    ? `<input type="checkbox" class="session-checkbox" data-id="${session.id}" ${selectedSessionIds.has(session.id) ? 'checked' : ''}>`
    : '';

  // Selected class
  const selectedClass = isDeleteMode && selectedSessionIds.has(session.id) ? 'selected-for-delete' : '';
  const deleteModeClass = isDeleteMode ? 'delete-mode' : '';

  // Hide action buttons in delete mode
  const actionsHtml = isDeleteMode ? '' : `
    <div class="session-actions">
      <button class="btn-icon copy" title="复制上下文" data-action="copy">📋</button>
      <button class="btn-icon tag-btn" title="管理标签" data-action="tags">🏷️</button>
      <button class="btn-icon edit" title="编辑标题" data-action="edit">✏️</button>
      <button class="btn-icon delete" title="删除" data-action="delete">🗑️</button>
    </div>
  `;

  // Tooltip for session info (only in non-delete mode)
  const infoTooltip = isDeleteMode ? '' : 'title="点击查看完整对话"';

  return `
    <div class="session-item ${deleteModeClass} ${selectedClass}" data-id="${session.id}">
      ${checkboxHtml}
      <div class="session-info" ${infoTooltip}>
        <div class="session-title">${titleHtml}</div>
        <div class="session-tags">${tagsHtml}</div>
        <div class="session-meta">${date} · ${session.messageCount}条消息</div>
      </div>
      ${actionsHtml}
    </div>
  `;
}

function renderPlatformGroupWithHtml(platform: Platform, sessionHtmls: string[]): string {
  const icon = PLATFORM_ICONS[platform];
  const name = formatPlatformName(platform);
  const isCurrent = currentPlatform === platform;
  const isCollapsed = collapsedPlatforms.has(platform);

  // 检查该平台下是否所有 session 都被选中
  const platformSessions = allSessions.filter(s => s.platform === platform);
  const allPlatformSelected = platformSessions.length > 0 &&
    platformSessions.every(s => selectedSessionIds.has(s.id));
  const somePlatformSelected = platformSessions.some(s => selectedSessionIds.has(s.id)) &&
    !allPlatformSelected;

  const checkboxChecked = allPlatformSelected ? 'checked' : '';
  const checkboxIndeterminate = somePlatformSelected ? 'data-indeterminate="true"' : '';

  return `
    <div class="platform-group">
      <div class="platform-header ${isCollapsed ? 'collapsed' : ''} ${isDeleteMode ? 'delete-mode' : ''}" data-platform="${platform}">
        ${isDeleteMode ? `<input type="checkbox" class="platform-checkbox" data-platform="${platform}" ${checkboxChecked} ${checkboxIndeterminate}>` : ''}
        ${icon} ${name}
        ${isCurrent && !isDeleteMode ? '<span style="margin-left: 8px; font-size: 10px; background: #1890ff; color: white; padding: 2px 6px; border-radius: 4px;">当前平台</span>' : ''}
        <span class="platform-count">${sessionHtmls.length}个会话</span>
      </div>
      <div class="platform-sessions" style="display: ${isCollapsed ? 'none' : 'block'}">
        ${sessionHtmls.join('')}
      </div>
    </div>
  `;
}

function bindSessionEvents() {
  // Copy buttons
  document.querySelectorAll('[data-action="copy"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
    const item = (e.target as HTMLElement).closest('.session-item');
    const id = item?.getAttribute('data-id');
    if (id) {
      await handleCopy(id);
    }
  });
  });

  // Edit buttons
  document.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
    const item = (e.target as HTMLElement).closest('.session-item');
    const id = item?.getAttribute('data-id');
    if (id) {
      await handleEdit(id);
    }
  });
  });

  // Tag buttons
  document.querySelectorAll('[data-action="tags"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
    const item = (e.target as HTMLElement).closest('.session-item');
    const id = item?.getAttribute('data-id');
    if (id) {
      await handleManageTags(id);
    }
  });
  });

  // Delete buttons
  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
    const item = (e.target as HTMLElement).closest('.session-item');
    const id = item?.getAttribute('data-id');
    if (id && confirm('确定要删除这个会话吗？')) {
      await handleDelete(id);
    }
  });
  });

  // Platform header toggle (and checkbox in delete mode)
  document.querySelectorAll('.platform-header').forEach(header => {
    header.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // 如果点击的是 platform checkbox，处理全选逻辑
      if (target.classList.contains('platform-checkbox')) {
        e.stopPropagation();
        const platform = header.getAttribute('data-platform') as Platform;
        handleSelectPlatform(platform);
        return;
      }

      // 在删除模式下，点击整个 header 也可以选中平台
      if (isDeleteMode) {
        const platform = header.getAttribute('data-platform') as Platform;
        handleSelectPlatform(platform);
        return;
      }

      // 正常模式：折叠/展开
      const platform = header.getAttribute('data-platform') as Platform;
      header.classList.toggle('collapsed');
      const isNowCollapsed = header.classList.contains('collapsed');

      // Track collapsed state
      if (isNowCollapsed) {
        collapsedPlatforms.add(platform);
      } else {
        collapsedPlatforms.delete(platform);
      }

      // Persist collapsed state to storage
      saveCollapsedState();

      const sessions = header.nextElementSibling as HTMLElement;
      if (sessions) {
        sessions.style.display = sessions.style.display === 'none' ? 'block' : 'none';
      }
    });
  });

  // Checkbox for delete mode
  document.querySelectorAll('.session-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const id = target.getAttribute('data-id');
      if (id) {
        if (target.checked) {
          selectedSessionIds.add(id);
        } else {
          selectedSessionIds.delete(id);
        }
        updateDeleteSelectedCount();
        // Update visual state
        const item = target.closest('.session-item');
        item?.classList.toggle('selected-for-delete', target.checked);
      }
    });
  });

  // Click on session-info to view conversation (not in delete mode)
  document.querySelectorAll('.session-info').forEach(info => {
    info.addEventListener('click', (e) => {
      if (isDeleteMode) return;
      const item = (e.target as HTMLElement).closest('.session-item');
      const id = item?.getAttribute('data-id');
      if (id) {
        handleViewSession(id);
      }
    });
  });
}

// ========== Delete Mode ==========

function toggleDeleteMode() {
  isDeleteMode = !isDeleteMode;
  if (isDeleteMode) {
    selectedSessionIds.clear();
    deleteSelectAllCheckbox.checked = false;
    deleteModeBar.style.display = 'flex';
    manageBtn.textContent = '✖️ 取消';
    manageBtn.classList.add('btn-danger');
  } else {
    exitDeleteMode();
  }
  renderSessions();
}

function exitDeleteMode() {
  isDeleteMode = false;
  selectedSessionIds.clear();
  deleteSelectAllCheckbox.checked = false;
  deleteModeBar.style.display = 'none';
  manageBtn.textContent = '🗑️ 管理';
  manageBtn.classList.remove('btn-danger');
  renderSessions();
}

function updateDeleteSelectedCount() {
  deleteSelectedCount.textContent = String(selectedSessionIds.size);
  // Update select all checkbox state
  deleteSelectAllCheckbox.checked = selectedSessionIds.size === allSessions.length && allSessions.length > 0;
  deleteSelectAllCheckbox.indeterminate = selectedSessionIds.size > 0 && selectedSessionIds.size < allSessions.length;
}

function handleSelectAll() {
  if (deleteSelectAllCheckbox.checked) {
    // Select all sessions
    allSessions.forEach(s => selectedSessionIds.add(s.id));
  } else {
    // Deselect all
    selectedSessionIds.clear();
  }
  renderSessions();
  updateDeleteSelectedCount();
}

function handleSelectPlatform(platform: Platform) {
  // Toggle all sessions of this platform
  const platformSessions = allSessions.filter(s => s.platform === platform);
  const allSelected = platformSessions.every(s => selectedSessionIds.has(s.id));

  if (allSelected) {
    // Deselect all of this platform
    platformSessions.forEach(s => selectedSessionIds.delete(s.id));
  } else {
    // Select all of this platform
    platformSessions.forEach(s => selectedSessionIds.add(s.id));
  }
  renderSessions();
  updateDeleteSelectedCount();
}

async function handleDeleteSelected() {
  if (selectedSessionIds.size === 0) {
    showToast('请先选择要删除的会话');
    return;
  }

  const count = selectedSessionIds.size;
  if (!confirm(`确定要删除选中的 ${count} 个会话吗？此操作不可恢复。`)) {
    return;
  }

  // 禁用按钮并显示进度
  deleteConfirmBtn.disabled = true;
  deleteCancelBtn.disabled = true;
  deleteConfirmBtn.textContent = '删除中...';

  const total = count;
  let deleted = 0;
  const ids = Array.from(selectedSessionIds);

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      await sessionStorage.deleteSession(id);
      deleted++;
      // 更新进度显示
      deleteConfirmBtn.textContent = `删除中 ${deleted}/${total}`;
      deleteSelectedCount.textContent = `${deleted}/${total}`;
    } catch (err) {
      console.error('Failed to delete session:', id, err);
    }
  }

  // 恢复按钮状态
  deleteConfirmBtn.disabled = false;
  deleteCancelBtn.disabled = false;
  deleteConfirmBtn.textContent = '确认删除';

  exitDeleteMode();
  await loadSessions();
  showToast(`已删除 ${deleted} 个会话`);
}

async function handleCopy(sessionId: string) {
  const session = await sessionStorage.getSession(sessionId);
  if (!session) {
    showToast('会话不存在');
    return;
  }

  const formatted = formatSessionForInjection(session, 'full');

  try {
    await navigator.clipboard.writeText(formatted);
    showToast('已复制到剪贴板！请粘贴到目标AI助手的输入框');
  } catch (err) {
    // Fallback for extension context
    const textArea = document.createElement('textarea');
    textArea.value = formatted;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showToast('已复制到剪贴板！请粘贴到目标AI助手的输入框');
  }
}

async function handleEdit(sessionId: string) {
  const session = await sessionStorage.getSession(sessionId);
  if (!session) return;

  const newTitle = prompt('编辑会话标题:', session.title);
  if (newTitle && newTitle !== session.title) {
    await sessionStorage.updateSessionTitle(sessionId, newTitle);
    await loadSessions();
    showToast('标题已更新');
  }
}

async function handleManageTags(sessionId: string) {
  const session = await sessionStorage.getSession(sessionId);
  if (!session) return;

  // Set current session info
  currentTagSessionId = sessionId;

  // Update dialog title
  tagDialogTitle.textContent = `管理 "${session.title}" 的标签`;

  // Clear input
  tagNewInput.value = '';

  // Render tag list
  await renderTagList();

  // Show dialog
  tagDialog.style.display = 'flex';
}

async function renderTagList() {
  if (!currentTagSessionId) return;

  // Get current tags for this session
  const sessionTagIds = await tagStorage.getSessionTags(currentTagSessionId);
  const allTagsList = await tagStorage.getAllTags();

  if (allTagsList.length === 0) {
    tagList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #999;">暂无标签，请输入新标签名称创建</div>';
    return;
  }

  tagList.innerHTML = allTagsList.map(tag => {
    const isChecked = sessionTagIds.includes(tag.id);
    return `
      <div class="tag-item ${isChecked ? 'checked' : ''}" data-tag-id="${tag.id}">
        <input type="checkbox" ${isChecked ? 'checked' : ''}>
        <span class="tag-item-name">${escapeHtml(tag.name)}</span>
        <span class="tag-item-color" style="background: ${tag.color}"></span>
      </div>
    `;
  }).join('');

  // Bind click events
  tagList.querySelectorAll('.tag-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      // Don't toggle if clicking on the checkbox itself (it handles its own state)
      if (target.tagName === 'INPUT') return;

      const tagId = item.getAttribute('data-tag-id');
      if (!tagId || !currentTagSessionId) return;

      const checkbox = item.querySelector('input') as HTMLInputElement;
      const newChecked = !checkbox.checked;
      checkbox.checked = newChecked;
      item.classList.toggle('checked', newChecked);

      // Update storage
      if (newChecked) {
        await tagStorage.addTagToSession(currentTagSessionId, tagId);
      } else {
        await tagStorage.removeTagFromSession(currentTagSessionId, tagId);
      }

      // Refresh session list
      await loadSessions();
    });

    // Also handle checkbox change directly
    const checkbox = item.querySelector('input') as HTMLInputElement;
    checkbox.addEventListener('change', async () => {
      const tagId = item.getAttribute('data-tag-id');
      if (!tagId || !currentTagSessionId) return;

      item.classList.toggle('checked', checkbox.checked);

      if (checkbox.checked) {
        await tagStorage.addTagToSession(currentTagSessionId, tagId);
      } else {
        await tagStorage.removeTagFromSession(currentTagSessionId, tagId);
      }

      // Refresh session list
      await loadSessions();
    });
  });
}

async function handleAddNewTag() {
  const tagName = tagNewInput.value.trim();
  if (!tagName || !currentTagSessionId) return;

  // Check if tag already exists
  const allTags = await tagStorage.getAllTags();
  const existingTag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());

  if (existingTag) {
    // Add existing tag to session
    await tagStorage.addTagToSession(currentTagSessionId, existingTag.id);
    showToast(`已添加标签: ${existingTag.name}`);
  } else {
    // Create new tag with random color
    const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const newTag = await tagStorage.createTag(tagName, color);
    if (newTag) {
      await tagStorage.addTagToSession(currentTagSessionId, newTag.id);
      showToast(`已创建并添加标签: ${newTag.name}`);
    } else {
      showToast('标签创建失败');
      return;
    }
  }

  // Clear input
  tagNewInput.value = '';

  // Refresh tag list and session list
  await renderTagList();
  await loadSessions();
}

function hideTagDialog() {
  tagDialog.style.display = 'none';
  currentTagSessionId = null;
}

async function handleDelete(sessionId: string) {
  await sessionStorage.deleteSession(sessionId);
  await loadSessions();
  showToast('会话已删除');
}

async function handleExport() {
  // Collect all data
  const sessions = await sessionStorage.getAllSessions();
  const tags = await tagStorage.getAllTags();
  const sessionTags = await tagStorage.getAllSessionTags();

  const exportData: ExportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    sessions,
    tags,
    sessionTags,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  a.download = `omnicontext-backup-${year}-${month}${day}-${hours}${minutes}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('备份文件已下载');
}

function handleImportFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const content = event.target?.result as string;
      const data = JSON.parse(content) as ExportData;

      // Validate structure
      if (!data.version || !Array.isArray(data.sessions) || !Array.isArray(data.tags)) {
        showToast('导入失败：文件格式无效');
        return;
      }

      // Store pending data and show dialog
      pendingImportData = data;
      importFilename.textContent = file.name;
      importSessionCount.textContent = String(data.sessions.length);
      importTagCount.textContent = String(data.tags.length);
      importDialog.style.display = 'flex';

    } catch (err) {
      showToast('导入失败：文件解析错误');
    }
  };

  reader.readAsText(file);
  // Reset input so same file can be selected again
  importFileInput.value = '';
}

function hideImportDialog() {
  importDialog.style.display = 'none';
  pendingImportData = null;
}

async function handleImportConfirm() {
  if (!pendingImportData) return;

  // Get selected mode
  const modeRadio = document.querySelector('input[name="import-mode"]:checked') as HTMLInputElement;
  const mode = modeRadio?.value as 'merge-keep' | 'merge-overwrite' | 'replace';

  try {
    const data = pendingImportData;
    hideImportDialog();

    // Clear data if replace mode
    if (mode === 'replace') {
      await sessionStorage.clearAllSessions();
      const existingTags = await tagStorage.getAllTags();
      for (const tag of existingTags) {
        await tagStorage.deleteTag(tag.id);
      }
    }

    // Import tags
    for (const tag of data.tags) {
      if (mode === 'merge-keep') {
        const existing = await tagStorage.getTag(tag.id);
        if (!existing) {
          await tagStorage.createTagWithId(tag);
        }
      } else {
        await tagStorage.createTagWithId(tag);
      }
    }

    // Import sessions
    await sessionStorage.importSessions(data.sessions, mode);

    // Import session-tag associations
    if (mode === 'replace') {
      await tagStorage.setAllSessionTags(data.sessionTags);
    } else {
      // Merge session tags
      const existingSessionTags = await tagStorage.getAllSessionTags();
      for (const [sessionId, tagIds] of Object.entries(data.sessionTags)) {
        if (mode === 'merge-keep' && existingSessionTags[sessionId]) {
          continue; // Keep existing
        }
        for (const tagId of tagIds) {
          await tagStorage.addTagToSession(sessionId, tagId);
        }
      }
    }

    await loadSessions();
    showToast(`导入成功：${data.sessions.length}个会话，${data.tags.length}个标签`);

  } catch (err) {
    console.error('Import failed:', err);
    showToast('导入失败：请重试');
  }
}

// ========== Batch Capture ==========

async function handleBatchCaptureStart() {
  if (!currentPlatform) {
    showToast('请在支持的AI平台页面使用此功能');
    return;
  }

  // Check if already running locally
  if (isBatchCapturing) {
    showToast(`正在批量捕获 ${formatPlatformName(currentPlatform)} 的会话`);
    return;
  }

  // 检查全局批量捕获锁（防止在不同平台同时捕获）
  try {
    const lockCheck = await chrome.runtime.sendMessage({ type: 'BATCH_CAPTURE_CHECK_LOCK' });
    if (lockCheck.isLocked) {
      showToast(`请先完成 ${formatPlatformName(lockCheck.platform)} 的批量捕获`);
      return;
    }
  } catch (err) {
    console.error('Failed to check batch capture lock:', err);
  }

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showToast('无法获取当前标签页');
    return;
  }

  // 尝试获取全局锁
  try {
    const lockResponse = await chrome.runtime.sendMessage({
      type: 'BATCH_CAPTURE_ACQUIRE_LOCK',
      platform: currentPlatform,
      tabId: tab.id,
    });
    if (!lockResponse.success) {
      showToast(lockResponse.reason || '另一个批量捕获正在进行中');
      return;
    }
  } catch (err) {
    console.error('Failed to acquire batch capture lock:', err);
  }

  // 元宝和 DeepSeek 平台特殊提示：需要先打开会话列表
  if (currentPlatform === 'yuanbao' || currentPlatform === 'deepseek') {
    // 先检查会话列表是否可见
    try {
      const checkResponse = await chrome.tabs.sendMessage(tab.id, { type: 'BATCH_CAPTURE_CHECK_SIDEBAR' });
      if (!checkResponse.sidebarVisible) {
        // 释放锁
        await chrome.runtime.sendMessage({ type: 'BATCH_CAPTURE_RELEASE_LOCK' });
        // 显示友好提示
        if (currentPlatform === 'yuanbao') {
          showToast('💡 请在元宝页面中点击左侧菜单栏打开元宝的会话列表，OmniContext才能捕获到会话哦~');
        } else {
          showToast('💡 请在 DeepSeek 页面中点击左上角菜单按钮打开会话历史列表，OmniContext才能捕获到会话哦~');
        }
        return;
      }
    } catch (err) {
      console.error('Failed to check sidebar:', err);
    }
  }

  // Send message to content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'BATCH_CAPTURE_START' });

    if (response.success) {
      isBatchCapturing = true;
      // Show scanning UI initially
      batchScanning.style.display = 'block';
      batchProgress.style.display = 'none';
      batchScanningCount.textContent = '0';
    } else {
      // 获取失败，释放锁
      await chrome.runtime.sendMessage({ type: 'BATCH_CAPTURE_RELEASE_LOCK' });
      // 针对元宝/DeepSeek"请打开会话列表侧边栏"显示特殊提示
      if (currentPlatform === 'yuanbao' && response.error?.includes('请打开会话列表侧边栏')) {
        showToast('💡 请在元宝页面中点击左侧菜单栏打开元宝的会话列表，OmniContext才能捕获到会话哦~');
      } else if (currentPlatform === 'deepseek' && response.error?.includes('请打开会话列表侧边栏')) {
        showToast('💡 请在 DeepSeek 页面中点击左上角菜单按钮打开会话历史列表，OmniContext才能捕获到会话哦~');
      } else {
        showToast(response.error || '启动失败');
      }
    }
  } catch (err) {
    // 出错，释放锁
    await chrome.runtime.sendMessage({ type: 'BATCH_CAPTURE_RELEASE_LOCK' });
    showToast('请刷新页面后重试');
  }
}

async function handleBatchCaptureCancel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'BATCH_CAPTURE_CANCEL' });
    hideBatchCaptureProgress();
    showToast('批量捕获已取消');
  } catch (err) {
    hideBatchCaptureProgress();
  }

  // 释放全局锁
  try {
    await chrome.runtime.sendMessage({ type: 'BATCH_CAPTURE_RELEASE_LOCK' });
  } catch (err) {
    console.error('Failed to release batch capture lock:', err);
  }
}

function updateBatchCaptureProgress(progress: {
  total: number;
  current: number;
  currentTitle: string;
  captured: number;
  status: string;
  error?: string;
  isScanning?: boolean;
  discovered?: number;
  eta?: number;
  sessionJustCaptured?: boolean;
  discoveredSessions?: Array<{ id: string; title: string; platform: string }>;
  sessionMessagesTotal?: number;
}) {
  // Handle scanning state
  if (progress.isScanning || progress.status === 'scanning') {
    batchScanning.style.display = 'block';
    batchProgress.style.display = 'none';
    // 设置平台名称
    if (batchScanningPlatform && currentPlatform) {
      batchScanningPlatform.textContent = formatPlatformName(currentPlatform);
    }
    if (progress.discovered !== undefined) {
      batchScanningCount.textContent = String(progress.discovered);
    }
    return;
  }

  // Handle waiting for selection state
  if (progress.status === 'waiting_selection' && progress.discoveredSessions) {
    showSessionSelectDialog(progress.discoveredSessions);
    return;
  }

  // Handle capture state
  batchScanning.style.display = 'none';
  batchProgress.style.display = 'block';
  batchProgressCount.textContent = `${progress.current}/${progress.total}`;
  batchProgressFill.style.width = progress.total > 0
    ? `${(progress.current / progress.total) * 100}%`
    : '0%';

  // 更新标题：显示会话级进度和消息级进度
  const title = progress.currentTitle || '处理中';
  const sessionMsgTotal = progress.sessionMessagesTotal;
  if (sessionMsgTotal && sessionMsgTotal > 0) {
    batchProgressTitle.textContent = `正在处理 ${title} (${sessionMsgTotal}条消息)`;
  } else {
    batchProgressTitle.textContent = `正在处理 ${title}`;
  }

  // Update ETA
  const etaEl = document.getElementById('batch-progress-eta');
  if (etaEl) {
    if (progress.eta !== undefined && progress.eta > 0) {
      etaEl.textContent = `· 预计 ${formatETA(progress.eta)}`;
    } else {
      etaEl.textContent = '';
    }
  }

  if (progress.status === 'completed') {
    isBatchCapturing = false;
    hideBatchCaptureProgress();
    loadSessions();
    showToast(`批量捕获完成：${progress.current}个会话，${progress.captured}条消息`);
    // 释放全局锁
    chrome.runtime.sendMessage({ type: 'BATCH_CAPTURE_RELEASE_LOCK' }).catch(() => {});
  } else if (progress.status === 'cancelled') {
    isBatchCapturing = false;
    hideBatchCaptureProgress();
    showToast(`批量捕获已取消：已捕获${progress.captured}条消息`);
    // 释放全局锁
    chrome.runtime.sendMessage({ type: 'BATCH_CAPTURE_RELEASE_LOCK' }).catch(() => {});
  } else if (progress.status === 'error') {
    isBatchCapturing = false;
    hideBatchCaptureProgress();
    showToast(`批量捕获失败：${progress.error || '未知错误'}`);
    // 释放全局锁
    chrome.runtime.sendMessage({ type: 'BATCH_CAPTURE_RELEASE_LOCK' }).catch(() => {});
  }
}

function hideBatchCaptureProgress() {
  batchScanning.style.display = 'none';
  batchProgress.style.display = 'none';
}

// ========== Session Selection Dialog ==========

function showSessionSelectDialog(sessions: Array<{ id: string; title: string; platform: string }>) {
  discoveredSessions = sessions;
  captureSelectedIds = new Set(sessions.map(s => s.id)); // 默认全选

  // 渲染会话列表
  renderSessionSelectList();

  // 更新计数
  updateSessionSelectCount();

  // 显示对话框
  sessionSelectDialog.style.display = 'flex';
}

function hideSessionSelectDialog() {
  sessionSelectDialog.style.display = 'none';
  discoveredSessions = [];
  captureSelectedIds = new Set();
}

function renderSessionSelectList() {
  sessionSelectList.innerHTML = discoveredSessions.map(session => `
    <div class="session-select-item ${captureSelectedIds.has(session.id) ? 'selected' : ''}" data-id="${session.id}">
      <input type="checkbox" ${captureSelectedIds.has(session.id) ? 'checked' : ''}>
      <span class="session-title">${escapeHtml(session.title)}</span>
    </div>
  `).join('');

  // 绑定点击事件
  sessionSelectList.querySelectorAll('.session-select-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const id = item.getAttribute('data-id');
      if (!id) return;

      // 如果点击的不是checkbox，切换选中状态
      if (target.tagName !== 'INPUT') {
        const checkbox = item.querySelector('input') as HTMLInputElement;
        checkbox.checked = !checkbox.checked;
      }

      const checkbox = item.querySelector('input') as HTMLInputElement;
      if (checkbox.checked) {
        captureSelectedIds.add(id);
        item.classList.add('selected');
      } else {
        captureSelectedIds.delete(id);
        item.classList.remove('selected');
      }

      updateSessionSelectCount();
    });
  });
}

function updateSessionSelectCount() {
  sessionSelectCount.textContent = `已选择 ${captureSelectedIds.size} 个`;
  sessionSelectAll.checked = captureSelectedIds.size === discoveredSessions.length;
  sessionSelectAll.indeterminate = captureSelectedIds.size > 0 && captureSelectedIds.size < discoveredSessions.length;
}

function handleSessionSelectAll() {
  // 注意：当用户点击checkbox时，浏览器会先切换checked状态，然后才触发change事件
  // 所以这里 sessionSelectAll.checked 已经是点击后的新状态
  if (sessionSelectAll.checked) {
    discoveredSessions.forEach(s => captureSelectedIds.add(s.id));
  } else {
    captureSelectedIds.clear();
  }
  // 只更新列表显示，不更新checkbox状态（避免覆盖用户刚刚的操作）
  renderSessionSelectList();
  // 只更新计数文字和indeterminate状态，不改变checkbox的checked属性
  sessionSelectCount.textContent = `已选择 ${captureSelectedIds.size} 个`;
  // 当全部选中或全部取消时，取消indeterminate状态
  sessionSelectAll.indeterminate = false;
}

async function handleSessionSelectCancel() {
  // 取消批量捕获
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'BATCH_CAPTURE_CANCEL' });
  }
  hideSessionSelectDialog();
  hideBatchCaptureProgress();
  showToast('已取消批量捕获');
}

async function handleSessionSelectConfirm() {
  if (captureSelectedIds.size === 0) {
    showToast('请至少选择一个会话');
    return;
  }

  // 发送选中的会话ID到content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showToast('无法获取当前标签页');
    return;
  }

  await chrome.tabs.sendMessage(tab.id, {
    type: 'BATCH_CAPTURE_SELECT_SESSIONS',
    sessionIds: Array.from(captureSelectedIds)
  });

  // 隐藏选择对话框，显示进度
  hideSessionSelectDialog();
  batchScanning.style.display = 'none';
  batchProgress.style.display = 'block';
  batchProgressCount.textContent = `0/${captureSelectedIds.size}`;
  batchProgressFill.style.width = '0%';
  batchProgressTitle.textContent = '准备开始捕获...';
}

// ========== Session View Dialog ==========

let currentViewSession: Session | null = null;

async function handleViewSession(sessionId: string) {
  const session = await sessionStorage.getSession(sessionId);
  if (!session) return;

  currentViewSession = session;

  // Set title - remove platform suffix if present to avoid duplication
  let displayTitle = session.title;
  const platformName = session.platform ? formatPlatformName(session.platform) : 'AI';
  // Remove " - 平台名" suffix if exists
  const suffixPattern = new RegExp(`\\s*[-–—]\\s*${platformName}\\s*$`, 'i');
  displayTitle = displayTitle.replace(suffixPattern, '');
  sessionViewTitle.textContent = displayTitle;

  // Set meta info
  const date = new Date(session.updatedAt).toLocaleDateString('zh-CN');
  sessionViewMeta.textContent = `${platformName} · ${date} · ${session.messageCount}条消息`;

  // Render messages
  renderSessionMessages(session);

  // Show dialog and disable background scroll
  sessionViewDialog.style.display = 'flex';
  document.body.classList.add('dialog-open');
}

function renderSessionMessages(session: Session) {
  if (session.messages.length === 0) {
    sessionViewMessages.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #999;">暂无消息</div>';
    return;
  }

  // 准备平台信息
  const platform = session.platform;
  const assistantIcon = getPlatformIcon(platform, {
    size: 18,
    className: 'assistant-icon',
    extraStyle: 'vertical-align: middle; margin-right: 4px;'
  });
  const platformName = platform ? formatPlatformName(platform) : 'AI';

  sessionViewMessages.innerHTML = session.messages.map(msg => {
    // 用户显示固定图标，助手显示平台图标和名称
    const roleLabel = msg.role === 'user'
      ? '👤 用户'
      : `${assistantIcon}${platformName}`;
    const roleClass = msg.role;

    // Highlight search keyword if present
    let content = escapeHtml(msg.content);
    if (searchKeyword) {
      const regex = new RegExp(`(${escapeRegExp(searchKeyword)})`, 'gi');
      content = content.replace(regex, '<span class="search-highlight">$1</span>');
    }

    return `
      <div class="session-message ${roleClass}">
        <div class="session-message-header">
          <span class="session-message-role">${roleLabel}</span>
        </div>
        <div class="session-message-content">${content}</div>
      </div>
    `;
  }).join('');
}

function hideSessionViewDialog() {
  sessionViewDialog.style.display = 'none';
  document.body.classList.remove('dialog-open');
  currentViewSession = null;
}

async function handleSessionViewCopy() {
  if (!currentViewSession) return;

  const formatted = formatSessionForInjection(currentViewSession, 'full');

  try {
    await navigator.clipboard.writeText(formatted);
    showToast('已复制全部对话内容');
  } catch (err) {
    // Fallback for extension context
    const textArea = document.createElement('textarea');
    textArea.value = formatted;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showToast('已复制全部对话内容');
  }
}

// ========== Utility ==========

function showToast(message: string) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatETA(seconds: number): string {
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

// ==================== Onboarding ====================

async function checkAndShowOnboarding(): Promise<boolean> {
  const result = await chrome.storage.local.get(['sessions', 'onboarding_completed']);
  const sessions = result.sessions as Session[] | undefined;

  // 如果用户已标记完成引导，不再显示
  if (result.onboarding_completed) {
    return false;
  }

  // 没有任何会话时显示引导
  return !sessions || sessions.length === 0;
}

function showOnboardingDialog() {
  onboardingDialog.style.display = 'flex';
}

async function closeOnboardingDialog(dontShowAgain: boolean) {
  onboardingDialog.style.display = 'none';
  // 如果用户勾选"不再提示"，标记引导完成
  if (dontShowAgain) {
    await chrome.storage.local.set({ onboarding_completed: true });
  }
}

// Start
init();
