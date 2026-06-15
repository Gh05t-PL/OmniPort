import { AlertCircle, FileJson, X } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

export default function OpenApiImportModal({
  isOpen,
  text,
  error,
  fileName,
  collectionName,
  onTextChange,
  onCollectionNameChange,
  onFileChange,
  onClose,
  onReset,
  onImport
}) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileJson className="w-5 h-5 text-emerald-400" /> {t('importOpenApi.title')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-3 sm:p-4 flex-1 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-medium">{t('importOpenApi.collectionName')}</label>
              <input
                type="text"
                value={collectionName}
                onChange={(event) => onCollectionNameChange(event.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                placeholder={t('importOpenApi.collectionPlaceholder')}
              />
            </div>
            <label className="inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-100 px-3 py-2 rounded text-sm transition-colors border border-gray-700 cursor-pointer">
              <FileJson className="w-4 h-4 text-emerald-400" />
              <span>{fileName || t('importOpenApi.chooseFile')}</span>
              <input
                type="file"
                accept=".json,.yaml,.yml,application/json,text/yaml,application/yaml"
                onChange={onFileChange}
                className="hidden"
              />
            </label>
          </div>

          <textarea
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            className="w-full min-h-44 h-[min(18rem,42vh)] bg-gray-950 border border-gray-700 rounded p-3 sm:p-4 font-mono text-sm text-gray-300 outline-none focus:border-indigo-500 resize-none custom-scrollbar"
            placeholder={`openapi: 3.0.3\ninfo:\n  title: Example API\n  version: 1.0.0\nservers:\n  - url: https://api.example.com\npaths:\n  /users:\n    get:\n      summary: List users`}
            spellCheck="false"
          />

          {error && (
            <div className="p-3 bg-red-950/50 border border-red-900 rounded text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-800 bg-gray-800/30 flex flex-wrap justify-end gap-2 sm:gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">{t('common.cancel')}</button>
          <button onClick={onReset} disabled={!text.trim() && !collectionName.trim()} className="px-4 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{t('common.clear')}</button>
          <button onClick={onImport} disabled={!text.trim()} className="px-6 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded transition-colors font-semibold shadow">{t('common.import')}</button>
        </div>
      </div>
    </div>
  );
}
