import { Link2, Link2Off } from 'lucide-react';
import { isEditableHexValid } from '../../domain/network.js';
import { useTranslation } from '../../i18n/I18nProvider.jsx';

const READ_MODES = [
  { value: 'idle', labelKey: 'networkRead.idle' },
  { value: 'close', labelKey: 'networkRead.close' },
  { value: 'exact', labelKey: 'networkRead.exact' },
  { value: 'delimiter', labelKey: 'networkRead.delimiter' },
  { value: 'length-prefix', labelKey: 'networkRead.lengthPrefix' }
];

export default function NetworkReadOptions({
  protocol,
  readMode,
  exactBytes,
  delimiterHex,
  lengthPrefixBytes,
  lengthPrefixEndian,
  keepConnection,
  connected,
  onReadModeChange,
  onExactBytesChange,
  onDelimiterHexChange,
  onLengthPrefixBytesChange,
  onLengthPrefixEndianChange,
  onKeepConnectionChange
}) {
  const { t } = useTranslation();
  if (protocol !== 'tcp') return null;

  const delimiterValid = delimiterHex.trim() !== '' && isEditableHexValid(delimiterHex);

  return (
    <div className="network-read-options">
      <div className="network-read-options-main">
        <label>
          <span>{t('networkRead.responseRead')}</span>
          <select value={readMode} onChange={(event) => onReadModeChange(event.target.value)}>
            {READ_MODES.map(mode => (
              <option value={mode.value} key={mode.value}>{t(mode.labelKey)}</option>
            ))}
          </select>
        </label>

        {readMode === 'exact' && (
          <label className="network-read-compact">
            <span>{t('networkRead.byteCount')}</span>
            <input
              type="number"
              min="1"
              max={1024 * 1024}
              value={exactBytes}
              onChange={(event) => onExactBytesChange(event.target.value)}
            />
          </label>
        )}

        {readMode === 'delimiter' && (
          <label className="network-read-delimiter">
            <span>Delimiter Hex</span>
            <input
              type="text"
              value={delimiterHex}
              onChange={(event) => onDelimiterHexChange(event.target.value)}
              className={delimiterValid ? '' : 'network-read-input-invalid'}
              placeholder="0d 0a"
              spellCheck="false"
            />
          </label>
        )}

        {readMode === 'length-prefix' && (
          <>
            <label className="network-read-compact">
              <span>{t('networkRead.prefix')}</span>
              <select
                value={lengthPrefixBytes}
                onChange={(event) => onLengthPrefixBytesChange(event.target.value)}
              >
                <option value="1">{t('networkRead.oneByte')}</option>
                <option value="2">{t('networkRead.twoBytes')}</option>
                <option value="4">{t('networkRead.fourBytes')}</option>
                <option value="8">{t('networkRead.eightBytes')}</option>
              </select>
            </label>
            <label className="network-read-compact">
              <span>Endian</span>
              <select
                value={lengthPrefixEndian}
                disabled={Number(lengthPrefixBytes) === 1}
                onChange={(event) => onLengthPrefixEndianChange(event.target.value)}
              >
                <option value="big">Big-endian</option>
                <option value="little">Little-endian</option>
              </select>
            </label>
          </>
        )}
      </div>

      <label className={`network-session-toggle ${keepConnection ? 'network-session-toggle-active' : ''}`}>
        <input
          type="checkbox"
          checked={keepConnection}
          onChange={(event) => onKeepConnectionChange(event.target.checked)}
        />
        {keepConnection ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
        {t('networkRead.keepTcp')}
        {connected && <span className="network-session-live">{t('networkRead.connected')}</span>}
      </label>
    </div>
  );
}
