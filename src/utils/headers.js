export const isKeyValueRowEnabled = (item) => item?.enabled !== false;

export const normalizeHeaderRows = (headers) => {
  if (Array.isArray(headers)) return headers;
  return Object.entries(headers || {}).map(([key, value]) => ({
    key,
    value: String(value)
  }));
};

export const getHeaderValue = (headers, name) => {
  const lowerName = name.toLowerCase();
  return normalizeHeaderRows(headers)
    .find(item => item.key.toLowerCase() === lowerName)?.value || '';
};
