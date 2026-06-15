import { useState } from 'react';
import {
  FileArchive,
  FileCode2,
  FolderOpen,
  LoaderCircle,
  RadioTower,
  Trash2,
  Upload
} from 'lucide-react';
import {
  GRPC_PROTO_FILE_MAX_COUNT,
  GRPC_PROTO_FILE_MAX_BYTES,
  GRPC_SCHEMA_MAX_BYTES
} from '../../config/constants.js';
import {
  formatFileSize,
  readFileAsBase64,
  readFilesAsText
} from '../../utils/files.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

const SCHEMA_MODES = [
  {
    id: 'reflection',
    labelKey: 'Reflection',
    Icon: RadioTower
  },
  {
    id: 'proto',
    labelKey: 'grpcSchema.protoFiles',
    Icon: FileCode2
  },
  {
    id: 'protoset',
    labelKey: 'Protoset',
    Icon: FileArchive
  }
];

export default function GrpcSchemaPanel({
  mode,
  protoFiles,
  protoset,
  onModeChange,
  onProtoFilesImport,
  onRemoveProtoFile,
  onProtosetImport,
  onClearProtoFiles,
  onClearProtoset
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const totalProtoBytes = protoFiles.reduce((total, file) => total + (Number(file.size) || 0), 0);

  const importProtoFiles = async (event) => {
    const files = Array.from(event.target.files || []).filter(file => (
      file.name.toLocaleLowerCase('en').endsWith('.proto')
    ));
    event.target.value = '';
    if (!files.length) {
      setError(t('grpcSchema.noProtoFiles'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const importedFiles = await readFilesAsText(files, {
        maxFileBytes: GRPC_PROTO_FILE_MAX_BYTES,
        maxTotalBytes: GRPC_SCHEMA_MAX_BYTES
      });
      const projectedFiles = new Map(protoFiles.map(file => [file.name, file]));
      importedFiles.forEach(file => projectedFiles.set(file.name, file));
      if (projectedFiles.size > GRPC_PROTO_FILE_MAX_COUNT) {
        throw new Error(t('grpcSchema.maxFiles', { count: GRPC_PROTO_FILE_MAX_COUNT }));
      }
      const projectedBytes = Array.from(projectedFiles.values()).reduce((
        total,
        file
      ) => total + (Number(file.size) || 0), 0);
      if (projectedBytes > GRPC_SCHEMA_MAX_BYTES) {
        throw new Error(
          t('grpcSchema.totalSize', { size: formatFileSize(GRPC_SCHEMA_MAX_BYTES) })
        );
      }
      onProtoFilesImport(importedFiles);
    } catch (importError) {
      setError(importError?.message || t('grpcSchema.readProtoFailed'));
    } finally {
      setLoading(false);
    }
  };

  const importProtoset = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setLoading(true);
    setError('');
    try {
      onProtosetImport(await readFileAsBase64(file, {
        maxBytes: GRPC_SCHEMA_MAX_BYTES
      }));
    } catch (importError) {
      setError(importError?.message || t('grpcSchema.readProtosetFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t('grpcSchema.source')}
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1">
          {SCHEMA_MODES.map(({ id, labelKey, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setError('');
                onModeChange(id);
              }}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded px-2 py-2 text-xs font-medium transition-colors ${
                mode === id
                  ? 'bg-indigo-500/15 text-indigo-200 shadow-sm'
                  : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{labelKey.includes('.') ? t(labelKey) : labelKey}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === 'reflection' && (
        <div className="rounded border border-indigo-500/20 bg-indigo-500/5 p-4 text-sm leading-relaxed text-gray-400">
          {t('grpcSchema.reflectionHint')}
        </div>
      )}

      {mode === 'proto' && (
        <div className="space-y-3">
          <div className="rounded border border-gray-800 bg-gray-900/70 p-3 text-xs leading-relaxed text-gray-500">
            {t('grpcSchema.protoHint')}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-indigo-500/60 hover:text-indigo-200">
              <Upload className="h-4 w-4" />
              {t('grpcSchema.addFiles')}
              <input
                type="file"
                accept=".proto,text/plain"
                multiple
                className="hidden"
                onChange={(event) => void importProtoFiles(event)}
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-indigo-500/60 hover:text-indigo-200">
              <FolderOpen className="h-4 w-4" />
              {t('grpcSchema.addFolder')}
              <input
                type="file"
                accept=".proto,text/plain"
                multiple
                webkitdirectory=""
                className="hidden"
                onChange={(event) => void importProtoFiles(event)}
              />
            </label>
            {protoFiles.length > 0 && (
              <button
                type="button"
                onClick={onClearProtoFiles}
                className="inline-flex items-center gap-2 rounded border border-gray-800 px-3 py-2 text-xs text-gray-500 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
                {t('common.clear')}
              </button>
            )}
          </div>
          {protoFiles.length > 0 ? (
            <div className="overflow-hidden rounded border border-gray-800">
              <div className="flex items-center justify-between gap-3 border-b border-gray-800 bg-gray-900/70 px-3 py-2 text-[11px] text-gray-500">
                <span>{t('grpcSchema.fileCount', { count: protoFiles.length })}</span>
                <span>{formatFileSize(totalProtoBytes)}</span>
              </div>
              <div className="max-h-56 divide-y divide-gray-900 overflow-y-auto custom-scrollbar">
                {protoFiles.map(file => (
                  <div key={file.name} className="flex items-center gap-2 px-3 py-2">
                    <FileCode2 className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-300" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-[10px] text-gray-600">{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveProtoFile(file.name)}
                      className="rounded p-1 text-gray-600 hover:bg-red-500/10 hover:text-red-400"
                      title={t('grpcSchema.removeFile', { fileName: file.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded border border-dashed border-gray-800 px-4 py-6 text-center text-xs italic text-gray-600">
              {t('grpcSchema.emptyProto')}
            </div>
          )}
        </div>
      )}

      {mode === 'protoset' && (
        <div className="space-y-3">
          <div className="rounded border border-gray-800 bg-gray-900/70 p-3 text-xs leading-relaxed text-gray-500">
            {t('grpcSchema.protosetHint')}
            <code className="ml-1 text-gray-300">protoc --include_imports --descriptor_set_out=api.protoset</code>.
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-indigo-500/60 hover:text-indigo-200">
              <FileArchive className="h-4 w-4" />
              {t('grpcSchema.chooseProtoset')}
              <input
                type="file"
                accept=".protoset,.pb,application/octet-stream"
                className="hidden"
                onChange={(event) => void importProtoset(event)}
              />
            </label>
            {protoset.dataBase64 && (
              <button
                type="button"
                onClick={onClearProtoset}
                className="inline-flex items-center gap-2 rounded border border-gray-800 px-3 py-2 text-xs text-gray-500 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
                {t('common.remove')}
              </button>
            )}
          </div>
          {protoset.dataBase64 ? (
            <div className="flex items-center gap-3 rounded border border-gray-800 bg-gray-900/70 px-3 py-3">
              <FileArchive className="h-5 w-5 flex-shrink-0 text-indigo-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs text-gray-300" title={protoset.fileName}>
                  {protoset.fileName}
                </div>
                <div className="mt-1 text-[10px] text-gray-600">{formatFileSize(protoset.size)}</div>
              </div>
            </div>
          ) : (
            <div className="rounded border border-dashed border-gray-800 px-4 py-6 text-center text-xs italic text-gray-600">
              {t('grpcSchema.emptyProtoset')}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-indigo-300">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {t('grpcSchema.reading')}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
