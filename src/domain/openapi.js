import YAML from 'yaml';

const OPENAPI_HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

const parseOpenApiText = (rawText) => {
  const trimmedText = rawText.trim();
  if (!trimmedText) {
    throw new Error('Wklej treść pliku OpenAPI albo wybierz plik z dysku.');
  }

  try {
    return JSON.parse(trimmedText);
  } catch {
    try {
      return YAML.parse(trimmedText);
    } catch (error) {
      throw new Error(`Nie udało się odczytać definicji jako JSON/YAML: ${error.message}`);
    }
  }
};

const resolveOpenApiRef = (spec, value, depth = 0) => {
  if (!value || typeof value !== 'object' || !value.$ref || depth > 8) return value;
  const ref = value.$ref;
  if (!ref.startsWith('#/')) return value;
  const resolved = ref
    .slice(2)
    .split('/')
    .reduce((current, segment) => current?.[segment.replace(/~1/g, '/').replace(/~0/g, '~')], spec);

  return resolveOpenApiRef(spec, resolved || value, depth + 1);
};

const firstDefined = (...values) => values.find(value => value !== undefined && value !== null);

const getOpenApiExample = (spec, value) => {
  const resolvedValue = resolveOpenApiRef(spec, value);
  if (!resolvedValue || typeof resolvedValue !== 'object') return undefined;
  if (resolvedValue.example !== undefined) return resolvedValue.example;
  if (resolvedValue.default !== undefined) return resolvedValue.default;
  if (Array.isArray(resolvedValue.enum) && resolvedValue.enum.length > 0) return resolvedValue.enum[0];
  if (resolvedValue.examples && typeof resolvedValue.examples === 'object') {
    const firstExample = resolveOpenApiRef(spec, Object.values(resolvedValue.examples)[0]);
    if (firstExample?.value !== undefined) return firstExample.value;
    if (firstExample?.externalValue) return firstExample.externalValue;
  }
  return undefined;
};

const sampleValueFromSchema = (spec, schema, name = 'value', depth = 0) => {
  const resolvedSchema = resolveOpenApiRef(spec, schema) || {};
  const directExample = getOpenApiExample(spec, resolvedSchema);
  if (directExample !== undefined) return directExample;
  if (depth > 4) return null;

  const schemaType = resolvedSchema.type || (resolvedSchema.properties ? 'object' : undefined);
  if (resolvedSchema.oneOf?.length) return sampleValueFromSchema(spec, resolvedSchema.oneOf[0], name, depth + 1);
  if (resolvedSchema.anyOf?.length) return sampleValueFromSchema(spec, resolvedSchema.anyOf[0], name, depth + 1);
  if (resolvedSchema.allOf?.length) {
    return resolvedSchema.allOf.reduce((merged, part) => {
      const sample = sampleValueFromSchema(spec, part, name, depth + 1);
      return typeof sample === 'object' && !Array.isArray(sample) && sample !== null
        ? { ...merged, ...sample }
        : sample;
    }, {});
  }

  if (schemaType === 'object') {
    const properties = resolvedSchema.properties || {};
    return Object.fromEntries(Object.entries(properties).map(([key, propertySchema]) => [
      key,
      sampleValueFromSchema(spec, propertySchema, key, depth + 1)
    ]));
  }

  if (schemaType === 'array') {
    return [sampleValueFromSchema(spec, resolvedSchema.items || {}, name, depth + 1)];
  }

  if (schemaType === 'integer') return /id$/i.test(name) ? 1 : 123;
  if (schemaType === 'number') return 12.34;
  if (schemaType === 'boolean') return true;
  if (resolvedSchema.format === 'date-time') return '2026-06-16T12:00:00Z';
  if (resolvedSchema.format === 'date') return '2026-06-16';
  if (resolvedSchema.format === 'email') return 'user@example.com';
  if (resolvedSchema.format === 'uuid') return '00000000-0000-4000-8000-000000000000';
  if (/id$/i.test(name)) return '1';
  return String(name || 'value');
};

const sampleValueFromParameter = (spec, parameter) => {
  const resolvedParameter = resolveOpenApiRef(spec, parameter) || {};
  const example = getOpenApiExample(spec, resolvedParameter);
  if (example !== undefined) return example;
  return sampleValueFromSchema(spec, resolvedParameter.schema || {}, resolvedParameter.name || 'value');
};

const replaceServerVariables = (server) => {
  const url = server?.url || 'https://api.example.com';
  return url.replace(/\{([^}]+)\}/g, (_match, name) => {
    const variable = server?.variables?.[name];
    return variable?.default || `{${name}}`;
  });
};

