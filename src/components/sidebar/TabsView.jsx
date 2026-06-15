import { useMemo, useState } from 'react';
import { Folder, LoaderCircle, Plus, X } from 'lucide-react';
import { isCollectionFolder } from '../../domain/collections.js';
import { getRequestTabName, normalizeRequestSnapshot } from '../../domain/request.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import { getMethodColor, getStatusColor } from '../../utils/formatters.js';
import SidebarSearch from './SidebarSearch.jsx';

export default function TabsView({
  tabs,
  activeTabId,
  networkReading,
  operationsByTabId = {},
  collections = [],
  dirtyCollectionItemIds = [],
  onAdd,
  onSwitch,
  onClose
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const dirtyCollectionItems = useMemo(
    () => new Set(dirtyCollectionItemIds),
    [dirtyCollectionItemIds]
  );
  const collectionLocations = useMemo(() => {
    const locations = new Map();
    const visitNodes = (nodes, collection, folderNames = []) => {
      nodes.forEach(node => {
        if (isCollectionFolder(node)) {
          visitNodes(node.items, collection, [...folderNames, node.name]);
          return;
        }
        locations.set(node.id, {
          collectionName: collection.name,
          path: [collection.name, ...folderNames].join(' / ')
        });
      });
    };

    collections.forEach(collection => visitNodes(collection.items, collection));
    return locations;
  }, [collections]);
  const visibleTabs = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('pl');
    return tabs.map(tab => {
      const request = normalizeRequestSnapshot(tab.request);
      const method = request.protocol === 'grpc'
        ? 'gRPC'
        : request.protocol === 'ws'
          ? 'WS'
          : request.protocol === 'tcp' || request.protocol === 'udp'
            ? request.protocol.toUpperCase()
            : request.method;
      const target = request.protocol === 'grpc'
        ? request.grpcTarget
        : request.protocol === 'ws'
          ? request.wsUrl
          : request.protocol === 'tcp' || request.protocol === 'udp'
            ? request.networkTarget
            : request.url;
      const status = request.response?.error ? 'ERR' : request.response?.status;
      const name = tab.name || getRequestTabName(request);
      const collectionLocation = collectionLocations.get(request.collectionItemId) || null;
      const isDirty = request.collectionItemId
        ? dirtyCollectionItems.has(request.collectionItemId)
        : false;
      const operation = operationsByTabId[tab.id] || null;

      return { tab, method, target, status, name, collectionLocation, isDirty, operation };
    }).filter(({ method, target, status, name, collectionLocation }) => (
      !query || [method, target, status, name, collectionLocation?.path]
        .some(value => String(value || '').toLocaleLowerCase('pl').includes(query))
    ));
  }, [collectionLocations, dirtyCollectionItems, operationsByTabId, searchQuery, tabs]);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-gray-800 p-2">
        <SidebarSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t('tabs.search')}
        />
        <button
          onClick={onAdd}
          disabled={networkReading}
          className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-800 rounded transition-colors border border-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          title={networkReading ? t('tabs.waitTcp') : t('tabs.new')}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {visibleTabs.length === 0 ? (
          <div className="mt-4 text-center text-xs italic text-gray-600">
            {t('tabs.noResults', { query: searchQuery.trim() })}
          </div>
        ) : visibleTabs.map(({
          tab,
          method,
          target,
          status,
          name,
          collectionLocation,
          isDirty,
          operation
        }) => {
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              className={`group flex items-stretch rounded border overflow-hidden transition-colors ${
                isActive ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-transparent hover:border-gray-800 hover:bg-gray-900'
              }`}
            >
              <button
                onClick={() => onSwitch(tab)}
                disabled={networkReading && !isActive}
                className="min-w-0 flex-1 text-left p-2 disabled:cursor-not-allowed"
                title={networkReading && !isActive
                  ? t('tabs.waitTcp')
                  : undefined}
              >
                <div className="flex items-center justify-between gap-2 text-xs mb-1">
                  <span className={`font-bold ${getMethodColor(method)}`}>{method}</span>
                  {(isDirty || operation || status) && (
                    <span className="inline-flex items-center gap-1.5">
                      {isDirty && (
                        <span
                          className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.65)]"
                          title={t('toolbar.status.dirty')}
                          aria-label={t('toolbar.status.dirty')}
                        />
                      )}
                      {operation ? (
                        <span
                          className="inline-flex items-center gap-1 font-semibold text-indigo-300"
                          title={t('tabs.operationPending', { kind: operation.kind })}
                        >
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          {t('tabs.inProgress')}
                        </span>
                      ) : status && (
                        <span className={`font-bold ${getStatusColor(status)}`}>{status}</span>
                      )}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-200 truncate" title={name}>
                  {name}
                </div>
                {collectionLocation && (
                  <div
                    className="mt-1 inline-flex max-w-full items-center gap-1 rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-300/80"
                    title={collectionLocation.path}
                  >
                    <Folder className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{collectionLocation.collectionName}</span>
                  </div>
                )}
                <div className="text-[11px] text-gray-500 truncate mt-1" title={target}>
                  {target}
                </div>
              </button>
              <button
                onClick={(event) => onClose(tab.id, event)}
                disabled={tabs.length <= 1 || Boolean(operation) || (networkReading && isActive)}
                className="px-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:text-gray-600 disabled:hover:bg-transparent transition-colors"
                title={operation ? t('tabs.waitOperation') : t('tabs.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
