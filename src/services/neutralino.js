import {
  EXTENSION_CLIENT_LOG_EVENT,
  EXTENSION_CLIENT_LOG_TIMEOUT_MS,
  EXTENSION_DISPATCH_RETRY_MS,
  EXTENSION_DISPATCH_RETRY_TIMEOUT_MS,
  EXTENSION_ID,
  NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
  NEUTRALINO_PROCESS_RESTART_COOLDOWN_MS,
  NEUTRALINO_PROCESS_RESTART_KEY,
  NEUTRALINO_RENDERER_RELOAD_COOLDOWN_MS,
  NEUTRALINO_RENDERER_RELOAD_KEY,
  WINDOW_FALLBACK_SIZE,
  WINDOW_RECOVERY,
  WINDOW_RESPONSIVE_SIZE
} from '../config/constants.js';
import { delay, withTimeout } from '../utils/async.js';

export const emitClientLog = (level, message, detail = {}) => {
  if (!window.Neutralino?.extensions?.dispatch) return;
  void withTimeout(
    window.Neutralino.extensions.dispatch(EXTENSION_ID, EXTENSION_CLIENT_LOG_EVENT, {
      level,
      message,
      detail,
      time: new Date().toISOString()
    }),
    EXTENSION_CLIENT_LOG_TIMEOUT_MS,
    'Client log dispatch timeout.'
  ).catch(() => {});
};

const isNeutralinoNativeTimeoutError = (error) => (
  String(error?.message || error || '').toLowerCase().includes('neutralino native api')
);

export const reloadNeutralinoRendererOnce = (reason) => {
  if (!window.location?.reload) return false;

  const now = Date.now();
  let lastReloadAt = 0;
  try {
    lastReloadAt = Number(window.sessionStorage?.getItem(NEUTRALINO_RENDERER_RELOAD_KEY) || 0);
  } catch {
  }

  if (lastReloadAt && now - lastReloadAt < NEUTRALINO_RENDERER_RELOAD_COOLDOWN_MS) {
    return false;
  }

  try {
    window.sessionStorage?.setItem(NEUTRALINO_RENDERER_RELOAD_KEY, String(now));
  } catch {
  }

  console.warn(reason);
  emitClientLog('warn', 'renderer reload requested', { reason });
  setTimeout(() => window.location.reload(), 100);
  return true;
};

export const restartNeutralinoProcessOnce = (reason) => {
  if (!window.Neutralino?.app?.restartProcess) return false;

  const now = Date.now();
  let lastRestartAt = 0;
  try {
    lastRestartAt = Number(window.sessionStorage?.getItem(NEUTRALINO_PROCESS_RESTART_KEY) || 0);
  } catch {
  }

  if (lastRestartAt && now - lastRestartAt < NEUTRALINO_PROCESS_RESTART_COOLDOWN_MS) {
    return false;
  }

  try {
    window.sessionStorage?.setItem(NEUTRALINO_PROCESS_RESTART_KEY, String(now));
  } catch {
  }

  console.warn(reason);
  emitClientLog('warn', 'process restart requested', { reason });
  void withTimeout(
    window.Neutralino.app.restartProcess(),
    NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
    'Neutralino native API nie odpowiedziało podczas restartu procesu aplikacji.'
  ).catch((error) => {
    console.warn(error);
    reloadNeutralinoRendererOnce('Neutralino process restart failed; reloading renderer instead.');
  });
  return true;
};

export const probeNeutralinoNativeClient = async () => {
  if (!window.Neutralino?.extensions?.getStats) return true;
  await withTimeout(
    window.Neutralino.extensions.getStats(),
    NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
    'Neutralino native API nie odpowiedziało podczas sprawdzania połączenia po wybudzeniu.'
  );
  return true;
};

const isRetryableExtensionDispatchError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('not loaded')
    || message.includes('not connected')
    || message.includes('extension')
    || message.includes('websocket')
    || message.includes('dispatch')
    || message.includes('neutralino native api');
};

const isExtensionConnected = async (extensionId) => {
  if (!window.Neutralino?.extensions?.getStats) return true;
  const stats = await withTimeout(
    window.Neutralino.extensions.getStats(),
    NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
    'Neutralino native API nie odpowiedziało podczas sprawdzania extension.'
  );
  return Array.isArray(stats?.connected) && stats.connected.includes(extensionId);
};

