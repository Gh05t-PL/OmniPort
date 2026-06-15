export const STORAGE_KEYS = {
  collections: 'requester.collections',
  history: 'requester.history',
  layout: 'requester.layout',
  requestSession: 'requester.requestSession',
  sidebarView: 'requester.sidebarView'
};

export const NATIVE_STORAGE_KEYS = {
  collections: 'omniportCollections',
  requestSession: 'omniportRequestSession'
};

export const HISTORY_LIMIT = 30;
export const EXTENSION_ID = 'pl.codesymfony.omniport-http-ext';
export const REQUEST_TIMEOUT_MS = 60000;
export const MULTIPART_FILE_MAX_BYTES = 8 * 1024 * 1024;
export const MULTIPART_TOTAL_MAX_BYTES = 16 * 1024 * 1024;
export const NETWORK_PAYLOAD_MAX_BYTES = 1024 * 1024;
export const COLLECTION_IMPORT_MAX_BYTES = 16 * 1024 * 1024;
export const GRPC_PROTO_FILE_MAX_BYTES = 2 * 1024 * 1024;
export const GRPC_SCHEMA_MAX_BYTES = 8 * 1024 * 1024;
export const GRPC_PROTO_FILE_MAX_COUNT = 128;
export const EXTENSION_DISPATCH_RETRY_MS = 1000;
export const EXTENSION_DISPATCH_RETRY_TIMEOUT_MS = 55000;
export const EXTENSION_ACK_RETRY_MS = 3000;
export const EXTENSION_HEALTH_EVENT = 'extensionHealthCheck';
export const EXTENSION_HEALTH_RESULT_EVENT = 'extensionHealthPong';
export const EXTENSION_CLIENT_LOG_EVENT = 'clientLog';
export const EXTENSION_HEALTH_DISPATCH_TIMEOUT_MS = 5000;
export const EXTENSION_HEALTH_TIMEOUT_MS = 2500;
export const EXTENSION_HEALTH_ATTEMPTS = 2;
export const EXTENSION_CLIENT_LOG_TIMEOUT_MS = 500;
export const NEUTRALINO_NATIVE_CALL_TIMEOUT_MS = 3000;
export const NEUTRALINO_WAKE_PROBE_DELAY_MS = 1000;
export const NEUTRALINO_WAKE_PROBE_INTERVAL_MS = 15000;
export const NEUTRALINO_SLEEP_DRIFT_MS = 45000;
export const NEUTRALINO_RENDERER_RELOAD_COOLDOWN_MS = 60000;
export const NEUTRALINO_RENDERER_RELOAD_KEY = 'requester.neutralinoRendererReloadAt';
export const NEUTRALINO_PROCESS_RESTART_COOLDOWN_MS = 120000;
export const NEUTRALINO_PROCESS_RESTART_KEY = 'requester.neutralinoProcessRestartAt';

export const WINDOW_FALLBACK_SIZE = {
  width: 1280,
  height: 820,
  minWidth: 960,
  minHeight: 620
};

export const WINDOW_RESPONSIVE_SIZE = {
  widthRatio: 0.72,
  heightRatio: 0.78,
  maxWidth: 2200,
  maxHeight: 1400,
  tolerance: 32
};

export const WINDOW_RECOVERY = {
  visibleWidth: 96,
  visibleHeight: 48,
  restoreDelayMs: 80
};

export const DEFAULT_COLLECTIONS = [
  {
    id: 'default-1',
    name: 'Przykładowa Kolekcja',
    expanded: true,
    items: [
      {
        type: 'request',
        id: 'item-1',
        name: 'Pobierz dane testowe',
        request: {
          requestName: 'Pobierz dane testowe',
          protocol: 'http',
          url: 'https://jsonplaceholder.typicode.com/posts/1',
          method: 'GET',
          reqHeaders: [],
          queryParams: [],
          bodyType: 'none',
          reqBodyRaw: '',
          reqBodyForm: [],
          reqBodyMultipart: []
        }
      }
    ]
  }
];

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
