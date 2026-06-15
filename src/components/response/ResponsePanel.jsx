import {
  AlertCircle,
  ArrowDownToLine,
  Binary,
  Check,
  Clock,
  Copy,
  FileJson,
  FileText,
  Server
} from 'lucide-react';
import { isNetworkResponse, networkResponseText } from '../../domain/network.js';
import { isWebsocketResponse } from '../../domain/websocket.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import { formatMessageDate, getStatusColor } from '../../utils/formatters.js';
import { NetworkHexView } from './NetworkHexView.jsx';
import TraceWaterfall from './TraceWaterfall.jsx';

const INCOMPLETE_NETWORK_READ_MESSAGE_KEYS = {
  'manual-stop': 'response.incomplete.manual-stop',
  timeout: 'response.incomplete.timeout',
  'connection-close': 'response.incomplete.connection-close'
};

export default function ResponsePanel({
  layout,
  response,
  loading,
  operationKind,
  activeResTab,
  copied,
  wsAutoScroll,
  responseScrollRef,
  formatTraceRows,
  onResponseTabChange,
  onCopyResponse,
  onToggleWsAutoScroll
}) {
  const { t } = useTranslation();
  const networkResponse = isNetworkResponse(response);
  const incompleteNetworkReadMessage = networkResponse
    && response.networkProtocol === 'tcp'
    && response.networkReadComplete === false
    ? t(INCOMPLETE_NETWORK_READ_MESSAGE_KEYS[response.networkReadReason]
      || 'response.incomplete.default')
    : '';
  const canCopyResponse = networkResponse
    ? ['text', 'hex'].includes(activeResTab)
    : activeResTab === 'body';

  return (
    <div className={`flex flex-col bg-gray-950 overflow-hidden relative min-w-0 ${
      layout === 'horizontal'
        ? 'w-1/2 h-full min-h-0'
        : 'w-full h-1/2 min-h-0'
    }`}>
      <div className="px-3 py-2.5 sm:p-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-2 min-h-[58px] sm:min-h-[65px] bg-gray-900 flex-shrink-0">
        <h2 className="text-gray-400 font-bold text-xs sm:text-sm tracking-wider uppercase">{t('response.title')}</h2>
        {response && !response.error && (
          <div className="flex min-w-0 max-w-full items-center gap-2 sm:gap-3 text-xs bg-gray-950 px-2 sm:px-3 py-1.5 rounded-md border border-gray-800 shadow-inner">
            <div className="flex min-w-0 items-center gap-1 font-mono">
              <span className="text-gray-500">{t('response.status')}</span>
              <span className={`truncate font-bold ${getStatusColor(response.status)}`}>{response.status} {response.statusText}</span>
            </div>
            {!isWebsocketResponse(response) && (
              <>
                <div className="w-px h-4 bg-gray-800 hidden sm:block"></div>
                {response.httpVersion && (
                  <>
                    <div className="hidden sm:flex items-center gap-1 font-mono">
                      <span className="text-gray-500">HTTP:</span>
                      <span className="text-sky-300 font-bold">{response.httpVersion}</span>
                    </div>
                    <div className="w-px h-4 bg-gray-800 hidden sm:block"></div>
                  </>
                )}
                <div className="hidden sm:flex items-center gap-1 font-mono">
                  <Clock className="w-3.5 h-3.5 text-gray-500"/>
                  <span className="text-emerald-400 font-bold">{response.time} ms</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {!response && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-4">
            <Server className="w-16 h-16 opacity-10" />
            <p className="text-sm">{t('response.empty')}</p>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 bg-gray-950/90 backdrop-blur-sm z-10 flex items-center justify-center text-indigo-400 gap-3">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="font-semibold text-sm">
              {operationKind === 'ws-connect'
                ? t('response.wsConnecting')
                : operationKind === 'ws-close'
                  ? t('response.wsClosing')
                  : operationKind === 'ws-send'
                    ? t('response.wsSending')
                    : operationKind === 'tcp-read'
                      ? t('response.tcpReading')
                      : t('response.sending')}
            </span>
          </div>
        )}
        {response?.error && (
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center overflow-auto">
            <div className="bg-red-500/5 text-red-400 p-6 rounded-lg max-w-md border border-red-500/20 shadow-lg">
              <AlertCircle className="w-10 h-10 mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">{t('response.connectionProblem')}</h3>
              {typeof response.time === 'number' && (
                <div className="mb-3 inline-flex items-center gap-1.5 rounded border border-red-500/20 bg-red-950/30 px-2 py-1 font-mono text-xs text-red-300">
                  <Clock className="h-3.5 w-3.5" />
                  {response.time} ms
                </div>
              )}
              <p className="text-sm opacity-80 mb-4">{response.error}</p>
              <p className="text-xs opacity-75 bg-red-950/30 p-3 rounded text-left border border-red-900/40 line-height-relaxed">
                {response.hint}
              </p>
            </div>
          </div>
        )}

        {response && !response.error && (
          <>
            <div className="flex min-h-[43px] min-w-0 border-b border-gray-800 bg-gray-900 px-2 sm:px-4 gap-2 justify-between items-center flex-shrink-0">
              <div className="flex min-w-0 h-[42px] gap-3 sm:gap-4 items-end overflow-x-auto custom-scrollbar">
                {networkResponse ? (
                  <>
                    <button className={`whitespace-nowrap pb-2 px-1 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeResTab === 'text' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`} onClick={() => onResponseTabChange('text')}>
                      <FileText className="w-4 h-4" /> Text
                    </button>
                    <button className={`whitespace-nowrap pb-2 px-1 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeResTab === 'hex' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`} onClick={() => onResponseTabChange('hex')}>
                      <Binary className="w-4 h-4" /> Hex
                    </button>
                  </>
                ) : (
                  <button className={`whitespace-nowrap pb-2 px-1 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeResTab === 'body' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`} onClick={() => onResponseTabChange('body')}>
                    <FileJson className="w-4 h-4" /> Payload
                  </button>
                )}
                <button className={`whitespace-nowrap pb-2 px-1 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${activeResTab === 'headers' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`} onClick={() => onResponseTabChange('headers')}>
                  {t('response.headers', { count: response.headers.length })}
                </button>
                {!networkResponse && response.timings && (
                  <button className={`whitespace-nowrap pb-2 px-1 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${activeResTab === 'trace' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`} onClick={() => onResponseTabChange('trace')}>
                    Trace
                  </button>
                )}
              </div>
              <div
                className={`h-[42px] flex items-center gap-1.5 flex-shrink-0 ${
                  canCopyResponse ? '' : 'invisible pointer-events-none'
                }`}
                aria-hidden={!canCopyResponse}
              >
                {canCopyResponse && isWebsocketResponse(response) && (
                  <button
                    type="button"
                    aria-pressed={wsAutoScroll}
                    onClick={onToggleWsAutoScroll}
                    className={`text-xs flex items-center gap-1.5 transition-colors bg-gray-800 px-2.5 py-1 rounded border shadow-sm ${
                      wsAutoScroll
                        ? 'border-emerald-500/50 text-emerald-300 hover:text-emerald-200'
                        : 'border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                    title={wsAutoScroll ? t('response.disableAutoscroll') : t('response.enableAutoscroll')}
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    Auto-scroll
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCopyResponse}
                    className="h-[28px] text-xs flex items-center justify-center gap-1.5 text-gray-400 hover:text-white transition-colors bg-gray-800 px-2 sm:px-2.5 rounded border border-gray-700 shadow-sm"
                  tabIndex={canCopyResponse ? 0 : -1}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400"/> : <Copy className="w-3.5 h-3.5"/>}
                  <span className="hidden sm:inline">{copied ? t('common.copied') : t('common.copy')}</span>
                </button>
              </div>
            </div>

            <div ref={responseScrollRef} className="flex-1 min-h-0 overflow-y-auto p-2.5 sm:p-4 custom-scrollbar">
              {incompleteNetworkReadMessage && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-400" />
                  <span>{incompleteNetworkReadMessage}</span>
                </div>
              )}
              {networkResponse && activeResTab === 'text' && (
                <pre className="font-mono text-sm text-gray-300 whitespace-pre-wrap word-break">
                  {networkResponseText(response) || t('response.noData')}
                </pre>
              )}
              {networkResponse && activeResTab === 'hex' && (
                <NetworkHexView response={response} />
              )}
              {activeResTab === 'body' && (
                isWebsocketResponse(response) ? (
                  <div className="space-y-2">
                    {Array.isArray(response.data) && response.data.length > 0 ? response.data.map(frame => (
                      <div key={frame.id} className="border border-gray-800 rounded bg-gray-900/50 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-gray-800 text-[11px] font-mono">
                          <span className={`font-bold uppercase ${
                            frame.direction === 'in'
                              ? 'text-emerald-300'
                              : frame.direction === 'out'
                                ? 'text-indigo-300'
                                : frame.direction === 'error'
                                  ? 'text-red-300'
                                  : 'text-gray-400'
                          }`}>{frame.direction}</span>
                          <span className="text-gray-500">
                            {frame.messageType} / {frame.encoding} / {frame.bytes} B
                          </span>
                          <span className="text-gray-500">{formatMessageDate(frame.time)}</span>
                        </div>
                        <pre className="font-mono text-sm text-gray-300 whitespace-pre-wrap break-words p-3">
                          {frame.message}
                        </pre>
                      </div>
                    )) : (
                      <div className="text-sm text-gray-500 italic">{t('response.noWsFrames')}</div>
                    )}
                  </div>
                ) : (
                  <pre className="font-mono text-sm text-gray-300 whitespace-pre-wrap word-break">
                    {response.isJson ? JSON.stringify(response.data, null, 2) : response.data}
                  </pre>
                )
              )}
              {activeResTab === 'headers' && (
                <div className="font-mono text-sm border border-gray-800 rounded-lg overflow-hidden">
                  {response.headers.map((header, index) => (
                    <div key={index} className={`grid grid-cols-[minmax(7rem,1fr)_minmax(0,2fr)] gap-3 px-3 py-2 ${index % 2 === 0 ? 'bg-gray-900/50' : 'bg-transparent'} hover:bg-gray-800/50 transition-colors`}>
                      <div className="min-w-0 text-gray-400 font-semibold truncate" title={header.key}>{header.key}</div>
                      <div className="min-w-0 text-emerald-300 break-all">{header.value}</div>
                    </div>
                  ))}
                </div>
              )}
              {activeResTab === 'trace' && response.timings && (
                <div className="space-y-4">
                  <TraceWaterfall timings={response.timings} httpVersion={response.httpVersion} />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{t('common.details')}</div>
                    <div className="font-mono text-sm border border-gray-800 rounded-lg overflow-hidden">
                      {formatTraceRows(response.timings, response.httpVersion).map(([key, value], index) => (
                        <div key={key} className={`flex px-3 py-2 ${index % 2 === 0 ? 'bg-gray-900/50' : 'bg-transparent'} hover:bg-gray-800/50 transition-colors`}>
                          <div className="w-1/2 text-gray-400 font-semibold truncate pr-4">{key}</div>
                          <div className="w-1/2 text-emerald-300 break-all">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
