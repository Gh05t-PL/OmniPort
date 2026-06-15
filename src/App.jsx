import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import AppHeader from './components/app/AppHeader.jsx';
import AppStatusBar from './components/app/AppStatusBar.jsx';
import AboutModal from './components/modals/AboutModal.jsx';
import ConfirmationModal from './components/modals/ConfirmationModal.jsx';
import CurlImportModal from './components/modals/CurlImportModal.jsx';
import OpenApiImportModal from './components/modals/OpenApiImportModal.jsx';
import SaveRequestModal from './components/modals/SaveRequestModal.jsx';
import RequestPanel from './components/request/RequestPanel.jsx';
import RequestToolbar from './components/request/RequestToolbar.jsx';
import ResponsePanel from './components/response/ResponsePanel.jsx';
import AppSidebar from './components/sidebar/AppSidebar.jsx';
import {
  DEFAULT_COLLECTIONS,
  HTTP_METHODS,
  STORAGE_KEYS
} from './config/constants.js';
import { APP_HOTKEYS } from './config/hotkeys.js';
import {
  collectionItemToSnapshot,
  findCollectionItemLocation,
  normalizeCollections,
  parsePersistedCollections
} from './domain/collections.js';
import { parsePersistedHistory } from './domain/history.js';
import {
  areRequestSnapshotsEqual,
  createInitialRequestSession,
  getRequestTabName,
  normalizeRequestSnapshot
} from './domain/request.js';
import {
  formatGrpcPayloadTemplate,
  validateGrpcPayload
} from './domain/grpc.js';
import {
  base64ToText,
  formatHexDump,
  formatEditableHex,
  isEditableHexValid,
  isNetworkResponse,
  networkResponseText,
  parseEditableHex,
  textToBase64
} from './domain/network.js';
import { formatTraceRows } from './domain/trace.js';
import useCollectionsController from './hooks/useCollectionsController.js';
import useExtensionClient from './hooks/useExtensionClient.js';
import useGrpcDiscoveryController from './hooks/useGrpcDiscoveryController.js';
import useImportController from './hooks/useImportController.js';
import useAppHotkeys from './hooks/useAppHotkeys.js';
import useNeutralinoLifecycle from './hooks/useNeutralinoLifecycle.js';
import useOmniPortPersistence from './hooks/useOmniPortPersistence.js';
import useRequestExecutionController from './hooks/useRequestExecutionController.js';
import useRequestTabsController from './hooks/useRequestTabsController.js';
import useResponseAutoScroll from './hooks/useResponseAutoScroll.js';
import useTabOperations from './hooks/useTabOperations.js';
import useWebsocketController from './hooks/useWebsocketController.js';
import { useTranslation } from './i18n/I18nProvider.jsx';
import { readFromStorage } from './services/storage.js';
import { recoverNeutralinoWindow } from './services/neutralino.js';
import { createOmniPortStore } from './store/omniPortStore.js';
import { quoteShellArg } from './utils/formatters.js';
import { isKeyValueRowEnabled } from './utils/headers.js';

const createLocalizedDefaultCollections = (t) => DEFAULT_COLLECTIONS.map(collection => ({
  ...collection,
  name: collection.id === 'default-1'
    ? t('defaults.collectionName')
    : collection.name,
  items: collection.items.map(item => ({
    ...item,
    name: item.id === 'item-1' ? t('defaults.requestName') : item.name,
    request: item.request
      ? {
          ...item.request,
          requestName: item.id === 'item-1'
            ? t('defaults.requestName')
            : item.request.requestName
        }
      : item.request
  }))
}));

