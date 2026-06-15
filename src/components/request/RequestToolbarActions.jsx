import { PlugZap, Save, Send, Square, Unplug } from 'lucide-react';
import {
  APP_HOTKEYS,
  getHotkeyAriaKeyShortcuts,
  getHotkeyDisplayLabel
} from '../../config/hotkeys.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

const LoadingSpinner = () => (
  <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
);

const sendButtonClassName = 'min-w-28 flex-1 rounded bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-indigo-500 disabled:bg-indigo-800 2xl:flex-none';

const WebsocketActions = ({ state, actions }) => {
  const { t } = useTranslation();

  return (
    <>
      <button
        type="button"
        onClick={state.wsConnected ? actions.onCloseWebsocket : actions.onConnectWebsocket}
        disabled={state.loading || (!state.wsConnected && !state.wsUrl.trim())}
        className={`min-w-28 flex-1 rounded px-4 py-2 text-sm font-medium text-white shadow transition-colors 2xl:flex-none ${
          state.wsConnected
            ? 'bg-red-600 hover:bg-red-500 disabled:bg-red-900 disabled:text-red-300/50'
            : 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 disabled:text-emerald-300/50'
        }`}
      >
        <span className="flex items-center justify-center gap-2">
          {['ws-connect', 'ws-close'].includes(state.operationKind)
            ? <LoadingSpinner />
            : state.wsConnected
              ? <Unplug className="h-4 w-4" />
              : <PlugZap className="h-4 w-4" />}
          {state.wsConnected ? t('toolbar.disconnect') : t('toolbar.connect')}
        </span>
      </button>
      <button
        type="button"
        onClick={actions.onSendWebsocketMessage}
        disabled={state.loading || !state.wsConnected}
        className={sendButtonClassName}
      >
        <span className="flex items-center justify-center gap-2">
          {state.operationKind === 'ws-send'
            ? <LoadingSpinner />
            : <Send className="h-4 w-4" />}
          {t('toolbar.send')}
        </span>
      </button>
    </>
  );
};

const isSendDisabled = (state) => (
  state.loading
  || (
    state.protocol === 'grpc'
    && (
      !state.grpcTarget.trim()
      || !state.grpcService.trim()
      || !state.grpcMethod.trim()
      || !state.grpcSchemaValid
      || !state.grpcPayloadValid
      || state.grpcDiscoveryLoading
    )
  )
  || (
    (state.protocol === 'tcp' || state.protocol === 'udp')
    && (!state.networkTarget.trim() || !state.networkPayloadValid)
  )
  || (state.protocol === 'tcp' && !state.networkReadConfigValid)
);

const getSendHandler = (state, actions) => {
  if (state.protocol === 'grpc') return actions.onSendGrpcRequest;
  if (state.protocol === 'tcp' || state.protocol === 'udp') {
    return actions.onSendNetworkRequest;
  }
  return actions.onSendHttpRequest;
};

export default function RequestToolbarActions({ state, actions }) {
  const { t } = useTranslation();
  const saveHotkeyLabel = getHotkeyDisplayLabel(APP_HOTKEYS.saveRequest);

  return (
    <div className="flex w-full flex-wrap gap-2 2xl:ml-auto 2xl:w-auto">
      {state.protocol === 'http' && (
        <label className="min-w-28 flex-1 whitespace-nowrap rounded border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-300 2xl:flex-none">
          <span className="flex items-center justify-center gap-2">
            <input
              type="checkbox"
              checked={state.disableReuse}
              onChange={(event) => actions.onDisableReuseChange(event.target.checked)}
              className="accent-indigo-500"
            />
            {t('toolbar.newConnection')}
          </span>
        </label>
      )}

      <button
        type="button"
        onClick={actions.onOpenSaveModal}
        aria-keyshortcuts={getHotkeyAriaKeyShortcuts(APP_HOTKEYS.saveRequest)}
        className="min-w-24 flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-300 transition-colors hover:bg-gray-700 2xl:flex-none"
        title={state.requestSaveStatus === 'unsaved'
          ? t('toolbar.saveChoose', { hotkey: saveHotkeyLabel })
          : t('toolbar.saveDirect', { hotkey: saveHotkeyLabel })}
      >
        <span className="flex items-center justify-center gap-1.5">
          <Save className="h-4 w-4 text-gray-400" />
          <span className="text-sm">
            {state.requestSaveStatus === 'unsaved' ? t('common.save') : t('common.saveChanges')}
          </span>
        </span>
      </button>

      {state.protocol === 'tcp' && state.networkConnected && (
        <button
          type="button"
          onClick={actions.onCloseNetworkSession}
          className="min-w-28 flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-300 transition-colors hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-300 2xl:flex-none"
          title={t('toolbar.closeTcp')}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Unplug className="h-4 w-4" />
            <span className="text-sm">{t('toolbar.closeTcpShort')}</span>
          </span>
        </button>
      )}

      {state.protocol === 'ws' ? (
        <WebsocketActions state={state} actions={actions} />
      ) : state.protocol === 'tcp' && state.networkReading ? (
        <button
          type="button"
          onClick={actions.onStopNetworkRead}
          className="min-w-36 flex-1 rounded bg-amber-600 px-5 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-amber-500 2xl:flex-none"
        >
          <span className="flex items-center justify-center gap-2">
            <Square className="h-3.5 w-3.5 fill-current" />
            {t('toolbar.stopRead')}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={getSendHandler(state, actions)}
          disabled={isSendDisabled(state)}
          className={sendButtonClassName}
        >
          <span className="flex items-center justify-center gap-2">
            {state.loading ? <LoadingSpinner /> : <Send className="h-4 w-4" />}
            {t('toolbar.send')}
          </span>
        </button>
      )}
    </div>
  );
}
