import { useEffect, useRef } from 'react';
import {
  hotkeyMatchesEvent,
  isEditableHotkeyTarget
} from '../config/hotkeys.js';

const resolveRegistrationFlag = (value, event) => (
  typeof value === 'function' ? value(event) : value
);

export default function useAppHotkeys(registrations = [], enabled = true) {
  const registrationsRef = useRef(registrations);
  registrationsRef.current = registrations;

  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      if (event.defaultPrevented) return;

      const sortedRegistrations = [...registrationsRef.current]
        .filter(Boolean)
        .sort((left, right) => (right.priority || 0) - (left.priority || 0));

      for (const registration of sortedRegistrations) {
        if (!hotkeyMatchesEvent(registration, event)) continue;
        if (event.repeat && !registration.allowRepeat) continue;
        if (event.isComposing && !registration.allowWhileComposing) continue;
        if (
          isEditableHotkeyTarget(event.target)
          && !registration.allowInEditable
        ) {
          continue;
        }

        const registrationEnabled = resolveRegistrationFlag(registration.enabled, event) !== false;
        if (!registrationEnabled && !registration.captureWhenDisabled) continue;

        if (registration.preventDefault !== false) event.preventDefault();
        if (registration.stopPropagation) event.stopPropagation();

        if (!registrationEnabled) return;

        registration.handler?.(event, registration);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
