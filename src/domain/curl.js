export const parseCurlCommand = (command) => {
  const cleanCommand = command.replace(/\\\r?\n/g, ' ').trim();
  if (!cleanCommand.toLowerCase().startsWith('curl')) {
    throw new Error('Tekst nie zaczyna się od prawidłowej komendy "curl"');
  }

  const tokens = [];
  let currentToken = '';
  let inSingle = false;
  let inDouble = false;
  let isEscaped = false;

  for (let index = 4; index < cleanCommand.length; index += 1) {
    const char = cleanCommand[index];
    if (isEscaped) {
      currentToken += char;
      isEscaped = false;
    } else if (char === '\\') {
      isEscaped = true;
    } else if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (char === ' ' && !inSingle && !inDouble) {
      if (currentToken.length > 0) {
        tokens.push(currentToken);
        currentToken = '';
      }
    } else {
      currentToken += char;
    }
  }
  if (currentToken) tokens.push(currentToken);

  let parsedUrl = '';
  let parsedMethod = 'GET';
  const parsedHeaders = [];
  let parsedBody = '';
  const parsedMultipart = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '-X' || token === '--request') {
      if (tokens[index + 1]) parsedMethod = tokens[++index].toUpperCase();
    } else if (token === '-H' || token === '--header') {
      if (tokens[index + 1]) {
        const header = tokens[++index];
        const separatorIndex = header.indexOf(':');
        if (separatorIndex > 0) {
          parsedHeaders.push({
            key: header.substring(0, separatorIndex).trim(),
            value: header.substring(separatorIndex + 1).trim()
          });
        }
      }
    } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(token)) {
      if (tokens[index + 1]) {
        parsedBody = tokens[++index];
        if (parsedMethod === 'GET') parsedMethod = 'POST';
      }
    } else if (token === '-F' || token === '--form' || token === '--form-string') {
      if (tokens[index + 1]) {
        const formValue = tokens[++index];
        const separatorIndex = formValue.indexOf('=');
        if (separatorIndex > 0) {
          const key = formValue.slice(0, separatorIndex);
          const value = formValue.slice(separatorIndex + 1);
          const isFile = token !== '--form-string' && value.startsWith('@');
          const fileSegments = isFile ? value.slice(1).split(';') : [];
          const filePath = fileSegments[0] || '';
          const contentType = fileSegments
            .find(segment => segment.toLowerCase().startsWith('type='))
            ?.slice(5);
          parsedMultipart.push({
            key,
            type: isFile ? 'file' : 'text',
            value: isFile ? '' : value,
            fileName: isFile ? filePath.split(/[\\/]/).pop() || filePath : '',
            mimeType: isFile ? contentType || 'application/octet-stream' : '',
            size: 0,
            lastModified: 0,
            dataBase64: null
          });
          if (parsedMethod === 'GET') parsedMethod = 'POST';
        }
      }
    } else if (!token.startsWith('-') && !parsedUrl) {
      parsedUrl = token.replace(/^['"]|['"]$/g, '');
    }
  }

  return { parsedUrl, parsedMethod, parsedHeaders, parsedBody, parsedMultipart };
};
