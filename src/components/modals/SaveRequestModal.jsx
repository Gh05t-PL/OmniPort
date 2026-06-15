import { Bookmark, FolderOpen, FolderPlus, X } from 'lucide-react';
import { getCollectionFolderOptions } from '../../domain/collections.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

export default function SaveRequestModal({
  isOpen,
  collections,
  saveReqName,
  selectedCollectionId,
  selectedCollectionFolderId,
  newCollectionName,
  isCreatingCollection,
  isSaveDisabled,
  onClose,
  onSaveReqNameChange,
  onSelectedCollectionChange,
  onSelectedCollectionFolderChange,
  onNewCollectionNameChange,
  onCreatingCollectionChange,
  onSave
}) {
  const { t } = useTranslation();
  if (!isOpen) return null;
  const selectedCollection = collections.find(collection => collection.id === selectedCollectionId);
  const folderOptions = getCollectionFolderOptions(selectedCollection?.items);

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-yellow-500" /> {t('saveModal.title')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 sm:p-5 flex-1 space-y-4 overflow-y-auto custom-scrollbar">
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium">{t('saveModal.requestName')}</label>
            <input
              type="text"
              value={saveReqName}
              onChange={(event) => onSaveReqNameChange(event.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              placeholder={t('saveModal.requestPlaceholder')}
              autoFocus
            />
          </div>

          <div className="space-y-3">
            <label className="block text-xs text-gray-400 font-medium">{t('saveModal.location')}</label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-800 bg-gray-950 p-1">
              <button
                type="button"
                onClick={() => {
                  onCreatingCollectionChange(false);
                  onSelectedCollectionFolderChange('');
                }}
                disabled={collections.length === 0}
                className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  !isCreatingCollection
                    ? 'bg-indigo-500/15 text-indigo-200 shadow-sm'
                    : 'text-gray-500 hover:bg-gray-900 hover:text-gray-300'
                }`}
              >
                <FolderOpen className="h-4 w-4" />
                {t('saveModal.existing')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onCreatingCollectionChange(true);
                  onSelectedCollectionFolderChange('');
                }}
                className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-medium transition-colors ${
                  isCreatingCollection
                    ? 'bg-indigo-500/15 text-indigo-200 shadow-sm'
                    : 'text-gray-500 hover:bg-gray-900 hover:text-gray-300'
                }`}
              >
                <FolderPlus className="h-4 w-4" />
                {t('saveModal.newCollection')}
              </button>
            </div>

            {isCreatingCollection || collections.length === 0 ? (
              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">{t('saveModal.newCollectionName')}</label>
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={(event) => onNewCollectionNameChange(event.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  placeholder={t('saveModal.collectionPlaceholder')}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-medium">{t('saveModal.collection')}</label>
                  <select
                    value={selectedCollectionId}
                    onChange={(event) => {
                      onSelectedCollectionChange(event.target.value);
                      onSelectedCollectionFolderChange('');
                    }}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  >
                    {collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                  </select>
                </div>
                {folderOptions.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1 font-medium">{t('saveModal.folder')}</label>
                    <select
                      value={selectedCollectionFolderId}
                      onChange={(event) => onSelectedCollectionFolderChange(event.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                    >
                      <option value="">{t('saveModal.collectionRoot')}</option>
                      {folderOptions.map(folder => (
                        <option key={folder.id} value={folder.id}>
                          {`${'— '.repeat(folder.depth + 1)}${folder.name}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="p-4 border-t border-gray-800 bg-gray-800/30 flex flex-wrap justify-end gap-2 sm:gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">{t('common.cancel')}</button>
          <button onClick={onSave} disabled={isSaveDisabled} className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors font-semibold shadow">{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
}