export default function App() {
  const { t } = useTranslation();
  const [appStore] = useState(() => {
    const initialSession = createInitialRequestSession();
    const initialCollections = parsePersistedCollections(
      readFromStorage(STORAGE_KEYS.collections, null)
    ) || normalizeCollections(createLocalizedDefaultCollections(t));
    const initialHistory = parsePersistedHistory(
      readFromStorage(STORAGE_KEYS.history, null)
    ) || [];
    const storedSidebarView = readFromStorage(STORAGE_KEYS.sidebarView, 'collections');
    const initialSidebarView = ['collections', 'tabs', 'history'].includes(storedSidebarView)
      ? storedSidebarView
      : 'collections';

    return createOmniPortStore({
      requestName: initialSession.request.requestName,
      protocol: initialSession.request.protocol,
      url: initialSession.request.url,
      method: initialSession.request.method,
      reqHeaders: initialSession.request.reqHeaders,
      queryParams: initialSession.request.queryParams,
      bodyType: initialSession.request.bodyType,
      reqBodyRaw: initialSession.request.reqBodyRaw,
      reqBodyForm: initialSession.request.reqBodyForm,
      reqBodyMultipart: initialSession.request.reqBodyMultipart,
      grpcTarget: initialSession.request.grpcTarget,
      grpcService: initialSession.request.grpcService,
      grpcMethod: initialSession.request.grpcMethod,
      grpcMetadata: initialSession.request.grpcMetadata,
      grpcBodyRaw: initialSession.request.grpcBodyRaw,
      grpcSchemaMode: initialSession.request.grpcSchemaMode,
      grpcProtoFiles: initialSession.request.grpcProtoFiles,
      grpcProtoset: initialSession.request.grpcProtoset,
      wsUrl: initialSession.request.wsUrl,
      wsHeaders: initialSession.request.wsHeaders,
      wsMessage: initialSession.request.wsMessage,
      wsConnectionId: initialSession.request.wsConnectionId,
      wsConnected: initialSession.request.wsConnected,
      networkTarget: initialSession.request.networkTarget,
      networkPayload: initialSession.request.networkPayload,
      networkPayloadBase64: initialSession.request.networkPayloadBase64,
      networkPayloadHex: initialSession.request.networkPayloadHex,
      networkPayloadMode: initialSession.request.networkPayloadMode,
      networkPayloadFileName: initialSession.request.networkPayloadFileName,
      networkTimeoutMs: initialSession.request.networkTimeoutMs,
      networkReadMode: initialSession.request.networkReadMode,
      networkExactBytes: initialSession.request.networkExactBytes,
      networkDelimiterHex: initialSession.request.networkDelimiterHex,
      networkLengthPrefixBytes: initialSession.request.networkLengthPrefixBytes,
      networkLengthPrefixEndian: initialSession.request.networkLengthPrefixEndian,
      networkKeepConnection: initialSession.request.networkKeepConnection,
      networkConnectionId: initialSession.request.networkConnectionId,
      networkConnected: false,
      networkReading: false,
      networkActiveRequestId: '',
      activeTab: initialSession.request.activeTab,
      activeResTab: initialSession.request.activeResTab,
      wsAutoScroll: true,
      operationsByTabId: {},
      response: initialSession.request.response,
      copied: false,
      layout: readFromStorage(STORAGE_KEYS.layout, 'horizontal'),
      disableReuse: initialSession.request.disableReuse,
      activeCollectionItemId: initialSession.request.collectionItemId || '',
      activeHistoryItemId: '',
      isSidebarOpen: typeof window === 'undefined' || window.innerWidth >= 1280,
      sidebarView: initialSidebarView,
      history: initialHistory,
      collections: initialCollections,
      initialCollections,
      requestTabsState: initialSession.tabs,
      activeRequestTabId: initialSession.activeTabId,
      showImportModal: false,
      curlText: '',
      importError: '',
      showOpenApiModal: false,
      openApiText: '',
      openApiError: '',
      openApiFileName: '',
      openApiCollectionName: '',
      showSaveModal: false,
      saveReqName: t('request.new'),
      selectedCollectionId: 'default-1',
      newCollectionName: '',
      isCreatingCollection: false,
      newSidebarCollectionName: '',
      editingCollectionId: '',
      editingCollectionName: '',
      editingCollectionItem: null,
      editingCollectionItemName: ''
    });
  });
  const [confirmation, setConfirmation] = useState(null);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [selectedCollectionFolderId, setSelectedCollectionFolderId] = useState('');
  const {
    requestName, setRequestName,
    protocol, setProtocol,
    url, setUrl,
    method, setMethod,
    reqHeaders, setReqHeaders,
    queryParams, setQueryParams,
    bodyType, setBodyType,
    reqBodyRaw, setReqBodyRaw,
    reqBodyForm, setReqBodyForm,
    reqBodyMultipart, setReqBodyMultipart,
    grpcTarget, setGrpcTarget,
    grpcService, setGrpcService,
    grpcMethod, setGrpcMethod,
    grpcMetadata, setGrpcMetadata,
    grpcBodyRaw, setGrpcBodyRaw,
    grpcSchemaMode, setGrpcSchemaMode,
    grpcProtoFiles, setGrpcProtoFiles,
    grpcProtoset, setGrpcProtoset,
    wsUrl, setWsUrl,
    wsHeaders, setWsHeaders,
    wsMessage, setWsMessage,
    wsConnectionId, setWsConnectionId,
    wsConnected, setWsConnected,
    networkTarget, setNetworkTarget,
    networkPayload, setNetworkPayload,
    networkPayloadBase64, setNetworkPayloadBase64,
    networkPayloadHex, setNetworkPayloadHex,
    networkPayloadMode, setNetworkPayloadMode,
    networkPayloadFileName, setNetworkPayloadFileName,
    networkTimeoutMs, setNetworkTimeoutMs,
    networkReadMode, setNetworkReadMode,
    networkExactBytes, setNetworkExactBytes,
    networkDelimiterHex, setNetworkDelimiterHex,
    networkLengthPrefixBytes, setNetworkLengthPrefixBytes,
    networkLengthPrefixEndian, setNetworkLengthPrefixEndian,
    networkKeepConnection, setNetworkKeepConnection,
    networkConnectionId, setNetworkConnectionId,
    networkConnected, setNetworkConnected,
    networkReading, setNetworkReading,
    networkActiveRequestId, setNetworkActiveRequestId,
    activeTab, setActiveTab,
    activeResTab, setActiveResTab,
    wsAutoScroll, setWsAutoScroll,
    operationsByTabId, setOperationsByTabId,
    response, setResponse,
    copied, setCopied,
    layout, setLayout,
    disableReuse, setDisableReuse,
    activeCollectionItemId, setActiveCollectionItemId,
    activeHistoryItemId, setActiveHistoryItemId,
    isSidebarOpen, setIsSidebarOpen,
    sidebarView, setSidebarView,
    history, setHistory,
    collections, setCollections,
    initialCollections,
    requestTabsState, setRequestTabsState,
    activeRequestTabId, setActiveRequestTabId,
    showImportModal, setShowImportModal,
    curlText, setCurlText,
    importError, setImportError,
    showOpenApiModal, setShowOpenApiModal,
    openApiText, setOpenApiText,
    openApiError, setOpenApiError,
    openApiFileName, setOpenApiFileName,
    openApiCollectionName, setOpenApiCollectionName,
    showSaveModal, setShowSaveModal,
    saveReqName, setSaveReqName,
    selectedCollectionId, setSelectedCollectionId,
    newCollectionName, setNewCollectionName,
    isCreatingCollection, setIsCreatingCollection,
    newSidebarCollectionName, setNewSidebarCollectionName,
    editingCollectionId, setEditingCollectionId,
    editingCollectionName, setEditingCollectionName,
    editingCollectionItem, setEditingCollectionItem,
    editingCollectionItemName, setEditingCollectionItemName
  } = useStore(appStore);

  const copyResetTimeoutRef = useRef(null);
  const closeConfirmation = useCallback(() => setConfirmation(null), []);
  const requestConfirmation = useCallback((options) => setConfirmation(options), []);

  const methods = HTTP_METHODS;
  const requestTabs = protocol === 'grpc'
    ? ['schema', 'metadata', 'body', 'command']
    : protocol === 'ws'
      ? ['headers', 'body']
      : protocol === 'tcp'
        ? ['body', 'read']
        : protocol === 'udp'
        ? ['body']
        : ['params', 'headers', 'body'];
  const {
    sendHttpRequest: sendHttpRequestViaExtension,
    sendGrpcRequest: sendGrpcRequestViaExtension,
    describeGrpcApi: describeGrpcApiViaExtension,
    sendNetworkRequest: sendNetworkRequestViaExtension,
    stopNetworkRead: stopNetworkReadViaExtension,
    closeNetworkSession: closeNetworkSessionViaExtension,
    connectWebsocket: connectWebsocketViaExtension,
    sendWebsocketMessage: sendWebsocketMessageViaExtension,
    closeWebsocket: closeWebsocketViaExtension
  } = useExtensionClient();

  const {
    grpcServices,
    grpcDiscoveryLoading,
    grpcDiscoveryError,
    grpcDiscoveryReady,
    grpcSelectedService,
    grpcSelectedMethod,
    refreshGrpcDiscoveryNow
  } = useGrpcDiscoveryController({
    protocol,
    grpcTarget,
    grpcService,
    grpcMethod,
    grpcSchemaMode,
    grpcProtoFiles,
    grpcProtoset,
    describeGrpcApi: describeGrpcApiViaExtension,
    setGrpcService,
    setGrpcMethod
  });
  const grpcPayloadValidation = useMemo(() => validateGrpcPayload(
    grpcBodyRaw,
    grpcSelectedMethod?.requestSchema || null
  ), [grpcBodyRaw, grpcSelectedMethod]);

  const responseScrollRef = useResponseAutoScroll({
    response,
    activeResTab,
    enabled: wsAutoScroll
  });
  useNeutralinoLifecycle();

  const {
    activeOperation,
    applyTabOperationPatch,
    beginTabOperation,
    finishTabOperation,
    isTabOperationActive
  } = useTabOperations({
    activeRequestTabId,
    operationsByTabId,
    setOperationsByTabId,
    setRequestTabsState,
    setResponse,
    setActiveResTab,
    setNetworkConnected,
    setWsConnected
  });
  const loading = Boolean(activeOperation);

  useEffect(() => () => {
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }
  }, []);

  // --- AUTOMATYCZNA AKTUALIZACJA CONTENT-TYPE ---
  useEffect(() => {
    if (protocol !== 'http') return;
    if (bodyType === 'none') return;
    const ctIndex = reqHeaders.findIndex(h => h.key.toLowerCase() === 'content-type');
    let expectedCT = bodyType === 'raw'
      ? 'application/json'
      : bodyType === 'urlencoded'
        ? 'application/x-www-form-urlencoded'
        : bodyType === 'multipart'
          ? 'multipart/form-data'
          : '';

    if (ctIndex >= 0) {
       if (reqHeaders[ctIndex].value !== expectedCT && expectedCT !== '') {
           setReqHeaders(reqHeaders.map((header, index) => (
             index === ctIndex ? { ...header, value: expectedCT } : header
           )));
       }
    } else if (expectedCT !== '') {
       setReqHeaders([
         { key: 'Content-Type', value: expectedCT, enabled: true },
         ...reqHeaders
       ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyType, protocol]);

  // --- SYNCHRONIZACJA PARAMETRÓW URL ---
  useEffect(() => {
    if (protocol !== 'http') return;
    try {
      const urlObj = new URL(url);
      const params = Array.from(urlObj.searchParams.entries()).map(([key, value]) => ({
        key,
        value,
        enabled: true
      }));
      const enabledParams = queryParams
        .filter(param => isKeyValueRowEnabled(param) && param.key.trim())
        .map(param => ({
          key: param.key.trim(),
          value: param.value.trim(),
          enabled: true
        }));
      if (JSON.stringify(params) !== JSON.stringify(enabledParams)) {
         const disabledParams = queryParams.filter(param => !isKeyValueRowEnabled(param));
         const nextParams = [...params, ...disabledParams];
         setQueryParams(nextParams.length > 0
           ? nextParams
           : [{ key: '', value: '', enabled: true }]);
      }
    } catch {
      // Pozwalamy użytkownikowi wpisywać częściowe lub tymczasowo niepoprawne URL-e.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, protocol]);

  useEffect(() => {
    const availableTabs = protocol === 'grpc'
      ? ['schema', 'metadata', 'body', 'command']
      : protocol === 'ws'
        ? ['headers', 'body']
        : protocol === 'tcp'
          ? ['body', 'read']
          : protocol === 'udp'
          ? ['body']
          : ['params', 'headers', 'body'];
    if (!availableTabs.includes(activeTab)) {
      setActiveTab('body');
    }
  }, [activeTab, protocol]);

  const buildCurrentRequestSnapshot = useCallback(() => normalizeRequestSnapshot({
    requestName,
    protocol,
    url,
    method,
    reqHeaders,
    queryParams,
    bodyType,
    reqBodyRaw,
    reqBodyForm,
    reqBodyMultipart,
    grpcTarget,
    grpcService,
    grpcMethod,
    grpcMetadata,
    grpcBodyRaw,
    grpcSchemaMode,
    grpcProtoFiles,
    grpcProtoset,
    wsUrl,
    wsHeaders,
    wsMessage,
    wsConnectionId,
    wsConnected,
    networkTarget,
    networkPayload,
    networkPayloadBase64,
    networkPayloadHex,
    networkPayloadMode,
    networkPayloadFileName,
    networkTimeoutMs,
    networkReadMode,
    networkExactBytes,
    networkDelimiterHex,
    networkLengthPrefixBytes,
    networkLengthPrefixEndian,
    networkKeepConnection,
    networkConnectionId,
    networkConnected,
    activeTab,
    activeResTab,
    response,
    disableReuse,
    collectionItemId: activeCollectionItemId
  }), [
    requestName,
    protocol,
    url,
    method,
    reqHeaders,
    queryParams,
    bodyType,
    reqBodyRaw,
    reqBodyForm,
    reqBodyMultipart,
    grpcTarget,
    grpcService,
    grpcMethod,
    grpcMetadata,
    grpcBodyRaw,
    grpcSchemaMode,
    grpcProtoFiles,
    grpcProtoset,
    wsUrl,
    wsHeaders,
    wsMessage,
    wsConnectionId,
    wsConnected,
    networkTarget,
    networkPayload,
    networkPayloadBase64,
    networkPayloadHex,
    networkPayloadMode,
    networkPayloadFileName,
    networkTimeoutMs,
    networkReadMode,
    networkExactBytes,
    networkDelimiterHex,
    networkLengthPrefixBytes,
    networkLengthPrefixEndian,
    networkKeepConnection,
    networkConnectionId,
    networkConnected,
    activeTab,
    activeResTab,
    response,
    disableReuse,
    activeCollectionItemId
  ]);

  const applyRequestSnapshot = useCallback((snapshot) => {
    const next = normalizeRequestSnapshot(snapshot);
    setRequestName(next.requestName);
    setProtocol(next.protocol);
    setUrl(next.url);
    setMethod(next.method);
    setReqHeaders(next.reqHeaders);
    setQueryParams(next.queryParams);
    setBodyType(next.bodyType);
    setReqBodyRaw(next.reqBodyRaw);
    setReqBodyForm(next.reqBodyForm);
    setReqBodyMultipart(next.reqBodyMultipart);
    setGrpcTarget(next.grpcTarget);
    setGrpcService(next.grpcService);
    setGrpcMethod(next.grpcMethod);
    setGrpcMetadata(next.grpcMetadata);
    setGrpcBodyRaw(next.grpcBodyRaw);
    setGrpcSchemaMode(next.grpcSchemaMode);
    setGrpcProtoFiles(next.grpcProtoFiles);
    setGrpcProtoset(next.grpcProtoset);
    setWsUrl(next.wsUrl);
    setWsHeaders(next.wsHeaders);
    setWsMessage(next.wsMessage);
    setWsConnectionId(next.wsConnectionId);
    setWsConnected(next.wsConnected);
    setNetworkTarget(next.networkTarget);
    setNetworkPayload(next.networkPayload);
    setNetworkPayloadBase64(next.networkPayloadBase64);
    setNetworkPayloadHex(next.networkPayloadHex);
    setNetworkPayloadMode(next.networkPayloadMode);
    setNetworkPayloadFileName(next.networkPayloadFileName);
    setNetworkTimeoutMs(next.networkTimeoutMs);
    setNetworkReadMode(next.networkReadMode);
    setNetworkExactBytes(next.networkExactBytes);
    setNetworkDelimiterHex(next.networkDelimiterHex);
    setNetworkLengthPrefixBytes(next.networkLengthPrefixBytes);
    setNetworkLengthPrefixEndian(next.networkLengthPrefixEndian);
    setNetworkKeepConnection(next.networkKeepConnection);
    setNetworkConnectionId(next.networkConnectionId);
    setNetworkConnected(next.networkConnected);
    setNetworkReading(false);
    setNetworkActiveRequestId('');
    setActiveTab(next.activeTab);
    setActiveResTab(next.activeResTab);
    setResponse(next.response);
    setDisableReuse(next.disableReuse);
    setActiveCollectionItemId(next.collectionItemId || '');
  }, []);

  const {
    appendHistoryItem,
    persistCollections
  } = useOmniPortPersistence({
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
  });

  useEffect(() => {
    if (!activeRequestTabId) return;
    const snapshot = buildCurrentRequestSnapshot();
    setRequestTabsState(prev => prev.map(tab => (
      tab.id === activeRequestTabId
        ? { ...tab, name: getRequestTabName(snapshot), request: snapshot }
        : tab
    )));
  }, [activeRequestTabId, buildCurrentRequestSnapshot]);

  const updateUrlFromParams = useCallback((newParams) => {
    try {
      const urlObj = new URL(url);
      urlObj.search = '';
      newParams.forEach(param => {
        if (isKeyValueRowEnabled(param) && param.key.trim()) {
          urlObj.searchParams.append(param.key.trim(), param.value.trim());
        }
      });
      setUrl(urlObj.toString());
    } catch {
      // Parametry zsynchronizują się, gdy adres ponownie będzie poprawnym URL-em.
    }
  }, [url]);

  const handleParamChange = (index, field, value) => {
    const newParams = queryParams.map((param, paramIndex) => (
      paramIndex === index ? { ...param, [field]: value } : param
    ));
    setQueryParams(newParams);
    updateUrlFromParams(newParams);
  };

  const handleAddParam = () => setQueryParams([
    ...queryParams,
    { key: '', value: '', enabled: true }
  ]);
  const handleRemoveParam = (index) => {
    const newParams = queryParams.filter((_, i) => i !== index);
    setQueryParams(newParams);
    updateUrlFromParams(newParams);
  };

  const handleHeaderChange = (index, field, value) => {
    setReqHeaders(reqHeaders.map((header, headerIndex) => (
      headerIndex === index ? { ...header, [field]: value } : header
    )));
  };
  const handleAddHeader = () => setReqHeaders([
    ...reqHeaders,
    { key: '', value: '', enabled: true }
  ]);
  const handleRemoveHeader = (index) => setReqHeaders(reqHeaders.filter((_, i) => i !== index));

  const handleWsHeaderChange = (index, field, value) => {
    setWsHeaders(wsHeaders.map((header, headerIndex) => (
      headerIndex === index ? { ...header, [field]: value } : header
    )));
  };
  const handleAddWsHeader = () => setWsHeaders([
    ...wsHeaders,
    { key: '', value: '', enabled: true }
  ]);
  const handleRemoveWsHeader = (index) => setWsHeaders(wsHeaders.filter((_, i) => i !== index));

  const handleFormChange = (index, field, value) => {
    const newForm = [...reqBodyForm];
    newForm[index][field] = value;
    setReqBodyForm(newForm);
  };
  const handleAddFormRow = () => setReqBodyForm([...reqBodyForm, { key: '', value: '' }]);
  const handleRemoveFormRow = (index) => setReqBodyForm(reqBodyForm.filter((_, i) => i !== index));

  const handleMultipartChange = (index, field, value) => {
    setReqBodyMultipart(previousRows => previousRows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  };
  const handleMultipartTypeChange = (index, type) => {
    setReqBodyMultipart(previousRows => previousRows.map((row, rowIndex) => (
      rowIndex === index
        ? {
            ...row,
            type,
            value: '',
            fileName: '',
            mimeType: '',
            size: 0,
            lastModified: 0,
            dataBase64: null
          }
        : row
    )));
  };
  const handleMultipartFileChange = (index, fileData) => {
    setReqBodyMultipart(previousRows => previousRows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...fileData, type: 'file' } : row
    )));
  };
  const handleAddMultipartRow = () => {
    setReqBodyMultipart(previousRows => [
      ...previousRows,
      {
        id: `multipart-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        key: '',
        type: 'text',
        value: '',
        fileName: '',
        mimeType: '',
        size: 0,
        lastModified: 0,
        dataBase64: null
      }
    ]);
  };
  const handleRemoveMultipartRow = (index) => {
    setReqBodyMultipart(previousRows => previousRows.filter((_, rowIndex) => rowIndex !== index));
  };

  const networkPayloadValid = networkPayloadMode !== 'hex'
    || isEditableHexValid(networkPayloadHex);
  const networkReadConfigValid = protocol !== 'tcp'
    || (networkReadMode !== 'exact' || Number(networkExactBytes) > 0)
    && (
      networkReadMode !== 'delimiter'
      || (networkDelimiterHex.trim() !== '' && isEditableHexValid(networkDelimiterHex))
    );

  const handleNetworkPayloadTextChange = (value) => {
    const dataBase64 = textToBase64(value);
    setNetworkPayload(value);
    setNetworkPayloadBase64(dataBase64);
    setNetworkPayloadHex(formatEditableHex(dataBase64));
    setNetworkPayloadFileName('');
  };

  const handleNetworkPayloadHexChange = (value) => {
    setNetworkPayloadHex(value);
    setNetworkPayloadFileName('');

    const parsed = parseEditableHex(value);
    if (!parsed.valid) return;

    setNetworkPayloadBase64(parsed.dataBase64);
    setNetworkPayload(base64ToText(parsed.dataBase64));
  };

  const handleNetworkPayloadFileImport = (fileData) => {
    setNetworkPayloadBase64(fileData.dataBase64);
    setNetworkPayload(base64ToText(fileData.dataBase64));
    setNetworkPayloadHex(formatEditableHex(fileData.dataBase64));
    setNetworkPayloadFileName(fileData.fileName);
    setNetworkPayloadMode('hex');
  };

  const handleClearNetworkPayload = () => {
    if (!networkPayloadHex && !networkPayloadBase64 && !networkPayload) return;
    requestConfirmation({
      title: t('confirm.networkPayloadClear.title'),
      message: t('confirm.networkPayloadClear.message'),
      confirmLabel: t('confirm.networkPayloadClear.action'),
      tone: 'warning',
      onConfirm: () => handleNetworkPayloadHexChange('')
    });
  };

  const handleGrpcMetadataChange = (index, field, value) => {
    setGrpcMetadata(grpcMetadata.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };
  const handleAddGrpcMetadata = () => setGrpcMetadata([
    ...grpcMetadata,
    { key: '', value: '', enabled: true }
  ]);
  const handleRemoveGrpcMetadata = (index) => setGrpcMetadata(grpcMetadata.filter((_, i) => i !== index));
  const handleGrpcProtoFilesImport = (files) => {
    setGrpcProtoFiles(previousFiles => {
      const mergedFiles = new Map(previousFiles.map(file => [file.name, file]));
      files.forEach(file => mergedFiles.set(file.name, file));
      return Array.from(mergedFiles.values()).sort((left, right) => (
        left.name.localeCompare(right.name)
      ));
    });
    setGrpcSchemaMode('proto');
  };
  const handleRemoveGrpcProtoFile = (fileName) => {
    setGrpcProtoFiles(previousFiles => previousFiles.filter(file => file.name !== fileName));
  };
  const handleGrpcProtosetImport = (fileData) => {
    setGrpcProtoset(fileData);
    setGrpcSchemaMode('protoset');
  };
  const handleClearGrpcProtoFiles = () => {
    setGrpcProtoFiles([]);
  };
  const handleClearGrpcProtoset = () => {
    setGrpcProtoset({
      fileName: '',
      size: 0,
      lastModified: 0,
      dataBase64: ''
    });
  };
  const handleGrpcServiceChange = (value) => {
    setGrpcService(value);
    const selectedService = grpcServices.find(service => service.name === value);
    if (
      selectedService?.methods?.length
      && !selectedService.methods.some(methodItem => methodItem.name === grpcMethod)
    ) {
      setGrpcMethod(selectedService.methods[0].name);
    }
  };
  const handleGenerateGrpcPayload = () => {
    if (!grpcSelectedMethod) return;
    setGrpcBodyRaw(formatGrpcPayloadTemplate(grpcSelectedMethod.requestTemplate));
    setActiveTab('body');
  };

  const buildGrpcurlCommand = () => {
    const methodPath = `${grpcService.trim()}/${grpcMethod.trim()}`;
    const metadataArgs = grpcMetadata
      .filter(item => isKeyValueRowEnabled(item) && item.key.trim())
      .flatMap(item => ['-H', quoteShellArg(`${item.key.trim()}: ${item.value.trim()}`)]);
    const dataArgs = grpcBodyRaw.trim() ? ['-d', quoteShellArg(grpcBodyRaw)] : [];
    const schemaArgs = grpcSchemaMode === 'proto'
      ? [
          '-import-path',
          quoteShellArg('.'),
          ...grpcProtoFiles.flatMap(file => ['-proto', quoteShellArg(file.name)])
        ]
      : grpcSchemaMode === 'protoset' && grpcProtoset.fileName
        ? ['-protoset', quoteShellArg(grpcProtoset.fileName)]
        : [];

    return ['grpcurl', '-plaintext', ...schemaArgs, ...metadataArgs, ...dataArgs, grpcTarget.trim(), methodPath]
      .filter(Boolean)
      .join(' ');
  };

  const copyText = (textToCopy) => {
    const textArea = document.createElement("textarea");
    textArea.value = textToCopy;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyResetTimeoutRef.current = null;
      }, 2000);
    } catch {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
        copyResetTimeoutRef.current = null;
      }
      setCopied(false);
    }
    document.body.removeChild(textArea);
  };

  const handleCopyResponse = () => {
    if (!response) return;
    if (isNetworkResponse(response)) {
      const textToCopy = activeResTab === 'hex'
        ? formatHexDump(response)
        : networkResponseText(response);
      copyText(textToCopy);
      return;
    }
    if (response.data == null) return;
    const textToCopy = response.isJson ? JSON.stringify(response.data, null, 2) : response.data;
    copyText(textToCopy);
  };

  const handleCopyGrpcCommand = () => {
    copyText(buildGrpcurlCommand());
  };

  const handleDeleteHistoryItem = (itemId) => {
    const item = history.find(historyItem => historyItem.id === itemId);
    requestConfirmation({
      title: t('confirm.historyDelete.title'),
      message: t('confirm.historyDelete.message', {
        method: item?.method || '',
        url: item?.url || ''
      }),
      confirmLabel: t('confirm.historyDelete.action'),
      onConfirm: () => {
        setHistory(previousHistory => previousHistory.filter(historyItem => historyItem.id !== itemId));
        if (activeHistoryItemId === itemId) {
          setActiveHistoryItemId('');
        }
      }
    });
  };

  const handleClearHistory = () => {
    if (history.length === 0) return;
    requestConfirmation({
      title: t('confirm.historyClear.title'),
      message: t('confirm.historyClear.message', { count: history.length }),
      confirmLabel: t('confirm.historyClear.action'),
      onConfirm: () => {
        setHistory([]);
        setActiveHistoryItemId('');
      }
    });
  };

  const {
    handleAddRequestTab,
    handleCloseRequestTab,
    handleSwitchRequestTab,
    loadCollectionItem,
    loadHistoryItem
  } = useRequestTabsController({
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
    closeWebsocket: closeWebsocketViaExtension,
    closeNetworkSession: closeNetworkSessionViaExtension,
    requestConfirmation
  });

  const {
    handleSendGrpcRequest,
    handleSendHttpRequest,
    handleSendNetworkRequest,
    handleStopNetworkRead,
    handleCloseNetworkSession
  } = useRequestExecutionController({
    url,
    method,
    reqHeaders,
    queryParams,
    bodyType,
    reqBodyRaw,
    reqBodyForm,
    reqBodyMultipart,
    disableReuse,
    grpcTarget,
    grpcService,
    grpcMethod,
    grpcMetadata,
    grpcBodyRaw,
    grpcSchemaMode,
    grpcProtoFiles,
    grpcProtoset,
    grpcRequestSchema: grpcSelectedMethod?.requestSchema || null,
    protocol,
    networkTarget,
    networkPayload,
    networkPayloadBase64,
    networkPayloadHex,
    networkPayloadMode,
    networkPayloadFileName,
    networkTimeoutMs,
    networkReadMode,
    networkExactBytes,
    networkDelimiterHex,
    networkLengthPrefixBytes,
    networkLengthPrefixEndian,
    networkKeepConnection,
    networkConnectionId,
    networkActiveRequestId,
    activeResTab,
    beginTabOperation,
    finishTabOperation,
    applyTabOperationPatch,
    isTabOperationActive,
    setResponse,
    setNetworkReading,
    setNetworkActiveRequestId,
    setNetworkConnected,
    setActiveResTab,
    setActiveHistoryItemId,
    appendHistoryItem,
    sendHttpRequest: sendHttpRequestViaExtension,
    sendGrpcRequest: sendGrpcRequestViaExtension,
    sendNetworkRequest: sendNetworkRequestViaExtension,
    stopNetworkRead: stopNetworkReadViaExtension,
    closeNetworkSession: closeNetworkSessionViaExtension
  });

  const handleNetworkKeepConnectionChange = (value) => {
    setNetworkKeepConnection(value);
    if (!value && networkConnected) {
      void handleCloseNetworkSession();
    }
  };

  const handleProtocolChange = (nextProtocol) => {
    if (networkReading && nextProtocol !== protocol) return;
    if (protocol === 'tcp' && nextProtocol !== 'tcp' && networkConnected) {
      void handleCloseNetworkSession();
    }
    setProtocol(nextProtocol);
  };

  const {
    handleCloseWebsocket,
    handleConnectWebsocket,
    handleSendWebsocketMessage
  } = useWebsocketController({
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
    connectWebsocket: connectWebsocketViaExtension,
    sendWebsocketMessage: sendWebsocketMessageViaExtension,
    closeWebsocket: closeWebsocketViaExtension
  });

  const {
    activeCollectionSaveLocation,
    handleCancelEditCollection,
    handleCancelEditCollectionItem,
    handleCommitEditCollection,
    handleCommitEditCollectionItem,
    handleCreateCollection,
    handleCreateCollectionFolder,
    handleDeleteCollection,
    handleDeleteCollectionItem,
    handleExportCollection,
    handleExportCollections,
    handleImportCollections,
    handleMoveCollectionItem,
    handleOpenSaveModal,
    handleQuickAddCurrentRequestToCollection,
    handleSaveToCollection,
    handleStartEditCollection,
    handleStartEditCollectionItem,
    handleToggleCollectionFolder,
    isSaveDisabled,
    toggleCollection
  } = useCollectionsController({
    collections,
    persistCollections,
    requestName,
    setRequestName,
    setRequestTabsState,
    activeRequestTabId,
    activeCollectionItemId,
    setActiveCollectionItemId,
    setActiveHistoryItemId,
    selectedCollectionId,
    setSelectedCollectionId,
    selectedCollectionFolderId,
    setSelectedCollectionFolderId,
    newSidebarCollectionName,
    setNewSidebarCollectionName,
    editingCollectionId,
    setEditingCollectionId,
    editingCollectionName,
    setEditingCollectionName,
    editingCollectionItem,
    setEditingCollectionItem,
    editingCollectionItemName,
    setEditingCollectionItemName,
    saveReqName,
    setSaveReqName,
    newCollectionName,
    setNewCollectionName,
    isCreatingCollection,
    setIsCreatingCollection,
    setShowSaveModal,
    setSidebarView,
    isSidebarOpen,
    setIsSidebarOpen,
    buildCurrentRequestSnapshot,
    requestConfirmation
  });

  useAppHotkeys([{
    ...APP_HOTKEYS.saveRequest,
    enabled: !confirmation
      && !showImportModal
      && !showOpenApiModal
      && !showAboutModal
      && (!showSaveModal || !isSaveDisabled),
    handler: () => {
      if (showSaveModal) {
        handleSaveToCollection();
        return;
      }
      handleOpenSaveModal();
    }
  }]);

  const currentRequestSnapshot = buildCurrentRequestSnapshot();
  const requestSaveStatus = !activeCollectionSaveLocation
    ? 'unsaved'
    : areRequestSnapshotsEqual(
        currentRequestSnapshot,
        collectionItemToSnapshot(activeCollectionSaveLocation.item)
      )
      ? 'saved'
      : 'dirty';
  const revertSavedRequest = async () => {
    if (!activeCollectionSaveLocation || requestSaveStatus !== 'dirty') return;

    if (protocol === 'ws' && wsConnected) {
      await handleCloseWebsocket();
    }
    if (protocol === 'tcp' && networkConnected) {
      await handleCloseNetworkSession();
    }

    const savedSnapshot = normalizeRequestSnapshot({
      ...collectionItemToSnapshot(activeCollectionSaveLocation.item),
      collectionItemId: activeCollectionSaveLocation.item.id,
      response: null,
      wsConnected: false
    });

    setRequestTabsState(previousTabs => previousTabs.map(tab => (
      tab.id === activeRequestTabId
        ? {
            ...tab,
            name: getRequestTabName(savedSnapshot),
            request: savedSnapshot
          }
        : tab
    )));
    setActiveHistoryItemId('');
    applyRequestSnapshot(savedSnapshot);
  };
  const handleRevertSavedRequest = () => {
    if (!activeCollectionSaveLocation || requestSaveStatus !== 'dirty') return;
    requestConfirmation({
      title: t('confirm.revert.title'),
      message: t('confirm.revert.message'),
      confirmLabel: t('confirm.revert.action'),
      tone: 'warning',
      onConfirm: revertSavedRequest
    });
  };
  const requestNamePlaceholder = getRequestTabName({
    ...currentRequestSnapshot,
    requestName: ''
  });
  const dirtyCollectionItemIds = useMemo(() => (
    Array.from(new Set(requestTabsState.flatMap(tab => {
      const request = normalizeRequestSnapshot(tab.request);
      const comparableRequest = tab.id === activeRequestTabId
        ? currentRequestSnapshot
        : request;
      if (!comparableRequest.collectionItemId) return [];

      const location = findCollectionItemLocation(collections, comparableRequest.collectionItemId);
      if (!location) return [];

      return areRequestSnapshotsEqual(comparableRequest, collectionItemToSnapshot(location.item))
        ? []
        : [comparableRequest.collectionItemId];
    })))
  ), [activeRequestTabId, collections, currentRequestSnapshot, requestTabsState]);
  const openWebsocketCollectionItemIds = Array.from(new Set([
    ...requestTabsState
      .map(tab => normalizeRequestSnapshot(tab.request))
      .filter(request => (
        request.protocol === 'ws'
        && request.wsConnected
        && request.collectionItemId
      ))
      .map(request => request.collectionItemId),
    ...(protocol === 'ws' && wsConnected && activeCollectionItemId
      ? [activeCollectionItemId]
      : [])
  ]));

  const {
    closeOpenApiImport,
    handleImportCurl,
    handleImportOpenApi,
    handleOpenApiFileChange,
    resetOpenApiImport
  } = useImportController({
    methods,
    curlText,
    setCurlText,
    setImportError,
    setShowImportModal,
    setProtocol,
    setUrl,
    setMethod,
    setReqHeaders,
    setBodyType,
    setReqBodyRaw,
    setReqBodyMultipart,
    setActiveTab,
    openApiText,
    setOpenApiText,
    setOpenApiError,
    setOpenApiFileName,
    openApiCollectionName,
    setOpenApiCollectionName,
    setShowOpenApiModal,
    persistCollections,
    setSidebarView,
    isSidebarOpen,
    setIsSidebarOpen
  });

  return (
    <div className="h-screen bg-gray-950 text-gray-300 font-sans flex flex-col relative overflow-hidden">

      <AppHeader
        isSidebarOpen={isSidebarOpen}
        layout={layout}
        onToggleSidebar={setIsSidebarOpen}
        onLayoutChange={setLayout}
        onOpenCurlImport={() => setShowImportModal(true)}
        onOpenOpenApiImport={() => setShowOpenApiModal(true)}
      />

      {/* --- KORPUS ROBOCZY --- */}
      <main className="relative flex-1 flex overflow-hidden">

        <AppSidebar
          isOpen={isSidebarOpen}
          view={sidebarView}
          tabsState={{
            tabs: requestTabsState,
            activeTabId: activeRequestTabId,
            networkReading,
            operationsByTabId,
            collections,
            dirtyCollectionItemIds
          }}
          historyState={{
            history,
            activeHistoryItemId
          }}
          collectionsState={{
            collections,
            newCollectionName: newSidebarCollectionName,
            editingCollectionId,
            editingCollectionName,
            editingCollectionItem,
            editingCollectionItemName,
            activeCollectionItemId,
            openWebsocketCollectionItemIds,
            dirtyCollectionItemIds
          }}
          actions={{
            setSidebarView,
            setIsSidebarOpen,
            handleAddRequestTab,
            handleSwitchRequestTab,
            handleCloseRequestTab,
            loadHistoryItem,
            handleDeleteHistoryItem,
            handleClearHistory,
            setNewCollectionName: setNewSidebarCollectionName,
            handleCreateCollection,
            handleCreateCollectionFolder,
            setEditingCollectionName,
            handleCommitEditCollection,
            handleCancelEditCollection,
            toggleCollection,
            handleQuickAddCurrentRequestToCollection,
            handleStartEditCollection,
            handleDeleteCollection,
            handleExportCollection,
            handleExportCollections,
            handleImportCollections,
            handleMoveCollectionItem,
            setEditingCollectionItemName,
            handleCommitEditCollectionItem,
            handleCancelEditCollectionItem,
            loadCollectionItem,
            handleStartEditCollectionItem,
            handleToggleCollectionFolder,
            handleDeleteCollectionItem
          }}
        />

        {/* --- PRZESTRZEŃ PŁÓTNA: REQUEST + RESPONSE --- */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <RequestToolbar
            state={{
              requestName,
              requestNamePlaceholder,
              requestSaveStatus,
              protocol,
              method,
              methods,
              url,
              wsUrl,
              wsConnected,
              grpcTarget,
              grpcService,
              grpcMethod,
              grpcSchemaValid: grpcDiscoveryReady,
              grpcPayloadValid: grpcPayloadValidation.valid,
              grpcServices,
              grpcDiscoveryLoading,
              grpcDiscoveryError,
              networkTarget,
              networkTimeoutMs,
              networkPayloadValid,
              networkReadConfigValid,
              networkReading,
              networkConnected,
              disableReuse,
              loading,
              operationKind: activeOperation?.kind || '',
              canRevertChanges: requestSaveStatus === 'dirty'
            }}
            actions={{
              onRequestNameChange: setRequestName,
              onProtocolChange: handleProtocolChange,
              onMethodChange: setMethod,
              onUrlChange: setUrl,
              onWsUrlChange: setWsUrl,
              onGrpcTargetChange: setGrpcTarget,
              onGrpcServiceChange: handleGrpcServiceChange,
              onGrpcMethodChange: setGrpcMethod,
              onRefreshGrpcDiscovery: refreshGrpcDiscoveryNow,
              onNetworkTargetChange: setNetworkTarget,
              onNetworkTimeoutChange: (value) => setNetworkTimeoutMs(Number(value) || 100),
              onDisableReuseChange: setDisableReuse,
              onRevertChanges: () => void handleRevertSavedRequest(),
              onOpenSaveModal: handleOpenSaveModal,
              onConnectWebsocket: handleConnectWebsocket,
              onCloseWebsocket: handleCloseWebsocket,
              onSendWebsocketMessage: handleSendWebsocketMessage,
              onSendGrpcRequest: handleSendGrpcRequest,
              onSendNetworkRequest: handleSendNetworkRequest,
              onStopNetworkRead: handleStopNetworkRead,
              onCloseNetworkSession: handleCloseNetworkSession,
              onSendHttpRequest: handleSendHttpRequest
            }}
          />

          <div className={`flex-1 flex overflow-hidden min-w-0 min-h-0 ${
            layout === 'horizontal' ? 'flex-row' : 'flex-col'
          }`}>

          <RequestPanel
            layout={layout}
            state={{
              protocol,
              requestTabs,
              activeTab,
              queryParams,
              reqHeaders,
              wsHeaders,
              grpcMetadata,
              copied,
              bodyType,
              grpcBodyRaw,
              grpcSchemaMode,
              grpcProtoFiles,
              grpcProtoset,
              grpcSelectedMethod,
              grpcPayloadValidation,
              wsMessage,
              networkPayload,
              networkPayloadBase64,
              networkPayloadHex,
              networkPayloadMode,
              networkPayloadFileName,
              networkReadMode,
              networkExactBytes,
              networkDelimiterHex,
              networkLengthPrefixBytes,
              networkLengthPrefixEndian,
              networkKeepConnection,
              networkConnected,
              reqBodyRaw,
              reqBodyForm,
              reqBodyMultipart
            }}
            actions={{
              setActiveTab,
              handleParamChange,
              handleRemoveParam,
              handleAddParam,
              handleHeaderChange,
              handleRemoveHeader,
              handleAddHeader,
              handleWsHeaderChange,
              handleRemoveWsHeader,
              handleAddWsHeader,
              handleGrpcMetadataChange,
              handleRemoveGrpcMetadata,
              handleAddGrpcMetadata,
              handleCopyGrpcCommand,
              setGrpcSchemaMode,
              handleGrpcProtoFilesImport,
              handleRemoveGrpcProtoFile,
              handleGrpcProtosetImport,
              handleClearGrpcProtoFiles,
              handleClearGrpcProtoset,
              handleGenerateGrpcPayload,
              setBodyType,
              setGrpcBodyRaw,
              setWsMessage,
              setNetworkPayloadMode,
              handleNetworkPayloadTextChange,
              handleNetworkPayloadHexChange,
              handleNetworkPayloadFileImport,
              handleClearNetworkPayload,
              setNetworkReadMode,
              setNetworkExactBytes: (value) => setNetworkExactBytes(Number(value) || 1),
              setNetworkDelimiterHex,
              setNetworkLengthPrefixBytes: (value) => setNetworkLengthPrefixBytes(Number(value)),
              setNetworkLengthPrefixEndian,
              setNetworkKeepConnection: handleNetworkKeepConnectionChange,
              setReqBodyRaw,
              handleFormChange,
              handleRemoveFormRow,
              handleAddFormRow,
              handleMultipartChange,
              handleMultipartTypeChange,
              handleMultipartFileChange,
              handleAddMultipartRow,
              handleRemoveMultipartRow
            }}
            buildGrpcurlCommand={buildGrpcurlCommand}
          />

          <ResponsePanel
            layout={layout}
            response={response}
            loading={loading}
            operationKind={activeOperation?.kind || ''}
            activeResTab={activeResTab}
            copied={copied}
            wsAutoScroll={wsAutoScroll}
            responseScrollRef={responseScrollRef}
            formatTraceRows={formatTraceRows}
            onResponseTabChange={setActiveResTab}
            onCopyResponse={handleCopyResponse}
            onToggleWsAutoScroll={() => setWsAutoScroll(value => !value)}
          />
          </div>
        </div>
      </main>

      <AppStatusBar
        protocol={protocol}
        onOpenAbout={() => setShowAboutModal(true)}
      />

      {/* --- SYSTEM MODALI --- */}

      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        onRecoverWindow={() => recoverNeutralinoWindow({ force: true })}
      />

      <ConfirmationModal
        isOpen={Boolean(confirmation)}
        title={confirmation?.title || ''}
        message={confirmation?.message || ''}
        confirmLabel={confirmation?.confirmLabel}
        cancelLabel={confirmation?.cancelLabel}
        tone={confirmation?.tone}
        onCancel={closeConfirmation}
        onConfirm={confirmation?.onConfirm || (() => {})}
      />

      <SaveRequestModal
        isOpen={showSaveModal}
        collections={collections}
        saveReqName={saveReqName}
        selectedCollectionId={selectedCollectionId}
        selectedCollectionFolderId={selectedCollectionFolderId}
        newCollectionName={newCollectionName}
        isCreatingCollection={isCreatingCollection}
        isSaveDisabled={isSaveDisabled}
        onClose={() => setShowSaveModal(false)}
        onSaveReqNameChange={setSaveReqName}
        onSelectedCollectionChange={setSelectedCollectionId}
        onSelectedCollectionFolderChange={setSelectedCollectionFolderId}
        onNewCollectionNameChange={setNewCollectionName}
        onCreatingCollectionChange={setIsCreatingCollection}
        onSave={handleSaveToCollection}
      />

      <CurlImportModal
        isOpen={showImportModal}
        value={curlText}
        error={importError}
        onChange={setCurlText}
        onClose={() => setShowImportModal(false)}
        onImport={handleImportCurl}
      />

      <OpenApiImportModal
        isOpen={showOpenApiModal}
        text={openApiText}
        error={openApiError}
        fileName={openApiFileName}
        collectionName={openApiCollectionName}
        onTextChange={(value) => {
          setOpenApiText(value);
          setOpenApiError('');
        }}
        onCollectionNameChange={setOpenApiCollectionName}
        onFileChange={handleOpenApiFileChange}
        onClose={closeOpenApiImport}
        onReset={resetOpenApiImport}
        onImport={handleImportOpenApi}
      />

      {/* Style użytkownika dla scrollbarów */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #030712; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4b5563; }
        .word-break { word-break: break-all; }
      `}} />
    </div>
  );
}
