import { DEFAULT_COLLECTIONS } from '../config/constants.js';
import { createEntityId } from '../utils/ids.js';
import {
  compactGrpcSchemaAsset,
  createPersistableRequestSnapshot,
  expandGrpcSchemaAsset,
  getRequestTabName,
  normalizeRequestSnapshot
} from './request.js';
import {
  PERSISTENCE_FORMATS,
  createPersistenceDocument,
  readCurrentPersistenceDocument
} from './persistence.js';

export const COLLECTION_EXPORT_FORMAT = PERSISTENCE_FORMATS.collections;

export const isCollectionFolder = (node) => node?.type === 'folder';

const compactCollectionNodeSchemas = (node, schemas) => {
  if (isCollectionFolder(node)) {
    return {
      ...node,
      items: node.items.map(item => compactCollectionNodeSchemas(item, schemas))
    };
  }

  if (node.request?.protocol !== 'grpc') return node;
  return {
    ...node,
    request: compactGrpcSchemaAsset(node.request, schemas)
  };
};

const expandCollectionNodeSchemas = (node, schemas) => {
  if (isCollectionFolder(node)) {
    return {
      ...node,
      items: (Array.isArray(node.items) ? node.items : [])
        .map(item => expandCollectionNodeSchemas(item, schemas))
    };
  }

  return {
    ...node,
    request: expandGrpcSchemaAsset(node?.request, schemas)
  };
};

export const createCollectionFolder = (name) => ({
  id: createEntityId('folder'),
  type: 'folder',
  name: String(name || '').trim(),
  expanded: true,
  createdAt: new Date().toISOString(),
  items: []
});

export const collectionItemToSnapshot = (item = {}) => normalizeRequestSnapshot({
  ...item.request,
  requestName: item.request?.requestName || item.name || ''
});

export const getCollectionItemMethod = (item) => {
  const request = collectionItemToSnapshot(item);
  if (request.protocol === 'ws') return 'WS';
  if (request.protocol === 'tcp' || request.protocol === 'udp') return request.protocol.toUpperCase();
  return request.protocol === 'grpc' ? 'gRPC' : request.method;
};

export const getCollectionItemTarget = (item) => {
  const request = collectionItemToSnapshot(item);
  if (request.protocol === 'ws') return request.wsUrl;
  if (request.protocol === 'tcp' || request.protocol === 'udp') return request.networkTarget;
  return request.protocol === 'grpc' ? request.grpcTarget : request.url;
};

export const createCollectionItemFromSnapshot = (snapshot, name = '') => {
  const request = normalizeRequestSnapshot({
    ...snapshot,
    response: null,
    wsConnected: false,
    networkConnected: false,
    collectionItemId: ''
  });
  const itemName = name.trim() || getRequestTabName(request);
  const savedRequest = createPersistableRequestSnapshot({
    ...request,
    requestName: itemName
  });
  return {
    type: 'request',
    id: createEntityId('req'),
    name: itemName,
    createdAt: new Date().toISOString(),
    request: savedRequest
  };
};

const normalizeCollectionItem = (item = {}) => {
  const snapshot = collectionItemToSnapshot(item);
  const name = (item.name || getRequestTabName(snapshot)).trim()
    || getRequestTabName(snapshot);
  return {
    type: 'request',
    id: item.id || createEntityId('req'),
    name,
    createdAt: item.createdAt || new Date().toISOString(),
    ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
    request: createPersistableRequestSnapshot({
      ...snapshot,
      requestName: name,
      response: null,
      collectionItemId: ''
    })
  };
};

export const createCollection = (name) => ({
  id: createEntityId('col'),
  name: name.trim(),
  expanded: true,
  createdAt: new Date().toISOString(),
  items: []
});

const normalizeCollectionNode = (node = {}) => {
  if (isCollectionFolder(node)) {
    const name = String(node.name || 'Folder').trim() || 'Folder';
    return {
      ...node,
      id: node.id || createEntityId('folder'),
      type: 'folder',
      name,
      expanded: node.expanded ?? true,
      createdAt: node.createdAt || new Date().toISOString(),
      items: Array.isArray(node.items) ? node.items.map(normalizeCollectionNode) : []
    };
  }
  return normalizeCollectionItem(node);
};

