import { RotateCcw } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import RequestProtocolFields from './RequestProtocolFields.jsx';
import RequestToolbarActions from './RequestToolbarActions.jsx';

const SAVE_STATUS = {
  saved: { labelKey: 'toolbar.status.saved', dot: 'bg-emerald-400', text: 'text-gray-500' },
  dirty: { labelKey: 'toolbar.status.dirty', dot: 'bg-amber-400', text: 'text-amber-400/80' },
  unsaved: { labelKey: 'toolbar.status.unsaved', dot: 'bg-gray-500', text: 'text-gray-500' }
};

const RequestIdentity = ({ state, actions }) => {
  const { t } = useTranslation();
  const status = SAVE_STATUS[state.requestSaveStatus] || SAVE_STATUS.unsaved;

  return (
    <div className="flex min-w-0 items-center gap-2 px-2.5 pt-2 sm:gap-3 sm:px-3">
      <input
        type="text"
        value={state.requestName}
        onChange={(event) => actions.onRequestNameChange(event.target.value)}
        placeholder={state.requestNamePlaceholder}
        aria-label={t('toolbar.requestName')}
        className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-sm font-medium text-gray-200 outline-none placeholder:text-gray-600 focus:text-white"
      />
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className={`flex items-center gap-1.5 whitespace-nowrap text-[10px] uppercase tracking-wider ${status.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          {t(status.labelKey)}
        </span>
        <button
          type="button"
          onClick={actions.onRevertChanges}
          disabled={!state.canRevertChanges || state.loading}
          tabIndex={state.canRevertChanges ? 0 : -1}
          aria-hidden={!state.canRevertChanges}
          className={`inline-flex h-7 w-7 items-center justify-center rounded border transition-colors ${
            state.canRevertChanges
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:border-amber-400/60 hover:bg-amber-500/20 hover:text-amber-300 disabled:opacity-40'
              : 'invisible pointer-events-none border-transparent'
          }`}
          title={t('toolbar.revert')}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default function RequestToolbar({ state, actions }) {
  return (
    <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/80">
      <RequestIdentity state={state} actions={actions} />
      <div className="flex flex-wrap items-stretch gap-2 p-2.5 pt-2 sm:p-3 sm:pt-2">
        <RequestProtocolFields state={state} actions={actions} />
        <RequestToolbarActions state={state} actions={actions} />
      </div>
    </div>
  );
}
