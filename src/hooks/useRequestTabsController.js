import {
  collectionItemToSnapshot
} from '../domain/collections.js';
import {
  createDefaultRequestSnapshot,
  createRequestTab,
  getRequestTabName,
  normalizeRequestSnapshot
} from '../domain/request.js';
import { isNetworkResponse } from '../domain/network.js';
import { useTranslation } from '../i18n/I18nProvider.jsx';
import { emitClientLog } from '../services/neutralino.js';
import { createRequestToken } from '../utils/ids.js';

const keepResponseTabIfAvailable = (preferredTab, nextResponse) => {
  if (isNetworkResponse(nextResponse)) {
    return ['text', 'hex', 'headers'].includes(preferredTab)
      ? preferredTab
      : 'text';
  }

  if (preferredTab === 'trace' && !nextResponse?.timings) return 'body';
  if (preferredTab === 'headers' && !Array.isArray(nextResponse?.headers)) return 'body';
  return ['body', 'headers', 'trace'].includes(preferredTab) ? preferredTab : 'body';
};

const isNetworkProtocol = (protocol) => protocol === 'tcp' || protocol === 'udp';

export default function useRequestTabsController({
  requestTabsState,
  setRequestTabsState,
  activeRequestTabId,
  setActiveRequestTabId,
  networkReading,
  operationsByTabId,
  activeResTab,
  setActiveHistoryItemId,
  setSidebarView,
  isSidebarOpen,
  setIsSidebarOpen,
  buildCurrentRequestSnapshot,
  applyRequestSnapshot,
  closeWebsocket,
  closeNetworkSession,
  requestConfirmation
}) {
  const { t } = useTranslation();

  const applyRequestWithPreferredResponseTab = (request) => {
    const normalizedRequest = normalizeRequestSnapshot(request);
    applyRequestSnapshot(isNetworkProtocol(normalizedRequest.protocol)
      ? {
          ...normalizedRequest,
          activeResTab: ['text', 'hex'].includes(activeResTab)
            ? activeResTab
            : keepResponseTabIfAvailable(normalizedRequest.activeResTab, normalizedRequest.response)
        }
      : normalizedRequest);
  };

  const saveCurrentSnapshotIntoTabs = () => {
    const snapshot = buildCurrentRequestSnapshot();
    setRequestTabsState(previousTabs => previousTabs.map(tab => (
      tab.id === activeRequestTabId
        ? { ...tab, name: getRequestTabName(snapshot), request: snapshot }
        : tab
    )));
    return snapshot;
  };

  const handleAddRequestTab = () => {
    if (networkReading) return;
    saveCurrentSnapshotIntoTabs();
    const nextTab = createRequestTab(createDefaultRequestSnapshot(), t('request.new'));
    setRequestTabsState(previousTabs => [...previousTabs, nextTab]);
    setActiveRequestTabId(nextTab.id);
    setActiveHistoryItemId('');
    applyRequestSnapshot(nextTab.request);
    setSidebarView('tabs');
    if (!isSidebarOpen) setIsSidebarOpen(true);
  };

  const handleSwitchRequestTab = (tab) => {
    if (tab.id === activeRequestTabId) return;
    if (networkReading) return;
    saveCurrentSnapshotIntoTabs();
    setActiveRequestTabId(tab.id);
    setActiveHistoryItemId('');
    applyRequestWithPreferredResponseTab(tab.request);
  };

  const prepareTabClose = (tabId) => {
    const currentSnapshot = buildCurrentRequestSnapshot();
    const tabsWithCurrentState = requestTabsState.map(tab => (
      tab.id === activeRequestTabId
        ? { ...tab, name: getRequestTabName(currentSnapshot), request: currentSnapshot }
        : tab
    ));
    const closingIndex = tabsWithCurrentState.findIndex(tab => tab.id === tabId);
    if (closingIndex < 0) return null;
    const closingTab = tabsWithCurrentState[closingIndex];
    const closingRequest = normalizeRequestSnapshot(tabsWithCurrentState[closingIndex]?.request);

    return {
      closingIndex,
      closingRequest,
      closingTab,
      tabsWithCurrentState
    };
  };

  const closePreparedTab = async (tabId, preparedClose) => {
    const {
      closingIndex,
      closingRequest,
      tabsWithCurrentState
    } = preparedClose;

    if (closingRequest.protocol === 'ws' && closingRequest.wsConnected) {
      try {
        await closeWebsocket({
          requestId: createRequestToken('ws-close'),
          connectionId: closingRequest.wsConnectionId,
          reason: 'tab closed'
        });
      } catch (error) {
        emitClientLog('warn', 'websocket tab close cleanup failed', {
          connectionId: closingRequest.wsConnectionId,
          error: error?.message || String(error)
        });
        throw new Error(
          error?.message
            ? t('errors.wsCloseFailedWithMessage', { message: error.message })
            : t('errors.wsCloseFailed')
        );
      }
    }
    if (closingRequest.protocol === 'tcp' && closingRequest.networkConnected) {
      void closeNetworkSession({
        requestId: createRequestToken('tcp-close'),
        connectionId: closingRequest.networkConnectionId
      }).catch((error) => {
        emitClientLog('warn', 'tcp tab close cleanup failed', {
          connectionId: closingRequest.networkConnectionId,
          error: error?.message || String(error)
        });
      });
    }

    if (tabId === activeRequestTabId) {
      const nextTabs = tabsWithCurrentState.filter(tab => tab.id !== tabId);
      const nextActiveTab = nextTabs[Math.max(0, closingIndex - 1)] || nextTabs[0];
      if (nextActiveTab) {
        setActiveRequestTabId(nextActiveTab.id);
        setActiveHistoryItemId('');
        applyRequestWithPreferredResponseTab(nextActiveTab.request);
      }
    }

    setRequestTabsState(previousTabs => previousTabs.filter(tab => tab.id !== tabId));
  };

  const handleCloseRequestTab = (tabId, event) => {
    event?.stopPropagation();
    if (requestTabsState.length <= 1) return;
    if (operationsByTabId[tabId]) return;
    if (networkReading && tabId === activeRequestTabId) return;

    const preparedClose = prepareTabClose(tabId);
    if (!preparedClose) return;
    setRequestTabsState(preparedClose.tabsWithCurrentState);

    if (
      preparedClose.closingRequest.protocol === 'ws'
      && preparedClose.closingRequest.wsConnected
    ) {
      const socketProtocol = preparedClose.closingRequest.wsUrl
        .trim()
        .toLocaleLowerCase('en')
        .startsWith('wss://')
        ? 'WSS'
        : 'WS';
      requestConfirmation({
        title: t('confirm.closeConnectedTab.title', { protocol: socketProtocol }),
        message: t('confirm.closeConnectedTab.message', {
          name: preparedClose.closingTab.name || getRequestTabName(preparedClose.closingRequest),
          protocol: socketProtocol
        }),
        confirmLabel: t('confirm.closeConnectedTab.action'),
        tone: 'warning',
        onConfirm: () => closePreparedTab(tabId, preparedClose)
      });
      return;
    }

    void closePreparedTab(tabId, preparedClose);
  };

  const loadCollectionItem = (item) => {
    if (networkReading) return;
    const snapshot = collectionItemToSnapshot(item);
    const collectionRequest = normalizeRequestSnapshot({
      ...snapshot,
      collectionItemId: item.id,
      activeTab: 'body',
      activeResTab: keepResponseTabIfAvailable(activeResTab, snapshot.response || null)
    });

    const currentSnapshot = buildCurrentRequestSnapshot();
    const tabsWithCurrentState = requestTabsState.map(tab => (
      tab.id === activeRequestTabId
        ? { ...tab, name: getRequestTabName(currentSnapshot), request: currentSnapshot }
        : tab
    ));
    const existingTab = tabsWithCurrentState.find(tab => (
      normalizeRequestSnapshot(tab.request).collectionItemId === item.id
    ));

    if (existingTab) {
      setRequestTabsState(tabsWithCurrentState);
      setActiveRequestTabId(existingTab.id);
      applyRequestWithPreferredResponseTab(existingTab.request);
    } else {
      const nextTab = createRequestTab(collectionRequest, item.name || getRequestTabName(collectionRequest));
      setRequestTabsState([...tabsWithCurrentState, nextTab]);
      setActiveRequestTabId(nextTab.id);
      applyRequestWithPreferredResponseTab(nextTab.request);
    }

    setActiveHistoryItemId('');
  };

  const loadHistoryItem = (item) => {
    if (networkReading) return;
    if (item.protocol === 'ws') {
      const currentSnapshot = buildCurrentRequestSnapshot();
      const tabsWithCurrentState = requestTabsState.map(tab => (
        tab.id === activeRequestTabId
          ? { ...tab, name: getRequestTabName(currentSnapshot), request: currentSnapshot }
          : tab
      ));
      const websocketTab = tabsWithCurrentState.find(tab => (
        tab.id === item.requestTabId
        || normalizeRequestSnapshot(tab.request).wsConnectionId === item.wsConnectionId
      ));

      if (websocketTab) {
        setRequestTabsState(tabsWithCurrentState);
        setActiveRequestTabId(websocketTab.id);
        applyRequestSnapshot(websocketTab.request);
        setActiveHistoryItemId(item.id);
      }
      return;
    }

    // HTTP/gRPC history is a transient preview, not a request tab. Persist the
    // currently active tab first, then detach the preview so subsequent state
    // synchronization cannot overwrite that tab (especially an active WS tab).
    const currentSnapshot = buildCurrentRequestSnapshot();
    setActiveRequestTabId('');
    setRequestTabsState(previousTabs => previousTabs.map(tab => (
      tab.id === activeRequestTabId
        ? { ...tab, name: getRequestTabName(currentSnapshot), request: currentSnapshot }
        : tab
    )));
    const snapshot = collectionItemToSnapshot(item);
    applyRequestSnapshot({
      ...snapshot,
      collectionItemId: '',
      activeTab: 'body',
      activeResTab: keepResponseTabIfAvailable(activeResTab, snapshot.response || null)
    });
    setActiveHistoryItemId(item.id);
  };

  return {
    handleAddRequestTab,
    handleCloseRequestTab,
    handleSwitchRequestTab,
    loadCollectionItem,
    loadHistoryItem
  };
}
