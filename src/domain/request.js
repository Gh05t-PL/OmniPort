import { STORAGE_KEYS } from '../config/constants.js';
import { readFromStorage } from '../services/storage.js';
import { createEntityId, createRequestToken } from '../utils/ids.js';
import {
  base64ToText,
  formatEditableHex,
  textToBase64
} from './network.js';
import {
  PERSISTENCE_FORMATS,
  createPersistenceDocument,
  readCurrentPersistenceDocument
} from './persistence.js';

const DEFAULT_HTTP_BODY_RAW = '{\n  "title": "Nowy Post",\n  "body": "Testowanie układu pionowego i poziomego",\n  "userId": 1\n}';
const DEFAULT_GRPC_BODY_RAW = '{\n  "name": "Requester"\n}';
const DEFAULT_WS_MESSAGE = '{\n  "type": "ping",\n  "payload": "hello"\n}';
const DEFAULT_NETWORK_PAYLOAD = 'hello';
const DEFAULT_NETWORK_PAYLOAD_BASE64 = textToBase64(DEFAULT_NETWORK_PAYLOAD);

const normalizeGrpcProtoFiles = (files) => (
  Array.isArray(files) ? files : []
).flatMap(file => {
  const name = typeof file?.name === 'string'
    ? file.name.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+/g, '/')
    : '';
  if (!name || typeof file?.content !== 'string') return [];
  return [{
    name,
    content: file.content,
    size: Number.isFinite(Number(file.size)) ? Number(file.size) : file.content.length,
    lastModified: Number.isFinite(Number(file.lastModified)) ? Number(file.lastModified) : 0
  }];
});

const normalizeGrpcProtoset = (value) => ({
  fileName: typeof value?.fileName === 'string' ? value.fileName : '',
  size: Number.isFinite(Number(value?.size)) ? Number(value.size) : 0,
  lastModified: Number.isFinite(Number(value?.lastModified)) ? Number(value.lastModified) : 0,
  dataBase64: typeof value?.dataBase64 === 'string' ? value.dataBase64 : ''
});

const cloneRows = (rows, fallback = [], { toggleable = false } = {}) => (
  Array.isArray(rows) ? rows : fallback
).map(item => ({
  key: item?.key || '',
  value: item?.value || '',
  ...(toggleable ? { enabled: item?.enabled !== false } : {})
}));

export const createMultipartRow = (type = 'text') => ({
  id: createEntityId('multipart'),
  key: '',
  type: type === 'file' ? 'file' : 'text',
  value: '',
  fileName: '',
  mimeType: '',
  size: 0,
  lastModified: 0,
  dataBase64: null
});

const normalizeMultipartRows = (rows, fallback = []) => (
  Array.isArray(rows) ? rows : fallback
).map(item => ({
  ...createMultipartRow(item?.type),
  id: item?.id || createEntityId('multipart'),
  key: item?.key || '',
  type: item?.type === 'file' ? 'file' : 'text',
  value: typeof item?.value === 'string' ? item.value : '',
  fileName: typeof item?.fileName === 'string' ? item.fileName : '',
  mimeType: typeof item?.mimeType === 'string' ? item.mimeType : '',
  size: Number.isFinite(Number(item?.size)) ? Number(item.size) : 0,
  lastModified: Number.isFinite(Number(item?.lastModified)) ? Number(item.lastModified) : 0,
  dataBase64: typeof item?.dataBase64 === 'string' ? item.dataBase64 : null
}));

export const createDefaultRequestSnapshot = () => ({
  requestName: '',
  protocol: 'http',
  url: 'https://jsonplaceholder.typicode.com/posts',
  method: 'POST',
  reqHeaders: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
  queryParams: [],
  bodyType: 'raw',
  reqBodyRaw: DEFAULT_HTTP_BODY_RAW,
  reqBodyForm: [{ key: 'username', value: 'admin' }],
  reqBodyMultipart: [createMultipartRow()],
  grpcTarget: 'localhost:50051',
  grpcService: 'helloworld.Greeter',
  grpcMethod: 'SayHello',
  grpcMetadata: [{ key: 'authorization', value: 'Bearer token', enabled: true }],
  grpcBodyRaw: DEFAULT_GRPC_BODY_RAW,
  grpcSchemaMode: 'reflection',
  grpcProtoFiles: [],
  grpcProtoset: normalizeGrpcProtoset(),
  wsUrl: 'wss://echo.websocket.events',
  wsHeaders: [],
  wsMessage: DEFAULT_WS_MESSAGE,
  wsConnectionId: createRequestToken('ws'),
  wsConnected: false,
  networkTarget: 'localhost:9000',
  networkPayload: DEFAULT_NETWORK_PAYLOAD,
  networkPayloadBase64: DEFAULT_NETWORK_PAYLOAD_BASE64,
  networkPayloadHex: formatEditableHex(DEFAULT_NETWORK_PAYLOAD_BASE64),
  networkPayloadMode: 'text',
  networkPayloadFileName: '',
  networkTimeoutMs: 5000,
  networkReadMode: 'idle',
  networkExactBytes: 1,
  networkDelimiterHex: '0d 0a',
  networkLengthPrefixBytes: 4,
  networkLengthPrefixEndian: 'big',
  networkKeepConnection: false,
  networkConnectionId: createRequestToken('tcp'),
  networkConnected: false,
  activeTab: 'body',
  activeResTab: 'body',
  response: null,
  disableReuse: true,
  collectionItemId: ''
});

