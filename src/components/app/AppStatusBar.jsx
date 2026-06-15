import { CircleHelp } from 'lucide-react';
import { APP_NAME, APP_VERSION } from '../../config/appInfo.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

export default function AppStatusBar({
  protocol,
  onOpenAbout
}) {
  const { t } = useTranslation();

  return (
    <footer className="flex h-7 flex-shrink-0 items-center justify-between border-t border-gray-800 bg-gray-900 px-2.5 text-[10px] text-gray-600">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate">{APP_NAME} v{APP_VERSION}</span>
        <span className="h-3 w-px bg-gray-800" aria-hidden="true" />
        <span className="uppercase tracking-wider text-gray-500">{protocol}</span>
      </div>

      <button
        type="button"
        onClick={onOpenAbout}
        className="inline-flex h-6 w-7 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-800 hover:text-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        title={t('status.info')}
        aria-label={t('status.openInfo')}
      >
        <CircleHelp className="h-4 w-4" />
      </button>
    </footer>
  );
}
