import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Binary,
  FileUp,
  Trash2,
  Type
} from 'lucide-react';
import { NETWORK_PAYLOAD_MAX_BYTES } from '../../config/constants.js';
import {
  bytesToBase64,
  formatEditableHex,
  parseEditableHex
} from '../../domain/network.js';
import {
  readFileAsBase64
} from '../../utils/files.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

const BYTES_PER_ROW = 16;
const HEX_ROW_HEIGHT = 32;
const HEX_OVERSCAN_ROWS = 10;

export default function NetworkPayloadEditor({
  mode,
  textValue,
  hexValue,
  fileName,
  onModeChange,
  onTextChange,
  onHexChange,
  onFileImport,
  onClearPayload
}) {
  const { t } = useTranslation();
  const [highlightedByte, setHighlightedByte] = useState(null);
  const [byteDrafts, setByteDrafts] = useState({});
  const [newByteDraft, setNewByteDraft] = useState('');
  const [scrollViewport, setScrollViewport] = useState({ top: 0, height: 0 });
  const [rowHeight, setRowHeight] = useState(HEX_ROW_HEIGHT);
  const scrollRef = useRef(null);
  const byteInputRefs = useRef(new Map());
  const newByteInputRef = useRef(null);
  const parsedHex = useMemo(() => (
    mode === 'hex'
      ? parseEditableHex(hexValue)
      : { valid: true, tokens: [], tokenCount: 0, bytes: new Uint8Array() }
  ), [hexValue, mode]);
  const totalRows = parsedHex.valid
    ? Math.ceil(parsedHex.tokenCount / BYTES_PER_ROW)
    : 0;
  const effectiveRowHeight = Math.max(1, rowHeight || HEX_ROW_HEIGHT);
  const viewportStartRow = Math.max(
    0,
    Math.floor(scrollViewport.top / effectiveRowHeight) - HEX_OVERSCAN_ROWS
  );
  const viewportEndRow = Math.min(
    totalRows,
    Math.ceil((scrollViewport.top + scrollViewport.height) / effectiveRowHeight) + HEX_OVERSCAN_ROWS
  );
  const rawVisibleStartRow = scrollViewport.height > 0 ? viewportStartRow : 0;
  const rawVisibleEndRow = scrollViewport.height > 0
    ? viewportEndRow
    : Math.min(totalRows, 40);
  const visibleStartRow = Math.min(totalRows, rawVisibleStartRow);
  const visibleEndRow = Math.max(
    visibleStartRow,
    Math.min(totalRows, rawVisibleEndRow)
  );
  const topSpacerHeight = visibleStartRow * effectiveRowHeight;
  const bottomSpacerHeight = Math.max(0, totalRows - visibleEndRow) * effectiveRowHeight;
  const visibleRows = [];

  for (let rowIndex = visibleStartRow; rowIndex < visibleEndRow; rowIndex += 1) {
    const offset = rowIndex * BYTES_PER_ROW;
    visibleRows.push({
      offset,
      bytes: [...parsedHex.bytes.slice(offset, offset + BYTES_PER_ROW)]
    });
  }

  useEffect(() => {
    if (mode !== 'hex') return;
    setByteDrafts({});
  }, [hexValue, mode]);

  useEffect(() => {
    if (mode !== 'hex' || !parsedHex.valid) return undefined;
    const element = scrollRef.current;
    if (!element) return undefined;

    const updateViewport = () => {
      setScrollViewport({
        top: element.scrollTop,
        height: element.clientHeight
      });
    };

    updateViewport();
    element.addEventListener('scroll', updateViewport, { passive: true });

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateViewport);
    resizeObserver?.observe(element);

    return () => {
      element.removeEventListener('scroll', updateViewport);
      resizeObserver?.disconnect();
    };
  }, [mode, parsedHex.valid]);

  const commitBytes = (bytes) => {
    onHexChange(formatEditableHex(bytesToBase64(Uint8Array.from(bytes))));
  };

  const normalizeHexInput = (value) => (
    String(value || '')
      .replace(/[^0-9a-f]/gi, '')
      .slice(0, 2)
      .toLocaleLowerCase('en')
  );

  const parsePastedBytes = (value) => {
    const normalized = String(value || '').replace(/[^0-9a-f]/gi, '');
    if (normalized.length < 2) return [];
    const pairs = normalized.match(/.{1,2}/g) || [];
    return pairs
      .filter(pair => pair.length === 2)
      .map(pair => Number.parseInt(pair, 16));
  };

  const insertBytes = (index, bytes) => {
    if (!parsedHex.valid || bytes.length === 0) return;
    const nextBytes = [...parsedHex.bytes];
    nextBytes.splice(index, 0, ...bytes);
    commitBytes(nextBytes);
    setNewByteDraft('');
  };

  const focusNewByteInput = () => {
    requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) {
        element.scrollTop = element.scrollHeight;
        setScrollViewport({
          top: element.scrollTop,
          height: element.clientHeight
        });
      }

      requestAnimationFrame(() => newByteInputRef.current?.focus());
    });
  };

  const focusByte = (index) => {
    const element = scrollRef.current;
    if (element && index < parsedHex.tokenCount) {
      const rowIndex = Math.floor(index / BYTES_PER_ROW);
      const rowTop = rowIndex * effectiveRowHeight;
      const rowBottom = rowTop + effectiveRowHeight;
      if (rowTop < element.scrollTop || rowBottom > element.scrollTop + element.clientHeight) {
        element.scrollTop = Math.max(0, rowTop - effectiveRowHeight);
        setScrollViewport({
          top: element.scrollTop,
          height: element.clientHeight
        });
      }
    }

    requestAnimationFrame(() => {
      if (index < parsedHex.tokenCount) {
        const input = byteInputRefs.current.get(index);
        if (input) {
          input.focus();
          return;
        }
        requestAnimationFrame(() => byteInputRefs.current.get(index)?.focus());
        return;
      }
      focusNewByteInput();
    });
  };

  const replaceByte = (index, value) => {
    const nextDraft = normalizeHexInput(value);
    setByteDrafts(previous => ({ ...previous, [index]: nextDraft }));
    if (nextDraft.length !== 2 || !parsedHex.valid) return;

    const nextBytes = [...parsedHex.bytes];
    nextBytes[index] = Number.parseInt(nextDraft, 16);
    commitBytes(nextBytes);
    focusByte(index + 1);
  };

  const commitPartialByte = (index) => {
    const draft = byteDrafts[index];
    if (draft == null || !parsedHex.valid) return;
    if (!draft) {
      const nextBytes = [...parsedHex.bytes];
      nextBytes.splice(index, 1);
      commitBytes(nextBytes);
      return;
    }
    if (draft.length === 1) {
      const nextBytes = [...parsedHex.bytes];
      nextBytes[index] = Number.parseInt(draft.padStart(2, '0'), 16);
      commitBytes(nextBytes);
    }
  };

  const measureRow = (element) => {
    if (!element) return;
    const nextHeight = element.getBoundingClientRect().height;
    if (nextHeight <= 0) return;
    setRowHeight(current => (
      Math.abs(current - nextHeight) > 1 ? nextHeight : current
    ));
  };

  const handleBytePaste = (index, event) => {
    const pastedBytes = parsePastedBytes(event.clipboardData.getData('text'));
    if (pastedBytes.length === 0) return;
    event.preventDefault();
    if (!parsedHex.valid) return;
    const nextBytes = [...parsedHex.bytes];
    nextBytes.splice(index, pastedBytes.length, ...pastedBytes);
    commitBytes(nextBytes);
    focusByte(index + pastedBytes.length);
  };

  const handleNewByteChange = (value) => {
    const nextDraft = normalizeHexInput(value);
    setNewByteDraft(nextDraft);
    if (nextDraft.length === 2) {
      insertBytes(parsedHex.tokenCount, [Number.parseInt(nextDraft, 16)]);
      focusNewByteInput();
    }
  };

  const handleNewBytePaste = (event) => {
    const pastedBytes = parsePastedBytes(event.clipboardData.getData('text'));
    if (pastedBytes.length === 0) return;
    event.preventDefault();
    insertBytes(parsedHex.tokenCount, pastedBytes);
    focusNewByteInput();
  };

  const handleFileSelection = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      onFileImport(await readFileAsBase64(file, {
        maxBytes: NETWORK_PAYLOAD_MAX_BYTES
      }));
    } catch (error) {
      window.alert(error.message || t('request.fileReadFailed'));
    }
  };

  return (
    <div className="network-payload-editor">
      <div className="network-payload-toolbar">
        <div className="network-payload-mode-switch" role="group" aria-label={t('networkPayload.format')}>
          <button
            type="button"
            className={mode === 'text' ? 'network-payload-mode-active' : ''}
            onClick={() => onModeChange('text')}
          >
            <Type className="w-3.5 h-3.5" />
            Text
          </button>
          <button
            type="button"
            className={mode === 'hex' ? 'network-payload-mode-active' : ''}
            onClick={() => onModeChange('hex')}
          >
            <Binary className="w-3.5 h-3.5" />
            Hex
          </button>
        </div>

      </div>

      {mode === 'text' ? (
        <div className="network-payload-content">
          <textarea
            value={textValue}
            onChange={(event) => onTextChange(event.target.value)}
            className="network-payload-textarea custom-scrollbar"
            spellCheck="false"
            placeholder={t('networkPayload.placeholder')}
          />
          <div className="network-payload-hint">
            {t('networkPayload.textHint')}
          </div>
        </div>
      ) : (
        <div className="network-payload-content">
          <div className="network-payload-hex-workspace">
            <div className="network-payload-preview">
              <div className="network-payload-preview-title" aria-label={t('networkPayload.byteEditor')}>
                <span className={`network-payload-byte-count ${
                  parsedHex.valid ? '' : 'network-payload-byte-count-invalid'
                }`}>
                  {parsedHex.valid
                    ? `${parsedHex.tokenCount.toLocaleString()} ${parsedHex.tokenCount === 1 ? t('networkPayload.byte') : t('networkPayload.bytes')}`
                    : t('networkPayload.invalidSyntax')}
                </span>
                <div className="network-payload-preview-summary">
                  {fileName && (
                    <span className="network-payload-file-chip" title={fileName}>
                      {fileName}
                    </span>
                  )}
                  <div className="network-payload-action-group">
                    <label
                      className="network-payload-icon-button"
                      aria-label={t('networkPayload.importFile')}
                      title={t('networkPayload.importFile')}
                    >
                      <input
                        type="file"
                        className="hidden"
                        onChange={(event) => void handleFileSelection(event)}
                      />
                      <FileUp className="w-3.5 h-3.5" />
                    </label>
                    <button
                      type="button"
                      className="network-payload-icon-button network-payload-clear-button"
                      disabled={!hexValue}
                      onClick={onClearPayload}
                      aria-label={t('networkPayload.clearTitle')}
                      title={t('networkPayload.clearTitle')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {parsedHex.valid ? (
                <div className="network-payload-preview-scroll custom-scrollbar" ref={scrollRef}>
                  <div className="network-payload-preview-table">
                    <div className="network-payload-preview-header" aria-hidden="true">
                      <span>Offset</span>
                      <span>Hex</span>
                      <span>ASCII</span>
                    </div>

                    {topSpacerHeight > 0 && (
                      <div
                        aria-hidden="true"
                        className="network-payload-preview-spacer"
                        style={{ height: topSpacerHeight }}
                      />
                    )}

                    {visibleRows.map((row, rowIndex) => (
                      <div
                        className="network-payload-preview-row"
                        key={row.offset}
                        ref={rowIndex === 0 ? measureRow : undefined}
                      >
                        <span className="network-payload-preview-offset">
                          {row.offset.toString(16).padStart(8, '0')}
                        </span>

                        <span className="network-payload-preview-bytes">
                          {row.bytes.map((byte, index) => {
                            const byteIndex = row.offset + index;
                            const printable = byte >= 32 && byte <= 126;
                            const control = byte != null && !printable;
                            return (
                              <input
                                aria-label={t('networkPayload.byteInput', { offset: byteIndex })}
                                className={`network-payload-preview-byte ${
                                  byte == null ? 'network-payload-preview-empty' : ''
                                } ${
                                  printable
                                    ? 'network-payload-preview-byte-printable'
                                    : control
                                      ? byte === 0
                                        ? 'network-payload-preview-byte-null'
                                        : 'network-payload-preview-byte-control'
                                      : ''
                                } ${
                                  highlightedByte === byteIndex
                                    ? 'network-payload-preview-highlighted'
                                    : ''
                                } ${index === 8 ? 'network-payload-preview-group' : ''}`}
                                key={index}
                                ref={(element) => {
                                  if (element) {
                                    byteInputRefs.current.set(byteIndex, element);
                                  } else {
                                    byteInputRefs.current.delete(byteIndex);
                                  }
                                }}
                                inputMode="text"
                                maxLength={2}
                                spellCheck="false"
                                value={byteDrafts[byteIndex] ?? byte.toString(16).padStart(2, '0')}
                                onBlur={() => commitPartialByte(byteIndex)}
                                onChange={(event) => replaceByte(byteIndex, event.target.value)}
                                onFocus={(event) => {
                                  setHighlightedByte(byteIndex);
                                  event.target.select();
                                }}
                                onMouseEnter={() => byte != null && setHighlightedByte(byteIndex)}
                                onMouseLeave={() => setHighlightedByte(null)}
                                onPaste={(event) => handleBytePaste(byteIndex, event)}
                              />
                            );
                          })}
                          {row.offset + row.bytes.length === parsedHex.tokenCount && row.bytes.length < BYTES_PER_ROW && (
                            <input
                              aria-label={t('networkPayload.addByte')}
                              className={`network-payload-preview-byte network-payload-preview-byte-new ${
                                row.bytes.length === 8 ? 'network-payload-preview-group' : ''
                              }`}
                              ref={newByteInputRef}
                              inputMode="text"
                              maxLength={2}
                              spellCheck="false"
                              placeholder="00"
                              value={newByteDraft}
                              onBlur={() => {
                                if (newByteDraft.length === 1) {
                                  insertBytes(parsedHex.tokenCount, [Number.parseInt(newByteDraft.padStart(2, '0'), 16)]);
                                }
                              }}
                              onChange={(event) => handleNewByteChange(event.target.value)}
                              onFocus={(event) => event.target.select()}
                              onPaste={handleNewBytePaste}
                            />
                          )}
                        </span>

                        <span className="network-payload-preview-ascii">
                          {row.bytes.map((byte, index) => (
                            <span
                              className={`network-payload-preview-char ${
                                byte >= 32 && byte <= 126
                                  ? 'network-payload-preview-char-printable'
                                  : ''
                              } ${
                                highlightedByte === row.offset + index
                                  ? 'network-payload-preview-highlighted'
                                  : ''
                              }`}
                              key={index}
                              onMouseEnter={() => setHighlightedByte(row.offset + index)}
                              onMouseLeave={() => setHighlightedByte(null)}
                            >
                              {byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '·'}
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}

                    {visibleEndRow === totalRows
                      && parsedHex.tokenCount > 0
                      && parsedHex.tokenCount % BYTES_PER_ROW === 0 && (
                        <div className="network-payload-preview-row network-payload-preview-row-add">
                          <span className="network-payload-preview-offset">
                            {parsedHex.tokenCount.toString(16).padStart(8, '0')}
                          </span>
                          <span className="network-payload-preview-bytes">
                            <input
                              aria-label={t('networkPayload.addByte')}
                              className="network-payload-preview-byte network-payload-preview-byte-new"
                              ref={newByteInputRef}
                              inputMode="text"
                              maxLength={2}
                              spellCheck="false"
                              placeholder="00"
                              value={newByteDraft}
                              onBlur={() => {
                                if (newByteDraft.length === 1) {
                                  insertBytes(parsedHex.tokenCount, [Number.parseInt(newByteDraft.padStart(2, '0'), 16)]);
                                }
                              }}
                              onChange={(event) => handleNewByteChange(event.target.value)}
                              onFocus={(event) => event.target.select()}
                              onPaste={handleNewBytePaste}
                            />
                          </span>
                          <span className="network-payload-preview-ascii" />
                        </div>
                      )}

                    {bottomSpacerHeight > 0 && (
                      <div
                        aria-hidden="true"
                        className="network-payload-preview-spacer"
                        style={{ height: bottomSpacerHeight }}
                      />
                    )}

                    {totalRows === 0 && (
                      <div className="network-payload-preview-row network-payload-preview-row-empty" ref={measureRow}>
                        <span className="network-payload-preview-offset">00000000</span>
                        <span className="network-payload-preview-bytes">
                          <input
                            aria-label={t('networkPayload.addByte')}
                            className="network-payload-preview-byte network-payload-preview-byte-new"
                            ref={newByteInputRef}
                            inputMode="text"
                            maxLength={2}
                            spellCheck="false"
                            placeholder="00"
                            value={newByteDraft}
                            onBlur={() => {
                              if (newByteDraft.length === 1) {
                                insertBytes(0, [Number.parseInt(newByteDraft.padStart(2, '0'), 16)]);
                              }
                            }}
                            onChange={(event) => handleNewByteChange(event.target.value)}
                            onFocus={(event) => event.target.select()}
                            onPaste={handleNewBytePaste}
                          />
                        </span>
                        <span className="network-payload-preview-ascii" />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="network-payload-error">
                  {parsedHex.error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
