import { AlertCircle, Download, X } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

export default function CurlImportModal({
  isOpen,
  value,
  error,
  onChange,
  onClose,
  onImport
}) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-indigo-400" /> {t('importCurl.title')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-3 sm:p-4 flex-1 overflow-y-auto custom-scrollbar">
          <p className="text-sm text-gray-400 mb-3">
            {t('importCurl.description')}
          </p>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full min-h-36 h-[min(12rem,35vh)] bg-gray-950 border border-gray-700 rounded p-3 sm:p-4 font-mono text-sm text-gray-300 outline-none focus:border-indigo-500 resize-none"
            placeholder={`curl -X POST https://api.example.com \\\n  -H 'Content-Type: application/json' \\\n  -d '{"test": true}'`}
            spellCheck="false"
          />
          {error && (
            <div className="mt-3 p-3 bg-red-950/50 border border-red-900 rounded text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-800 bg-gray-800/30 flex flex-wrap justify-end gap-2 sm:gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">{t('common.cancel')}</button>
          <button onClick={onImport} disabled={!value.trim()} className="px-6 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded transition-colors font-semibold shadow">{t('common.import')}</button>
        </div>
      </div>
    </div>
  );
}
