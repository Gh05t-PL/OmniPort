const isPlainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const appendError = (errors, message) => {
  if (errors.length < 12) errors.push(message);
};

const validateInteger = (value, {
  path,
  errors,
  min,
  max,
  unsigned = false,
  allowString = false,
  minString,
  maxString
}) => {
  if (allowString && typeof value === 'string') {
    const pattern = unsigned ? /^\d+$/ : /^-?\d+$/;
    if (!pattern.test(value)) {
      appendError(errors, `${path}: oczekiwano liczby całkowitej zapisanej jako tekst.`);
      return;
    }
    if (minString != null && maxString != null) {
      const parsedValue = BigInt(value);
      if (parsedValue < BigInt(minString) || parsedValue > BigInt(maxString)) {
        appendError(errors, `${path}: wartość jest poza zakresem typu.`);
      }
    }
    return;
  }
  if (!Number.isSafeInteger(value)) {
    appendError(errors, `${path}: oczekiwano bezpiecznej liczby całkowitej.`);
    return;
  }
  if (value < min || value > max) {
    appendError(errors, `${path}: wartość jest poza zakresem typu.`);
  }
};

const validateMapKey = (value, schema, path, errors) => {
  if (!schema || schema.kind === 'string') return;
  if (schema.kind === 'bool') {
    if (!['true', 'false'].includes(value)) {
      appendError(errors, `${path}: klucz mapy powinien być true albo false.`);
    }
    return;
  }
  if (['int32', 'int64'].includes(schema.kind) && !/^-?\d+$/.test(value)) {
    appendError(errors, `${path}: klucz mapy powinien być liczbą całkowitą.`);
    return;
  }
  if (['uint32', 'uint64'].includes(schema.kind) && !/^\d+$/.test(value)) {
    appendError(errors, `${path}: klucz mapy powinien być nieujemną liczbą całkowitą.`);
  }
};

const validateValue = (value, schema, path, errors) => {
  if (!schema || schema.kind === 'any') return;

  switch (schema.kind) {
    case 'message': {
      if (!isPlainObject(value)) {
        appendError(errors, `${path}: oczekiwano obiektu ${schema.typeName || 'message'}.`);
        return;
      }
      if (schema.truncated) return;

      const fields = Array.isArray(schema.fields) ? schema.fields : [];
      const fieldsByName = new Map();
      fields.forEach(field => {
        fieldsByName.set(field.name, field);
        fieldsByName.set(field.protoName, field);
      });

      Object.entries(value).forEach(([key, fieldValue]) => {
        const field = fieldsByName.get(key);
        if (!field) {
          appendError(errors, `${path}.${key}: pole nie występuje w schemacie.`);
          return;
        }
        const fieldPath = `${path}.${key}`;
        if (field.repeated) {
          if (!Array.isArray(fieldValue)) {
            appendError(errors, `${fieldPath}: oczekiwano tablicy.`);
            return;
          }
          fieldValue.forEach((item, index) => {
            validateValue(item, field.value, `${fieldPath}[${index}]`, errors);
          });
          return;
        }
        if (field.map) {
          if (!isPlainObject(fieldValue)) {
            appendError(errors, `${fieldPath}: oczekiwano obiektu mapy.`);
            return;
          }
          Object.entries(fieldValue).forEach(([mapKey, mapValue]) => {
            validateMapKey(mapKey, field.mapKey, `${fieldPath}.${mapKey}`, errors);
            validateValue(mapValue, field.value, `${fieldPath}.${mapKey}`, errors);
          });
          return;
        }
        validateValue(fieldValue, field.value, fieldPath, errors);
      });

      fields.filter(field => field.required).forEach(field => {
        if (
          !Object.prototype.hasOwnProperty.call(value, field.name)
          && !Object.prototype.hasOwnProperty.call(value, field.protoName)
        ) {
          appendError(errors, `${path}.${field.name}: pole wymagane.`);
        }
      });
      const selectedOneofs = new Map();
      fields.filter(field => field.oneof).forEach(field => {
        const isSelected = Object.prototype.hasOwnProperty.call(value, field.name)
          || Object.prototype.hasOwnProperty.call(value, field.protoName);
        if (!isSelected) return;
        const selectedFields = selectedOneofs.get(field.oneof) || [];
        selectedFields.push(field.name);
        selectedOneofs.set(field.oneof, selectedFields);
      });
      selectedOneofs.forEach((selectedFields, oneofName) => {
        if (selectedFields.length > 1) {
          appendError(
            errors,
            `${path}: pola ${selectedFields.join(', ')} należą do oneof ${oneofName}; wybierz jedno.`
          );
        }
      });
      return;
    }
    case 'object':
      if (!isPlainObject(value)) {
        appendError(errors, `${path}: oczekiwano obiektu.`);
      }
      return;
    case 'array':
      if (!Array.isArray(value)) {
        appendError(errors, `${path}: oczekiwano tablicy.`);
      }
      return;
    case 'string':
    case 'bytes':
      if (typeof value !== 'string') {
        appendError(errors, `${path}: oczekiwano tekstu.`);
      }
      return;
    case 'bool':
      if (typeof value !== 'boolean') {
        appendError(errors, `${path}: oczekiwano true albo false.`);
      }
      return;
    case 'int32':
      validateInteger(value, {
        path,
        errors,
        min: -2147483648,
        max: 2147483647
      });
      return;
    case 'uint32':
      validateInteger(value, {
        path,
        errors,
        min: 0,
        max: 4294967295,
        unsigned: true
      });
      return;
    case 'int64':
      validateInteger(value, {
        path,
        errors,
        min: Number.MIN_SAFE_INTEGER,
        max: Number.MAX_SAFE_INTEGER,
        allowString: true,
        minString: '-9223372036854775808',
        maxString: '9223372036854775807'
      });
      return;
    case 'uint64':
      validateInteger(value, {
        path,
        errors,
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        unsigned: true,
        allowString: true,
        minString: '0',
        maxString: '18446744073709551615'
      });
      return;
    case 'float':
    case 'double':
      if (
        typeof value !== 'number'
        && !['NaN', 'Infinity', '-Infinity'].includes(value)
      ) {
        appendError(errors, `${path}: oczekiwano liczby.`);
      }
      return;
    case 'enum':
      if (Number.isInteger(value)) return;
      if (
        typeof value !== 'string'
        || (
          Array.isArray(schema.enumValues)
          && schema.enumValues.length > 0
          && !schema.enumValues.includes(value)
        )
      ) {
        appendError(
          errors,
          `${path}: oczekiwano wartości enum${schema.enumValues?.length
            ? ` (${schema.enumValues.join(', ')})`
            : ''}.`
        );
      }
      return;
    default:
  }
};

export const validateGrpcPayload = (rawPayload, requestSchema = null) => {
  const source = String(rawPayload || '').trim() || '{}';
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return {
      valid: false,
      errors: [`Niepoprawny JSON: ${error?.message || 'błąd składni'}.`],
      value: null
    };
  }

  const errors = [];
  if (requestSchema) {
    validateValue(value, requestSchema, '$', errors);
  }
  return {
    valid: errors.length === 0,
    errors,
    value
  };
};

export const formatGrpcPayloadTemplate = (template) => JSON.stringify(
  template ?? {},
  null,
  2
);