const getOpenApiBaseUrl = (spec) => {
  if (Array.isArray(spec.servers) && spec.servers.length > 0) {
    return replaceServerVariables(spec.servers[0]).replace(/\/+$/, '');
  }

  if (spec.swagger === '2.0' && spec.host) {
    const scheme = Array.isArray(spec.schemes) && spec.schemes.length > 0 ? spec.schemes[0] : 'https';
    const basePath = spec.basePath || '';
    return `${scheme}://${spec.host}${basePath}`.replace(/\/+$/, '');
  }

  return 'https://api.example.com';
};

const joinOpenApiUrl = (baseUrl, path) => {
  const cleanBase = (baseUrl || 'https://api.example.com').replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
};

const appendQueryParams = (targetUrl, queryParams) => {
  const filledParams = queryParams.filter(param => param.name);
  if (filledParams.length === 0) return targetUrl;
  const separator = targetUrl.includes('?') ? '&' : '?';
  const query = filledParams
    .map(param => `${encodeURIComponent(param.name)}=${encodeURIComponent(String(param.value ?? ''))}`)
    .join('&');
  return `${targetUrl}${separator}${query}`;
};

const chooseOpenApiContent = (content = {}) => {
  const entries = Object.entries(content);
  return entries.find(([type]) => type.includes('application/json'))
    || entries.find(([type]) => type.includes('x-www-form-urlencoded'))
    || entries.find(([type]) => type.includes('multipart/form-data'))
    || entries[0]
    || null;
};

const buildMultipartRowsFromSchema = (spec, schema) => {
  const resolvedSchema = resolveOpenApiRef(spec, schema) || {};
  return Object.entries(resolvedSchema.properties || {}).map(([key, propertySchema]) => {
    const property = resolveOpenApiRef(spec, propertySchema) || {};
    const isFile = property.type === 'string' && property.format === 'binary';
    return {
      key,
      type: isFile ? 'file' : 'text',
      value: isFile ? '' : String(sampleValueFromSchema(spec, property, key) ?? ''),
      fileName: '',
      mimeType: isFile ? property.contentMediaType || 'application/octet-stream' : '',
      size: 0,
      lastModified: 0,
      dataBase64: null
    };
  });
};

const buildOpenApiBody = (spec, operation, parameters, headers) => {
  const requestBody = resolveOpenApiRef(spec, operation.requestBody);
  const bodyParameter = parameters.find(param => param.in === 'body');
  const formParameters = parameters.filter(param => param.in === 'formData');

  if (requestBody?.content) {
    const selectedContent = chooseOpenApiContent(requestBody.content);
    if (!selectedContent) {
      return { bodyType: 'none', reqBody: '', formArray: null, multipartArray: null };
    }

    const [contentType, media] = selectedContent;
    if (!headers.some(header => header.key.toLowerCase() === 'content-type')) {
      headers.push({ key: 'Content-Type', value: contentType });
    }

    if (contentType.includes('multipart/form-data')) {
      return {
        bodyType: 'multipart',
        reqBody: '',
        formArray: null,
        multipartArray: buildMultipartRowsFromSchema(spec, media.schema || {})
      };
    }

    if (contentType.includes('x-www-form-urlencoded')) {
      const sample = sampleValueFromSchema(spec, media.schema || {}, 'form');
      const formArray = typeof sample === 'object' && !Array.isArray(sample) && sample !== null
        ? Object.entries(sample).map(([key, value]) => ({ key, value: String(value ?? '') }))
        : [];
      return { bodyType: 'urlencoded', reqBody: '', formArray, multipartArray: null };
    }

    const bodyExample = firstDefined(
      getOpenApiExample(spec, media),
      sampleValueFromSchema(spec, media.schema || {}, 'body')
    );
    return {
      bodyType: 'raw',
      reqBody: typeof bodyExample === 'string' ? bodyExample : JSON.stringify(bodyExample ?? {}, null, 2),
      formArray: null,
      multipartArray: null
    };
  }

  if (bodyParameter) {
    const bodyExample = sampleValueFromSchema(spec, bodyParameter.schema || {}, bodyParameter.name || 'body');
    if (!headers.some(header => header.key.toLowerCase() === 'content-type')) {
      headers.push({ key: 'Content-Type', value: 'application/json' });
    }
    return {
      bodyType: 'raw',
      reqBody: JSON.stringify(bodyExample ?? {}, null, 2),
      formArray: null,
      multipartArray: null
    };
  }

  if (formParameters.length > 0) {
    const consumes = Array.isArray(operation.consumes)
      ? operation.consumes
      : Array.isArray(spec.consumes) ? spec.consumes : [];
    const isMultipart = formParameters.some(param => param.type === 'file')
      || consumes.some(contentType => String(contentType).includes('multipart/form-data'));
    if (!headers.some(header => header.key.toLowerCase() === 'content-type')) {
      headers.push({
        key: 'Content-Type',
        value: isMultipart ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
      });
    }
    if (isMultipart) {
      return {
        bodyType: 'multipart',
        reqBody: '',
        formArray: null,
        multipartArray: formParameters.map(param => ({
          key: param.name,
          type: param.type === 'file' ? 'file' : 'text',
          value: param.type === 'file' ? '' : String(sampleValueFromParameter(spec, param) ?? ''),
          fileName: '',
          mimeType: param.type === 'file' ? 'application/octet-stream' : '',
          size: 0,
          lastModified: 0,
          dataBase64: null
        }))
      };
    }
    return {
      bodyType: 'urlencoded',
      reqBody: '',
      formArray: formParameters.map(param => ({
        key: param.name,
        value: String(sampleValueFromParameter(spec, param) ?? '')
      })),
      multipartArray: null
    };
  }

  return { bodyType: 'none', reqBody: '', formArray: null, multipartArray: null };
};

