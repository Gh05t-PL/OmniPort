import { useCallback, useRef } from 'react';
import {
  getRequestTabName,
  normalizeRequestSnapshot
} from '../domain/request.js';
import { createRequestToken } from '../utils/ids.js';

const DETACHED_OPERATION_KEY = 'detached';

export default function useTabOperations({
  activeRequestTabId,
  operationsByTabId,
  setOperationsByTabId,
  setRequestTabsState,
  setResponse,
  setActiveResTab,
  setNetworkConnected,
  setWsConnected
}) {
  const activeRequestTabIdRef = useRef(activeRequestTabId);
  const operationsByTabIdRef = useRef(operationsByTabId);
  activeRequestTabIdRef.current = activeRequestTabId;
  operationsByTabIdRef.current = operationsByTabId;

  const beginTabOperation = useCallback((kind) => {
    const tabId = activeRequestTabIdRef.current;
    const key = tabId || DETACHED_OPERATION_KEY;
    const operation = {
      id: createRequestToken('operation'),
      key,
      tabId,
      kind,
      status: 'running',
      startedAt: Date.now()
    };
    setOperationsByTabId(previous => {
      const next = {
        ...previous,
        [key]: operation
      };
      operationsByTabIdRef.current = next;
      return next;
    });
    return operation;
  }, [setOperationsByTabId]);

  const finishTabOperation = useCallback((operation) => {
    if (!operation) return;
    setOperationsByTabId(previous => {
      if (previous[operation.key]?.id !== operation.id) return previous;
      const next = { ...previous };
      delete next[operation.key];
      operationsByTabIdRef.current = next;
      return next;
    });
  }, [setOperationsByTabId]);

  const applyTabOperationPatch = useCallback((operation, patch) => {
    if (!operation || !patch) return;
    if (operationsByTabIdRef.current[operation.key]?.id !== operation.id) return;

    if (operation.tabId) {
      setRequestTabsState(previousTabs => previousTabs.map(tab => {
        if (tab.id !== operation.tabId) return tab;
        const nextRequest = normalizeRequestSnapshot({
          ...tab.request,
          ...patch
        });
        return {
          ...tab,
          name: getRequestTabName(nextRequest),
          request: nextRequest
        };
      }));
    }

    if (activeRequestTabIdRef.current !== operation.tabId) return;
    if (Object.prototype.hasOwnProperty.call(patch, 'response')) {
      setResponse(patch.response);
    }
    if (typeof patch.activeResTab === 'string') {
      setActiveResTab(patch.activeResTab);
    }
    if (typeof patch.networkConnected === 'boolean') {
      setNetworkConnected(patch.networkConnected);
    }
    if (typeof patch.wsConnected === 'boolean') {
      setWsConnected(patch.wsConnected);
    }
  }, [
    setActiveResTab,
    setNetworkConnected,
    setRequestTabsState,
    setResponse,
    setWsConnected
  ]);

  const isTabOperationActive = useCallback((operation) => (
    Boolean(operation)
    && activeRequestTabIdRef.current === operation.tabId
  ), []);

  const activeOperationKey = activeRequestTabId || DETACHED_OPERATION_KEY;

  return {
    activeOperation: operationsByTabId[activeOperationKey] || null,
    applyTabOperationPatch,
    beginTabOperation,
    finishTabOperation,
    isTabOperationActive
  };
}
