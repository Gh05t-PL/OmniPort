import { useEffect, useMemo, useRef, useState } from 'react';
import { base64ToBytes } from '../../domain/network.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

const BYTES_PER_ROW = 16;
const HEX_ROW_HEIGHT = 32;
const HEX_OVERSCAN_ROWS = 10;

export function NetworkHexView({ response }) {
  const { t } = useTranslation();
  const [highlightedByte, setHighlightedByte] = useState(null);
  const [scrollViewport, setScrollViewport] = useState({ top: 0, height: 0 });
  const [rowHeight, setRowHeight] = useState(HEX_ROW_HEIGHT);
  const scrollRef = useRef(null);
  const bytes = useMemo(
    () => base64ToBytes(response?.networkDataBase64),
    [response?.networkDataBase64]
  );
  const totalRows = Math.ceil(bytes.length / BYTES_PER_ROW);
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
  const rows = [];

  for (let rowIndex = visibleStartRow; rowIndex < visibleEndRow; rowIndex += 1) {
    const offset = rowIndex * BYTES_PER_ROW;
    rows.push({
      offset,
      bytes: [...bytes.slice(offset, offset + BYTES_PER_ROW)]
    });
  }

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      setScrollViewport({ top: 0, height: 0 });
      return;
    }
    setScrollViewport({
      top: element.scrollTop,
      height: element.clientHeight
    });
  }, [bytes.length]);

  const measureRow = (element) => {
    if (!element) return;
    const nextHeight = element.getBoundingClientRect().height;
    if (nextHeight <= 0) return;
    setRowHeight(current => (
      Math.abs(current - nextHeight) > 1 ? nextHeight : current
    ));
  };

  if (bytes.length === 0) {
    return (
      <div className="network-hex-empty">
        {t('response.noData')}
      </div>
    );
  }

  return (
    <div className="network-hex-shell">
      <div className="network-hex-summary">
        <span>{t('response.hexDump')}</span>
        <span className="network-hex-byte-count">
          {bytes.length.toLocaleString()} {bytes.length === 1 ? t('response.byte') : t('response.bytes')}
        </span>
      </div>

      <div className="network-hex-scroll custom-scrollbar" ref={scrollRef}>
        <div className="network-hex-table">
          <div className="network-hex-header" aria-hidden="true">
            <span>Offset</span>
            <span>Hexadecimal</span>
            <span>ASCII</span>
          </div>

          {topSpacerHeight > 0 && (
            <div
              aria-hidden="true"
              className="network-hex-spacer"
              style={{ height: topSpacerHeight }}
            />
          )}

          {rows.map((row, rowIndex) => (
            <div
              className="network-hex-row"
              key={row.offset}
              ref={rowIndex === 0 ? measureRow : undefined}
            >
              <span className="network-hex-offset">
                {row.offset.toString(16).padStart(8, '0')}
              </span>

              <span className="network-hex-bytes">
                {Array.from({ length: 16 }, (_, index) => {
                  const byte = row.bytes[index];
                  const printable = byte >= 32 && byte <= 126;
                  const control = byte != null && !printable;
                  const byteIndex = row.offset + index;
                  const highlighted = byte != null && highlightedByte === byteIndex;

                  return (
                    <span
                      className={`network-hex-byte ${
                        byte == null
                          ? 'network-hex-byte-empty'
                          : printable
                            ? 'network-hex-byte-printable'
                            : control
                              ? byte === 0
                                ? 'network-hex-byte-null'
                                : 'network-hex-byte-control'
                              : ''
                      } ${index === 8 ? 'network-hex-byte-group' : ''} ${
                        highlighted ? 'network-hex-byte-highlighted' : ''
                      }`}
                      key={index}
                      onBlur={() => setHighlightedByte(null)}
                      onFocus={() => byte != null && setHighlightedByte(byteIndex)}
                      onMouseEnter={() => byte != null && setHighlightedByte(byteIndex)}
                      onMouseLeave={() => setHighlightedByte(null)}
                      tabIndex={byte == null ? undefined : 0}
                    >
                      {byte == null ? '\u00a0\u00a0' : byte.toString(16).padStart(2, '0')}
                    </span>
                  );
                })}
              </span>

              <span className="network-hex-ascii">
                {row.bytes.map((byte, index) => (
                  <span
                    className={`network-hex-ascii-char ${
                      byte >= 32 && byte <= 126 ? 'network-hex-ascii-printable' : ''
                    } ${
                      highlightedByte === row.offset + index
                        ? 'network-hex-ascii-highlighted'
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

          {bottomSpacerHeight > 0 && (
            <div
              aria-hidden="true"
              className="network-hex-spacer"
              style={{ height: bottomSpacerHeight }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
