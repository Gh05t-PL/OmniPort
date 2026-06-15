const toTimingNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
};

export const clampTiming = (value, min, max) => Math.min(Math.max(value, min), max);

const createTraceSegment = ({ label, startMs, durationMs, color, hint }) => ({
  label,
  startMs: Math.max(0, Math.round(startMs)),
  durationMs: Math.max(0, Math.round(durationMs)),
  color,
  hint
});

export const buildTraceWaterfall = (timings) => {
  if (!timings) return { totalMs: 0, segments: [], mode: 'none' };

  if (typeof timings.dialMs === 'number') {
    const dialMs = toTimingNumber(timings.dialMs);
    const invokeMs = toTimingNumber(timings.invokeMs);
    const totalMs = Math.max(toTimingNumber(timings.totalMs), dialMs + invokeMs, 1);
    const overheadMs = Math.max(0, totalMs - dialMs - invokeMs);
    const segments = [
      createTraceSegment({
        label: 'Dial',
        startMs: 0,
        durationMs: dialMs,
        color: '#22d3ee',
        hint: 'Nawiązanie połączenia gRPC'
      }),
      createTraceSegment({
        label: 'Invoke',
        startMs: dialMs,
        durationMs: invokeMs,
        color: '#a78bfa',
        hint: 'Wywołanie metody gRPC'
      })
    ];

    if (overheadMs > 0) {
      segments.push(createTraceSegment({
        label: 'Overhead',
        startMs: dialMs + invokeMs,
        durationMs: overheadMs,
        color: '#64748b',
        hint: 'Pozostały czas transportu i obsługi'
      }));
    }

    return { totalMs, segments, mode: 'grpc' };
  }

  const dnsMs = toTimingNumber(timings.dnsMs);
  const connectMs = toTimingNumber(timings.connectMs);
  const tlsHandshakeMs = toTimingNumber(timings.tlsHandshakeMs);
  const gotConnectionMs = toTimingNumber(timings.gotConnectionMs);
  const timeToFirstByteMs = toTimingNumber(timings.timeToFirstByteMs);
  const bodyReadMs = toTimingNumber(timings.bodyReadMs);
  const preConnectionMs = dnsMs + connectMs + tlsHandshakeMs;
  const connectionReadyMs = gotConnectionMs || preConnectionMs;
  const firstByteMs = timeToFirstByteMs || connectionReadyMs;
  const totalMs = Math.max(
    toTimingNumber(timings.totalMs),
    connectionReadyMs,
    firstByteMs + bodyReadMs,
    preConnectionMs,
    1
  );
  const networkStartMs = clampTiming(connectionReadyMs - preConnectionMs, 0, totalMs);
  const bodyStartMs = clampTiming(
    timeToFirstByteMs || Math.max(totalMs - bodyReadMs, connectionReadyMs),
    0,
    totalMs
  );
  const waitMs = Math.max(0, bodyStartMs - connectionReadyMs);

  return {
    totalMs,
    mode: 'http',
    segments: [
      createTraceSegment({
        label: 'DNS',
        startMs: networkStartMs,
        durationMs: dnsMs,
        color: '#38bdf8',
        hint: 'Rozwiązanie nazwy hosta'
      }),
      createTraceSegment({
        label: 'Connect',
        startMs: networkStartMs + dnsMs,
        durationMs: connectMs,
        color: '#34d399',
        hint: 'Połączenie TCP'
      }),
      createTraceSegment({
        label: 'TLS',
        startMs: networkStartMs + dnsMs + connectMs,
        durationMs: tlsHandshakeMs,
        color: '#f59e0b',
        hint: 'Negocjacja TLS'
      }),
      createTraceSegment({
        label: 'TTFB',
        startMs: connectionReadyMs,
        durationMs: waitMs,
        color: '#818cf8',
        hint: 'Czas od gotowego połączenia do pierwszego bajtu'
      }),
      createTraceSegment({
        label: 'Body',
        startMs: bodyStartMs,
        durationMs: bodyReadMs,
        color: '#f472b6',
        hint: 'Odczyt response body'
      })
    ]
  };
};

export const formatMs = (value) => `${Math.round(toTimingNumber(value))} ms`;

export const formatTraceRows = (timings, httpVersion) => {
  if (!timings) return [];
  const rows = [['Total', `${timings.totalMs} ms`]];
  if (typeof timings.dialMs === 'number') {
    rows.push(['HTTP version', httpVersion || 'HTTP/2']);
    rows.push(['Dial', `${timings.dialMs} ms`]);
    rows.push(['Invoke', `${timings.invokeMs} ms`]);
    return rows;
  }

  rows.push(
    ['HTTP version', httpVersion || 'HTTP'],
    ['DNS', `${timings.dnsMs} ms`],
    ['Connect', `${timings.connectMs} ms`],
    ['TLS handshake', `${timings.tlsHandshakeMs} ms`],
    ['Got connection', `${timings.gotConnectionMs} ms`],
    ['Time to first byte', `${timings.timeToFirstByteMs} ms`],
    ['Body read', `${timings.bodyReadMs} ms`],
    ['Reused connection', timings.reusedConnection ? 'tak' : 'nie'],
    ['Forced new connection', timings.disableReuse ? 'tak' : 'nie'],
    ['Connection was idle', timings.connectionWasIdle ? 'tak' : 'nie'],
    ['Connection idle time', `${timings.connectionIdleTimeMs} ms`]
  );
  return rows;
};
