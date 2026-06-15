export const quoteShellArg = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

const formatDate = (createdAt, fractionalSecondDigits) => {
  if (!createdAt) return 'brak daty';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'brak daty';
  return new Intl.DateTimeFormat('pl-PL', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...(fractionalSecondDigits ? { fractionalSecondDigits } : {})
  }).format(date);
};

export const formatHistoryDate = (createdAt) => formatDate(createdAt);

export const formatMessageDate = (createdAt) => formatDate(createdAt, 3);

export const getStatusColor = (status) => {
  if (status === 'gRPC' || status === 'CMD') return 'text-indigo-400';
  if (status === 'OK') return 'text-green-500';
  if (status === 'OPEN' || status === 'SENT') return 'text-emerald-400';
  if (status === 'CLOSED') return 'text-gray-400';
  if (status === 'ERR') return 'text-red-500';
  if (status >= 200 && status < 300) return 'text-green-500';
  if (status >= 300 && status < 400) return 'text-yellow-500';
  if (status >= 400) return 'text-red-500';
  return 'text-gray-500';
};

export const getMethodColor = (method) => {
  switch (method) {
    case 'GET': return 'text-blue-400';
    case 'POST': return 'text-green-400';
    case 'PUT':
    case 'PATCH': return 'text-yellow-400';
    case 'DELETE': return 'text-red-400';
    case 'gRPC': return 'text-indigo-400';
    case 'WS': return 'text-emerald-400';
    case 'TCP': return 'text-cyan-400';
    case 'UDP': return 'text-violet-400';
    default: return 'text-gray-400';
  }
};
