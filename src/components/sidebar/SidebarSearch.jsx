import { Search, X } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

export default function SidebarSearch({
  value,
  onChange,
  placeholder,
  ariaLabel = placeholder
}) {
  const { t } = useTranslation();

  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-600" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded border border-gray-800 bg-gray-950 py-1.5 pl-8 pr-8 text-xs text-white outline-none transition-colors placeholder:text-gray-600 focus:border-indigo-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-600 transition-colors hover:bg-gray-800 hover:text-gray-300"
          title={t('sidebar.searchClear')}
          aria-label={t('sidebar.searchClear')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