export const normalizeRequestSnapshot = (snapshot = {}) => {
  const defaults = createDefaultRequestSnapshot();
  const networkPayloadText = typeof snapshot.networkPayload === 'string'
    ? snapshot.networkPayload
    : defaults.networkPayload;
  let networkPayloadBase64 = typeof snapshot.networkPayloadBase64 === 'string'
    ? snapshot.networkPayloadBase64
    : textToBase64(networkPayloadText);
  try {
    base64ToText(networkPayloadBase64);
  } catch {
    networkPayloadBase64 = textToBase64(networkPayloadText);
  }

  return {
    ...defaults,
    ...snapshot,
    requestName: typeof snapshot.requestName === 'string' ? snapshot.requestName : defaults.requestName,
    protocol: ['http', 'grpc', 'ws', 'tcp', 'udp'].includes(snapshot.protocol) ? snapshot.protocol : 'http',
    url: typeof snapshot.url === 'string' ? snapshot.url : defaults.url,
    method: snapshot.method || defaults.method,
    reqHeaders: cloneRows(snapshot.reqHeaders, defaults.reqHeaders, { toggleable: true }),
    queryParams: cloneRows(snapshot.queryParams, defaults.queryParams, { toggleable: true }),
    bodyType: ['none', 'raw', 'urlencoded', 'multipart'].includes(snapshot.bodyType)
      ? snapshot.bodyType
      : defaults.bodyType,
    reqBodyRaw: typeof snapshot.reqBodyRaw === 'string' ? snapshot.reqBodyRaw : defaults.reqBodyRaw,
    reqBodyForm: cloneRows(snapshot.reqBodyForm, defaults.reqBodyForm),
    reqBodyMultipart: normalizeMultipartRows(snapshot.reqBodyMultipart, defaults.reqBodyMultipart),
    grpcTarget: typeof snapshot.grpcTarget === 'string' ? snapshot.grpcTarget : defaults.grpcTarget,
    grpcService: typeof snapshot.grpcService === 'string' ? snapshot.grpcService : defaults.grpcService,
    grpcMethod: typeof snapshot.grpcMethod === 'string' ? snapshot.grpcMethod : defaults.grpcMethod,
    grpcMetadata: cloneRows(snapshot.grpcMetadata, defaults.grpcMetadata, { toggleable: true }),
    grpcBodyRaw: typeof snapshot.grpcBodyRaw === 'string' ? snapshot.grpcBodyRaw : defaults.grpcBodyRaw,
    grpcSchemaMode: ['reflection', 'proto', 'protoset'].includes(snapshot.grpcSchemaMode)
      ? snapshot.grpcSchemaMode
      : defaults.grpcSchemaMode,
    grpcProtoFiles: normalizeGrpcProtoFiles(snapshot.grpcProtoFiles),
    grpcProtoset: normalizeGrpcProtoset(snapshot.grpcProtoset),
    wsUrl: typeof snapshot.wsUrl === 'string' ? snapshot.wsUrl : defaults.wsUrl,
    wsHeaders: cloneRows(snapshot.wsHeaders, defaults.wsHeaders, { toggleable: true }),
    wsMessage: typeof snapshot.wsMessage === 'string' ? snapshot.wsMessage : defaults.wsMessage,
    wsConnectionId: typeof snapshot.wsConnectionId === 'string' && snapshot.wsConnectionId
      ? snapshot.wsConnectionId
      : createRequestToken('ws'),
    wsConnected: Boolean(snapshot.wsConnected),
    networkTarget: typeof snapshot.networkTarget === 'string'
      ? snapshot.networkTarget
      : defaults.networkTarget,
    networkPayload: typeof snapshot.networkPayload === 'string'
      ? snapshot.networkPayload
      : base64ToText(networkPayloadBase64),
    networkPayloadBase64,
    networkPayloadHex: typeof snapshot.networkPayloadHex === 'string'
      ? snapshot.networkPayloadHex
      : formatEditableHex(networkPayloadBase64),
    networkPayloadMode: snapshot.networkPayloadMode === 'hex' ? 'hex' : 'text',
    networkPayloadFileName: typeof snapshot.networkPayloadFileName === 'string'
      ? snapshot.networkPayloadFileName
      : '',
    networkTimeoutMs: Number.isFinite(Number(snapshot.networkTimeoutMs))
      ? Math.min(Math.max(Math.round(Number(snapshot.networkTimeoutMs)), 100), 60000)
      : defaults.networkTimeoutMs,
    networkReadMode: ['idle', 'close', 'exact', 'delimiter', 'length-prefix'].includes(snapshot.networkReadMode)
      ? snapshot.networkReadMode
      : defaults.networkReadMode,
    networkExactBytes: Number.isFinite(Number(snapshot.networkExactBytes))
      ? Math.min(Math.max(Math.round(Number(snapshot.networkExactBytes)), 1), 1024 * 1024)
      : defaults.networkExactBytes,
    networkDelimiterHex: typeof snapshot.networkDelimiterHex === 'string'
      ? snapshot.networkDelimiterHex
      : defaults.networkDelimiterHex,
    networkLengthPrefixBytes: [1, 2, 4, 8].includes(Number(snapshot.networkLengthPrefixBytes))
      ? Number(snapshot.networkLengthPrefixBytes)
      : defaults.networkLengthPrefixBytes,
    networkLengthPrefixEndian: snapshot.networkLengthPrefixEndian === 'little' ? 'little' : 'big',
    networkKeepConnection: Boolean(snapshot.networkKeepConnection),
    networkConnectionId: typeof snapshot.networkConnectionId === 'string' && snapshot.networkConnectionId
      ? snapshot.networkConnectionId
      : createRequestToken('tcp'),
    networkConnected: Boolean(snapshot.networkConnected),
    activeTab: snapshot.activeTab || defaults.activeTab,
    activeResTab: snapshot.activeResTab || defaults.activeResTab,
    response: snapshot.response || null,
    disableReuse: snapshot.disableReuse ?? defaults.disableReuse,
    collectionItemId: typeof snapshot.collectionItemId === 'string'
      ? snapshot.collectionItemId
      : defaults.collectionItemId
  };
};

