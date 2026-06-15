import { createStore } from 'zustand/vanilla';

const STATE_SETTERS = {
  requestName: 'setRequestName',
  protocol: 'setProtocol',
  url: 'setUrl',
  method: 'setMethod',
  reqHeaders: 'setReqHeaders',
  queryParams: 'setQueryParams',
  bodyType: 'setBodyType',
  reqBodyRaw: 'setReqBodyRaw',
  reqBodyForm: 'setReqBodyForm',
  reqBodyMultipart: 'setReqBodyMultipart',
  grpcTarget: 'setGrpcTarget',
  grpcService: 'setGrpcService',
  grpcMethod: 'setGrpcMethod',
  grpcMetadata: 'setGrpcMetadata',
  grpcBodyRaw: 'setGrpcBodyRaw',
  grpcSchemaMode: 'setGrpcSchemaMode',
  grpcProtoFiles: 'setGrpcProtoFiles',
  grpcProtoset: 'setGrpcProtoset',
  wsUrl: 'setWsUrl',
  wsHeaders: 'setWsHeaders',
  wsMessage: 'setWsMessage',
  wsConnectionId: 'setWsConnectionId',
  wsConnected: 'setWsConnected',
  networkTarget: 'setNetworkTarget',
  networkPayload: 'setNetworkPayload',
  networkPayloadBase64: 'setNetworkPayloadBase64',
  networkPayloadHex: 'setNetworkPayloadHex',
  networkPayloadMode: 'setNetworkPayloadMode',
  networkPayloadFileName: 'setNetworkPayloadFileName',
  networkTimeoutMs: 'setNetworkTimeoutMs',
  networkReadMode: 'setNetworkReadMode',
  networkExactBytes: 'setNetworkExactBytes',
  networkDelimiterHex: 'setNetworkDelimiterHex',
  networkLengthPrefixBytes: 'setNetworkLengthPrefixBytes',
  networkLengthPrefixEndian: 'setNetworkLengthPrefixEndian',
  networkKeepConnection: 'setNetworkKeepConnection',
  networkConnectionId: 'setNetworkConnectionId',
  networkConnected: 'setNetworkConnected',
  networkReading: 'setNetworkReading',
  networkActiveRequestId: 'setNetworkActiveRequestId',
  activeTab: 'setActiveTab',
  activeResTab: 'setActiveResTab',
  wsAutoScroll: 'setWsAutoScroll',
  operationsByTabId: 'setOperationsByTabId',
  response: 'setResponse',
  copied: 'setCopied',
  layout: 'setLayout',
  disableReuse: 'setDisableReuse',
  activeCollectionItemId: 'setActiveCollectionItemId',
  activeHistoryItemId: 'setActiveHistoryItemId',
  isSidebarOpen: 'setIsSidebarOpen',
  sidebarView: 'setSidebarView',
  history: 'setHistory',
  collections: 'setCollections',
  requestTabsState: 'setRequestTabsState',
  activeRequestTabId: 'setActiveRequestTabId',
  showImportModal: 'setShowImportModal',
  curlText: 'setCurlText',
  importError: 'setImportError',
  showOpenApiModal: 'setShowOpenApiModal',
  openApiText: 'setOpenApiText',
  openApiError: 'setOpenApiError',
  openApiFileName: 'setOpenApiFileName',
  openApiCollectionName: 'setOpenApiCollectionName',
  showSaveModal: 'setShowSaveModal',
  saveReqName: 'setSaveReqName',
  selectedCollectionId: 'setSelectedCollectionId',
  newCollectionName: 'setNewCollectionName',
  isCreatingCollection: 'setIsCreatingCollection',
  newSidebarCollectionName: 'setNewSidebarCollectionName',
  editingCollectionId: 'setEditingCollectionId',
  editingCollectionName: 'setEditingCollectionName',
  editingCollectionItem: 'setEditingCollectionItem',
  editingCollectionItemName: 'setEditingCollectionItemName'
};

const resolveStateUpdate = (update, previousValue) => (
  typeof update === 'function' ? update(previousValue) : update
);

export const createOmniPortStore = (initialState) => createStore((set) => {
  const setters = Object.entries(STATE_SETTERS).reduce((actions, [field, setterName]) => {
    actions[setterName] = (update) => {
      set(state => ({ [field]: resolveStateUpdate(update, state[field]) }));
    };
    return actions;
  }, {});

  return {
    ...initialState,
    ...setters
  };
});
