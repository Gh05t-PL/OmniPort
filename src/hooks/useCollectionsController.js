import {
  collectionTreeContains,
  countCollectionRequests,
  createCollection,
  createCollectionFolder,
  createCollectionItemFromSnapshot,
  findCollectionItemLocation,
  findCollectionNode,
  isCollectionFolder,
  moveCollectionTreeNode,
  parseCollectionsImport,
  removeCollectionTreeNode,
  serializeCollections,
  updateCollectionTreeNode
} from '../domain/collections.js';
import { COLLECTION_IMPORT_MAX_BYTES } from '../config/constants.js';
import { getRequestTabName, normalizeRequestSnapshot } from '../domain/request.js';
import { useTranslation } from '../i18n/I18nProvider.jsx';
import { readFileAsText, saveTextFile } from '../utils/files.js';

const safeExportFileName = (value, fallback = 'omniport-collections') => {
  const normalized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${normalized || fallback}.json`;
};

export default function useCollectionsController({
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
}) {
  const { t } = useTranslation();

  const handleCancelEditCollection = (event) => {
    event?.stopPropagation();
    setEditingCollectionId('');
    setEditingCollectionName('');
  };

  const handleCancelEditCollectionItem = (event) => {
    event?.stopPropagation();
    setEditingCollectionItem(null);
    setEditingCollectionItemName('');
  };

  const toggleCollection = (collectionId) => {
    persistCollections(previousCollections => previousCollections.map(collection => (
      collection.id === collectionId
        ? { ...collection, expanded: !collection.expanded }
        : collection
    )));
  };

  const syncActiveTabWithCollectionItem = (itemId, name, snapshot) => {
    if (!activeRequestTabId) return;
    const linkedRequest = normalizeRequestSnapshot({
      ...snapshot,
      requestName: name,
      collectionItemId: itemId
    });
    setRequestTabsState(previousTabs => previousTabs.map(tab => (
      tab.id === activeRequestTabId
        ? {
            ...tab,
            name,
            request: linkedRequest
          }
        : tab
    )));
  };

  const saveExistingCollectionItem = (location, snapshot, name) => {
    if (!location) return false;
    const nextRequestName = String(name || '').trim()
      || location.item.name
      || getRequestTabName(snapshot);
    const requestData = createCollectionItemFromSnapshot(snapshot, nextRequestName);
    const updatedAt = new Date().toISOString();

    persistCollections(previousCollections => previousCollections.map(collection => (
      collection.id === location.collection.id
        ? {
            ...collection,
            updatedAt,
            items: updateCollectionTreeNode(
              collection.items,
              location.item.id,
              item => ({
                ...requestData,
                id: item.id,
                createdAt: item.createdAt,
                updatedAt
              })
            )
          }
        : collection
    )));
    setActiveCollectionItemId(location.item.id);
    setRequestName(nextRequestName);
    setActiveHistoryItemId('');
    setSelectedCollectionId(location.collection.id);
    setSelectedCollectionFolderId(location.parentFolderId || '');
    syncActiveTabWithCollectionItem(location.item.id, nextRequestName, snapshot);
    return true;
  };

  const handleOpenSaveModal = () => {
    const currentSnapshot = buildCurrentRequestSnapshot();
    const activeCollectionLocation = findCollectionItemLocation(collections, activeCollectionItemId);
    const nextRequestName = requestName.trim()
      || activeCollectionLocation?.item.name
      || getRequestTabName(currentSnapshot);

    if (activeCollectionLocation) {
      saveExistingCollectionItem(activeCollectionLocation, currentSnapshot, nextRequestName);
      return;
    }

    setSaveReqName(nextRequestName);
    if (!collections.some(collection => collection.id === selectedCollectionId) && collections[0]) {
      setSelectedCollectionId(collections[0].id);
      setSelectedCollectionFolderId('');
    }
    setIsCreatingCollection(collections.length === 0);
    setShowSaveModal(true);
  };

  const handleCreateCollection = () => {
    const name = newSidebarCollectionName.trim();
    if (!name) return;

    const collection = createCollection(name);
    persistCollections(previousCollections => [...previousCollections, collection]);
    setSelectedCollectionId(collection.id);
    setSelectedCollectionFolderId('');
    setNewSidebarCollectionName('');
  };

  const handleCreateCollectionFolder = (collectionId, parentFolderId, name) => {
    const folderName = String(name || '').trim();
    if (!folderName) return;
    const folder = createCollectionFolder(folderName);
    persistCollections(previousCollections => previousCollections.map(collection => {
      if (collection.id !== collectionId) return collection;
      if (!parentFolderId) {
        return {
          ...collection,
          expanded: true,
          updatedAt: new Date().toISOString(),
          items: [...collection.items, folder]
        };
      }
      return {
        ...collection,
        updatedAt: new Date().toISOString(),
        items: updateCollectionTreeNode(collection.items, parentFolderId, parent => ({
          ...parent,
          expanded: true,
          items: [...parent.items, folder]
        }))
      };
    }));
  };

  const handleImportCollections = async (file) => {
    if (!file) return;
    const contents = await readFileAsText(file, {
      maxBytes: COLLECTION_IMPORT_MAX_BYTES
    });
    const importedCollections = parseCollectionsImport(contents);
    persistCollections(previousCollections => [
      ...importedCollections,
      ...previousCollections
    ]);
    setSelectedCollectionId(importedCollections[0].id);
    setSelectedCollectionFolderId('');
  };

  const handleExportCollections = async () => {
    if (collections.length === 0) return;
    await saveTextFile({
      fileName: safeExportFileName(
        collections.length === 1 ? collections[0].name : 'omniport-collections'
      ),
      contents: serializeCollections(collections)
    });
  };

  const handleExportCollection = async (event, collection) => {
    event.stopPropagation();
    await saveTextFile({
      fileName: safeExportFileName(collection.name, 'omniport-collection'),
      contents: serializeCollections([collection])
    });
  };

  const handleStartEditCollection = (event, collection) => {
    event.stopPropagation();
    setEditingCollectionId(collection.id);
    setEditingCollectionName(collection.name);
  };

  const handleCommitEditCollection = (event, collectionId) => {
    event?.stopPropagation();
    const name = editingCollectionName.trim();
    if (!name) return;

    persistCollections(previousCollections => previousCollections.map(collection => (
      collection.id === collectionId
        ? { ...collection, name, updatedAt: new Date().toISOString() }
        : collection
    )));
    handleCancelEditCollection();
  };

  const handleDeleteCollection = (event, collection) => {
    event.stopPropagation();
    const requestCount = countCollectionRequests(collection.items);
    requestConfirmation({
      title: t('confirm.collectionDelete.title'),
      message: t('confirm.collectionDelete.message', {
        name: collection.name,
        count: requestCount
      }),
      confirmLabel: t('confirm.collectionDelete.action'),
      onConfirm: () => {
        const deletedActiveItem = collectionTreeContains(collection.items, activeCollectionItemId);
        persistCollections(previousCollections => (
          previousCollections.filter(item => item.id !== collection.id)
        ));
        if (selectedCollectionId === collection.id) {
          setSelectedCollectionId('');
          setSelectedCollectionFolderId('');
        }
        if (deletedActiveItem) setActiveCollectionItemId('');
        if (editingCollectionId === collection.id) handleCancelEditCollection();
        if (editingCollectionItem?.collectionId === collection.id) handleCancelEditCollectionItem();
      }
    });
  };

  const handleQuickAddCurrentRequestToCollection = (event, collectionId, parentFolderId = '') => {
    event.stopPropagation();
    const snapshot = buildCurrentRequestSnapshot();
    const requestData = createCollectionItemFromSnapshot(snapshot, requestName.trim() || getRequestTabName(snapshot));

    persistCollections(previousCollections => previousCollections.map(collection => {
      if (collection.id !== collectionId) return collection;
      if (!parentFolderId) {
        return {
          ...collection,
          expanded: true,
          items: [...collection.items, requestData],
          updatedAt: new Date().toISOString()
        };
      }
      return {
        ...collection,
        updatedAt: new Date().toISOString(),
        items: updateCollectionTreeNode(collection.items, parentFolderId, folder => ({
          ...folder,
          expanded: true,
          items: [...folder.items, requestData]
        }))
      };
    }));
    setActiveCollectionItemId(requestData.id);
    setRequestName(requestData.name);
    setActiveHistoryItemId('');
    syncActiveTabWithCollectionItem(requestData.id, requestData.name, snapshot);
  };

  const handleStartEditCollectionItem = (event, collectionId, item) => {
    event.stopPropagation();
    setEditingCollectionItem({ collectionId, itemId: item.id });
    setEditingCollectionItemName(item.name);
  };

  const handleCommitEditCollectionItem = (event) => {
    event?.stopPropagation();
    const name = editingCollectionItemName.trim();
    if (!name || !editingCollectionItem) return;

    const editedLocation = collections
      .find(collection => collection.id === editingCollectionItem.collectionId);
    const editedNode = editedLocation
      ? findCollectionNode(editedLocation.items, editingCollectionItem.itemId)?.node
      : null;
    persistCollections(previousCollections => previousCollections.map(collection => (
      collection.id === editingCollectionItem.collectionId
        ? {
            ...collection,
            updatedAt: new Date().toISOString(),
            items: updateCollectionTreeNode(collection.items, editingCollectionItem.itemId, item => ({
              ...item,
              name,
              updatedAt: new Date().toISOString(),
              request: item.request
                ? { ...item.request, requestName: name }
                : item.request
            }))
          }
        : collection
    )));
    if (!isCollectionFolder(editedNode) && activeCollectionItemId === editingCollectionItem.itemId) {
      setRequestName(name);
    }
    if (!isCollectionFolder(editedNode)) {
      setRequestTabsState(previousTabs => previousTabs.map(tab => (
        tab.request?.collectionItemId === editingCollectionItem.itemId
          ? {
              ...tab,
              name,
              request: { ...tab.request, requestName: name }
            }
          : tab
      )));
    }
    handleCancelEditCollectionItem();
  };

  const handleDeleteCollectionItem = (event, collectionId, itemId) => {
    event.stopPropagation();
    const collection = collections.find(item => item.id === collectionId);
    const node = collection ? findCollectionNode(collection.items, itemId)?.node : null;
    const folderRequestCount = isCollectionFolder(node) ? countCollectionRequests(node.items) : 0;
    requestConfirmation({
      title: isCollectionFolder(node) ? t('confirm.folderDelete.title') : t('confirm.requestDelete.title'),
      message: isCollectionFolder(node)
        ? t('confirm.folderDelete.message', {
            name: node?.name || '',
            count: folderRequestCount
          })
        : t('confirm.requestDelete.message', {
            name: node?.name || '',
            collection: collection?.name || ''
          }),
      confirmLabel: isCollectionFolder(node)
        ? t('confirm.folderDelete.action')
        : t('confirm.requestDelete.action'),
      onConfirm: () => {
        persistCollections(previousCollections => previousCollections.map(previousCollection => (
          previousCollection.id === collectionId
            ? {
                ...previousCollection,
                updatedAt: new Date().toISOString(),
                items: removeCollectionTreeNode(previousCollection.items, itemId)
              }
            : previousCollection
        )));

        if (
          activeCollectionItemId === itemId
          || (isCollectionFolder(node) && collectionTreeContains(node.items, activeCollectionItemId))
        ) {
          setActiveCollectionItemId('');
        }
        if (
          editingCollectionItem?.collectionId === collectionId
          && (
            editingCollectionItem?.itemId === itemId
            || (
              isCollectionFolder(node)
              && collectionTreeContains(node.items, editingCollectionItem?.itemId)
            )
          )
        ) {
          handleCancelEditCollectionItem();
        }
      }
    });
  };

  const handleToggleCollectionFolder = (collectionId, folderId) => {
    persistCollections(previousCollections => previousCollections.map(collection => (
      collection.id === collectionId
        ? {
            ...collection,
            items: updateCollectionTreeNode(collection.items, folderId, folder => ({
              ...folder,
              expanded: !folder.expanded
            }))
          }
        : collection
    )));
  };

  const handleMoveCollectionItem = (move) => {
    persistCollections(previousCollections => moveCollectionTreeNode(previousCollections, move));
  };

  const handleSaveToCollection = () => {
    if (!saveReqName.trim()) return;

    const nextRequestName = saveReqName.trim();
    const currentSnapshot = buildCurrentRequestSnapshot();
    const requestData = createCollectionItemFromSnapshot(
      currentSnapshot,
      nextRequestName
    );
    const activeCollectionLocation = findCollectionItemLocation(collections, activeCollectionItemId);

    if (activeCollectionLocation) {
      saveExistingCollectionItem(activeCollectionLocation, currentSnapshot, nextRequestName);
      setShowSaveModal(false);
      setNewCollectionName('');
      setIsCreatingCollection(false);
      return;
    }

    if ((collections.length === 0 || isCreatingCollection) && !newCollectionName.trim()) return;

    let targetCollectionId = selectedCollectionId;
    let nextCollections = [...collections];

    if ((collections.length === 0 || isCreatingCollection) && newCollectionName.trim()) {
      const collection = createCollection(newCollectionName.trim());
      targetCollectionId = collection.id;
      setSelectedCollectionFolderId('');
      nextCollections.push(collection);
    }

    const targetCollection = nextCollections.find(collection => collection.id === targetCollectionId);
    const selectedFolderNode = targetCollection && selectedCollectionFolderId
      ? findCollectionNode(targetCollection.items, selectedCollectionFolderId)?.node
      : null;
    const targetFolderId = isCollectionFolder(selectedFolderNode)
      ? selectedCollectionFolderId
      : '';

    nextCollections = nextCollections.map(collection => {
      if (collection.id !== targetCollectionId) return collection;
      if (!targetFolderId) {
        return {
          ...collection,
          expanded: true,
          updatedAt: new Date().toISOString(),
          items: [...collection.items, requestData]
        };
      }
      return {
        ...collection,
        expanded: true,
        updatedAt: new Date().toISOString(),
        items: updateCollectionTreeNode(collection.items, targetFolderId, folder => ({
          ...folder,
          expanded: true,
          items: [...folder.items, requestData]
        }))
      };
    });

    persistCollections(nextCollections);
    setActiveCollectionItemId(requestData.id);
    setRequestName(nextRequestName);
    setActiveHistoryItemId('');
    syncActiveTabWithCollectionItem(requestData.id, nextRequestName, currentSnapshot);
    setSelectedCollectionId(targetCollectionId);
    setSelectedCollectionFolderId('');
    setShowSaveModal(false);
    setSaveReqName(t('request.new'));
    setNewCollectionName('');
    setIsCreatingCollection(false);
    setSidebarView('collections');
    if (!isSidebarOpen) setIsSidebarOpen(true);
  };

  const activeCollectionSaveLocation = findCollectionItemLocation(collections, activeCollectionItemId);
  const isSaveDisabled = !saveReqName.trim()
    || ((isCreatingCollection || collections.length === 0) && !newCollectionName.trim())
    || (!isCreatingCollection && collections.length > 0 && !selectedCollectionId);

  return {
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
  };
}