const normalizeCollection = (collection = {}, index = 0) => ({
  id: collection.id || createEntityId('col'),
  name: (collection.name || `Kolekcja ${index + 1}`).trim() || `Kolekcja ${index + 1}`,
  expanded: collection.expanded ?? true,
  createdAt: collection.createdAt,
  items: Array.isArray(collection.items) ? collection.items.map(normalizeCollectionNode) : []
});

export const normalizeCollections = (value) => {
  const collections = Array.isArray(value) ? value : DEFAULT_COLLECTIONS;
  return collections.map(normalizeCollection);
};

export const createPersistableCollections = (collections) => {
  const grpcSchemas = {};
  const normalizedCollections = normalizeCollections(collections);
  return createPersistenceDocument(COLLECTION_EXPORT_FORMAT, {
    grpcSchemas,
    collections: normalizedCollections.map(collection => ({
      ...collection,
      items: collection.items.map(node => compactCollectionNodeSchemas(node, grpcSchemas))
    }))
  });
};

const isCurrentCollectionNode = (node) => {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  if (node.type === 'folder') {
    return Array.isArray(node.items) && node.items.every(isCurrentCollectionNode);
  }
  return node.type === 'request'
    && node.request
    && typeof node.request === 'object'
    && !Array.isArray(node.request);
};

const isCurrentCollection = (collection) => (
  collection
  && typeof collection === 'object'
  && !Array.isArray(collection)
  && Array.isArray(collection.items)
  && collection.items.every(isCurrentCollectionNode)
);

export const parsePersistedCollections = (value) => {
  const document = readCurrentPersistenceDocument(value, COLLECTION_EXPORT_FORMAT);
  if (
    !document
    || !Array.isArray(document.collections)
    || !document.collections.every(isCurrentCollection)
  ) {
    return null;
  }

  return normalizeCollections(document.collections.map(collection => ({
    ...collection,
    items: (Array.isArray(collection.items) ? collection.items : [])
      .map(node => expandCollectionNodeSchemas(node, document.grpcSchemas))
  })));
};

const createImportedNode = (node = {}) => {
  if (isCollectionFolder(node)) {
    return {
      ...createCollectionFolder(node.name || 'Folder'),
      items: Array.isArray(node.items) ? node.items.map(createImportedNode) : []
    };
  }
  return createCollectionItemFromSnapshot(
    collectionItemToSnapshot(node),
    typeof node?.name === 'string' ? node.name : ''
  );
};

const createImportedCollection = (collection = {}, index = 0) => {
  const name = String(collection.name || `Importowana kolekcja ${index + 1}`).trim()
    || `Importowana kolekcja ${index + 1}`;
  return {
    ...createCollection(name),
    createdAt: typeof collection.createdAt === 'string'
      ? collection.createdAt
      : new Date().toISOString(),
    importedAt: new Date().toISOString(),
    items: Array.isArray(collection.items) ? collection.items.map(createImportedNode) : []
  };
};

const postmanHeaderRows = (headers) => (
  Array.isArray(headers) ? headers : []
).map(header => ({
  key: String(header?.key || ''),
  value: String(header?.value || ''),
  enabled: !header?.disabled
}));

const postmanUrl = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value?.raw === 'string') return value.raw;
  const protocol = value?.protocol ? `${value.protocol}://` : '';
  const host = Array.isArray(value?.host) ? value.host.join('.') : String(value?.host || '');
  const path = Array.isArray(value?.path) ? `/${value.path.join('/')}` : String(value?.path || '');
  const query = Array.isArray(value?.query)
    ? value.query
        .filter(item => !item?.disabled && item?.key)
        .map(item => `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value ?? '')}`)
        .join('&')
    : '';
  return `${protocol}${host}${path}${query ? `?${query}` : ''}`;
};