const persistableMultipartRows = (rows) => rows.map(item => ({
  ...item,
  dataBase64: null
}));

const emptyGrpcProtoset = () => ({
  fileName: '',
  size: 0,
  lastModified: 0,
  dataBase64: ''
});

const hashString = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const compactGrpcSchemaAsset = (request, schemas) => {
  if (request?.protocol !== 'grpc' || request.grpcSchemaMode === 'reflection') {
    return request;
  }

  const schema = request.grpcSchemaMode === 'proto'
    ? {
        mode: 'proto',
        protoFiles: request.grpcProtoFiles
      }
    : {
        mode: 'protoset',
        protoset: request.grpcProtoset
      };
  const serializedSchema = JSON.stringify(schema);
  const baseId = `grpc-schema-${hashString(serializedSchema)}`;
  let schemaId = baseId;
  let collisionIndex = 2;

  while (
    schemas[schemaId]
    && JSON.stringify(schemas[schemaId]) !== serializedSchema
  ) {
    schemaId = `${baseId}-${collisionIndex}`;
    collisionIndex += 1;
  }
  schemas[schemaId] = schema;

  return {
    ...request,
    grpcSchemaRef: schemaId,
    grpcProtoFiles: [],
    grpcProtoset: emptyGrpcProtoset()
  };
};

export const expandGrpcSchemaAsset = (request, schemas) => {
  const schema = request?.grpcSchemaRef
    ? schemas?.[request.grpcSchemaRef]
    : null;
  if (!schema) return request;

  const requestWithoutRef = { ...request };
  delete requestWithoutRef.grpcSchemaRef;
  return {
    ...requestWithoutRef,
    grpcSchemaMode: schema.mode,
    grpcProtoFiles: schema.mode === 'proto'
      ? schema.protoFiles
      : [],
    grpcProtoset: schema.mode === 'protoset'
      ? schema.protoset
      : emptyGrpcProtoset()
  };
};

