import { buildTraceWaterfall, clampTiming, formatMs } from '../../domain/trace.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

export default function TraceWaterfall({ timings, httpVersion }) {
  const { t } = useTranslation();
  const { totalMs, segments, mode } = buildTraceWaterfall(timings);
  const visibleSegments = segments.filter(segment => segment.durationMs > 0);
  const axisMiddle = Math.round(totalMs / 2);
  const reusedLabel = timings?.reusedConnection ? t('trace.reused') : t('trace.new');
  const forcedLabel = timings?.disableReuse ? t('trace.forcedNew') : t('trace.keepAliveAllowed');
  const transportLabel = mode === 'grpc' ? 'gRPC / HTTP/2' : (httpVersion || 'HTTP');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <div className="rounded border border-gray-800 bg-gray-900/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">{t('trace.total')}</div>
          <div className="font-mono text-lg font-bold text-emerald-300">{formatMs(totalMs)}</div>
        </div>
        <div className="rounded border border-gray-800 bg-gray-900/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">{t('trace.transport')}</div>
          <div className="font-mono text-sm font-bold text-gray-200">{transportLabel}</div>
        </div>
        {mode === 'http' && (
          <>
            <div className="rounded border border-gray-800 bg-gray-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">{t('trace.connection')}</div>
              <div className={`font-mono text-sm font-bold ${timings.reusedConnection ? 'text-amber-300' : 'text-sky-300'}`}>{reusedLabel}</div>
            </div>
            <div className="rounded border border-gray-800 bg-gray-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">{t('trace.reusePolicy')}</div>
              <div className="font-mono text-sm font-bold text-gray-200">{forcedLabel}</div>
            </div>
          </>
        )}
      </div>

      <div className="rounded border border-gray-800 bg-gray-950 p-3">
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] sm:grid-cols-[7rem_minmax(0,1fr)_5rem] gap-3 text-[10px] text-gray-600 font-mono mb-2">
          <div></div>
          <div className="flex justify-between px-1">
            <span>0 ms</span>
            <span>{axisMiddle} ms</span>
            <span>{Math.round(totalMs)} ms</span>
          </div>
          <div></div>
        </div>

        {visibleSegments.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-6">{t('trace.empty')}</div>
        ) : (
          <div className="space-y-2">
            {visibleSegments.map(segment => {
              const left = (segment.startMs / totalMs) * 100;
              const width = (segment.durationMs / totalMs) * 100;

              return (
                <div key={segment.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] sm:grid-cols-[7rem_minmax(0,1fr)_5rem] gap-3 items-center text-xs">
                  <div className="min-w-0">
                    <div className="text-gray-300 font-semibold truncate" title={segment.hint}>{segment.label}</div>
                    <div className="text-[10px] text-gray-600 font-mono">{segment.startMs} ms</div>
                  </div>
                  <div className="relative h-8 rounded bg-gray-900 border border-gray-800 overflow-hidden">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-gray-800"></div>
                    <div
                      className="absolute top-1 bottom-1 rounded-sm shadow-sm"
                      style={{
                        left: `${clampTiming(left, 0, 100)}%`,
                        width: `${Math.max(width, 1)}%`,
                        maxWidth: `${Math.max(0, 100 - clampTiming(left, 0, 100))}%`,
                        backgroundColor: segment.color
                      }}
                      title={`${segment.label}: ${segment.durationMs} ms`}
                    ></div>
                  </div>
                  <div className="text-right font-mono text-emerald-300">{segment.durationMs} ms</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
