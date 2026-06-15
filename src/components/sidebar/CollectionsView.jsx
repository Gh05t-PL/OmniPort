import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Wifi,
  X
} from 'lucide-react';
import {
  countCollectionRequests,
  getCollectionItemMethod,
  getCollectionItemTarget,
  isCollectionFolder
} from '../../domain/collections.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import { getMethodColor } from '../../utils/formatters.js';
import SidebarSearch from './SidebarSearch.jsx';

const includesCollectionQuery = (value, query) => (
  String(value || '').toLocaleLowerCase('pl').includes(query)
);

const filterCollectionNodes = (nodes, query) => nodes.reduce((matches, node) => {
  if (isCollectionFolder(node)) {
    const filteredItems = filterCollectionNodes(node.items, query);
    if (includesCollectionQuery(node.name, query)) {
      matches.push({ ...node, expanded: true });
    } else if (filteredItems.length > 0) {
      matches.push({ ...node, expanded: true, items: filteredItems });
    }
    return matches;
  }

  if ([
    node.name,
    getCollectionItemMethod(node),
    getCollectionItemTarget(node)
  ].some(value => includesCollectionQuery(value, query))) {
    matches.push(node);
  }
  return matches;
}, []);

const filterCollections = (collections, query) => {
  if (!query) return collections;
  return collections.reduce((matches, collection) => {
    if (includesCollectionQuery(collection.name, query)) {
      matches.push({ ...collection, expanded: true });
      return matches;
    }

    const filteredItems = filterCollectionNodes(collection.items, query);
    if (filteredItems.length > 0) {
      matches.push({
        ...collection,
        expanded: true,
        items: filteredItems
      });
    }
    return matches;
  }, []);
};

const countOpenWebsockets = (nodes, openWebsocketItemIds) => nodes.reduce((total, node) => (
  total + (
    isCollectionFolder(node)
      ? countOpenWebsockets(node.items, openWebsocketItemIds)
      : openWebsocketItemIds.has(node.id) ? 1 : 0
  )
), 0);

const FolderComposer = ({
  depth,
  value,
  onChange,
  onCancel,
  onSave
}) => {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center gap-1 py-1 pr-1"
      style={{ paddingLeft: `${Math.min(depth, 8) * 14 + 28}px` }}
    >
      <FolderPlus className="w-3.5 h-3.5 flex-shrink-0 text-yellow-500" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSave();
          if (event.key === 'Escape') onCancel();
        }}
        className="min-w-0 flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
        placeholder={t('collections.folderName')}
        autoFocus
      />
      <button type="button" onClick={onSave} disabled={!value.trim()} className="p-1 text-gray-500 hover:text-green-400 disabled:opacity-30" title={t('collections.addFolder')}>
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onCancel} className="p-1 text-gray-500 hover:text-white" title={t('common.cancel')}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

const FOLDER_MENU_WIDTH = 126-16;
const FOLDER_MENU_HEIGHT = 34-4-3;
const FOLDER_MENU_GAP = 4;

