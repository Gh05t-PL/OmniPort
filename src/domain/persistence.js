export const PERSISTENCE_SCHEMA_VERSION = 1;

export const PERSISTENCE_FORMATS = Object.freeze({
  collections: 'omniport.collections',
  requestSession: 'omniport.request-session',
  history: 'omniport.history'
});

export const createPersistenceDocument = (format, payload = {}) => ({
  format,
  schemaVersion: PERSISTENCE_SCHEMA_VERSION,
  ...payload
});

export const readCurrentPersistenceDocument = (value, format) => {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.format !== format
    || value.schemaVersion !== PERSISTENCE_SCHEMA_VERSION
  ) {
    return null;
  }

  return value;
};