const postmanBody = (body = {}) => {
  if (body.mode === 'raw') {
    return {
      bodyType: 'raw',
      reqBodyRaw: typeof body.raw === 'string' ? body.raw : ''
    };
  }
  if (body.mode === 'urlencoded') {
    return {
      bodyType: 'urlencoded',
      reqBodyForm: (Array.isArray(body.urlencoded) ? body.urlencoded : [])
        .filter(item => !item?.disabled)
        .map(item => ({ key: String(item?.key || ''), value: String(item?.value || '') }))
    };
  }
  if (body.mode === 'formdata') {
    return {
      bodyType: 'multipart',
      reqBodyMultipart: (Array.isArray(body.formdata) ? body.formdata : [])
        .filter(item => !item?.disabled)
        .map(item => ({
          key: String(item?.key || ''),
          type: item?.type === 'file' ? 'file' : 'text',
          value: item?.type === 'file' ? '' : String(item?.value || ''),
          fileName: item?.type === 'file'
            ? String(Array.isArray(item.src) ? item.src[0] || '' : item.src || '')
            : '',
          mimeType: String(item?.contentType || ''),
          size: 0,
          lastModified: 0,
          dataBase64: null
        }))
    };
  }
  if (body.mode === 'graphql') {
    return {
      bodyType: 'raw',
      reqBodyRaw: JSON.stringify(body.graphql || {}, null, 2)
    };
  }
  return { bodyType: 'none' };
};

const postmanNodeToCollectionNode = (node = {}) => {
  if (Array.isArray(node.item) && !node.request) {
    return {
      ...createCollectionFolder(node.name || 'Folder'),
      items: node.item.map(postmanNodeToCollectionNode).filter(Boolean)
    };
  }
  if (!node.request) return null;

  const request = typeof node.request === 'string'
    ? { method: 'GET', url: node.request }
    : node.request;
  return createCollectionItemFromSnapshot({
    protocol: 'http',
    requestName: String(node.name || 'Postman request'),
    url: postmanUrl(request.url),
    method: String(request.method || 'GET').toUpperCase(),
    reqHeaders: postmanHeaderRows(request.header),
    ...postmanBody(request.body)
  }, String(node.name || 'Postman request'));
};

const postmanCollectionToOmniPort = (value) => ({
  ...createCollection(value?.info?.name || 'Postman Collection'),
  importedAt: new Date().toISOString(),
  sourceFormat: 'postman',
  items: (Array.isArray(value?.item) ? value.item : [])
    .map(postmanNodeToCollectionNode)
    .filter(Boolean)
});

export const serializeCollections = (collections) => JSON.stringify({
  ...createPersistableCollections(collections),
  exportedAt: new Date().toISOString()
}, null, 2);

export const parseCollectionsImport = (text) => {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch {
    throw new Error('Plik nie zawiera poprawnego JSON.');
  }

  if (
    parsed
    && typeof parsed === 'object'
    && parsed.info
    && Array.isArray(parsed.item)
  ) {
    return [postmanCollectionToOmniPort(parsed)];
  }

  const rawCollections = parsePersistedCollections(parsed);
  if (!rawCollections) {
    if (parsed?.format === COLLECTION_EXPORT_FORMAT) {
      throw new Error('Wersja eksportu nie jest obsługiwana przez tę wersję OmniPort.');
    }
    throw new Error('JSON nie zawiera kolekcji OmniPort.');
  }

  if (rawCollections.length === 0) {
    throw new Error('Plik nie zawiera żadnych kolekcji.');
  }
  if (rawCollections.some(collection => !collection || typeof collection !== 'object')) {
    throw new Error('Plik zawiera nieprawidłową definicję kolekcji.');
  }

  return rawCollections.map(createImportedCollection);
};

export const countCollectionRequests = (items = []) => items.reduce((total, node) => (
  total + (isCollectionFolder(node) ? countCollectionRequests(node.items) : 1)
), 0);

export const collectionTreeContains = (items = [], nodeId) => items.some(node => (
  node.id === nodeId
  || (isCollectionFolder(node) && collectionTreeContains(node.items, nodeId))
));

export const findCollectionNode = (items = [], nodeId, parentFolderId = '') => {
  for (let index = 0; index < items.length; index += 1) {
    const node = items[index];
    if (node.id === nodeId) {
      return { node, parentFolderId, index };
    }
    if (isCollectionFolder(node)) {
      const nested = findCollectionNode(node.items, nodeId, node.id);
      if (nested) return nested;
    }
  }
  return null;
};

export const findCollectionItemLocation = (collections, itemId) => {
  if (!itemId) return null;
  for (const collection of collections) {
    const location = findCollectionNode(collection.items, itemId);
    if (location && !isCollectionFolder(location.node)) {
      return { collection, item: location.node, ...location };
    }
  }
  return null;
};

export const getCollectionFolderOptions = (items = [], depth = 0) => items.flatMap(node => {
  if (!isCollectionFolder(node)) return [];
  return [
    { id: node.id, name: node.name, depth },
    ...getCollectionFolderOptions(node.items, depth + 1)
  ];
});