export const createPersistableRequestSnapshot = (
  snapshot,
  { includeResponse = false } = {}
) => {
  const request = normalizeRequestSnapshot(snapshot);
  const common = {
    requestName: request.requestName,
    protocol: request.protocol,
    activeTab: request.activeTab,
    activeResTab: request.activeResTab,
    disableReuse: request.disableReuse,
    collectionItemId: request.collectionItemId
  };

  if (includeResponse) {
    common.response = request.response;
  }

  if (request.protocol === 'grpc') {
    return {
      ...common,
      grpcTarget: request.grpcTarget,
      grpcService: request.grpcService,
      grpcMethod: request.grpcMethod,
      grpcMetadata: request.grpcMetadata,
      grpcBodyRaw: request.grpcBodyRaw,
      grpcSchemaMode: request.grpcSchemaMode,
      grpcProtoFiles: request.grpcProtoFiles,
      grpcProtoset: request.grpcProtoset
    };
  }

  if (request.protocol === 'ws') {
    return {
      ...common,
      wsUrl: request.wsUrl,
      wsHeaders: request.wsHeaders,
      wsMessage: request.wsMessage
    };
  }

  if (request.protocol === 'tcp' || request.protocol === 'udp') {
    return {
      ...common,
      networkTarget: request.networkTarget,
      networkPayloadBase64: request.networkPayloadBase64,
      networkPayloadMode: request.networkPayloadMode,
      networkPayloadFileName: request.networkPayloadFileName,
      networkTimeoutMs: request.networkTimeoutMs,
      networkReadMode: request.networkReadMode,
      networkExactBytes: request.networkExactBytes,
      networkDelimiterHex: request.networkDelimiterHex,
      networkLengthPrefixBytes: request.networkLengthPrefixBytes,
      networkLengthPrefixEndian: request.networkLengthPrefixEndian,
      networkKeepConnection: request.networkKeepConnection
    };
  }

  return {
    ...common,
    url: request.url,
    method: request.method,
    reqHeaders: request.reqHeaders,
    queryParams: request.queryParams,
    bodyType: request.bodyType,
    reqBodyRaw: request.bodyType === 'raw' ? request.reqBodyRaw : '',
    reqBodyForm: request.bodyType === 'urlencoded' ? request.reqBodyForm : [],
    reqBodyMultipart: request.bodyType === 'multipart'
      ? persistableMultipartRows(request.reqBodyMultipart)
      : []
  };
};

export const getRequestTabName = (snapshot) => {
  const request = normalizeRequestSnapshot(snapshot);
  if (request.requestName.trim()) {
    return request.requestName.trim();
  }
  if (request.protocol === 'grpc') {
    const methodPath = `${request.grpcService || 'Service'}/${request.grpcMethod || 'Method'}`;
    return `gRPC ${methodPath}`;
  }
  if (request.protocol === 'ws') {
    try {
      const parsedUrl = new URL(request.wsUrl);
      const path = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname;
      return `WS ${parsedUrl.hostname}${path}`.trim();
    } catch {
      return `WS ${request.wsUrl || 'WebSocket'}`.trim();
    }
  }
  if (request.protocol === 'tcp' || request.protocol === 'udp') {
    return `${request.protocol.toUpperCase()} ${request.networkTarget || 'host:port'}`.trim();
  }

  try {
    const parsedUrl = new URL(request.url);
    const path = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname;
    return `${request.method} ${parsedUrl.hostname}${path}`.trim();
  } catch {
    return `${request.method} ${request.url || 'HTTP request'}`.trim();
  }
};