const FolderActionsMenu = ({
  onAddRequest,
  onAddFolder,
  onRename,
  onDelete
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const closeMenu = (event) => {
      if (
        buttonRef.current?.contains(event.target)
        || menuRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const closeOnViewportChange = () => setOpen(false);

    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [open]);

  const toggleMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }

    const bounds = buttonRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const opensUpward = bounds.bottom + FOLDER_MENU_GAP + FOLDER_MENU_HEIGHT
      > window.innerHeight - 8;
    setPosition({
      top: opensUpward
        ? Math.max(8, bounds.top - FOLDER_MENU_GAP - FOLDER_MENU_HEIGHT)
        : bounds.bottom + FOLDER_MENU_GAP - 3,
      left: Math.min(
        window.innerWidth - FOLDER_MENU_WIDTH - 8,
        Math.max(8, bounds.right - FOLDER_MENU_WIDTH)
      )
    });
    setOpen(true);
  };

  const runAction = (callback) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    callback(event);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        draggable={false}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={toggleMenu}
        className={`rounded p-1 transition-colors ${
          open
            ? 'bg-gray-800 text-gray-200'
            : 'text-gray-700 opacity-0 hover:bg-gray-800 hover:text-gray-300 group-hover:opacity-100 focus:opacity-100'
        }`}
        title={t('collections.folderActions')}
        aria-label={t('collections.folderActions')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[100] flex w-[110px] items-center justify-center gap-1 overflow-hidden rounded-md border border-gray-700 bg-gray-900 p-1 shadow-2xl shadow-black/50"
          style={position}
        >
          <button
            type="button"
            role="menuitem"
            onClick={runAction(onAddRequest)}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-indigo-500/10 hover:text-indigo-300"
            title={t('collections.addCurrentToFolder')}
            aria-label={t('collections.addCurrentToFolder')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={runAction(onAddFolder)}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-yellow-500/10 hover:text-yellow-400"
            title={t('collections.addSubfolder')}
            aria-label={t('collections.addSubfolder')}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={runAction(onRename)}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-800 hover:text-gray-200"
            title={t('collections.renameFolder')}
            aria-label={t('collections.renameFolder')}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <div className="mx-0.5 h-4 border-l border-gray-700" />
          <button
            type="button"
            role="menuitem"
            onClick={runAction(onDelete)}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-red-500/10 hover:text-red-400"
            title={t('collections.deleteFolder')}
            aria-label={t('collections.deleteFolder')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>,
        document.body
      )}
    </>
  );
};

