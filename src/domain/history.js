import {
  PERSISTENCE_FORMATS,
  createPersistenceDocument,
  readCurrentPersistenceDocument
} from './persistence.js';

export const createPersistableHistory = (history) => createPersistenceDocument(
  PERSISTENCE_FORMATS.history,
  {
    items: Array.isArray(history) ? history : []
  }
);

export const parsePersistedHistory = (value) => {
  const document = readCurrentPersistenceDocument(value, PERSISTENCE_FORMATS.history);
  return document && Array.isArray(document.items) ? document.items : null;
};