export const createComparableRequestSnapshot = (snapshot) => {
  const request = normalizeRequestSnapshot(snapshot);
  const base = {
    requestName: request.requestName.trim(),
    protocol: request.protocol
  };

  if (request.protocol === 'grpc') {
    return {
      ...base,
      grpcTarget: request.grpcTarget,
      grpcService: request.grpcService,
      grpcMethod: request.grpcMethod,
      grpcMetadata: request.grpcMetadata,
      grpcBodyRaw: request.grpcBodyRaw,
      grpcSchemaMode: request.grpcSchemaMode,
      grpcProtoFiles: request.grpcProtoFiles,
      grpcProtoset: request.grpcProtoset
    };
  }

  if (request.protocol === 'ws') {
    return {
      ...base,
      wsUrl: request.wsUrl,
      wsHeaders: request.wsHeaders,
      wsMessage: request.wsMessage
    };
  }

  if (request.protocol === 'tcp' || request.protocol === 'udp') {
    return {
      ...base,
      networkTarget: request.networkTarget,
      networkPayloadBase64: request.networkPayloadBase64,
      networkPayloadMode: request.networkPayloadMode,
      networkPayloadFileName: request.networkPayloadFileName,
      networkTimeoutMs: request.networkTimeoutMs,
      networkReadMode: request.networkReadMode,
      networkExactBytes: request.networkExactBytes,
      networkDelimiterHex: request.networkDelimiterHex,
      networkLengthPrefixBytes: request.networkLengthPrefixBytes,
      networkLengthPrefixEndian: request.networkLengthPrefixEndian,
      networkKeepConnection: request.networkKeepConnection
    };
  }

  const httpRequest = {
    ...base,
    url: request.url,
    method: request.method,
    reqHeaders: request.reqHeaders,
    queryParams: request.queryParams,
    bodyType: request.bodyType,
    disableReuse: request.disableReuse
  };

  if (request.bodyType === 'raw') {
    httpRequest.reqBodyRaw = request.reqBodyRaw;
  } else if (request.bodyType === 'urlencoded') {
    httpRequest.reqBodyForm = request.reqBodyForm;
  } else if (request.bodyType === 'multipart') {
    httpRequest.reqBodyMultipart = request.reqBodyMultipart.map(item => ({
      key: item.key,
      type: item.type,
      value: item.type === 'text' ? item.value : '',
      fileName: item.type === 'file' ? item.fileName : '',
      mimeType: item.type === 'file' ? item.mimeType : '',
      size: item.type === 'file' ? item.size : 0,
      lastModified: item.type === 'file' ? item.lastModified : 0
    }));
  }

  return httpRequest;
};

export const areRequestSnapshotsEqual = (left, right) => (
  JSON.stringify(createComparableRequestSnapshot(left))
  === JSON.stringify(createComparableRequestSnapshot(right))
);

export const createRequestTab = (request = createDefaultRequestSnapshot(), name) => {
  const normalizedRequest = normalizeRequestSnapshot(request);
  return {
    id: createRequestToken('tab'),
    name: name || getRequestTabName(normalizedRequest),
    request: normalizedRequest
  };
};

export const createPersistableRequestSession = ({
  tabs,
  activeTabId,
  updatedAt = 0
}) => {
  const grpcSchemas = {};
  return createPersistenceDocument(PERSISTENCE_FORMATS.requestSession, {
    tabs: (Array.isArray(tabs) ? tabs : []).map(tab => ({
      id: tab.id,
      name: tab.name,
      request: compactGrpcSchemaAsset(
        createPersistableRequestSnapshot(tab.request),
        grpcSchemas
      )
    })),
    activeTabId,
    updatedAt,
    grpcSchemas
  });
};

const normalizeRequestTab = (tab) => {
  const storedRequest = normalizeRequestSnapshot(tab?.request);
  const request = storedRequest.protocol === 'ws'
    ? normalizeRequestSnapshot({
        ...storedRequest,
        wsConnectionId: createRequestToken('ws'),
        wsConnected: false
      })
    : storedRequest.protocol === 'tcp'
      ? normalizeRequestSnapshot({
          ...storedRequest,
          networkConnectionId: createRequestToken('tcp'),
          networkConnected: false
        })
    : storedRequest;
  return {
    id: tab?.id || createRequestToken('tab'),
    name: tab?.name || getRequestTabName(request),
    request
  };
};

export const normalizeRequestSession = (value = {}) => {
  const storedTabs = Array.isArray(value.tabs) && value.tabs.length > 0
    ? value.tabs.map(tab => ({
        ...tab,
        request: expandGrpcSchemaAsset(tab?.request, value.grpcSchemas)
      }))
    : null;
  const tabs = storedTabs
    ? storedTabs.map(normalizeRequestTab)
    : [createRequestTab()];
  const activeTab = tabs.find(tab => tab.id === value.activeTabId) || tabs[0];

  return {
    tabs,
    activeTabId: activeTab.id,
    request: normalizeRequestSnapshot(activeTab.request),
    updatedAt: Number.isFinite(Number(value.updatedAt))
      ? Number(value.updatedAt)
      : 0
  };
};

export const parsePersistedRequestSession = (value) => {
  const document = readCurrentPersistenceDocument(
    value,
    PERSISTENCE_FORMATS.requestSession
  );
  if (
    !document
    || !Array.isArray(document.tabs)
    || document.tabs.length === 0
    || document.tabs.some(tab => (
      !tab
      || typeof tab !== 'object'
      || !tab.request
      || typeof tab.request !== 'object'
      || Array.isArray(tab.request)
    ))
  ) {
    return null;
  }
  return normalizeRequestSession(document);
};

export const createInitialRequestSession = () => {
  const storedSession = readFromStorage(STORAGE_KEYS.requestSession, null);
  return parsePersistedRequestSession(storedSession) || normalizeRequestSession();
};
