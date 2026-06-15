import { RefreshCw } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import { getMethodColor } from '../../utils/formatters.js';

const inputClassName = 'min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-white outline-none focus:border-indigo-500';

const HttpFields = ({ state, actions }) => (
  <>
    <select
      value={state.method}
      onChange={(event) => actions.onMethodChange(event.target.value)}
      className={`flex-shrink-0 rounded border border-gray-700 bg-gray-800 px-2.5 py-2 text-sm font-bold outline-none focus:border-indigo-500 sm:px-3 ${getMethodColor(state.method)}`}
    >
      {state.methods.map(method => (
        <option key={method} value={method}>{method}</option>
      ))}
    </select>
    <input
      type="text"
      value={state.url}
      onChange={(event) => actions.onUrlChange(event.target.value)}
      placeholder="https://api.example.com/v1/resource"
      className={`basis-[20rem] ${inputClassName}`}
    />
  </>
);

const GrpcFields = ({ state, actions }) => {
  const { t } = useTranslation();
  const selectedService = state.grpcServices.find(service => (
    service.name === state.grpcService
  ));
  const methods = selectedService?.methods || [];
  const hasSavedService = Boolean(state.grpcService)
    && !state.grpcServices.some(service => service.name === state.grpcService);
  const hasSavedMethod = Boolean(state.grpcMethod)
    && !methods.some(method => method.name === state.grpcMethod);

  return (
    <>
      <input
        type="text"
        value={state.grpcTarget}
        onChange={(event) => actions.onGrpcTargetChange(event.target.value)}
        placeholder="localhost:50051"
        className={`basis-44 ${inputClassName}`}
      />
      <select
        value={state.grpcService}
        onChange={(event) => actions.onGrpcServiceChange(event.target.value)}
        disabled={state.grpcDiscoveryLoading && state.grpcServices.length === 0}
        aria-label={t('protocol.grpcService')}
        title={state.grpcService || t('protocol.chooseGrpcService')}
        className={`basis-52 ${inputClassName} disabled:cursor-wait disabled:opacity-60`}
      >
        {!state.grpcService && (
          <option value="">
            {state.grpcDiscoveryLoading ? t('protocol.discoveringServices') : t('protocol.chooseService')}
          </option>
        )}
        {hasSavedService && (
          <option value={state.grpcService}>{state.grpcService} ({t('protocol.saved')})</option>
        )}
        {state.grpcServices.map(service => (
          <option key={service.name} value={service.name}>
            {service.name}
          </option>
        ))}
      </select>
      <select
        value={state.grpcMethod}
        onChange={(event) => actions.onGrpcMethodChange(event.target.value)}
        disabled={!selectedService || methods.length === 0}
        aria-label={t('protocol.grpcMethod')}
        title={state.grpcMethod || t('protocol.chooseMethod')}
        className={`basis-40 ${inputClassName} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {!state.grpcMethod && (
          <option value="">
            {selectedService ? t('protocol.chooseMethod') : t('protocol.chooseMethodAfterService')}
          </option>
        )}
        {hasSavedMethod && (
          <option value={state.grpcMethod}>{state.grpcMethod} ({t('protocol.saved')})</option>
        )}
        {methods.map(method => (
          <option key={method.name} value={method.name}>
            {method.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={actions.onRefreshGrpcDiscovery}
        disabled={state.grpcDiscoveryLoading || !state.grpcSchemaValid}
        className={`inline-flex min-w-10 flex-shrink-0 items-center justify-center gap-1.5 rounded border px-2.5 py-2 text-xs transition-colors ${
          state.grpcDiscoveryError
            ? 'border-red-500/40 bg-red-500/10 text-red-300'
            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-indigo-500/50 hover:text-indigo-200'
        } disabled:cursor-not-allowed disabled:opacity-40`}
        title={state.grpcDiscoveryError || t('protocol.refreshGrpc')}
      >
        <RefreshCw className={`h-4 w-4 ${state.grpcDiscoveryLoading ? 'animate-spin' : ''}`} />
        {state.grpcServices.length > 0 && <span>{state.grpcServices.length}</span>}
      </button>
    </>
  );
};

const NetworkFields = ({ state, actions }) => (
  <>
    <input
      type="text"
      value={state.networkTarget}
      onChange={(event) => actions.onNetworkTargetChange(event.target.value)}
      placeholder="localhost:9000"
      className={`basis-[18rem] ${inputClassName}`}
    />
    <label className="flex flex-shrink-0 items-center gap-2 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-400">
      Timeout
      <input
        type="number"
        min="100"
        max="60000"
        step="100"
        value={state.networkTimeoutMs}
        onChange={(event) => actions.onNetworkTimeoutChange(event.target.value)}
        className="w-20 rounded border border-gray-700 bg-gray-950 px-2 py-1 font-mono text-gray-200 outline-none focus:border-indigo-500"
      />
      ms
    </label>
  </>
);

export default function RequestProtocolFields({ state, actions }) {
  const { t } = useTranslation();

  return (
    <>
      <select
        value={state.protocol}
        onChange={(event) => actions.onProtocolChange(event.target.value)}
        disabled={state.networkReading}
        className="flex-shrink-0 rounded border border-gray-700 bg-gray-800 px-2.5 py-2 text-sm font-bold text-indigo-300 outline-none focus:border-indigo-500 disabled:opacity-60 sm:px-3"
      >
        <option value="http">HTTP</option>
        <option value="grpc">gRPC</option>
        <option value="ws">WS</option>
        <option value="tcp">TCP</option>
        <option value="udp">UDP</option>
      </select>

      {state.protocol === 'http' && <HttpFields state={state} actions={actions} />}
      {state.protocol === 'ws' && (
        <input
          type="text"
          value={state.wsUrl}
          onChange={(event) => actions.onWsUrlChange(event.target.value)}
          placeholder="wss://example.com/socket"
          className={`basis-[20rem] ${inputClassName}`}
        />
      )}
      {state.protocol === 'grpc' && <GrpcFields state={state} actions={actions} />}
      {(state.protocol === 'tcp' || state.protocol === 'udp') && (
        <NetworkFields state={state} actions={actions} />
      )}

      {state.protocol === 'grpc' && state.grpcDiscoveryError && (
        <div className="w-full rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {t('protocol.schemaReadFailed', { error: state.grpcDiscoveryError })}
        </div>
      )}
    </>
  );
}
