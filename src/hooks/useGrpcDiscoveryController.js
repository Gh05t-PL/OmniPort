import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../i18n/I18nProvider.jsx';
import { createRequestToken } from '../utils/ids.js';

const GRPC_REFLECTION_DISCOVERY_DEBOUNCE_MS = 650;
const GRPC_SCHEMA_ASSET_DISCOVERY_DEBOUNCE_MS = 150;

export default function useGrpcDiscoveryController({
  protocol,
  grpcTarget,
  grpcService,
  grpcMethod,
  grpcSchemaMode,
  grpcProtoFiles,
  grpcProtoset,
  describeGrpcApi,
  setGrpcService,
  setGrpcMethod
}) {
  const { t } = useTranslation();
  const [grpcServices, setGrpcServices] = useState([]);
  const [grpcDiscoveryLoading, setGrpcDiscoveryLoading] = useState(false);
  const [grpcDiscoveryError, setGrpcDiscoveryError] = useState('');
  const grpcDiscoverySequenceRef = useRef(0);
  const grpcDiscoveryDebounceTimeoutRef = useRef(null);

  const grpcSchemaValid = grpcSchemaMode === 'reflection'
    || (grpcSchemaMode === 'proto' && grpcProtoFiles.length > 0)
    || (grpcSchemaMode === 'protoset' && Boolean(grpcProtoset.dataBase64));
  const grpcDiscoveryTarget = grpcSchemaMode === 'reflection' ? grpcTarget.trim() : '';
  const grpcDiscoveryReady = grpcSchemaValid
    && (grpcSchemaMode !== 'reflection' || Boolean(grpcDiscoveryTarget));

  const clearGrpcDiscoveryDebounce = useCallback(() => {
    if (!grpcDiscoveryDebounceTimeoutRef.current) return;
    clearTimeout(grpcDiscoveryDebounceTimeoutRef.current);
    grpcDiscoveryDebounceTimeoutRef.current = null;
  }, []);

  const refreshGrpcDiscovery = useCallback(async () => {
    if (!grpcDiscoveryReady) return;
    const sequence = grpcDiscoverySequenceRef.current + 1;
    grpcDiscoverySequenceRef.current = sequence;
    setGrpcDiscoveryLoading(true);
    setGrpcDiscoveryError('');

    try {
      const payload = await describeGrpcApi({
        requestId: createRequestToken('grpc-describe'),
        target: grpcDiscoveryTarget,
        schemaMode: grpcSchemaMode,
        protoFiles: grpcSchemaMode === 'proto'
          ? grpcProtoFiles.map(file => ({
              name: file.name,
              content: file.content
            }))
          : [],
        protosetBase64: grpcSchemaMode === 'protoset'
          ? grpcProtoset.dataBase64
          : ''
      });
      if (sequence !== grpcDiscoverySequenceRef.current) return;
      setGrpcServices(Array.isArray(payload.services) ? payload.services : []);
    } catch (error) {
      if (sequence !== grpcDiscoverySequenceRef.current) return;
      setGrpcServices([]);
      setGrpcDiscoveryError(error?.message || t('protocol.servicesReadFailed'));
    } finally {
      if (sequence === grpcDiscoverySequenceRef.current) {
        setGrpcDiscoveryLoading(false);
      }
    }
  }, [
    describeGrpcApi,
    grpcDiscoveryReady,
    grpcDiscoveryTarget,
    grpcProtoFiles,
    grpcProtoset.dataBase64,
    grpcSchemaMode,
    t
  ]);

  const scheduleGrpcDiscoveryRefresh = useCallback((delayMs) => {
    clearGrpcDiscoveryDebounce();
    if (protocol !== 'grpc' || !grpcDiscoveryReady) return;
    grpcDiscoveryDebounceTimeoutRef.current = setTimeout(() => {
      grpcDiscoveryDebounceTimeoutRef.current = null;
      void refreshGrpcDiscovery();
    }, delayMs);
  }, [
    clearGrpcDiscoveryDebounce,
    grpcDiscoveryReady,
    protocol,
    refreshGrpcDiscovery
  ]);

  const refreshGrpcDiscoveryNow = useCallback(() => {
    clearGrpcDiscoveryDebounce();
    void refreshGrpcDiscovery();
  }, [clearGrpcDiscoveryDebounce, refreshGrpcDiscovery]);

  useEffect(() => {
    grpcDiscoverySequenceRef.current += 1;
    clearGrpcDiscoveryDebounce();
    setGrpcDiscoveryLoading(false);
    setGrpcDiscoveryError('');
    setGrpcServices([]);
    if (protocol !== 'grpc' || !grpcDiscoveryReady) return undefined;

    scheduleGrpcDiscoveryRefresh(
      grpcSchemaMode === 'reflection'
        ? GRPC_REFLECTION_DISCOVERY_DEBOUNCE_MS
        : GRPC_SCHEMA_ASSET_DISCOVERY_DEBOUNCE_MS
    );
    return clearGrpcDiscoveryDebounce;
  }, [
    clearGrpcDiscoveryDebounce,
    grpcDiscoveryReady,
    grpcDiscoveryTarget,
    grpcProtoFiles,
    grpcProtoset.dataBase64,
    grpcSchemaMode,
    protocol,
    scheduleGrpcDiscoveryRefresh
  ]);

  const grpcSelectedService = useMemo(() => (
    grpcServices.find(service => service.name === grpcService) || null
  ), [grpcService, grpcServices]);
  const grpcSelectedMethod = useMemo(() => (
    grpcSelectedService?.methods?.find(methodItem => methodItem.name === grpcMethod) || null
  ), [grpcMethod, grpcSelectedService]);

  useEffect(() => {
    if (protocol !== 'grpc' || grpcServices.length === 0) return;
    if (!grpcService.trim()) {
      const firstService = grpcServices[0];
      setGrpcService(firstService.name);
      if (!grpcMethod.trim() && firstService.methods?.length) {
        setGrpcMethod(firstService.methods[0].name);
      }
      return;
    }
    if (!grpcMethod.trim() && grpcSelectedService?.methods?.length) {
      setGrpcMethod(grpcSelectedService.methods[0].name);
    }
  }, [
    grpcMethod,
    grpcSelectedService,
    grpcService,
    grpcServices,
    protocol,
    setGrpcMethod,
    setGrpcService
  ]);

  useEffect(() => clearGrpcDiscoveryDebounce, [clearGrpcDiscoveryDebounce]);

  return {
    grpcServices,
    grpcDiscoveryLoading,
    grpcDiscoveryError,
    grpcDiscoveryReady,
    grpcSelectedService,
    grpcSelectedMethod,
    refreshGrpcDiscoveryNow
  };
}