const waitForExtensionConnection = async ({
  extensionId,
  shouldStop,
  retryTimeoutMs = EXTENSION_DISPATCH_RETRY_TIMEOUT_MS
}) => {
  const deadline = Date.now() + retryTimeoutMs;
  while (!shouldStop()) {
    if (await isExtensionConnected(extensionId)) return true;
    if (Date.now() + EXTENSION_DISPATCH_RETRY_MS > deadline) return false;
    await delay(EXTENSION_DISPATCH_RETRY_MS);
  }
  return false;
};

export const dispatchExtensionEventWithRetry = async ({
  extensionId,
  eventName,
  payload,
  shouldStop,
  retryTimeoutMs = EXTENSION_DISPATCH_RETRY_TIMEOUT_MS
}) => {
  const deadline = Date.now() + retryTimeoutMs;
  let lastError = null;

  while (!shouldStop()) {
    try {
      const connected = await waitForExtensionConnection({ extensionId, shouldStop, retryTimeoutMs });
      if (!connected) {
        throw new Error(`${extensionId} is not connected`);
      }
      await withTimeout(
        window.Neutralino.extensions.dispatch(extensionId, eventName, payload),
        NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
        'Neutralino native API nie odpowiedziało podczas wysyłania zdarzenia do extension.'
      );
      return;
    } catch (error) {
      lastError = error;
      if (
        isNeutralinoNativeTimeoutError(error) &&
        reloadNeutralinoRendererOnce('Neutralino renderer websocket stalled; reloading UI.')
      ) {
        emitClientLog('error', 'neutralino native api timeout', {
          eventName,
          error: error?.message || String(error)
        });
        throw new Error('Połączenie UI z Neutralino przestało odpowiadać po wybudzeniu. Odświeżam okno aplikacji.');
      }
      if (!isRetryableExtensionDispatchError(error) || Date.now() + EXTENSION_DISPATCH_RETRY_MS > deadline) {
        break;
      }
      await delay(EXTENSION_DISPATCH_RETRY_MS);
    }
  }

  throw new Error(`Nie udało się wysłać zdarzenia do extension po wybudzeniu aplikacji: ${lastError?.message || lastError || 'extension nie jest dostępny'}`);
};

const clampNumber = (value, min, max) => Math.min(Math.max(Math.round(value), min), max);

const isNearSize = (size, expected) => (
  Math.abs((size?.width || 0) - expected.width) <= WINDOW_RESPONSIVE_SIZE.tolerance
  && Math.abs((size?.height || 0) - expected.height) <= WINDOW_RESPONSIVE_SIZE.tolerance
);

const getScreenResolution = async () => {
  try {
    const displays = await window.Neutralino?.computer?.getDisplays?.();
    const firstResolution = Array.isArray(displays) ? displays[0]?.resolution : null;
    if (firstResolution?.width > 0 && firstResolution?.height > 0) {
      return firstResolution;
    }
  } catch {
  }

  return {
    width: window.screen?.availWidth || window.screen?.width || WINDOW_FALLBACK_SIZE.width,
    height: window.screen?.availHeight || window.screen?.height || WINDOW_FALLBACK_SIZE.height
  };
};

const getCurrentScreenBounds = async () => {
  const browserScreen = window.screen;
  const browserWidth = Number(browserScreen?.availWidth || browserScreen?.width);
  const browserHeight = Number(browserScreen?.availHeight || browserScreen?.height);
  if (browserWidth > 0 && browserHeight > 0) {
    const left = Number.isFinite(Number(browserScreen?.availLeft))
      ? Number(browserScreen.availLeft)
      : 0;
    const top = Number.isFinite(Number(browserScreen?.availTop))
      ? Number(browserScreen.availTop)
      : 0;
    return {
      left,
      top,
      width: browserWidth,
      height: browserHeight,
      right: left + browserWidth,
      bottom: top + browserHeight
    };
  }

  const resolution = await getScreenResolution();
  return {
    left: 0,
    top: 0,
    width: resolution.width,
    height: resolution.height,
    right: resolution.width,
    bottom: resolution.height
  };
};

const calculateResponsiveWindowSize = (resolution) => {
  const maxWidth = Math.max(
    WINDOW_FALLBACK_SIZE.minWidth,
    Math.min(WINDOW_RESPONSIVE_SIZE.maxWidth, resolution.width - 80)
  );
  const maxHeight = Math.max(
    WINDOW_FALLBACK_SIZE.minHeight,
    Math.min(WINDOW_RESPONSIVE_SIZE.maxHeight, resolution.height - 90)
  );

  return {
    width: clampNumber(
      resolution.width * WINDOW_RESPONSIVE_SIZE.widthRatio,
      WINDOW_FALLBACK_SIZE.minWidth,
      maxWidth
    ),
    height: clampNumber(
      resolution.height * WINDOW_RESPONSIVE_SIZE.heightRatio,
      WINDOW_FALLBACK_SIZE.minHeight,
      maxHeight
    ),
    minWidth: WINDOW_FALLBACK_SIZE.minWidth,
    minHeight: WINDOW_FALLBACK_SIZE.minHeight
  };
};