function CollectionTreeNode({
  node,
  collectionId,
  depth,
  activeCollectionItemId,
  openWebsocketItemIds,
  dirtyCollectionItemIds,
  editingCollectionItem,
  editingCollectionItemName,
  folderComposer,
  folderName,
  draggedNodeId,
  dragOverKey,
  actions,
  onFolderNameChange,
  onStartFolder,
  onCancelFolder,
  onCommitFolder,
  onDragStart,
  onDragEnd,
  onDragOverKeyChange,
  isFiltering
}) {
  const { t } = useTranslation();
  const isFolder = isCollectionFolder(node);
  const isEditing = editingCollectionItem?.collectionId === collectionId
    && editingCollectionItem?.itemId === node.id;
  const isActive = !isFolder && node.id === activeCollectionItemId;
  const isOpenWebsocket = !isFolder && openWebsocketItemIds.has(node.id);
  const isDirty = !isFolder && dirtyCollectionItemIds.has(node.id);
  const openWebsocketCount = isFolder
    ? countOpenWebsockets(node.items, openWebsocketItemIds)
    : 0;
  const beforeDropKey = `before:${collectionId}:${node.id}`;
  const afterDropKey = `after:${collectionId}:${node.id}`;
  const insideDropKey = `inside:${collectionId}:${node.id}`;
  const isBeforeDropActive = dragOverKey === beforeDropKey;
  const isAfterDropActive = dragOverKey === afterDropKey;
  const isInsideDropActive = dragOverKey === insideDropKey;
  const paddingLeft = `${Math.min(depth, 8) * 14 + 4}px`;

  const dropRelativeToNode = (event, placement = 'before') => {
    if (isFiltering) return;
    event.preventDefault();
    event.stopPropagation();
    const movingNodeId = draggedNodeId || event.dataTransfer.getData('text/plain');
    if (!movingNodeId) return;
    actions.handleMoveCollectionItem({
      nodeId: movingNodeId,
      targetCollectionId: collectionId,
      targetNodeId: node.id,
      targetPlacement: placement
    });
    onDragEnd();
  };

  const setRelativeDropFromPointer = (event, upperPlacement = 'before') => {
    if (isFiltering) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const isLowerHalf = event.clientY >= bounds.top + bounds.height / 2;
    onDragOverKeyChange(isLowerHalf ? afterDropKey : (
      upperPlacement === 'inside' ? insideDropKey : beforeDropKey
    ));
  };

  const dropFromPointer = (event, upperPlacement = 'before') => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const isLowerHalf = event.clientY >= bounds.top + bounds.height / 2;
    if (isLowerHalf) {
      dropRelativeToNode(event, 'after');
      return;
    }
    if (upperPlacement === 'inside') {
      dropInsideFolder(event);
      return;
    }
    dropRelativeToNode(event, 'before');
  };

  const dropInsideFolder = (event) => {
    if (isFiltering) return;
    event.preventDefault();
    event.stopPropagation();
    const movingNodeId = draggedNodeId || event.dataTransfer.getData('text/plain');
    if (!movingNodeId || !isFolder) return;
    actions.handleMoveCollectionItem({
      nodeId: movingNodeId,
      targetCollectionId: collectionId,
      targetParentFolderId: node.id,
      targetIndex: node.items.length
    });
    onDragEnd();
  };

  return (
    <div>
      {!isFiltering && (
        <div
          className="relative z-10 -my-1 h-3"
          onDragEnter={() => onDragOverKeyChange(beforeDropKey)}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            onDragOverKeyChange(beforeDropKey);
          }}
          onDrop={(event) => dropRelativeToNode(event, 'before')}
        >
          <div className={`absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-full transition-all ${
            isBeforeDropActive
              ? 'h-1 bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.65)]'
              : 'h-0.5 bg-transparent'
          }`} />
        </div>
      )}

      {isEditing ? (
        <div className="pr-1 py-1 flex items-center gap-1" style={{ paddingLeft }}>
          <input
            type="text"
            value={editingCollectionItemName}
            onChange={(event) => actions.setEditingCollectionItemName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') actions.handleCommitEditCollectionItem(event);
              if (event.key === 'Escape') actions.handleCancelEditCollectionItem(event);
            }}
            className="min-w-0 flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
            autoFocus
          />
          <button type="button" onClick={actions.handleCommitEditCollectionItem} disabled={!editingCollectionItemName.trim()} className="p-1 text-gray-500 hover:text-green-400 disabled:opacity-40" title={t('collections.saveName')}>
            <Check className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={actions.handleCancelEditCollectionItem} className="p-1 text-gray-500 hover:text-white" title={t('common.cancel')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : isFolder ? (
        <div
          draggable={!isFiltering}
          onDragStart={(event) => onDragStart(event, node.id)}
          onDragEnd={onDragEnd}
          onDragEnter={(event) => setRelativeDropFromPointer(event, 'inside')}
          onDragOver={(event) => {
            if (isFiltering) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            setRelativeDropFromPointer(event, 'inside');
          }}
          onDrop={(event) => dropFromPointer(event, 'inside')}
          className={`group relative flex min-h-9 items-center gap-1 rounded border transition-colors ${
            isInsideDropActive
              ? 'border-indigo-400 bg-indigo-500/15 shadow-[inset_0_0_0_1px_rgba(129,140,248,0.18)]'
              : isAfterDropActive
                ? 'border-transparent bg-gray-900'
              : 'border-transparent hover:bg-gray-900'
          } ${draggedNodeId === node.id ? 'opacity-40' : ''}`}
          style={{ paddingLeft }}
        >
          {isAfterDropActive && (
            <div className="pointer-events-none absolute inset-x-1 -bottom-0.5 z-20 h-1 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.65)]" />
          )}
          <GripVertical className={`w-3.5 h-3.5 flex-shrink-0 text-gray-700 ${
            isFiltering ? 'invisible' : 'cursor-grab group-hover:text-gray-500'
          }`} />
          <button
            type="button"
            onClick={() => {
              if (!isFiltering) actions.handleToggleCollectionFolder(collectionId, node.id);
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left"
          >
            {node.expanded
              ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" />
              : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" />}
            <Folder className="w-3.5 h-3.5 flex-shrink-0 text-yellow-500/85" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-300" title={node.name}>
              {node.name}
            </span>
            {openWebsocketCount > 0 && (
              <span
                className="mr-1 inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300"
                title={t('collections.activeWs', { count: openWebsocketCount })}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {openWebsocketCount}
              </span>
            )}
            <span className="mr-1 text-[10px] text-gray-600">{countCollectionRequests(node.items)}</span>
          </button>
          <FolderActionsMenu
            onAddRequest={(event) => (
              actions.handleQuickAddCurrentRequestToCollection(event, collectionId, node.id)
            )}
            onAddFolder={(event) => {
              if (!node.expanded) {
                actions.handleToggleCollectionFolder(collectionId, node.id);
              }
              onStartFolder(collectionId, node.id);
            }}
            onRename={(event) => (
              actions.handleStartEditCollectionItem(event, collectionId, node)
            )}
            onDelete={(event) => (
              actions.handleDeleteCollectionItem(event, collectionId, node.id)
            )}
          />
        </div>
      ) : (
        <div
          draggable={!isFiltering}
          onDragStart={(event) => onDragStart(event, node.id)}
          onDragEnd={onDragEnd}
          onDragEnter={(event) => setRelativeDropFromPointer(event)}
          onDragOver={(event) => {
            if (isFiltering) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            setRelativeDropFromPointer(event);
          }}
          onDrop={(event) => dropFromPointer(event)}
          className={`group relative flex min-h-10 items-center gap-1 rounded border transition-colors ${
            isBeforeDropActive
              ? 'border-indigo-400 bg-indigo-500/15 shadow-[inset_0_0_0_1px_rgba(129,140,248,0.18)]'
              : isAfterDropActive
                ? 'border-transparent bg-gray-900'
              : isActive
              ? 'bg-indigo-500/10 border-indigo-500/40'
              : 'border-transparent hover:bg-gray-900'
          } ${draggedNodeId === node.id ? 'opacity-40' : ''}`}
          style={{ paddingLeft }}
        >
          {isBeforeDropActive && (
            <div className="pointer-events-none absolute inset-x-1 -top-0.5 z-20 h-1 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.65)]" />
          )}
          {isAfterDropActive && (
            <div className="pointer-events-none absolute inset-x-1 -bottom-0.5 z-20 h-1 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.65)]" />
          )}
          <GripVertical className={`w-3.5 h-3.5 flex-shrink-0 text-gray-700 ${
            isFiltering ? 'invisible' : 'cursor-grab group-hover:text-gray-500'
          }`} />
          <button type="button" onClick={() => actions.loadCollectionItem(node)} className="min-w-0 flex-1 text-left py-1.5 flex items-center gap-2">
            
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-bold ${getMethodColor(getCollectionItemMethod(node))}`}>
                  {getCollectionItemMethod(node)}
                </span>
                {(isDirty || isOpenWebsocket) && (
                  <span className="inline-flex items-center gap-1.5">
                    {isDirty && (
                      <span
                        className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.65)]"
                        title={t('toolbar.status.dirty')}
                        aria-label={t('toolbar.status.dirty')}
                      />
                    )}
                    {isOpenWebsocket && (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                        OPEN
                      </span>
                    )}
                  </span>
                )}
              </span>
              <span className={`block min-w-0 text-xs truncate group-hover:text-white ${isActive ? 'text-white font-semibold' : 'text-gray-300'}`} title={node.name}>
                {node.name}
              </span>
              <span className="block text-[10px] text-gray-600 truncate" title={getCollectionItemTarget(node)}>
                {getCollectionItemTarget(node)}
              </span>
            </span>
          </button>
          <button type="button" onClick={(event) => actions.handleStartEditCollectionItem(event, collectionId, node)} className="p-1.5 text-gray-700 opacity-0 hover:text-gray-300 group-hover:opacity-100" title={t('collections.renameRequest')}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={(event) => actions.handleDeleteCollectionItem(event, collectionId, node.id)} className="p-1.5 text-gray-700 opacity-0 hover:text-red-400 group-hover:opacity-100" title={t('collections.deleteRequest')}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isFolder && node.expanded && (
        <div>
          {folderComposer?.collectionId === collectionId
            && folderComposer?.parentFolderId === node.id && (
              <FolderComposer
                depth={depth + 1}
                value={folderName}
                onChange={onFolderNameChange}
                onCancel={onCancelFolder}
                onSave={onCommitFolder}
              />
            )}
          {node.items.map(child => (
            <CollectionTreeNode
              key={child.id}
              node={child}
              collectionId={collectionId}
              depth={depth + 1}
              activeCollectionItemId={activeCollectionItemId}
              openWebsocketItemIds={openWebsocketItemIds}
              dirtyCollectionItemIds={dirtyCollectionItemIds}
              editingCollectionItem={editingCollectionItem}
              editingCollectionItemName={editingCollectionItemName}
              folderComposer={folderComposer}
              folderName={folderName}
              draggedNodeId={draggedNodeId}
              dragOverKey={dragOverKey}
              actions={actions}
              onFolderNameChange={onFolderNameChange}
              onStartFolder={onStartFolder}
              onCancelFolder={onCancelFolder}
              onCommitFolder={onCommitFolder}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverKeyChange={onDragOverKeyChange}
              isFiltering={isFiltering}
            />
          ))}
          {node.items.length === 0 && !(
            folderComposer?.collectionId === collectionId
            && folderComposer?.parentFolderId === node.id
          ) && (
            <div
              className={`mr-1 flex min-h-10 items-center rounded border border-dashed pr-2 text-[10px] italic transition-colors ${
                isInsideDropActive
                  ? 'border-indigo-400 bg-indigo-500/15 text-indigo-300'
                  : 'border-gray-900 text-gray-700'
              }`}
              style={{ paddingLeft: `${Math.min(depth + 1, 8) * 14 + 30}px` }}
              onDragEnter={() => {
                if (!isFiltering) onDragOverKeyChange(insideDropKey);
              }}
              onDragOver={(event) => {
                if (isFiltering) return;
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'move';
                onDragOverKeyChange(insideDropKey);
              }}
              onDrop={dropInsideFolder}
            >
              {isInsideDropActive ? t('collections.dropInFolder') : t('collections.emptyFolderDrop')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CollectionsView({ state, actions }) {
  const { t } = useTranslation();
  const {
    collections,
    newCollectionName,
    editingCollectionId,
    editingCollectionName,
    editingCollectionItem,
    editingCollectionItemName,
    activeCollectionItemId,
    openWebsocketCollectionItemIds = [],
    dirtyCollectionItemIds = []
  } = state;
  const [folderComposer, setFolderComposer] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [draggedNodeId, setDraggedNodeId] = useState('');
  const [dragOverKey, setDragOverKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const openWebsocketItemIds = useMemo(
    () => new Set(openWebsocketCollectionItemIds),
    [openWebsocketCollectionItemIds]
  );
  const dirtyCollectionItems = useMemo(
    () => new Set(dirtyCollectionItemIds),
    [dirtyCollectionItemIds]
  );
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase('pl');
  const isFiltering = normalizedSearchQuery.length > 0;
  const visibleCollections = useMemo(
    () => filterCollections(collections, normalizedSearchQuery),
    [collections, normalizedSearchQuery]
  );

  const startFolder = (collectionId, parentFolderId = '') => {
    const collection = collections.find(item => item.id === collectionId);
    if (collection && !collection.expanded) {
      actions.toggleCollection(collectionId);
    }
    setFolderComposer({ collectionId, parentFolderId });
    setFolderName('');
  };
  const cancelFolder = () => {
    setFolderComposer(null);
    setFolderName('');
  };
  const commitFolder = () => {
    if (!folderComposer || !folderName.trim()) return;
    actions.handleCreateCollectionFolder(
      folderComposer.collectionId,
      folderComposer.parentFolderId,
      folderName
    );
    cancelFolder();
  };
  const handleDragStart = (event, nodeId) => {
    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
  };
  const handleDragEnd = () => {
    setDraggedNodeId('');
    setDragOverKey('');
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-gray-800 p-2">
        <SidebarSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t('collections.search')}
        />
        <div className="flex items-center gap-1">
          <label className="cursor-pointer rounded border border-gray-800 p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-indigo-300" title={t('collections.import')}>
            <Upload className="w-4 h-4" />
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void actions.handleImportCollections(file).catch((error) => {
                  window.alert(error?.message || t('collections.importFailed'));
                });
              }}
            />
          </label>
          <button type="button" onClick={() => void actions.handleExportCollections()} disabled={collections.length === 0} className="rounded border border-gray-800 p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30" title={t('collections.exportAll')}>
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-2 border-b border-gray-900 flex gap-2">
        <input
          type="text"
          value={newCollectionName}
          onChange={(event) => actions.setNewCollectionName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') actions.handleCreateCollection();
          }}
          className="min-w-0 flex-1 bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
          placeholder={t('collections.newCollection')}
        />
        <button onClick={actions.handleCreateCollection} disabled={!newCollectionName.trim()} className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-800 rounded transition-colors border border-gray-800 disabled:opacity-40 disabled:cursor-not-allowed" title={t('collections.addCollection')}>
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {collections.length === 0 ? (
          <div className="text-xs text-gray-600 text-center mt-4 italic">{t('collections.empty')}</div>
        ) : visibleCollections.length === 0 ? (
          <div className="text-xs text-gray-600 text-center mt-4 italic">
            {t('collections.noResults', { query: searchQuery.trim() })}
          </div>
        ) : visibleCollections.map(collection => {
          const sourceCollection = collections.find(item => item.id === collection.id) || collection;
          const isEditingCollection = editingCollectionId === collection.id;
          const openWebsocketCount = countOpenWebsockets(sourceCollection.items, openWebsocketItemIds);
          const rootDropKey = `root:${collection.id}`;
          return (
            <div key={collection.id} className="border border-gray-800 rounded bg-gray-900/30 overflow-hidden">
              <div className="flex items-center gap-1 p-1.5 hover:bg-gray-800 transition-colors">
                {isEditingCollection ? (
                  <>
                    <input
                      type="text"
                      value={editingCollectionName}
                      onChange={(event) => actions.setEditingCollectionName(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') actions.handleCommitEditCollection(event, collection.id);
                        if (event.key === 'Escape') actions.handleCancelEditCollection(event);
                      }}
                      className="min-w-0 flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
                      autoFocus
                    />
                    <button onClick={(event) => actions.handleCommitEditCollection(event, collection.id)} disabled={!editingCollectionName.trim()} className="p-1.5 text-gray-400 hover:text-green-400 disabled:opacity-40" title={t('collections.saveName')}>
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={actions.handleCancelEditCollection} className="p-1.5 text-gray-400 hover:text-white" title={t('common.cancel')}>
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button onClick={() => {
                    if (!isFiltering) actions.toggleCollection(collection.id);
                  }} className="min-w-0 flex-1 flex items-center gap-2 text-sm text-gray-200 text-left px-1 py-1 rounded">
                    {collection.expanded ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0"/> : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0"/>}
                    <Folder className="w-4 h-4 text-yellow-500/85 flex-shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-medium" title={collection.name}>{collection.name}</span>
                    {openWebsocketCount > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300"
                        title={t('collections.activeWs', { count: openWebsocketCount })}
                      >
                        <Wifi className="h-3 w-3" />
                        {openWebsocketCount}
                      </span>
                    )}
                    <span className="text-xs text-gray-500 bg-gray-950 px-1.5 py-0.5 rounded flex-shrink-0">{countCollectionRequests(collection.items)}</span>
                  </button>
                )}
              </div>

              {!isEditingCollection && (
                <div className="flex items-center justify-end gap-1 border-t border-gray-800/70 bg-gray-950/45 px-1.5 py-1">
                  <button onClick={(event) => actions.handleQuickAddCurrentRequestToCollection(event, collection.id)} className="p-1.5 text-gray-500 hover:text-indigo-300 hover:bg-gray-900 rounded" title={t('collections.addCurrentRequest')}>
                    <Plus className="w-4 h-4" />
                  </button>
                  <button onClick={(event) => {
                    event.stopPropagation();
                    startFolder(collection.id);
                  }} className="p-1.5 text-gray-500 hover:text-yellow-400 hover:bg-gray-900 rounded" title={t('collections.addFolder')}>
                    <FolderPlus className="w-4 h-4" />
                  </button>
                  <button onClick={(event) => actions.handleStartEditCollection(event, sourceCollection)} className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-900 rounded" title={t('collections.renameCollection')}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={(event) => void actions.handleExportCollection(event, sourceCollection)} className="p-1.5 text-gray-500 hover:text-emerald-300 hover:bg-gray-900 rounded" title={t('collections.exportCollection')}>
                    <Download className="w-4 h-4" />
                  </button>
                  <button onClick={(event) => actions.handleDeleteCollection(event, sourceCollection)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded" title={t('collections.deleteCollection')}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              {collection.expanded && (
                <div className="bg-gray-950 p-1 border-t border-gray-900">
                  {folderComposer?.collectionId === collection.id && !folderComposer.parentFolderId && (
                    <FolderComposer
                      depth={0}
                      value={folderName}
                      onChange={setFolderName}
                      onCancel={cancelFolder}
                      onSave={commitFolder}
                    />
                  )}
                  {collection.items.map(node => (
                    <CollectionTreeNode
                      key={node.id}
                      node={node}
                      collectionId={collection.id}
                      depth={0}
                      activeCollectionItemId={activeCollectionItemId}
                      openWebsocketItemIds={openWebsocketItemIds}
                      dirtyCollectionItemIds={dirtyCollectionItems}
                      editingCollectionItem={editingCollectionItem}
                      editingCollectionItemName={editingCollectionItemName}
                      folderComposer={folderComposer}
                      folderName={folderName}
                      draggedNodeId={draggedNodeId}
                      dragOverKey={dragOverKey}
                      actions={actions}
                      onFolderNameChange={setFolderName}
                      onStartFolder={startFolder}
                      onCancelFolder={cancelFolder}
                      onCommitFolder={commitFolder}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOverKeyChange={setDragOverKey}
                      isFiltering={isFiltering}
                    />
                  ))}
                  {!isFiltering && (
                    <div
                      className={`mt-1 flex items-center justify-center rounded border border-dashed px-3 py-2 text-center text-[10px] transition-colors ${
                        dragOverKey === rootDropKey
                          ? 'border-indigo-400 bg-indigo-500/15 text-indigo-200 shadow-[inset_0_0_0_1px_rgba(129,140,248,0.15)]'
                          : 'border-gray-900 text-gray-700'
                      }`}
                      onDragEnter={() => setDragOverKey(rootDropKey)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDragOverKey(rootDropKey);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const movingNodeId = draggedNodeId || event.dataTransfer.getData('text/plain');
                        if (!movingNodeId) return;
                        actions.handleMoveCollectionItem({
                          nodeId: movingNodeId,
                          targetCollectionId: collection.id,
                          targetParentFolderId: '',
                          targetIndex: collection.items.length
                        });
                        handleDragEnd();
                      }}
                    >
                      {dragOverKey === rootDropKey
                        ? t('collections.dropMoveEnd')
                        : collection.items.length === 0
                          ? t('collections.dropEmpty')
                          : t('collections.dropEnd')}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
