import { MULTIPART_TOTAL_MAX_BYTES } from '../config/constants.js';
import { validateGrpcPayload } from '../domain/grpc.js';
import { isEditableHexValid, parseEditableHex } from '../domain/network.js';
import {
  getHeaderValue,
  isKeyValueRowEnabled,
  normalizeHeaderRows
} from '../utils/headers.js';
import { formatFileSize } from '../utils/files.js';
import { emitClientLog } from '../services/neutralino.js';
import { createRequestToken } from '../utils/ids.js';
import { useTranslation } from '../i18n/I18nProvider.jsx';

export default function useRequestExecutionController({
  url,
  method,
  reqHeaders,
  queryParams,
  bodyType,
  reqBodyRaw,
  reqBodyForm,
  reqBodyMultipart,
  disableReuse,
  grpcTarget,
  grpcService,
  grpcMethod,
  grpcMetadata,
  grpcBodyRaw,
  grpcSchemaMode,
  grpcProtoFiles,
  grpcProtoset,
  grpcRequestSchema,
  protocol,
  networkTarget,
  networkPayload,
  networkPayloadBase64,
  networkPayloadHex,
  networkPayloadMode,
  networkPayloadFileName,
  networkTimeoutMs,
  networkReadMode,
  networkExactBytes,
  networkDelimiterHex,
  networkLengthPrefixBytes,
  networkLengthPrefixEndian,
  networkKeepConnection,
  networkConnectionId,
  networkActiveRequestId,
  activeResTab,
  beginTabOperation,
  finishTabOperation,
  applyTabOperationPatch,
  isTabOperationActive,
  setResponse,
  setNetworkReading,
  setNetworkActiveRequestId,
  setNetworkConnected,
  setActiveResTab,
  setActiveHistoryItemId,
  appendHistoryItem,
  sendHttpRequest,
  sendGrpcRequest,
  sendNetworkRequest,
  stopNetworkRead,
  closeNetworkSession
}) {
  const { t } = useTranslation();

  const handleSendHttpRequest = async () => {
    if (!url) return;
    const operation = beginTabOperation('http');
    applyTabOperationPatch(operation, { response: null });
    setActiveHistoryItemId('');

    try {
      const headers = {};
      reqHeaders.forEach(item => {
        if (isKeyValueRowEnabled(item) && item.key.trim() !== '') {
          headers[item.key.trim()] = item.value.trim();
        }
      });

      let bodyDataForHistory = '';
      let formArrayForHistory = null;
      let multipartArrayForHistory = null;
      let requestBody = '';
      let multipart = [];
      if (bodyType === 'raw') {
        requestBody = reqBodyRaw;
        bodyDataForHistory = reqBodyRaw;
      } else if (bodyType === 'urlencoded') {
        const params = new URLSearchParams();
        reqBodyForm.forEach(item => {
          if (item.key.trim()) params.append(item.key.trim(), item.value);
        });
        requestBody = params.toString();
        bodyDataForHistory = requestBody;
        formArrayForHistory = [...reqBodyForm];
      } else if (bodyType === 'multipart') {
        const totalFileBytes = reqBodyMultipart.reduce((total, item) => (
          item.type === 'file' ? total + (Number(item.size) || 0) : total
        ), 0);
        if (totalFileBytes > MULTIPART_TOTAL_MAX_BYTES) {
          throw new Error(t('errors.multipartTotalSize', {
            size: formatFileSize(MULTIPART_TOTAL_MAX_BYTES)
          }));
        }
        multipart = reqBodyMultipart
          .filter(item => item.key.trim())
          .map(item => {
            if (item.type === 'file' && typeof item.dataBase64 !== 'string') {
              throw new Error(t('errors.multipartFileMissing', { field: item.key }));
            }
            return {
              name: item.key.trim(),
              type: item.type,
              value: item.type === 'text' ? item.value : '',
              fileName: item.type === 'file' ? item.fileName : '',
              contentType: item.type === 'file'
                ? item.mimeType || 'application/octet-stream'
                : '',
              dataBase64: item.type === 'file' ? item.dataBase64 : null
            };
          });
        multipartArrayForHistory = reqBodyMultipart.map(item => ({
          ...item,
          dataBase64: null
        }));
      }

      const payload = await sendHttpRequest({
        requestId: createRequestToken('http'),
        url,
        method,
        headers,
        body: requestBody,
        bodyType,
        multipart,
        disableReuse
      });

      const responseHeaders = normalizeHeaderRows(payload.headers);
      const contentType = getHeaderValue(responseHeaders, 'content-type');
      const isJson = contentType.includes('application/json');
      let data = payload.body || '';
      if (isJson && data) {
        try {
          data = JSON.parse(data);
        } catch {
          data = payload.body;
        }
      }

      const responseSnapshot = {
        status: payload.status,
        statusText: payload.statusText,
        time: payload.elapsedMs ?? payload.timings?.totalMs,
        headers: responseHeaders,
        data,
        isJson,
        timings: payload.timings,
        httpVersion: payload.httpVersion,
        httpProtoMajor: payload.httpProtoMajor,
        httpProtoMinor: payload.httpProtoMinor,
        truncated: payload.truncated,
        transport: 'Neutralino extension'
      };
      applyTabOperationPatch(operation, { response: responseSnapshot });

      appendHistoryItem({
        protocol: 'http',
        url,
        method,
        status: payload.status,
        statusText: payload.statusText,
        time: payload.elapsedMs ?? payload.timings?.totalMs,
        reqHeaders: [...reqHeaders],
        queryParams: [...queryParams],
        bodyType,
        reqBody: bodyDataForHistory,
        formArray: formArrayForHistory,
        multipartArray: multipartArrayForHistory,
        response: responseSnapshot
      }, { activate: isTabOperationActive(operation) });
    } catch (error) {
      const responseSnapshot = {
        error: error.message,
        hint: t('errors.httpHint'),
        time: 0
      };
      applyTabOperationPatch(operation, { response: responseSnapshot });
      appendHistoryItem({
        protocol: 'http',
        url,
        method,
        status: 'ERR',
        statusText: t('errors.generic'),
        time: 0,
        reqHeaders: [...reqHeaders],
        queryParams: [...queryParams],
        bodyType,
        reqBody: bodyType === 'raw' ? reqBodyRaw : '',
        formArray: bodyType === 'urlencoded' ? [...reqBodyForm] : null,
        multipartArray: bodyType === 'multipart'
          ? reqBodyMultipart.map(item => ({ ...item, dataBase64: null }))
          : null,
        response: responseSnapshot
      }, { activate: isTabOperationActive(operation) });
    } finally {
      finishTabOperation(operation);
    }
  };

  const handleSendGrpcRequest = async () => {
    if (!grpcTarget.trim() || !grpcService.trim() || !grpcMethod.trim()) return;
    if (grpcSchemaMode === 'proto' && grpcProtoFiles.length === 0) return;
    if (grpcSchemaMode === 'protoset' && !grpcProtoset.dataBase64) return;
    const payloadValidation = validateGrpcPayload(grpcBodyRaw, grpcRequestSchema);
    if (!payloadValidation.valid) {
      setResponse({
        error: t('errors.grpcPayloadSchema'),
        hint: payloadValidation.errors.join(' '),
        time: 0
      });
      setActiveResTab('body');
      return;
    }
    const operation = beginTabOperation('grpc');
    applyTabOperationPatch(operation, { response: null });
    setActiveHistoryItemId('');

    try {
      const metadata = {};
      grpcMetadata.forEach(item => {
        if (isKeyValueRowEnabled(item) && item.key.trim() !== '') {
          metadata[item.key.trim()] = item.value.trim();
        }
      });

      const payload = await sendGrpcRequest({
        requestId: createRequestToken('grpc'),
        target: grpcTarget.trim(),
        service: grpcService.trim(),
        method: grpcMethod.trim(),
        metadata,
        body: grpcBodyRaw,
        schemaMode: grpcSchemaMode,
        protoFiles: grpcSchemaMode === 'proto'
          ? grpcProtoFiles.map(file => ({
              name: file.name,
              content: file.content
            }))
          : [],
        protosetBase64: grpcSchemaMode === 'protoset'
          ? grpcProtoset.dataBase64
          : ''
      });

      const headers = [
        ...normalizeHeaderRows(payload.headers),
        ...normalizeHeaderRows(payload.trailers).map(item => ({
          key: `trailer:${item.key}`,
          value: item.value
        }))
      ];
      let data = payload.body || '{}';
      try {
        data = JSON.parse(data);
      } catch {
        // Streaming responses are returned as a JSON array string; invalid JSON is displayed as text.
      }

      const responseSnapshot = {
        status: payload.status || 'OK',
        statusText: payload.statusText || '',
        time: payload.elapsedMs ?? payload.timings?.totalMs,
        headers,
        data,
        isJson: typeof data !== 'string',
        timings: payload.timings,
        httpVersion: payload.httpVersion || 'HTTP/2',
        httpProtoMajor: payload.httpProtoMajor || 2,
        httpProtoMinor: payload.httpProtoMinor || 0,
        transport: 'Neutralino gRPC extension'
      };
      applyTabOperationPatch(operation, {
        response: responseSnapshot,
        activeResTab: 'body'
      });

      appendHistoryItem({
        protocol: 'grpc',
        url: grpcTarget,
        grpcTarget,
        grpcService,
        grpcMethod,
        grpcMetadata: [...grpcMetadata],
        grpcBodyRaw,
        grpcSchemaMode,
        grpcProtoFiles,
        grpcProtoset,
        method: 'gRPC',
        status: responseSnapshot.status,
        statusText: responseSnapshot.statusText,
        time: responseSnapshot.time,
        response: responseSnapshot
      }, { activate: isTabOperationActive(operation) });
    } catch (error) {
      const errorMessage = String(error?.message || error || '');
      const reflectionUnsupported = grpcSchemaMode === 'reflection'
        && /reflection.*not supported|does not support.*reflection|reflection api/i.test(errorMessage);
      applyTabOperationPatch(operation, {
        activeResTab: 'body',
        response: {
          error: errorMessage,
          hint: reflectionUnsupported
            ? t('errors.grpcReflectionHint')
            : grpcSchemaMode === 'proto'
              ? t('errors.grpcProtoHint')
              : grpcSchemaMode === 'protoset'
                ? t('errors.grpcProtosetHint')
                : t('errors.grpcGenericHint'),
          time: 0
        }
      });
    } finally {
      finishTabOperation(operation);
    }
  };

  const handleSendNetworkRequest = async () => {
    if (!networkTarget.trim() || !['tcp', 'udp'].includes(protocol)) return;
    if (networkPayloadMode === 'hex' && !isEditableHexValid(networkPayloadHex)) return;
    if (
      protocol === 'tcp'
      && networkReadMode === 'delimiter'
      && (!networkDelimiterHex.trim() || !isEditableHexValid(networkDelimiterHex))
    ) return;

    const requestId = createRequestToken(protocol);
    const delimiterBase64 = networkReadMode === 'delimiter'
      ? parseEditableHex(networkDelimiterHex).dataBase64
      : '';
    const operation = beginTabOperation(protocol === 'tcp' ? 'tcp-read' : 'udp');
    setNetworkReading(protocol === 'tcp');
    setNetworkActiveRequestId(requestId);
    applyTabOperationPatch(operation, { response: null });
    setActiveHistoryItemId('');

    try {
      const payload = await sendNetworkRequest({
        requestId,
        connectionId: networkConnectionId,
        protocol,
        target: networkTarget.trim(),
        payload: networkPayload,
        payloadBase64: networkPayloadBase64,
        timeoutMs: networkTimeoutMs,
        readMode: networkReadMode,
        exactBytes: networkExactBytes,
        delimiterBase64,
        lengthPrefixBytes: networkLengthPrefixBytes,
        lengthPrefixEndian: networkLengthPrefixEndian,
        keepConnection: protocol === 'tcp' && networkKeepConnection
      });
      const responseSnapshot = {
        status: payload.status || 'OK',
        statusText: payload.statusText || `${protocol.toUpperCase()} response`,
        time: payload.elapsedMs ?? 0,
        headers: [
          { key: 'protocol', value: protocol.toUpperCase() },
          { key: 'remote-address', value: payload.remoteAddress || networkTarget.trim() },
          { key: 'sent-bytes', value: String(payload.sentBytes ?? 0) },
          { key: 'received-bytes', value: String(payload.receivedBytes ?? 0) },
          { key: 'encoding', value: payload.encoding || 'utf-8' },
          { key: 'read-mode', value: payload.readMode || networkReadMode },
          { key: 'read-reason', value: payload.readReason || '' },
          { key: 'read-complete', value: String(Boolean(payload.readComplete)) },
          ...(protocol === 'tcp'
            ? [{ key: 'connection', value: payload.connectionOpen ? 'open' : 'closed' }]
            : [])
        ],
        data: payload.body || '',
        networkDataBase64: payload.dataBase64 || '',
        networkEncoding: payload.encoding || 'utf-8',
        networkProtocol: protocol,
        networkReadReason: payload.readReason || '',
        networkReadComplete: Boolean(payload.readComplete),
        isJson: false,
        transport: `Neutralino ${protocol.toUpperCase()} extension`
      };
      const nextResponseTab = ['text', 'hex'].includes(activeResTab)
        ? activeResTab
        : 'text';
      applyTabOperationPatch(operation, {
        response: responseSnapshot,
        activeResTab: nextResponseTab,
        networkConnected: Boolean(payload.connectionOpen)
      });
      appendHistoryItem({
        protocol,
        url: networkTarget.trim(),
        networkTarget: networkTarget.trim(),
        networkPayload,
        networkPayloadBase64,
        networkPayloadHex,
        networkPayloadMode,
        networkPayloadFileName,
        networkTimeoutMs,
        networkReadMode,
        networkExactBytes,
        networkDelimiterHex,
        networkLengthPrefixBytes,
        networkLengthPrefixEndian,
        networkKeepConnection,
        method: protocol.toUpperCase(),
        status: responseSnapshot.status,
        statusText: responseSnapshot.statusText,
        time: responseSnapshot.time,
        response: responseSnapshot
      }, { activate: isTabOperationActive(operation) });
    } catch (error) {
      const responseSnapshot = {
        error: error.message,
        hint: t('errors.networkHint', { protocol: protocol.toUpperCase() }),
        time: 0
      };
      applyTabOperationPatch(operation, {
        response: responseSnapshot,
        networkConnected: false
      });
      appendHistoryItem({
        protocol,
        url: networkTarget.trim(),
        networkTarget: networkTarget.trim(),
        networkPayload,
        networkPayloadBase64,
        networkPayloadHex,
        networkPayloadMode,
        networkPayloadFileName,
        networkTimeoutMs,
        networkReadMode,
        networkExactBytes,
        networkDelimiterHex,
        networkLengthPrefixBytes,
        networkLengthPrefixEndian,
        networkKeepConnection,
        method: protocol.toUpperCase(),
        status: 'ERR',
        statusText: t('errors.generic'),
        time: 0,
        response: responseSnapshot
      }, { activate: isTabOperationActive(operation) });
    } finally {
      setNetworkReading(false);
      setNetworkActiveRequestId('');
      finishTabOperation(operation);
    }
  };

  const handleStopNetworkRead = async () => {
    if (!networkActiveRequestId) return;
    try {
      await stopNetworkRead({
        requestId: createRequestToken('tcp-stop'),
        activeRequestId: networkActiveRequestId,
        connectionId: networkConnectionId
      });
    } catch (error) {
      emitClientLog('warn', 'tcp read stop failed', {
        activeRequestId: networkActiveRequestId,
        connectionId: networkConnectionId,
        error: error?.message || String(error)
      });
    }
  };

  const handleCloseNetworkSession = async () => {
    try {
      if (!networkConnectionId) return;
      await closeNetworkSession({
        requestId: createRequestToken('tcp-close'),
        activeRequestId: networkActiveRequestId,
        connectionId: networkConnectionId
      });
    } catch (error) {
      emitClientLog('warn', 'tcp session close failed', {
        activeRequestId: networkActiveRequestId,
        connectionId: networkConnectionId,
        error: error?.message || String(error)
      });
    } finally {
      setNetworkConnected(false);
    }
  };

  return {
    handleSendGrpcRequest,
    handleSendHttpRequest,
    handleSendNetworkRequest,
    handleStopNetworkRead,
    handleCloseNetworkSession
  };
}
