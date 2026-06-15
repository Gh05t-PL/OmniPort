import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

export default function GrpcPayloadEditor({
  value,
  selectedMethod,
  validation,
  onChange,
  onGenerateTemplate
}) {
  const { t } = useTranslation();
  const hasMethodSchema = Boolean(selectedMethod?.requestSchema);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-xs text-gray-500">
          {selectedMethod ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-gray-300">{selectedMethod.inputType}</span>
              <span>→</span>
              <span className="font-mono text-gray-400">{selectedMethod.outputType}</span>
              {selectedMethod.clientStreaming && (
                <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">
                  client stream
                </span>
              )}
              {selectedMethod.serverStreaming && (
                <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-300">
                  server stream
                </span>
              )}
            </div>
          ) : (
            <span>{t('grpcPayload.chooseMethod')}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onGenerateTemplate}
          disabled={!hasMethodSchema}
          className="inline-flex items-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-medium text-indigo-200 transition-colors hover:border-indigo-400/60 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          title={t('grpcPayload.replaceTemplate')}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t('grpcPayload.insertTemplate')}
        </button>
      </div>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`min-h-40 flex-1 resize-none rounded border bg-gray-900 p-4 font-mono text-sm outline-none custom-scrollbar ${
          validation.valid
            ? 'border-gray-800 focus:border-indigo-500'
            : 'border-red-500/60 focus:border-red-400'
        }`}
        spellCheck="false"
        placeholder={`{\n  "field": "value"\n}`}
      />

      <div className={`flex items-start gap-2 rounded border px-3 py-2 text-xs ${
        validation.valid
          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
          : 'border-red-500/30 bg-red-500/10 text-red-300'
      }`}>
        {validation.valid
          ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          : <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
        <div className="space-y-1">
          {validation.valid ? (
            <div>{hasMethodSchema ? t('grpcPayload.schemaValid') : t('grpcPayload.jsonValid')}</div>
          ) : validation.errors.map(error => (
            <div key={error}>{error}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
