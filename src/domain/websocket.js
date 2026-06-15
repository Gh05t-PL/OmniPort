import { createRequestToken } from '../utils/ids.js';

const WEBSOCKET_FRAME_LIMIT = 200;

export const isWebsocketResponse = (value) => value?.transport === 'Neutralino WebSocket extension';

const normalizeWebsocketFrame = (frame = {}) => ({
  id: frame.id || createRequestToken('ws-frame'),
  direction: frame.direction || 'system',
  messageType: frame.messageType || 'text',
  message: typeof frame.message === 'string' ? frame.message : JSON.stringify(frame.message ?? ''),
  encoding: frame.encoding || 'utf-8',
  bytes: typeof frame.bytes === 'number' ? frame.bytes : String(frame.message || '').length,
  elapsedMs: typeof frame.elapsedMs === 'number' ? frame.elapsedMs : null,
  time: frame.time || new Date().toISOString()
});

export const appendWebsocketFrameToResponse = (previousResponse, frame, override = {}) => {
  const normalizedFrame = normalizeWebsocketFrame(frame);
  const sourceResponse = override.reset ? null : previousResponse;
  const previousFrames = isWebsocketResponse(sourceResponse) && Array.isArray(sourceResponse.data)
    ? sourceResponse.data
    : [];

  return {
    status: override.status || sourceResponse?.status || 'OPEN',
    statusText: override.statusText || sourceResponse?.statusText || 'Connected',
    time: override.time ?? sourceResponse?.time ?? 0,
    headers: Array.isArray(override.headers)
      ? override.headers
      : Array.isArray(sourceResponse?.headers) ? sourceResponse.headers : [],
    data: [...previousFrames, normalizedFrame].slice(-WEBSOCKET_FRAME_LIMIT),
    isJson: true,
    connectionId: override.connectionId || frame.connectionId || sourceResponse?.connectionId,
    url: override.url || frame.url || sourceResponse?.url || '',
    transport: 'Neutralino WebSocket extension'
  };
};

export const websocketSystemFrame = (message, elapsedMs = null) => ({
  direction: 'system',
  messageType: 'text',
  message,
  encoding: 'utf-8',
  bytes: message.length,
  elapsedMs,
  time: new Date().toISOString()
});
