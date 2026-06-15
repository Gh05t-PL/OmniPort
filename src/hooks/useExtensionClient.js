import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  EXTENSION_ACK_RETRY_MS,
  EXTENSION_DISPATCH_RETRY_MS,
  EXTENSION_HEALTH_ATTEMPTS,
  EXTENSION_HEALTH_DISPATCH_TIMEOUT_MS,
  EXTENSION_HEALTH_EVENT,
  EXTENSION_HEALTH_RESULT_EVENT,
  EXTENSION_HEALTH_TIMEOUT_MS,
  EXTENSION_ID,
  NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS
} from '../config/constants.js';
import {
  dispatchExtensionEventWithRetry,
  emitClientLog,
  restartNeutralinoProcessOnce
} from '../services/neutralino.js';
import { useTranslation } from '../i18n/I18nProvider.jsx';
import { delay, withTimeout } from '../utils/async.js';
import { createRequestToken } from '../utils/ids.js';

export default function useExtensionClient() {
  const { t } = useTranslation();
  const pendingCleanupsRef = useRef(new Set());

  useEffect(() => () => {
    pendingCleanupsRef.current.forEach(cleanup => cleanup());
    pendingCleanupsRef.current.clear();
  }, []);

  const pingExtension = useCallback(async () => {
    if (!window.Neutralino?.extensions?.dispatch) {
      throw new Error(t('errors.extensionApiUnavailable'));
    }

    const requestId = createRequestToken('health');
    return new Promise(async (resolve, reject) => {
      let settled = false;
      let timeoutId = null;

      const cleanup = async () => {
        await Promise.allSettled([
          window.Neutralino.events.off(EXTENSION_HEALTH_RESULT_EVENT, handlePong)
        ]);
      };
      const cleanupPendingHealthCheck = () => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        void cleanup();
      };
      const finish = async (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        pendingCleanupsRef.current.delete(cleanupPendingHealthCheck);
        await cleanup();
        callback(value);
      };
      const handlePong = (event) => {
        if (event.detail?.requestId === requestId) {
          finish(resolve, true);
        }
      };

      timeoutId = setTimeout(() => {
        finish(reject, new Error(t('errors.extensionHealthTimeout')));
      }, EXTENSION_HEALTH_TIMEOUT_MS);
      pendingCleanupsRef.current.add(cleanupPendingHealthCheck);

      try {
        await withTimeout(
          window.Neutralino.events.on(EXTENSION_HEALTH_RESULT_EVENT, handlePong),
          NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
          t('errors.extensionHealthRegisterTimeout')
        );
        await dispatchExtensionEventWithRetry({
          extensionId: EXTENSION_ID,
          eventName: EXTENSION_HEALTH_EVENT,
          payload: { requestId },
          retryTimeoutMs: EXTENSION_HEALTH_DISPATCH_TIMEOUT_MS,
          shouldStop: () => settled
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }, [t]);

  const ensureExtensionResponsive = useCallback(async () => {
    let lastError = null;

    for (let attempt = 0; attempt < EXTENSION_HEALTH_ATTEMPTS; attempt += 1) {
      try {
        await pingExtension();
        return;
      } catch (error) {
        lastError = error;
        emitClientLog('warn', 'extension health check failed', {
          attempt: attempt + 1,
          error: error?.message || String(error)
        });
        if (attempt + 1 < EXTENSION_HEALTH_ATTEMPTS) {
          await delay(EXTENSION_DISPATCH_RETRY_MS);
        }
      }
    }

    if (restartNeutralinoProcessOnce('OmniPort extension health check failed; restarting Neutralino process.')) {
      throw new Error(t('errors.extensionWakeRestart'));
    }

    throw new Error(t('errors.extensionHealthFailed', {
      message: lastError?.message || lastError || t('errors.extensionNoResponse')
    }));
  }, [pingExtension, t]);

  const sendRequest = useCallback(async ({ eventName, ackEvent, resultEvent, errorEvent, payload }) => {
    if (!window.Neutralino?.extensions?.dispatch) {
      throw new Error(t('errors.extensionApiBrowser'));
    }
    await ensureExtensionResponsive();

    return new Promise(async (resolve, reject) => {
      let settled = false;
      let timeoutId = null;
      let ackReceived = false;

      const cleanup = async () => {
        const listeners = [
          window.Neutralino.events.off(resultEvent, handleResult),
          window.Neutralino.events.off(errorEvent, handleError)
        ];
        if (ackEvent) {
          listeners.push(window.Neutralino.events.off(ackEvent, handleAck));
        }
        await Promise.allSettled(listeners);
      };
      const cleanupPendingRequest = () => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        void cleanup();
      };
      const finish = async (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        pendingCleanupsRef.current.delete(cleanupPendingRequest);
        await cleanup();
        callback(value);
      };
      const handleResult = (event) => {
        if (event.detail?.requestId === payload.requestId) {
          ackReceived = true;
          finish(resolve, event.detail);
        }
      };
      const handleError = (event) => {
        if (event.detail?.requestId === payload.requestId) {
          ackReceived = true;
          finish(reject, new Error(event.detail.message || t('errors.extensionRequestFailed')));
        }
      };
      const handleAck = (event) => {
        if (event.detail?.requestId === payload.requestId) {
          ackReceived = true;
        }
      };

      timeoutId = setTimeout(() => {
        emitClientLog('error', 'request timed out while waiting for extension response', {
          eventName,
          requestId: payload.requestId
        });
        if (restartNeutralinoProcessOnce('OmniPort request timed out while waiting for extension response; restarting Neutralino process.')) {
          finish(reject, new Error(t('errors.extensionRequestTimeoutRestart')));
          return;
        }
        finish(reject, new Error(t('errors.extensionRequestTimeout')));
      }, REQUEST_TIMEOUT_MS);
      pendingCleanupsRef.current.add(cleanupPendingRequest);

      try {
        await window.Neutralino.events.on(resultEvent, handleResult);
        await window.Neutralino.events.on(errorEvent, handleError);
        if (ackEvent) {
          await window.Neutralino.events.on(ackEvent, handleAck);
        }

        while (!settled && !ackReceived) {
          await dispatchExtensionEventWithRetry({
            extensionId: EXTENSION_ID,
            eventName,
            payload,
            shouldStop: () => settled || ackReceived
          });
          if (!settled && !ackReceived) {
            await delay(EXTENSION_ACK_RETRY_MS);
          }
        }
      } catch (error) {
        finish(reject, error);
      }
    });
  }, [ensureExtensionResponsive, t]);

  return useMemo(() => ({
    sendHttpRequest: (payload) => sendRequest({
      eventName: 'httpRequest',
      ackEvent: 'httpRequestAck',
      resultEvent: 'httpFetchResult',
      errorEvent: 'httpFetchError',
      payload
    }),
    sendGrpcRequest: (payload) => sendRequest({
      eventName: 'grpcRequest',
      ackEvent: 'grpcRequestAck',
      resultEvent: 'grpcRequestResult',
      errorEvent: 'grpcRequestError',
      payload
    }),
    describeGrpcApi: (payload) => sendRequest({
      eventName: 'grpcDescribe',
      ackEvent: 'grpcDescribeAck',
      resultEvent: 'grpcDescribeResult',
      errorEvent: 'grpcDescribeError',
      payload
    }),
    sendNetworkRequest: (payload) => sendRequest({
      eventName: 'networkRequest',
      ackEvent: 'networkRequestAck',
      resultEvent: 'networkRequestResult',
      errorEvent: 'networkRequestError',
      payload
    }),
    stopNetworkRead: (payload) => sendRequest({
      eventName: 'networkStopRead',
      ackEvent: 'networkStopReadAck',
      resultEvent: 'networkStopReadResult',
      errorEvent: 'networkStopReadError',
      payload
    }),
    closeNetworkSession: (payload) => sendRequest({
      eventName: 'networkClose',
      ackEvent: 'networkCloseAck',
      resultEvent: 'networkCloseResult',
      errorEvent: 'networkCloseError',
      payload
    }),
    connectWebsocket: (payload) => sendRequest({
      eventName: 'wsConnect',
      ackEvent: 'wsConnectAck',
      resultEvent: 'wsConnectResult',
      errorEvent: 'wsConnectError',
      payload
    }),
    sendWebsocketMessage: (payload) => sendRequest({
      eventName: 'wsSend',
      ackEvent: 'wsSendAck',
      resultEvent: 'wsSendResult',
      errorEvent: 'wsSendError',
      payload
    }),
    closeWebsocket: (payload) => sendRequest({
      eventName: 'wsClose',
      ackEvent: 'wsCloseAck',
      resultEvent: 'wsCloseResult',
      errorEvent: 'wsCloseError',
      payload
    })
  }), [sendRequest]);
}
