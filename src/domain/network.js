export const isNetworkResponse = response => (
  ['tcp', 'udp'].includes(response?.networkProtocol)
);

export const base64ToBytes = value => {
  const binary = atob(value || '');
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

export const bytesToBase64 = bytes => {
  const chunks = [];
  const chunkSize = 32 * 1024;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }

  return btoa(chunks.join(''));
};

export const textToBase64 = value => (
  bytesToBase64(new TextEncoder().encode(value || ''))
);

export const base64ToText = value => (
  new TextDecoder('utf-8', { fatal: false }).decode(base64ToBytes(value))
);

export const base64ByteLength = value => {
  const normalized = String(value || '').replace(/\s/g, '');
  if (!normalized) return 0;
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(normalized.length * 3 / 4) - padding);
};

export const formatEditableHex = value => (
  [...base64ToBytes(value)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .reduce((lines, byte, index) => {
      const lineIndex = Math.floor(index / 16);
      lines[lineIndex] = lines[lineIndex]
        ? `${lines[lineIndex]} ${byte}`
        : byte;
      return lines;
    }, [])
    .join('\n')
);

export const isEditableHexValid = value => {
  const trimmed = String(value || '').trim();
  return !trimmed || /^(?:[0-9a-fA-F]{2})(?:\s+[0-9a-fA-F]{2})*$/.test(trimmed);
};

export const parseEditableHex = value => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return {
      valid: true,
      bytes: new Uint8Array(),
      dataBase64: '',
      tokens: [],
      tokenCount: 0
    };
  }

  const values = trimmed.split(/\s+/);
  const bytes = new Uint8Array(values.length);
  const tokens = [];
  const invalidTokens = [];
  let invalidCount = 0;

  values.forEach((token, index) => {
    const valid = /^[0-9a-fA-F]{2}$/.test(token);
    if (index < 256 || (!valid && invalidTokens.length < 32)) {
      tokens.push({ index, value: token, valid });
    }
    if (!valid) {
      invalidCount += 1;
      if (invalidTokens.length < 32) {
        invalidTokens.push({ index, value: token, valid });
      }
      return;
    }
    bytes[index] = Number.parseInt(token, 16);
  });

  if (invalidCount > 0) {
    return {
      valid: false,
      bytes: null,
      dataBase64: null,
      tokens,
      invalidTokens,
      tokenCount: values.length,
      error: invalidCount === 1
        ? `Nieprawidłowy bajt: "${invalidTokens[0].value}". Użyj dwóch cyfr hex, np. 00 lub ff.`
        : `${invalidCount} nieprawidłowe bajty. Każdy bajt musi mieć dokładnie dwie cyfry hex.`
    };
  }

  return {
    valid: true,
    bytes,
    dataBase64: bytesToBase64(bytes),
    tokens,
    invalidTokens: [],
    tokenCount: values.length
  };
};

export const networkResponseText = response => {
  if (response?.networkEncoding === 'utf-8') {
    return response.data || '';
  }

  return base64ToText(response?.networkDataBase64);
};

export const formatHexDump = response => {
  const bytes = base64ToBytes(response?.networkDataBase64);
  const rows = [];

  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const hex = [...chunk]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(47, ' ');

    const ascii = [...chunk]
      .map(byte => (
        byte >= 32 && byte <= 126
          ? String.fromCharCode(byte)
          : '.'
      ))
      .join('');

    rows.push(
      `${offset.toString(16).padStart(8, '0')}  ${hex}  |${ascii}|`
    );
  }

  return rows.join('\n');
};
