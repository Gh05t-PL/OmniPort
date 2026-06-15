import { useCallback, useEffect, useRef } from 'react';
import {
  HISTORY_LIMIT,
  NATIVE_STORAGE_KEYS,
  STORAGE_KEYS
} from '../config/constants.js';
import {
  createPersistableCollections,
  parsePersistedCollections
} from '../domain/collections.js';
import { createPersistableHistory } from '../domain/history.js';
import {
  createPersistableRequestSession,
  normalizeRequestSession,
  parsePersistedRequestSession
} from '../domain/request.js';
import {
  readFromStorage,
  readFromNativeStorage,
  writeToDurableStorage,
  writeToStorage
} from '../services/storage.js';
import { delay } from '../utils/async.js';
import { createEntityId } from '../utils/ids.js';

export default function useOmniPortPersistence({
  history,
  setHistory,
  setActiveHistoryItemId,
  collections,
  setCollections,
  initialCollections,
  selectedCollectionId,
  setSelectedCollectionId,
  requestTabsState,
  setRequestTabsState,
  activeRequestTabId,
  setActiveRequestTabId,
  applyRequestSnapshot,
  layout,
  sidebarView
}) {
  const collectionsMutatedRef = useRef(false);
  const requestSessionHydratedRef = useRef(false);
  const requestSessionMutatedRef = useRef(false);
  const latestRequestSessionRef = useRef({
    tabs: requestTabsState,
    activeTabId: activeRequestTabId
  });
  const initialRequestSessionFingerprintRef = useRef(JSON.stringify(createPersistableRequestSession({
    tabs: requestTabsState,
    activeTabId: activeRequestTabId
  })));
  latestRequestSessionRef.current = {
    tabs: requestTabsState,
    activeTabId: activeRequestTabId
  };

  const persistCollections = useCallback((updater) => {
    setCollections(previousCollections => {
      const nextCollections = typeof updater === 'function'
        ? updater(previousCollections)
        : updater;
      collectionsMutatedRef.current = true;
      void writeToDurableStorage(
        STORAGE_KEYS.collections,
        NATIVE_STORAGE_KEYS.collections,
        createPersistableCollections(nextCollections)
      );
      return nextCollections;
    });
  }, [setCollections]);

  const appendHistoryItem = useCallback((item, { activate = true } = {}) => {
    const nextItem = {
      id: createEntityId('hist'),
      createdAt: new Date().toISOString(),
      ...item
    };
    if (activate) setActiveHistoryItemId(nextItem.id);
    setHistory(previousHistory => [nextItem, ...previousHistory].slice(0, HISTORY_LIMIT));
    return nextItem;
  }, [setActiveHistoryItemId, setHistory]);

  useEffect(() => {
    writeToStorage(STORAGE_KEYS.history, createPersistableHistory(history));
  }, [history]);

  useEffect(() => {
    writeToStorage(
      STORAGE_KEYS.collections,
      createPersistableCollections(collections)
    );
  }, [collections]);

  useEffect(() => {
    let cancelled = false;

    const hydrateCollections = async () => {
      await delay(0);
      const storedCollections = await readFromNativeStorage(NATIVE_STORAGE_KEYS.collections);
      if (cancelled) return;

      if (storedCollections.found) {
        const nextCollections = parsePersistedCollections(storedCollections.value);
        if (nextCollections) {
          writeToStorage(
            STORAGE_KEYS.collections,
            createPersistableCollections(nextCollections)
          );
          if (!collectionsMutatedRef.current) {
            setCollections(nextCollections);
          }
          return;
        }
      }

      if (storedCollections.ready) {
        void writeToDurableStorage(
          STORAGE_KEYS.collections,
          NATIVE_STORAGE_KEYS.collections,
          createPersistableCollections(initialCollections)
        );
      }
    };

    void hydrateCollections();
    return () => {
      cancelled = true;
    };
  }, [initialCollections, setCollections]);

  useEffect(() => {
    if (collections.length === 0) {
      if (selectedCollectionId) setSelectedCollectionId('');
      return;
    }
    if (!collections.some(collection => collection.id === selectedCollectionId)) {
      setSelectedCollectionId(collections[0].id);
    }
  }, [collections, selectedCollectionId, setSelectedCollectionId]);

  useEffect(() => {
    const sessionState = {
      tabs: requestTabsState,
      activeTabId: activeRequestTabId
    };
    const persistableSessionState = createPersistableRequestSession(sessionState);
    const fingerprint = JSON.stringify(persistableSessionState);
    if (
      !requestSessionHydratedRef.current
      && fingerprint !== initialRequestSessionFingerprintRef.current
    ) {
      requestSessionMutatedRef.current = true;
    }

    if (!requestSessionHydratedRef.current) return undefined;

    const persistedSession = {
      ...persistableSessionState,
      updatedAt: Date.now()
    };
    writeToStorage(STORAGE_KEYS.requestSession, persistedSession);

    const timeoutId = setTimeout(() => {
      void writeToDurableStorage(
        STORAGE_KEYS.requestSession,
        NATIVE_STORAGE_KEYS.requestSession,
        persistedSession
      );
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [activeRequestTabId, requestTabsState]);

  useEffect(() => {
    let cancelled = false;

    const hydrateRequestSession = async () => {
      await delay(0);
      const localValue = readFromStorage(STORAGE_KEYS.requestSession, null);
      const localSession = parsePersistedRequestSession(localValue)
        || normalizeRequestSession(latestRequestSessionRef.current);
      const storedNativeSession = await readFromNativeStorage(NATIVE_STORAGE_KEYS.requestSession);
      if (cancelled) return;

      const nativeSession = storedNativeSession.found
        ? parsePersistedRequestSession(storedNativeSession.value)
        : null;
      const currentSessionWasEdited = requestSessionMutatedRef.current;
      const shouldRestoreNative = !currentSessionWasEdited
        && nativeSession
        && nativeSession.updatedAt > localSession.updatedAt;
      const selectedSession = shouldRestoreNative
        ? nativeSession
        : currentSessionWasEdited
          ? normalizeRequestSession({
              ...latestRequestSessionRef.current,
              updatedAt: Date.now()
            })
          : localSession;

      initialRequestSessionFingerprintRef.current = JSON.stringify(createPersistableRequestSession({
        tabs: selectedSession.tabs,
        activeTabId: selectedSession.activeTabId
      }));
      requestSessionHydratedRef.current = true;

      if (shouldRestoreNative) {
        setRequestTabsState(selectedSession.tabs);
        setActiveRequestTabId(selectedSession.activeTabId);
        setActiveHistoryItemId('');
        applyRequestSnapshot(selectedSession.request);
      }

      const persistedSession = createPersistableRequestSession({
        tabs: selectedSession.tabs,
        activeTabId: selectedSession.activeTabId,
        updatedAt: selectedSession.updatedAt || Date.now()
      });
      void writeToDurableStorage(
        STORAGE_KEYS.requestSession,
        NATIVE_STORAGE_KEYS.requestSession,
        persistedSession
      );
    };

    void hydrateRequestSession();
    return () => {
      cancelled = true;
    };
  }, [
    applyRequestSnapshot,
    setActiveHistoryItemId,
    setActiveRequestTabId,
    setRequestTabsState
  ]);

  useEffect(() => {
    writeToStorage(STORAGE_KEYS.layout, layout);
  }, [layout]);

  useEffect(() => {
    writeToStorage(STORAGE_KEYS.sidebarView, sidebarView);
  }, [sidebarView]);

  return {
    appendHistoryItem,
    persistCollections
  };
}
