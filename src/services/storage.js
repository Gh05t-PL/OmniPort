import { NEUTRALINO_NATIVE_CALL_TIMEOUT_MS } from '../config/constants.js';
import { withTimeout } from '../utils/async.js';

const createPersistableValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(createPersistableValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const isMultipartFile = value.type === 'file'
    && Object.prototype.hasOwnProperty.call(value, 'dataBase64')
    && Object.prototype.hasOwnProperty.call(value, 'fileName');
  const hasNetworkPayload = typeof value.networkPayloadBase64 === 'string';
  return Object.fromEntries(Object.entries(value).flatMap(([key, nestedValue]) => {
    if (hasNetworkPayload && (key === 'networkPayload' || key === 'networkPayloadHex')) {
      return [];
    }
    return [[
      key,
      isMultipartFile && key === 'dataBase64' ? null : createPersistableValue(nestedValue)
    ]];
  }));
};

export const readFromStorage = (key, fallback) => {
  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallback;
  } catch {
    return fallback;
  }
};

export const writeToStorage = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(createPersistableValue(value)));
  } catch {
    // Large response histories may exceed localStorage. The current session
    // remains usable even if this persistence attempt fails.
  }
};

const ensureNativeStorageDirectory = async () => {
  if (!window.Neutralino?.filesystem?.createDirectory || typeof window.NL_DATAPATH !== 'string') {
    return false;
  }

  try {
    await withTimeout(
      window.Neutralino.filesystem.createDirectory(`${window.NL_DATAPATH}/.storage`),
      NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
      'Neutralino filesystem nie odpowiedziało podczas tworzenia katalogu storage.'
    );
    return true;
  } catch {
    return false;
  }
};

export const readFromNativeStorage = async (key) => {
  if (!window.Neutralino?.storage?.getData || !window.Neutralino?.storage?.getKeys) {
    return { found: false, ready: false };
  }

  try {
    await ensureNativeStorageDirectory();
    const keys = await withTimeout(
      window.Neutralino.storage.getKeys(),
      NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
      'Neutralino storage nie odpowiedziało podczas listowania kluczy.'
    );
    if (!Array.isArray(keys) || !keys.includes(key)) {
      return { found: false, ready: true };
    }

    const storedValue = await withTimeout(
      window.Neutralino.storage.getData(key),
      NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
      `Neutralino storage nie odpowiedziało podczas odczytu ${key}.`
    );
    if (typeof storedValue !== 'string' || storedValue.length === 0) {
      return { found: false, ready: true };
    }
    return { found: true, ready: true, value: JSON.parse(storedValue) };
  } catch (error) {
    if (error?.code === 'NE_ST_NOSTDIR') {
      const ready = await ensureNativeStorageDirectory();
      return { found: false, ready };
    }
    console.warn('Neutralino storage read failed', { key, error });
    return { found: false, ready: false };
  }
};

export const writeToDurableStorage = async (localKey, nativeKey, value) => {
  writeToStorage(localKey, value);

  if (!window.Neutralino?.storage?.setData) {
    return false;
  }

  await ensureNativeStorageDirectory();

  try {
    await withTimeout(
      window.Neutralino.storage.setData(nativeKey, JSON.stringify(createPersistableValue(value))),
      NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
      `Neutralino storage nie odpowiedziało podczas zapisu ${nativeKey}.`
    );
    return true;
  } catch (error) {
    console.warn('Neutralino storage write failed', { key: nativeKey, error });
    return false;
  }
};
