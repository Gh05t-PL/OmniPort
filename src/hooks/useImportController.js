import { useEffect, useRef } from 'react';
import { parseCurlCommand } from '../domain/curl.js';
import { openApiToCollection } from '../domain/openapi.js';
import { useTranslation } from '../i18n/I18nProvider.jsx';

export default function useImportController({
  methods,
  curlText,
  setCurlText,
  setImportError,
  setShowImportModal,
  setProtocol,
  setUrl,
  setMethod,
  setReqHeaders,
  setBodyType,
  setReqBodyRaw,
  setReqBodyMultipart,
  setActiveTab,
  openApiText,
  setOpenApiText,
  setOpenApiError,
  setOpenApiFileName,
  openApiCollectionName,
  setOpenApiCollectionName,
  setShowOpenApiModal,
  persistCollections,
  setSidebarView,
  isSidebarOpen,
  setIsSidebarOpen
}) {
  const { t } = useTranslation();
  const openApiReaderRef = useRef(null);

  useEffect(() => () => {
    if (openApiReaderRef.current?.readyState === 1) {
      openApiReaderRef.current.abort();
    }
  }, []);

  const handleImportCurl = () => {
    try {
      setImportError('');
      const {
        parsedUrl,
        parsedMethod,
        parsedHeaders,
        parsedBody,
        parsedMultipart
      } = parseCurlCommand(curlText);
      setProtocol('http');
      if (parsedUrl) setUrl(parsedUrl);
      if (methods.includes(parsedMethod)) setMethod(parsedMethod);
      if (parsedHeaders.length > 0) setReqHeaders(parsedHeaders);
      if (parsedMultipart.length > 0) {
        setBodyType('multipart');
        setReqBodyMultipart(parsedMultipart);
        setActiveTab('body');
      } else if (parsedBody) {
        setBodyType('raw');
        try {
          setReqBodyRaw(JSON.stringify(JSON.parse(parsedBody), null, 2));
        } catch {
          setReqBodyRaw(parsedBody);
        }
        setActiveTab('body');
      } else {
        setBodyType('none');
      }
      setShowImportModal(false);
      setCurlText('');
    } catch (error) {
      setImportError(error.message || t('importCurl.failed'));
    }
  };

  const resetOpenApiImport = () => {
    if (openApiReaderRef.current?.readyState === 1) {
      openApiReaderRef.current.abort();
    }
    openApiReaderRef.current = null;
    setOpenApiText('');
    setOpenApiError('');
    setOpenApiFileName('');
    setOpenApiCollectionName('');
  };

  const closeOpenApiImport = () => {
    if (openApiReaderRef.current?.readyState === 1) {
      openApiReaderRef.current.abort();
    }
    setShowOpenApiModal(false);
  };

  const handleOpenApiFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (openApiReaderRef.current?.readyState === 1) {
      openApiReaderRef.current.abort();
    }

    const reader = new FileReader();
    openApiReaderRef.current = reader;
    reader.onload = () => {
      if (openApiReaderRef.current !== reader) return;
      setOpenApiText(String(reader.result || ''));
      setOpenApiFileName(file.name);
      setOpenApiError('');
      if (!openApiCollectionName.trim()) {
        setOpenApiCollectionName(file.name.replace(/\.(json|ya?ml)$/i, ''));
      }
      openApiReaderRef.current = null;
    };
    reader.onerror = () => {
      if (openApiReaderRef.current !== reader) return;
      setOpenApiError(t('importOpenApi.fileReadFailed'));
      openApiReaderRef.current = null;
    };
    reader.onabort = () => {
      if (openApiReaderRef.current === reader) {
        openApiReaderRef.current = null;
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleImportOpenApi = () => {
    try {
      setOpenApiError('');
      const collection = openApiToCollection(openApiText, openApiCollectionName);
      persistCollections(previousCollections => [collection, ...previousCollections]);
      setShowOpenApiModal(false);
      resetOpenApiImport();
      setSidebarView('collections');
      if (!isSidebarOpen) setIsSidebarOpen(true);
    } catch (error) {
      setOpenApiError(error.message || t('importOpenApi.failed'));
    }
  };

  return {
    closeOpenApiImport,
    handleImportCurl,
    handleImportOpenApi,
    handleOpenApiFileChange,
    resetOpenApiImport
  };
}
