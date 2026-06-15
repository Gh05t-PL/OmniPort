import { useEffect, useState } from 'react';
import { AlertTriangle, LoaderCircle, X } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  onCancel,
  onConfirm
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setPending(false);
      setError('');
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !pending) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, pending]);

  if (!isOpen) return null;

  const confirmButtonClass = tone === 'warning'
    ? 'bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900'
    : 'bg-red-600 hover:bg-red-500 disabled:bg-red-900';
  const iconClass = tone === 'warning'
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    : 'border-red-500/30 bg-red-500/10 text-red-400';

  const handleConfirm = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await onConfirm();
      onCancel();
    } catch (actionError) {
      setError(actionError?.message || t('common.operationFailed'));
      setPending(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        aria-describedby="confirmation-modal-message"
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
      >
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
          <h2 id="confirmation-modal-title" className="text-base font-bold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
            aria-label={t('confirm.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex items-start gap-4">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border ${iconClass}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <p id="confirmation-modal-message" className="pt-1.5 text-sm leading-relaxed text-gray-300">
            {message}
          </p>
        </div>

        {error && (
          <div className="mx-5 mb-4 rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="p-4 border-t border-gray-800 bg-gray-800/30 flex flex-wrap justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            autoFocus
            className="px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={pending}
            className={`min-w-24 px-5 py-2 text-sm text-white rounded transition-colors font-semibold shadow disabled:cursor-wait ${confirmButtonClass}`}
          >
            {pending ? (
              <span className="flex items-center justify-center gap-2">
                <LoaderCircle className="w-4 h-4 animate-spin" />
                {t('common.wait')}
              </span>
            ) : (confirmLabel || t('common.confirm'))}
          </button>
        </div>
      </div>
    </div>
  );
}