export const openApiToCollection = (rawText, overrideName = '') => {
  const spec = parseOpenApiText(rawText);
  if (!spec || typeof spec !== 'object' || (!spec.openapi && spec.swagger !== '2.0')) {
    throw new Error('To nie wygląda jak definicja OpenAPI/Swagger.');
  }
  if (!spec.paths || typeof spec.paths !== 'object') {
    throw new Error('Definicja OpenAPI nie zawiera sekcji paths.');
  }

  const baseUrl = getOpenApiBaseUrl(spec);
  const now = Date.now();
  const items = [];

  Object.entries(spec.paths).forEach(([path, pathItem], pathIndex) => {
    const resolvedPathItem = resolveOpenApiRef(spec, pathItem) || {};
    const pathParameters = Array.isArray(resolvedPathItem.parameters)
      ? resolvedPathItem.parameters.map(param => resolveOpenApiRef(spec, param))
      : [];

    OPENAPI_HTTP_METHODS.forEach((methodName) => {
      const operation = resolveOpenApiRef(spec, resolvedPathItem[methodName]);
      if (!operation || typeof operation !== 'object') return;

      const operationParameters = Array.isArray(operation.parameters)
        ? operation.parameters.map(param => resolveOpenApiRef(spec, param))
        : [];
      const parameters = [...pathParameters, ...operationParameters].filter(Boolean);
      const pathParams = parameters.filter(param => param.in === 'path');
      const queryParams = parameters
        .filter(param => param.in === 'query')
        .map(param => ({ name: param.name, value: sampleValueFromParameter(spec, param) }));
      const headers = parameters
        .filter(param => param.in === 'header')
        .map(param => ({ key: param.name, value: String(sampleValueFromParameter(spec, param) ?? '') }));

      const pathWithSamples = path.replace(/\{([^}]+)\}/g, (_match, name) => {
        const param = pathParams.find(item => item.name === name);
        return encodeURIComponent(String(param ? sampleValueFromParameter(spec, param) : `{${name}}`));
      });
      const requestBody = buildOpenApiBody(spec, operation, parameters, headers);
      const method = methodName.toUpperCase();
      const operationName = operation.summary || operation.operationId || `${method} ${path}`;

      items.push({
        id: `openapi-${now}-${pathIndex}-${methodName}`,
        name: operationName,
        protocol: 'http',
        url: appendQueryParams(joinOpenApiUrl(baseUrl, pathWithSamples), queryParams),
        method,
        reqHeaders: headers,
        bodyType: requestBody.bodyType,
        reqBody: requestBody.reqBody,
        formArray: requestBody.formArray,
        multipartArray: requestBody.multipartArray,
        grpcTarget: '',
        grpcService: '',
        grpcMethod: '',
        grpcMetadata: [],
        grpcBodyRaw: ''
      });
    });
  });

  if (items.length === 0) {
    throw new Error('Nie znaleziono żadnych operacji HTTP w paths.');
  }

  return {
    id: `col-openapi-${now}`,
    name: overrideName.trim() || spec.info?.title || 'OpenAPI import',
    expanded: true,
    items
  };
};
