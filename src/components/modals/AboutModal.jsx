import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  ExternalLink,
  Info,
  Keyboard,
  Lightbulb,
  LoaderCircle,
  MonitorUp,
  Network,
  ShieldCheck,
  X
} from 'lucide-react';
import {
  APP_HOTKEY_LIST,
  getHotkeyDisplayLabel
} from '../../config/hotkeys.js';
import {
  APP_NAME,
  APP_REPOSITORY_URL,
  APP_VERSION,
  getRuntimeInfo,
  SUPPORTED_PROTOCOLS
} from '../../config/appInfo.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

const InfoRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-gray-800/70 py-2 last:border-0">
    <span className="text-gray-500">{label}</span>
    <span className="min-w-0 text-right font-mono text-gray-300">{value}</span>
  </div>
);

export default function AboutModal({
  isOpen,
  onClose,
  onRecoverWindow
}) {
  const { t } = useTranslation();
  const [recoveringWindow, setRecoveringWindow] = useState(false);
  const [windowRecoveryStatus, setWindowRecoveryStatus] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setRecoveringWindow(false);
      setWindowRecoveryStatus(null);
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const runtime = getRuntimeInfo();
  const handleRecoverWindow = async () => {
    if (!onRecoverWindow || recoveringWindow) return;
    setRecoveringWindow(true);
    setWindowRecoveryStatus(null);
    try {
      const result = await onRecoverWindow();
      setWindowRecoveryStatus(result?.available === false
        ? {
            tone: 'error',
            message: t('about.nativeOnly')
          }
        : {
            tone: 'success',
            message: t('about.windowRecovered')
          });
    } catch (error) {
      setWindowRecoveryStatus({
        tone: 'error',
        message: error?.message || t('about.windowRecoveryFailed')
      });
    } finally {
      setRecoveringWindow(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        className="flex max-h-[calc(100vh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-2xl sm:max-h-[calc(100vh-2rem)]"
      >
        <div className="flex items-center justify-between border-b border-gray-800 bg-gray-800/50 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/omniport-logo.png" alt="" className="h-9 w-9 rounded-lg shadow" />
            <div className="min-w-0">
              <h2 id="about-modal-title" className="truncate text-base font-bold text-white">
                {APP_NAME}
              </h2>
              <p className="text-xs text-gray-500">{t('app.tagline')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            aria-label={t('about.closeInfo')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
          <section className="rounded border border-gray-800 bg-gray-950/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-300">
              <Info className="h-4 w-4" />
              {t('about.versionEnv')}
            </div>
            <InfoRow label={t('about.appVersion')} value={APP_VERSION} />
            <InfoRow label={t('about.system')} value={runtime.operatingSystem} />
            <InfoRow label={t('about.architecture')} value={runtime.architecture} />
            <InfoRow label="Neutralino" value={runtime.neutralinoVersion} />
            <InfoRow label="Client API" value={runtime.clientVersion} />
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded border border-gray-800 bg-gray-950/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                <Network className="h-4 w-4" />
                {t('about.protocols')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUPPORTED_PROTOCOLS.map(protocol => (
                  <span key={protocol} className="rounded border border-gray-800 bg-gray-900 px-2 py-1 text-[11px] text-gray-300">
                    {protocol}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded border border-gray-800 bg-gray-950/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
                <Lightbulb className="h-4 w-4" />
                {t('about.tips')}
              </div>
              <ul className="space-y-1.5 text-xs leading-relaxed text-gray-400">
                <li>• {t('about.tipDisable')}</li>
                <li>• {t('about.tipCollections')}</li>
                <li>• {t('about.tipSidebar')}</li>
              </ul>
            </section>
          </div>

          <section className="rounded border border-gray-800 bg-gray-950/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-300">
              <Keyboard className="h-4 w-4" />
              {t('about.hotkeys')}
            </div>
            <div className="divide-y divide-gray-800/70">
              {APP_HOTKEY_LIST.map(hotkey => (
                <div key={hotkey.id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-300">
                      {t(hotkey.id === 'save-request' ? 'hotkeys.saveRequest.label' : hotkey.label)}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
                      {t(hotkey.id === 'save-request' ? 'hotkeys.saveRequest.description' : hotkey.description)}
                    </div>
                  </div>
                  <kbd className="flex-shrink-0 rounded border border-gray-700 bg-gray-900 px-2 py-1 font-mono text-[11px] font-semibold text-gray-300 shadow-sm">
                    {getHotkeyDisplayLabel(hotkey)}
                  </kbd>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded border border-gray-800 bg-gray-950/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-300">
              <ShieldCheck className="h-4 w-4" />
              {t('about.data')}
            </div>
            <div className="flex items-start gap-2 text-xs leading-relaxed text-gray-400">
              <Database className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-600" />
              <p>
                {t('about.dataText')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRecoverWindow()}
              disabled={!onRecoverWindow || recoveringWindow}
              className="mt-3 inline-flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:border-indigo-500/60 hover:bg-indigo-500/10 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {recoveringWindow
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : <MonitorUp className="h-4 w-4" />}
              {t('about.recoverWindow')}
            </button>
            {windowRecoveryStatus && (
              <div className={`mt-2 flex items-center gap-1.5 text-[11px] ${
                windowRecoveryStatus.tone === 'success'
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
              >
                {windowRecoveryStatus.tone === 'success'
                  ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                  : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
                {windowRecoveryStatus.message}
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-800 bg-gray-800/30 p-3">
          <a
            href={APP_REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-indigo-300"
          >
            GitHub
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
