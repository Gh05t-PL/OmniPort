import { Check, Copy, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import { formatFileSize, readFileAsBase64 } from '../../utils/files.js';
import { isKeyValueRowEnabled } from '../../utils/headers.js';
import GrpcPayloadEditor from './GrpcPayloadEditor.jsx';
import GrpcSchemaPanel from './GrpcSchemaPanel.jsx';
import NetworkPayloadEditor from './NetworkPayloadEditor.jsx';
import NetworkReadOptions from './NetworkReadOptions.jsx';

const formatEnabledRowCount = (rows) => {
  const enabledCount = rows.filter(isKeyValueRowEnabled).length;
  return enabledCount === rows.length
    ? String(rows.length)
    : `${enabledCount}/${rows.length}`;
};

const RowEnabledCheckbox = ({ checked, onChange, label, t }) => (
  <label
    className="flex w-7 flex-shrink-0 cursor-pointer items-center justify-center"
    title={checked ? t('request.disableRow', { label }) : t('request.enableRow', { label })}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={checked ? t('request.disableRow', { label }) : t('request.enableRow', { label })}
      className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
    />
  </label>
);

const getRequestTabLabel = ({ tab, protocol, queryParams, reqHeaders, wsHeaders, grpcMetadata, t }) => {
  if (tab === 'params') return t('request.tab.params', { count: formatEnabledRowCount(queryParams) });
  if (tab === 'headers') {
    return t('request.tab.headers', {
      count: formatEnabledRowCount(protocol === 'ws' ? wsHeaders : reqHeaders)
    });
  }
  if (tab === 'metadata') return t('request.tab.metadata', { count: formatEnabledRowCount(grpcMetadata) });
  if (tab === 'schema') return t('request.tab.schema');
  if (tab === 'command') return t('request.tab.command');
  if (tab === 'read') return t('request.tab.read');
  if (protocol === 'grpc') return t('request.tab.grpcPayload');
  if (protocol === 'ws') return t('request.tab.wsMessage');
  if (protocol === 'tcp' || protocol === 'udp') return t('request.tab.networkPayload');
  return t('request.tab.body');
};

export default function RequestPanel({
  layout,
  state,
  actions,
  buildGrpcurlCommand
}) {
  const { t } = useTranslation();
  const {
    protocol,
    requestTabs,
    activeTab,
    queryParams,
    reqHeaders,
    wsHeaders,
    grpcMetadata,
    copied,
    bodyType,
    grpcBodyRaw,
    grpcSchemaMode,
    grpcProtoFiles,
    grpcProtoset,
    grpcSelectedMethod,
    grpcPayloadValidation,
    wsMessage,
    networkPayload,
    networkPayloadHex,
    networkPayloadMode,
    networkPayloadFileName,
    networkReadMode,
    networkExactBytes,
    networkDelimiterHex,
    networkLengthPrefixBytes,
    networkLengthPrefixEndian,
    networkKeepConnection,
    networkConnected,
    reqBodyRaw,
    reqBodyForm,
    reqBodyMultipart
  } = state;

  const handleMultipartFileSelection = async (index, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      actions.handleMultipartFileChange(index, await readFileAsBase64(file));
    } catch (error) {
      window.alert(error.message || t('request.fileReadFailed'));
    }
  };

  return (
    <div className={`flex flex-col bg-gray-900 overflow-hidden min-w-0 ${
      layout === 'horizontal'
        ? 'w-1/2 h-full min-h-0 border-r border-gray-800'
        : 'w-full h-1/2 min-h-0 border-b border-gray-800'
    }`}>
      <div className="flex border-b border-gray-800 bg-gray-900 px-3 sm:px-4 pt-2 gap-3 sm:gap-4 overflow-x-auto custom-scrollbar flex-shrink-0">
        {requestTabs.map(tab => (
          <button
            key={tab}
            className={`pb-2 px-1 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            onClick={() => actions.setActiveTab(tab)}
          >
            {getRequestTabLabel({
              tab,
              protocol,
              queryParams,
              reqHeaders,
              wsHeaders,
              grpcMetadata,
              t
            })}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-gray-950 custom-scrollbar">
        {protocol === 'http' && activeTab === 'params' && (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 mb-3">{t('request.queryHint')}</div>
            {queryParams.map((param, index) => (
              <div key={index} className={`flex gap-2 transition-opacity ${isKeyValueRowEnabled(param) ? '' : 'opacity-50'}`}>
                <RowEnabledCheckbox
                  checked={isKeyValueRowEnabled(param)}
                  onChange={(enabled) => actions.handleParamChange(index, 'enabled', enabled)}
                  label={t('request.paramLabel', { name: param.key || index + 1 })}
                  t={t}
                />
                <input type="text" placeholder={t('request.key')} value={param.key} onChange={(event) => actions.handleParamChange(index, 'key', event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono"/>
                <input type="text" placeholder={t('request.value')} value={param.value} onChange={(event) => actions.handleParamChange(index, 'value', event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono"/>
                <button onClick={() => actions.handleRemoveParam(index)} className="p-2 text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={actions.handleAddParam} className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"><Plus className="w-4 h-4" /> {t('request.addQuery')}</button>
          </div>
        )}

        {protocol === 'http' && activeTab === 'headers' && (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 mb-3 font-medium">{t('request.httpHeaders')}</div>
            {reqHeaders.map((header, index) => (
              <div key={index} className={`flex gap-2 transition-opacity ${isKeyValueRowEnabled(header) ? '' : 'opacity-50'}`}>
                <RowEnabledCheckbox
                  checked={isKeyValueRowEnabled(header)}
                  onChange={(enabled) => actions.handleHeaderChange(index, 'enabled', enabled)}
                  label={t('request.headerLabel', { name: header.key || index + 1 })}
                  t={t}
                />
                <input type="text" placeholder={t('request.headerKey')} value={header.key} onChange={(event) => actions.handleHeaderChange(index, 'key', event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono"/>
                <input type="text" placeholder={t('request.headerValue')} value={header.value} onChange={(event) => actions.handleHeaderChange(index, 'value', event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono"/>
                <button onClick={() => actions.handleRemoveHeader(index)} className="p-2 text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={actions.handleAddHeader} className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"><Plus className="w-4 h-4" /> {t('request.addHeader')}</button>
          </div>
        )}

        {protocol === 'ws' && activeTab === 'headers' && (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 mb-3 font-medium">{t('request.wsHeaders')}</div>
            {wsHeaders.map((header, index) => (
              <div key={index} className={`flex gap-2 transition-opacity ${isKeyValueRowEnabled(header) ? '' : 'opacity-50'}`}>
                <RowEnabledCheckbox
                  checked={isKeyValueRowEnabled(header)}
                  onChange={(enabled) => actions.handleWsHeaderChange(index, 'enabled', enabled)}
                  label={t('request.wsHeaderLabel', { name: header.key || index + 1 })}
                  t={t}
                />
                <input type="text" placeholder={t('request.headerKey')} value={header.key} onChange={(event) => actions.handleWsHeaderChange(index, 'key', event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono"/>
                <input type="text" placeholder={t('request.value')} value={header.value} onChange={(event) => actions.handleWsHeaderChange(index, 'value', event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono"/>
                <button onClick={() => actions.handleRemoveWsHeader(index)} className="p-2 text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={actions.handleAddWsHeader} className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"><Plus className="w-4 h-4" /> {t('request.addHeader')}</button>
          </div>
        )}

        {protocol === 'grpc' && activeTab === 'metadata' && (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 mb-3 font-medium">{t('request.grpcMetadata')}</div>
            {grpcMetadata.map((item, index) => (
              <div key={index} className={`flex gap-2 transition-opacity ${isKeyValueRowEnabled(item) ? '' : 'opacity-50'}`}>
                <RowEnabledCheckbox
                  checked={isKeyValueRowEnabled(item)}
                  onChange={(enabled) => actions.handleGrpcMetadataChange(index, 'enabled', enabled)}
                  label={t('request.metadataLabel', { name: item.key || index + 1 })}
                  t={t}
                />
                <input type="text" placeholder={t('request.metadataKey')} value={item.key} onChange={(event) => actions.handleGrpcMetadataChange(index, 'key', event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono"/>
                <input type="text" placeholder={t('request.value')} value={item.value} onChange={(event) => actions.handleGrpcMetadataChange(index, 'value', event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono"/>
                <button onClick={() => actions.handleRemoveGrpcMetadata(index)} className="p-2 text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={actions.handleAddGrpcMetadata} className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"><Plus className="w-4 h-4" /> {t('request.addMetadata')}</button>
          </div>
        )}

        {protocol === 'grpc' && activeTab === 'schema' && (
          <GrpcSchemaPanel
            mode={grpcSchemaMode}
            protoFiles={grpcProtoFiles}
            protoset={grpcProtoset}
            onModeChange={actions.setGrpcSchemaMode}
            onProtoFilesImport={actions.handleGrpcProtoFilesImport}
            onRemoveProtoFile={actions.handleRemoveGrpcProtoFile}
            onProtosetImport={actions.handleGrpcProtosetImport}
            onClearProtoFiles={actions.handleClearGrpcProtoFiles}
            onClearProtoset={actions.handleClearGrpcProtoset}
          />
        )}

        {protocol === 'grpc' && activeTab === 'command' && (
          <div className="h-full flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500">
                {t('request.grpcCommandHint')}
              </div>
              <button onClick={actions.handleCopyGrpcCommand} className="text-xs flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors bg-gray-800 px-2.5 py-1 rounded border border-gray-700 shadow-sm flex-shrink-0">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400"/> : <Copy className="w-3.5 h-3.5"/>} {copied ? t('common.copied') : t('common.copy')}
              </button>
            </div>
            <pre className="flex-1 bg-gray-900 border border-gray-800 rounded p-4 overflow-auto custom-scrollbar whitespace-pre-wrap break-all font-mono text-sm text-gray-300">
              {buildGrpcurlCommand()}
            </pre>
          </div>
        )}

        {protocol === 'tcp' && activeTab === 'read' && (
          <NetworkReadOptions
            protocol={protocol}
            readMode={networkReadMode}
            exactBytes={networkExactBytes}
            delimiterHex={networkDelimiterHex}
            lengthPrefixBytes={networkLengthPrefixBytes}
            lengthPrefixEndian={networkLengthPrefixEndian}
            keepConnection={networkKeepConnection}
            connected={networkConnected}
            onReadModeChange={actions.setNetworkReadMode}
            onExactBytesChange={actions.setNetworkExactBytes}
            onDelimiterHexChange={actions.setNetworkDelimiterHex}
            onLengthPrefixBytesChange={actions.setNetworkLengthPrefixBytes}
            onLengthPrefixEndianChange={actions.setNetworkLengthPrefixEndian}
            onKeepConnectionChange={actions.setNetworkKeepConnection}
          />
        )}

        {activeTab === 'body' && (
          <div className="h-full flex flex-col">
            {protocol === 'http' && (
              <div className="flex items-center gap-3 mb-4 border-b border-gray-800 pb-3 flex-shrink-0">
                <label htmlFor="http-body-type" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {t('request.bodyType')}
                </label>
                <select
                  id="http-body-type"
                  value={bodyType}
                  onChange={(event) => actions.setBodyType(event.target.value)}
                  className="min-w-52 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm text-gray-200"
                >
                  <option value="none">{t('request.bodyNone')}</option>
                  <option value="raw">Raw (JSON)</option>
                  <option value="multipart">Multipart/Form-Data</option>
                  <option value="urlencoded">Form URL Encoded</option>
                </select>
              </div>
            )}
            <div className="flex-1 flex flex-col min-h-0">
              {protocol === 'grpc' && (
                <GrpcPayloadEditor
                  value={grpcBodyRaw}
                  selectedMethod={grpcSelectedMethod}
                  validation={grpcPayloadValidation}
                  onChange={actions.setGrpcBodyRaw}
                  onGenerateTemplate={actions.handleGenerateGrpcPayload}
                />
              )}
              {protocol === 'ws' && <textarea value={wsMessage} onChange={(event) => actions.setWsMessage(event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded p-4 outline-none focus:border-indigo-500 font-mono text-sm resize-none custom-scrollbar" spellCheck="false" placeholder={`{\n  "type": "ping"\n}`}/>}
              {(protocol === 'tcp' || protocol === 'udp') && (
                <NetworkPayloadEditor
                  mode={networkPayloadMode}
                  textValue={networkPayload}
                  hexValue={networkPayloadHex}
                  fileName={networkPayloadFileName}
                  onModeChange={actions.setNetworkPayloadMode}
                  onTextChange={actions.handleNetworkPayloadTextChange}
                  onHexChange={actions.handleNetworkPayloadHexChange}
                  onFileImport={actions.handleNetworkPayloadFileImport}
                  onClearPayload={actions.handleClearNetworkPayload}
                />
              )}
              {protocol === 'http' && bodyType === 'none' && <div className="flex-1 flex items-center justify-center text-gray-500 italic text-sm">{t('request.noBody')}</div>}
              {protocol === 'http' && bodyType === 'raw' && <textarea value={reqBodyRaw} onChange={(event) => actions.setReqBodyRaw(event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded p-4 outline-none focus:border-indigo-500 font-mono text-sm resize-none custom-scrollbar" spellCheck="false" placeholder={`{\n  "key": "value"\n}`}/>}
              {protocol === 'http' && bodyType === 'urlencoded' && (
                <div className="space-y-2 overflow-y-auto max-h-full">
                  {reqBodyForm.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <input type="text" placeholder={t('request.formKey')} value={item.key} onChange={(event) => actions.handleFormChange(index, 'key', event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono"/>
                      <input type="text" placeholder={t('request.value')} value={item.value} onChange={(event) => actions.handleFormChange(index, 'value', event.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono"/>
                      <button onClick={() => actions.handleRemoveFormRow(index)} className="p-2 text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                  <button onClick={actions.handleAddFormRow} className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"><Plus className="w-4 h-4" /> {t('request.addFormField')}</button>
                </div>
              )}
              {protocol === 'http' && bodyType === 'multipart' && (
                <div className="space-y-2 overflow-y-auto max-h-full">
                  <div className="text-xs text-gray-500 mb-3">
                    {t('request.multipartHint')}
                  </div>
                  {reqBodyMultipart.map((item, index) => (
                    <div key={item.id || index} className="grid grid-cols-[minmax(0,1fr)_max-content] 2xl:grid-cols-[minmax(120px,1fr)_110px_minmax(180px,1.4fr)_36px] gap-2 items-center">
                      <input
                        type="text"
                        placeholder={t('request.fieldName')}
                        value={item.key}
                        onChange={(event) => actions.handleMultipartChange(index, 'key', event.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono min-w-0"
                      />
                      <select
                        value={item.type}
                        onChange={(event) => actions.handleMultipartTypeChange(index, event.target.value)}
                        className="min-w-0 bg-gray-900 border border-gray-800 rounded px-2 py-1.5 outline-none focus:border-indigo-500 text-sm 2xl:col-auto"
                      >
                        <option value="text">{t('common.text')}</option>
                        <option value="file">{t('common.file')}</option>
                      </select>
                      {item.type === 'file' ? (
                        <label className="min-w-0 col-span-1 flex items-center gap-2 bg-gray-900 border border-gray-800 hover:border-indigo-500 rounded px-3 py-1.5 cursor-pointer text-sm 2xl:col-auto">
                          <input
                            type="file"
                            className="hidden"
                            onChange={(event) => void handleMultipartFileSelection(index, event)}
                          />
                          <span className={`truncate ${typeof item.dataBase64 === 'string' ? 'text-gray-200' : 'text-amber-400'}`}>
                            {typeof item.dataBase64 === 'string'
                              ? item.fileName
                              : item.fileName
                                ? t('request.chooseAgain', { fileName: item.fileName })
                                : t('request.chooseFile')}
                          </span>
                          {item.fileName && (
                            <span className="ml-auto text-[11px] text-gray-500 whitespace-nowrap">
                              {formatFileSize(item.size)}
                            </span>
                          )}
                        </label>
                      ) : (
                        <input
                          type="text"
                          placeholder={t('request.value')}
                          value={item.value}
                          onChange={(event) => actions.handleMultipartChange(index, 'value', event.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-mono min-w-0"
                        />
                      )}
                      <button onClick={() => actions.handleRemoveMultipartRow(index)} className="p-2 text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                  <button onClick={actions.handleAddMultipartRow} className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"><Plus className="w-4 h-4" /> {t('request.addMultipartPart')}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
