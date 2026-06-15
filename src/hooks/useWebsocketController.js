import { useCallback, useEffect, useRef } from 'react';
import {
  appendWebsocketFrameToResponse,
  websocketSystemFrame
} from '../domain/websocket.js';
import {
  getRequestTabName,
  normalizeRequestSnapshot
} from '../domain/request.js';
import { useTranslation } from '../i18n/I18nProvider.jsx';
import { isKeyValueRowEnabled, normalizeHeaderRows } from '../utils/headers.js';
import { createRequestToken } from '../utils/ids.js';

export default function useWebsocketController({
  wsUrl,
  wsHeaders,
  wsMessage,
  wsConnectionId,
  setWsConnectionId,
  wsConnected,
  setWsConnected,
  activeRequestTabId,
  beginTabOperation,
  finishTabOperation,
  applyTabOperationPatch,
  isTabOperationActive,
  setResponse,
  setActiveResTab,
  setActiveHistoryItemId,
  setRequestTabsState,
  setHistory,
  appendHistoryItem,
  connectWebsocket,
  sendWebsocketMessage,
  closeWebsocket
}) {
  const { t } = useTranslation();
  const activeConnectionIdRef = useRef(wsConnectionId);
  const activeConnectedRef = useRef(wsConnected);
  const activeRequestTabIdRef = useRef(activeRequestTabId);
  const historyItemIdsRef = useRef(new Map());

  activeConnectionIdRef.current = wsConnectionId;
  activeConnectedRef.current = wsConnected;
  activeRequestTabIdRef.current = activeRequestTabId;

  const appendWebsocketFrame = useCallback((frame, override = {}) => {
    const connectionId = override.connectionId || frame?.connectionId;
    if (!connectionId) return;

    const applyResponseUpdate = (previousResponse) => appendWebsocketFrameToResponse(
      previousResponse,
      { ...frame, connectionId },
      { ...override, connectionId }
    );

    const targetsActiveTab = override.tabId
      ? override.tabId === activeRequestTabIdRef.current
      : connectionId === activeConnectionIdRef.current;
    if (targetsActiveTab && (activeConnectedRef.current || override.reset)) {
      setResponse(previousResponse => applyResponseUpdate(previousResponse));
      if (typeof override.wsConnected === 'boolean') {
        activeConnectedRef.current = override.wsConnected;
        setWsConnected(override.wsConnected);
      }
      if (override.activeResTab) setActiveResTab(override.activeResTab);
    }

    setRequestTabsState(previousTabs => previousTabs.map(tab => {
      const tabRequest = normalizeRequestSnapshot(tab.request);
      const targetsTab = override.tabId
        ? tab.id === override.tabId
        : tabRequest.wsConnectionId === connectionId;
      if (!targetsTab || (!override.reset && !tabRequest.wsConnected)) return tab;

      const nextRequest = normalizeRequestSnapshot({
        ...tabRequest,
        wsConnectionId: connectionId,
        wsConnected: typeof override.wsConnected === 'boolean'
          ? override.wsConnected
          : tabRequest.wsConnected,
        response: applyResponseUpdate(tabRequest.response)
      });
      return {
        ...tab,
        name: getRequestTabName(nextRequest),
        request: nextRequest
      };
    }));

    const historyItemId = historyItemIdsRef.current.get(connectionId);
    if (historyItemId && override.wsConnected === false) {
      setHistory(previousHistory => previousHistory.map(item => (
        item.id === historyItemId
          ? {
              ...item,
              status: override.status || item.status,
              statusText: override.statusText || item.statusText,
              time: override.time ?? item.time
            }
          : item
      )));
      historyItemIdsRef.current.delete(connectionId);
    }
  }, [
    setActiveResTab,
    setHistory,
    setRequestTabsState,
    setResponse,
    setWsConnected
  ]);

  useEffect(() => {
    if (!window.Neutralino?.events?.on) return undefined;

    const handleWsMessage = (event) => {
      appendWebsocketFrame(event.detail, {
        status: 'OPEN',
        statusText: 'Message received',
        time: event.detail?.elapsedMs ?? 0,
        wsConnected: true
      });
    };
    const handleWsClosed = (event) => {
      const detail = event.detail || {};
      const message = detail.message || t('errors.wsClosed');
      appendWebsocketFrame({
        ...detail,
        ...websocketSystemFrame(message, detail.elapsedMs ?? null)
      }, {
        status: 'CLOSED',
        statusText: 'Closed',
        time: detail.elapsedMs ?? 0,
        wsConnected: false
      });
    };
    const handleWsError = (event) => {
      const detail = event.detail || {};
      const message = detail.message || t('errors.wsConnection');
      appendWebsocketFrame({
        ...detail,
        direction: 'error',
        messageType: 'text',
        message,
        encoding: 'utf-8',
        bytes: message.length,
        time: detail.time || new Date().toISOString()
      }, {
        status: 'ERR',
        statusText: 'WebSocket error',
        time: detail.elapsedMs ?? 0,
        wsConnected: false
      });
    };

    void window.Neutralino.events.on('wsMessage', handleWsMessage);
    void window.Neutralino.events.on('wsClosed', handleWsClosed);
    void window.Neutralino.events.on('wsError', handleWsError);

    return () => {
      void Promise.allSettled([
        window.Neutralino.events.off('wsMessage', handleWsMessage),
        window.Neutralino.events.off('wsClosed', handleWsClosed),
        window.Neutralino.events.off('wsError', handleWsError)
      ]);
    };
  }, [appendWebsocketFrame, t]);

  const handleConnectWebsocket = async () => {
    if (!wsUrl.trim()) return;
    const operation = beginTabOperation('ws-connect');
    setActiveHistoryItemId('');
    const connectionId = createRequestToken('ws');
    activeConnectionIdRef.current = connectionId;
    activeConnectedRef.current = false;
    setWsConnectionId(connectionId);
    applyTabOperationPatch(operation, {
      response: null,
      wsConnectionId: connectionId,
      wsConnected: false
    });

    try {
      const headers = {};
      wsHeaders.forEach(item => {
        if (isKeyValueRowEnabled(item) && item.key.trim() !== '') {
          headers[item.key.trim()] = item.value.trim();
        }
      });

      const payload = await connectWebsocket({
        requestId: createRequestToken('ws-connect'),
        connectionId,
        url: wsUrl.trim(),
        headers
      });

      const connectedUrl = payload.url || wsUrl.trim();
      appendWebsocketFrame({
        ...websocketSystemFrame(t('errors.wsConnected', { url: connectedUrl }), payload.elapsedMs ?? 0),
        connectionId,
        url: connectedUrl
      }, {
        reset: true,
        status: 'OPEN',
        statusText: payload.statusText || 'Connected',
        time: payload.elapsedMs ?? 0,
        headers: normalizeHeaderRows(payload.headers),
        url: connectedUrl,
        wsConnected: true,
        activeResTab: 'body',
        tabId: operation.tabId
      });

      const historyItem = appendHistoryItem({
        protocol: 'ws',
        url: connectedUrl,
        wsUrl: connectedUrl,
        wsConnectionId: connectionId,
        requestTabId: operation.tabId,
        method: 'WS',
        status: 'OPEN',
        statusText: payload.statusText || 'Connected',
        time: payload.elapsedMs ?? 0
      }, { activate: isTabOperationActive(operation) });
      historyItemIdsRef.current.set(connectionId, historyItem.id);
    } catch (error) {
      applyTabOperationPatch(operation, {
        wsConnected: false,
        response: {
          error: error.message,
          hint: t('errors.wsHint'),
          time: 0
        }
      });
      appendHistoryItem({
        protocol: 'ws',
        url: wsUrl,
        wsUrl,
        wsConnectionId: connectionId,
        requestTabId: operation.tabId,
        method: 'WS',
        status: 'ERR',
        statusText: t('errors.generic'),
        time: 0
      }, { activate: isTabOperationActive(operation) });
    } finally {
      finishTabOperation(operation);
    }
  };

  const handleSendWebsocketMessage = async () => {
    if (!wsConnected || !wsMessage.length) return;
    const operation = beginTabOperation('ws-send');
    setActiveHistoryItemId('');

    try {
      const payload = await sendWebsocketMessage({
        requestId: createRequestToken('ws-send'),
        connectionId: wsConnectionId,
        message: wsMessage
      });

      appendWebsocketFrame({
        connectionId: wsConnectionId,
        url: wsUrl,
        direction: 'out',
        messageType: 'text',
        message: payload.message ?? wsMessage,
        encoding: 'utf-8',
        bytes: payload.bytes ?? wsMessage.length,
        elapsedMs: payload.elapsedMs ?? null,
        time: payload.time || new Date().toISOString()
      }, {
        status: 'OPEN',
        statusText: payload.statusText || 'Message sent',
        time: payload.elapsedMs ?? 0,
        url: wsUrl,
        wsConnected: true,
        activeResTab: 'body',
        tabId: operation.tabId
      });
    } catch (error) {
      appendWebsocketFrame({
        connectionId: wsConnectionId,
        url: wsUrl,
        direction: 'error',
        messageType: 'text',
        message: error.message,
        encoding: 'utf-8',
        bytes: error.message.length,
        time: new Date().toISOString()
      }, {
        status: 'ERR',
        statusText: 'WebSocket error',
        wsConnected: false,
        activeResTab: 'body',
        tabId: operation.tabId
      });
    } finally {
      finishTabOperation(operation);
    }
  };

  const handleCloseWebsocket = async () => {
    if (!wsConnectionId) return;
    const operation = beginTabOperation('ws-close');
    setActiveHistoryItemId('');

    try {
      const payload = await closeWebsocket({
        requestId: createRequestToken('ws-close'),
        connectionId: wsConnectionId,
        reason: 'closed by OmniPort'
      });

      appendWebsocketFrame({
        ...websocketSystemFrame(t('errors.wsClosed'), payload.elapsedMs ?? 0),
        connectionId: wsConnectionId,
        url: wsUrl
      }, {
        status: 'CLOSED',
        statusText: payload.statusText || 'Closed',
        time: payload.elapsedMs ?? 0,
        url: wsUrl,
        wsConnected: false,
        activeResTab: 'body',
        tabId: operation.tabId
      });
    } catch (error) {
      appendWebsocketFrame({
        connectionId: wsConnectionId,
        url: wsUrl,
        direction: 'error',
        messageType: 'text',
        message: error.message,
        encoding: 'utf-8',
        bytes: error.message.length,
        time: new Date().toISOString()
      }, {
        status: 'ERR',
        statusText: 'WebSocket error',
        wsConnected: false,
        activeResTab: 'body',
        tabId: operation.tabId
      });
    } finally {
      finishTabOperation(operation);
    }
  };

  return {
    handleCloseWebsocket,
    handleConnectWebsocket,
    handleSendWebsocketMessage
  };
}
