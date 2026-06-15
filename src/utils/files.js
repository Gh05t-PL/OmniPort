import {
  MULTIPART_FILE_MAX_BYTES,
  NEUTRALINO_NATIVE_CALL_TIMEOUT_MS
} from '../config/constants.js';
import { withTimeout } from './async.js';

export const readFileAsBase64 = (file, options = {}) => new Promise((resolve, reject) => {
  const maxBytes = options.maxBytes ?? MULTIPART_FILE_MAX_BYTES;
  if (file.size > maxBytes) {
    reject(new Error(
      `Plik jest za duży. Maksymalny rozmiar to ${formatFileSize(maxBytes)}.`
    ));
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    const separatorIndex = result.indexOf(',');
    resolve({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      lastModified: file.lastModified,
      dataBase64: separatorIndex >= 0 ? result.slice(separatorIndex + 1) : result
    });
  };
  reader.onerror = () => reject(reader.error || new Error('Nie udało się odczytać pliku.'));
  reader.readAsDataURL(file);
});

export const formatFileSize = (bytes) => {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const readFileAsText = (file, options = {}) => new Promise((resolve, reject) => {
  const maxBytes = options.maxBytes ?? MULTIPART_FILE_MAX_BYTES;
  if (file.size > maxBytes) {
    reject(new Error(
      `Plik jest za duży. Maksymalny rozmiar to ${formatFileSize(maxBytes)}.`
    ));
    return;
  }

  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Nie udało się odczytać pliku.'));
  reader.readAsText(file, 'utf-8');
});

const normalizeRelativeFilePath = (value) => String(value || '')
  .replace(/\\/g, '/')
  .replace(/^\.?\//, '')
  .replace(/\/+/g, '/');

export const readFilesAsText = async (fileList, options = {}) => {
  const files = Array.from(fileList || []);
  const maxFileBytes = options.maxFileBytes ?? MULTIPART_FILE_MAX_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? maxFileBytes;
  const totalBytes = files.reduce((total, file) => total + (Number(file.size) || 0), 0);
  if (totalBytes > maxTotalBytes) {
    throw new Error(
      `Łączny rozmiar plików przekracza ${formatFileSize(maxTotalBytes)}.`
    );
  }

  const relativePaths = files.map(file => normalizeRelativeFilePath(
    file.webkitRelativePath || file.name
  ));
  const commonDirectory = relativePaths.length > 0
    && relativePaths.every(path => path.includes('/'))
    && relativePaths.every(path => path.split('/')[0] === relativePaths[0].split('/')[0])
    ? `${relativePaths[0].split('/')[0]}/`
    : '';

  return Promise.all(files.map(async (file, index) => ({
    name: commonDirectory
      ? relativePaths[index].slice(commonDirectory.length)
      : relativePaths[index],
    content: await readFileAsText(file, { maxBytes: maxFileBytes }),
    size: Number(file.size) || 0,
    lastModified: Number(file.lastModified) || 0
  })));
};

const downloadTextInBrowser = (fileName, contents, mimeType) => {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const saveTextFile = async ({
  fileName,
  contents,
  mimeType = 'application/json;charset=utf-8'
}) => {
  const nativeDialog = window.Neutralino?.os?.showSaveDialog;
  const nativeWrite = window.Neutralino?.filesystem?.writeFile;

  if (nativeDialog && nativeWrite) {
    try {
      const selectedPath = await nativeDialog('Eksportuj kolekcje', {
        defaultPath: fileName,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      if (!selectedPath) return false;
      const outputPath = selectedPath.toLowerCase().endsWith('.json')
        ? selectedPath
        : `${selectedPath}.json`;
      await withTimeout(
        nativeWrite(outputPath, contents),
        NEUTRALINO_NATIVE_CALL_TIMEOUT_MS,
        'Neutralino nie odpowiedziało podczas zapisu eksportu.'
      );
      return true;
    } catch {
      // Browser download remains available when the native dialog is unavailable.
    }
  }

  downloadTextInBrowser(fileName, contents, mimeType);
  return true;
};
