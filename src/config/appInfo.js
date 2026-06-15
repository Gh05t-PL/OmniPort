import packageInfo from '../../package.json';

export const APP_NAME = 'OmniPort';
export const APP_VERSION = String(packageInfo.version || 'dev');
export const APP_REPOSITORY_URL = 'https://github.com/Gh05t-PL/OmniPort';
export const SUPPORTED_PROTOCOLS = ['HTTP', 'gRPC', 'WebSocket', 'TCP', 'UDP'];

export const getRuntimeInfo = () => ({
  operatingSystem: window.NL_OS || navigator.platform || 'Nieznany',
  architecture: window.NL_ARCH || 'Nieznana',
  neutralinoVersion: window.NL_VERSION || 'Tryb przeglądarkowy',
  clientVersion: window.NL_CVERSION || 'Brak danych'
});
