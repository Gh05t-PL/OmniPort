import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import { formatHistoryDate, getMethodColor, getStatusColor } from '../../utils/formatters.js';
import SidebarSearch from './SidebarSearch.jsx';

export default function HistoryView({
  history,
  activeHistoryItemId,
  onSelect,
  onDelete,
  onClear
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const visibleHistory = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('pl');
    if (!query) return history;
    return history.filter(item => (
      [
        item.method,
        item.protocol,
        item.url,
        item.status,
        item.statusText
      ].some(value => String(value || '').toLocaleLowerCase('pl').includes(query))
    ));
  }, [history, searchQuery]);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-gray-800 p-2">
        <SidebarSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t('history.search')}
        />
        <button
          type="button"
          onClick={onClear}
          disabled={history.length === 0}
          className="inline-flex items-center gap-1 rounded border border-gray-800 px-2 py-1.5 text-[11px] text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500"
          title={t('history.clearAll')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {history.length === 0 ? (
          <div className="text-xs text-gray-600 text-center mt-4 italic">{t('history.empty')}</div>
        ) : visibleHistory.length === 0 ? (
          <div className="text-xs text-gray-600 text-center mt-4 italic">
            {t('history.noResults', { query: searchQuery.trim() })}
          </div>
        ) : (
          visibleHistory.map(item => {
            const isActive = item.id === activeHistoryItemId;
            return (
              <div key={item.id} className={`flex items-stretch rounded transition-colors border group ${
                isActive
                  ? 'bg-blue-500/10 border-blue-500/40'
                  : 'border-transparent hover:border-gray-800 hover:bg-gray-900'
              }`}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="min-w-0 flex-1 p-2 text-left flex flex-col gap-1"
                >
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <span className={`font-bold ${getMethodColor(item.method)}`}>{item.method}</span>
                    <span className={`font-bold ${getStatusColor(item.status)}`}>{item.status || '---'}</span>
                  </div>
                  <div className={`text-xs truncate ${isActive ? 'text-white font-semibold' : 'text-gray-400'}`} title={item.url}>{item.url}</div>
                  <div className="text-[11px] text-gray-500 font-mono">{formatHistoryDate(item.createdAt)}</div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                    <span className="truncate">{item.statusText || (item.response ? t('history.savedResponse') : t('history.requestOnly'))}</span>
                    <span className="font-mono text-emerald-500 flex-shrink-0">{typeof item.time === 'number' ? `${item.time} ms` : '-- ms'}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="w-8 flex-shrink-0 text-gray-700 opacity-0 transition-colors hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
                  title={t('history.deleteEntry')}
                  aria-label={t('history.deleteAria', { target: item.url || item.method })}
                >
                  <Trash2 className="w-3.5 h-3.5 mx-auto" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
