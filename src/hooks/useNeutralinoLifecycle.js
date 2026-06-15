import { useEffect, useRef } from 'react';
import {
  NEUTRALINO_SLEEP_DRIFT_MS,
  NEUTRALINO_WAKE_PROBE_DELAY_MS,
  NEUTRALINO_WAKE_PROBE_INTERVAL_MS
} from '../config/constants.js';
import {
  applyResponsiveInitialWindowSize,
  probeNeutralinoNativeClient,
  recoverNeutralinoWindow,
  reloadNeutralinoRendererOnce
} from '../services/neutralino.js';

export default function useNeutralinoLifecycle() {
  const windowFocusTimeoutRef = useRef(null);
  const releaseAlwaysOnTopTimeoutRef = useRef(null);
  const probeTimeoutRef = useRef(null);
  const probeIntervalRef = useRef(null);
  const windowRecoveryTimeoutRef = useRef(null);

  useEffect(() => {
    if (window.Neutralino && !window.__requesterNeutralinoInitialized) {
      window.__requesterNeutralinoInitialized = true;
      window.Neutralino.init();
    }
    if (!window.Neutralino?.window) return undefined;

    windowFocusTimeoutRef.current = setTimeout(() => {
      const nativeWindow = window.Neutralino?.window;
      if (!nativeWindow) return;

      void (async () => {
        try {
          await recoverNeutralinoWindow({
            nativeWindow,
            restoreMinimized: true
          });
          await applyResponsiveInitialWindowSize(nativeWindow);
          await nativeWindow.show();
          await nativeWindow.focus();
        } catch {
        }

        releaseAlwaysOnTopTimeoutRef.current = setTimeout(() => {
          void nativeWindow.setAlwaysOnTop(false).catch(() => {});
          releaseAlwaysOnTopTimeoutRef.current = null;
        }, 800);
      })();
      windowFocusTimeoutRef.current = null;
    }, 250);

    return () => {
      if (windowFocusTimeoutRef.current) {
        clearTimeout(windowFocusTimeoutRef.current);
        windowFocusTimeoutRef.current = null;
      }
      if (releaseAlwaysOnTopTimeoutRef.current) {
        clearTimeout(releaseAlwaysOnTopTimeoutRef.current);
        releaseAlwaysOnTopTimeoutRef.current = null;
      }
      if (windowRecoveryTimeoutRef.current) {
        clearTimeout(windowRecoveryTimeoutRef.current);
        windowRecoveryTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let lastProbeTick = Date.now();

    const runProbe = async () => {
      if (disposed) return;
      if (!window.Neutralino?.extensions?.getStats) return;
      try {
        await probeNeutralinoNativeClient();
      } catch (error) {
        reloadNeutralinoRendererOnce(error.message || 'Neutralino renderer websocket stalled after wake.');
      }
    };

    const scheduleProbe = (delayMs = NEUTRALINO_WAKE_PROBE_DELAY_MS) => {
      if (probeTimeoutRef.current) {
        clearTimeout(probeTimeoutRef.current);
      }

      probeTimeoutRef.current = setTimeout(() => {
        probeTimeoutRef.current = null;
        void runProbe();
      }, delayMs);
    };

    const scheduleWindowRecovery = (
      delayMs = NEUTRALINO_WAKE_PROBE_DELAY_MS,
      restoreMinimized = false
    ) => {
      if (!window.Neutralino?.window) return;
      if (windowRecoveryTimeoutRef.current) {
        clearTimeout(windowRecoveryTimeoutRef.current);
      }

      windowRecoveryTimeoutRef.current = setTimeout(() => {
        windowRecoveryTimeoutRef.current = null;
        if (disposed) return;
        void recoverNeutralinoWindow({ restoreMinimized }).catch(() => {});
      }, delayMs);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        scheduleProbe();
        scheduleWindowRecovery(NEUTRALINO_WAKE_PROBE_DELAY_MS, true);
      }
    };
    const handleFocus = () => {
      scheduleProbe();
      scheduleWindowRecovery(0, true);
    };
    const handleOnline = () => scheduleProbe();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    probeIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const wasSuspended = now - lastProbeTick > NEUTRALINO_SLEEP_DRIFT_MS;
      lastProbeTick = now;
      if (wasSuspended) {
        scheduleProbe(0);
        scheduleWindowRecovery(0, false);
      }
    }, NEUTRALINO_WAKE_PROBE_INTERVAL_MS);

    return () => {
      disposed = true;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (probeTimeoutRef.current) {
        clearTimeout(probeTimeoutRef.current);
        probeTimeoutRef.current = null;
      }
      if (probeIntervalRef.current) {
        clearInterval(probeIntervalRef.current);
        probeIntervalRef.current = null;
      }
      if (windowRecoveryTimeoutRef.current) {
        clearTimeout(windowRecoveryTimeoutRef.current);
        windowRecoveryTimeoutRef.current = null;
      }
    };
  }, []);
}