const getWindowGeometry = async (nativeWindow) => {
  const [nativePosition, nativeSize] = await Promise.all([
    nativeWindow.getPosition
      ? nativeWindow.getPosition().catch(() => null)
      : Promise.resolve(null),
    nativeWindow.getSize
      ? nativeWindow.getSize().catch(() => null)
      : Promise.resolve(null)
  ]);
  const browserX = Number(window.screenX ?? window.screenLeft);
  const browserY = Number(window.screenY ?? window.screenTop);
  const browserWidth = Number(window.outerWidth);
  const browserHeight = Number(window.outerHeight);

  return {
    x: Number.isFinite(browserX) ? browserX : Number(nativePosition?.x || 0),
    y: Number.isFinite(browserY) ? browserY : Number(nativePosition?.y || 0),
    width: browserWidth > 0 ? browserWidth : Number(nativeSize?.width || 0),
    height: browserHeight > 0 ? browserHeight : Number(nativeSize?.height || 0)
  };
};

const isWindowGeometryVisible = (geometry, screenBounds) => {
  if (
    !Number.isFinite(geometry.x)
    || !Number.isFinite(geometry.y)
    || geometry.width <= 0
    || geometry.height <= 0
  ) {
    return false;
  }

  const intersectionWidth = Math.max(
    0,
    Math.min(geometry.x + geometry.width, screenBounds.right)
      - Math.max(geometry.x, screenBounds.left)
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(geometry.y + geometry.height, screenBounds.bottom)
      - Math.max(geometry.y, screenBounds.top)
  );

  return intersectionWidth >= Math.min(WINDOW_RECOVERY.visibleWidth, geometry.width)
    && intersectionHeight >= Math.min(WINDOW_RECOVERY.visibleHeight, geometry.height);
};

export const applyResponsiveInitialWindowSize = async (nativeWindow) => {
  try {
    const currentSize = await nativeWindow.getSize();
    if (!isNearSize(currentSize, WINDOW_FALLBACK_SIZE)) return;

    const resolution = await getScreenResolution();
    const nextSize = calculateResponsiveWindowSize(resolution);

    await nativeWindow.setSize(nextSize);
    await nativeWindow.center();
  } catch {
  }
};

export const recoverNeutralinoWindow = async ({
  nativeWindow = window.Neutralino?.window,
  force = false,
  restoreMinimized = true
} = {}) => {
  if (!nativeWindow) {
    return { available: false, recovered: false, reason: 'native-window-unavailable' };
  }

  const wasMinimized = await nativeWindow.isMinimized?.().catch(() => false);
  if (wasMinimized && !force && !restoreMinimized) {
    return { available: true, recovered: false, reason: 'intentionally-minimized' };
  }
  if (wasMinimized) {
    await nativeWindow.unminimize?.();
    await delay(WINDOW_RECOVERY.restoreDelayMs);
  }

  await nativeWindow.show?.();

  const wasMaximized = await nativeWindow.isMaximized?.().catch(() => false);
  const screenBounds = await getCurrentScreenBounds();
  const geometry = await getWindowGeometry(nativeWindow);
  const geometryVisible = isWindowGeometryVisible(geometry, screenBounds);

  if (!force && geometryVisible) {
    if (wasMinimized) await nativeWindow.focus?.();
    return {
      available: true,
      recovered: wasMinimized,
      reason: wasMinimized ? 'restored-minimized-window' : 'geometry-valid'
    };
  }

  if (wasMaximized) {
    await nativeWindow.unmaximize?.();
    await delay(WINDOW_RECOVERY.restoreDelayMs);
  }

  if (
    force
    || geometry.width <= 0
    || geometry.height <= 0
    || geometry.width > screenBounds.width * 1.5
    || geometry.height > screenBounds.height * 1.5
  ) {
    await nativeWindow.setSize?.(calculateResponsiveWindowSize(screenBounds));
  }

  await nativeWindow.center?.();
  await nativeWindow.show?.();
  if (wasMaximized && !force) {
    await nativeWindow.maximize?.();
  }
  await nativeWindow.focus?.();

  emitClientLog('warn', 'window geometry recovered', {
    force,
    wasMinimized,
    wasMaximized,
    geometry,
    screenBounds
  });

  return {
    available: true,
    recovered: true,
    reason: force ? 'manual-reset' : 'off-screen-geometry'
  };
};