export const updateCollectionTreeNode = (items, nodeId, updater) => items.map(node => {
  if (node.id === nodeId) return updater(node);
  if (!isCollectionFolder(node)) return node;
  return {
    ...node,
    items: updateCollectionTreeNode(node.items, nodeId, updater)
  };
});

export const removeCollectionTreeNode = (items, nodeId) => items.flatMap(node => {
  if (node.id === nodeId) return [];
  if (!isCollectionFolder(node)) return [node];
  return [{
    ...node,
    items: removeCollectionTreeNode(node.items, nodeId)
  }];
});

const extractCollectionTreeNode = (items, nodeId) => {
  for (let index = 0; index < items.length; index += 1) {
    const node = items[index];
    if (node.id === nodeId) {
      return {
        node,
        items: [...items.slice(0, index), ...items.slice(index + 1)]
      };
    }
    if (isCollectionFolder(node)) {
      const nested = extractCollectionTreeNode(node.items, nodeId);
      if (nested.node) {
        const nextItems = [...items];
        nextItems[index] = { ...node, items: nested.items };
        return { node: nested.node, items: nextItems };
      }
    }
  }
  return { node: null, items };
};

const insertCollectionTreeNode = (items, parentFolderId, index, node) => {
  if (!parentFolderId) {
    const targetIndex = Math.min(Math.max(Number(index) || 0, 0), items.length);
    return [...items.slice(0, targetIndex), node, ...items.slice(targetIndex)];
  }
  return items.map(item => {
    if (item.id === parentFolderId && isCollectionFolder(item)) {
      const targetIndex = Math.min(Math.max(Number(index) || 0, 0), item.items.length);
      return {
        ...item,
        expanded: true,
        items: [...item.items.slice(0, targetIndex), node, ...item.items.slice(targetIndex)]
      };
    }
    if (!isCollectionFolder(item)) return item;
    return {
      ...item,
      items: insertCollectionTreeNode(item.items, parentFolderId, index, node)
    };
  });
};

export const moveCollectionTreeNode = (
  collections,
  {
    nodeId,
    targetCollectionId,
    targetNodeId = '',
    targetPlacement = 'before',
    targetParentFolderId = '',
    targetIndex = 0
  }
) => {
  if (!nodeId || nodeId === targetNodeId || nodeId === targetParentFolderId) {
    return collections;
  }
  let movedNode = null;
  let sourceCollectionId = '';
  let withoutSource = collections.map(collection => {
    if (movedNode) return collection;
    const extracted = extractCollectionTreeNode(collection.items, nodeId);
    if (!extracted.node) return collection;
    movedNode = extracted.node;
    sourceCollectionId = collection.id;
    return { ...collection, items: extracted.items };
  });

  if (!movedNode) return collections;

  if (targetNodeId) {
    const targetCollection = withoutSource.find(collection => collection.id === targetCollectionId);
    const targetLocation = targetCollection
      ? findCollectionNode(targetCollection.items, targetNodeId)
      : null;
    if (!targetLocation) return collections;
    targetParentFolderId = targetLocation.parentFolderId;
    targetIndex = targetLocation.index + (targetPlacement === 'after' ? 1 : 0);
  }

  if (
    isCollectionFolder(movedNode)
    && targetParentFolderId
    && collectionTreeContains(movedNode.items, targetParentFolderId)
  ) {
    return collections;
  }
  if (targetParentFolderId) {
    const targetCollection = withoutSource.find(collection => collection.id === targetCollectionId);
    const targetParent = targetCollection
      ? findCollectionNode(targetCollection.items, targetParentFolderId)?.node
      : null;
    if (!isCollectionFolder(targetParent)) return collections;
  }

  let inserted = false;
  withoutSource = withoutSource.map(collection => {
    if (collection.id !== targetCollectionId) return collection;
    inserted = true;
    return {
      ...collection,
      expanded: true,
      updatedAt: new Date().toISOString(),
      items: insertCollectionTreeNode(
        collection.items,
        targetParentFolderId,
        targetIndex,
        movedNode
      )
    };
  });

  if (!inserted) return collections;
  return withoutSource.map(collection => (
    collection.id === sourceCollectionId && sourceCollectionId !== targetCollectionId
      ? { ...collection, updatedAt: new Date().toISOString() }
      : collection
  ));
};
