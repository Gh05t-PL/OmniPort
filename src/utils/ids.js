export const createRequestToken = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const createEntityId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
