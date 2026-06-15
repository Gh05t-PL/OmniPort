import { Columns, Download, FileJson, Menu, Rows } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

export default function AppHeader({
  isSidebarOpen,
  layout,
  onToggleSidebar,
  onLayoutChange,
  onOpenCurlImport,
  onOpenOpenApiImport
}) {
  const { language, languageMeta, languages, setLanguage, t } = useTranslation();

  return (
    <header className="bg-gray-900 border-b border-gray-800 px-2.5 py-2 sm:p-3 flex items-center justify-between gap-2 z-10 shadow-sm flex-shrink-0">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          onClick={() => onToggleSidebar(!isSidebarOpen)}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          title={t('header.toggleSidebar')}
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <img src="/omniport-logo.png" alt="" className="w-6 h-6 rounded-md shadow-sm" />
          <h1 className="app-wordmark text-base tracking-wide hidden sm:block">
            <span className="font-extrabold text-white">Omni</span>
            <span className="font-medium text-gray-200">Port</span>
          </h1>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-3">
        <label
          className="flex h-[31px] items-center gap-1.5 rounded border border-gray-700 bg-gray-800/80 px-2 text-xs text-gray-300 transition-colors focus-within:border-indigo-500"
          title={t('header.language')}
        >
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            aria-label={t('header.language')}
            className="bg-transparent text-xs font-semibold text-gray-200 outline-none"
          >
            {languages.map(item => (
              <option key={item.code} value={item.code} className="bg-gray-900 text-gray-100">
                {item.shortLabel}
              </option>
            ))}
          </select>
        </label>

        <div className="bg-gray-800/80 rounded border border-gray-700 p-0.5 flex gap-0.5">
          <button
            onClick={() => onLayoutChange('horizontal')}
            className={`p-1.5 rounded transition-colors ${layout === 'horizontal' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
            title={t('header.layoutHorizontal')}
          >
            <Columns className="w-4 h-4" />
          </button>
          <button
            onClick={() => onLayoutChange('vertical')}
            className={`p-1.5 rounded transition-colors ${layout === 'vertical' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
            title={t('header.layoutVertical')}
          >
            <Rows className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={onOpenCurlImport}
          className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-2 sm:px-3 py-1.5 rounded transition-colors shadow"
        >
          <Download className="w-4 h-4" /> <span className="hidden md:inline">{t('header.importCurl')}</span>
        </button>
        <button
          onClick={onOpenOpenApiImport}
          className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-100 px-2 sm:px-3 py-1.5 rounded transition-colors border border-gray-700 shadow"
        >
          <FileJson className="w-4 h-4 text-emerald-400" /> <span className="hidden md:inline">{t('header.importOpenApi')}</span>
        </button>
      </div>
    </header>
  );
}
