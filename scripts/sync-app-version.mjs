import fs from 'node:fs';

const packageJsonPath = 'package.json';
const neutralinoConfigPath = 'neutralino.config.json';
const launcherPath = 'cmd/launcher/main.go';

const readText = (path) => fs.readFileSync(path, 'utf8');
const writeText = (path, content) => fs.writeFileSync(path, content);

const packageJson = JSON.parse(readText(packageJsonPath));
const appVersion = String(packageJson.version || '').trim();

if (!appVersion) {
  throw new Error('package.json does not contain a valid version');
}

const syncNeutralinoConfig = () => {
  const config = JSON.parse(readText(neutralinoConfigPath));
  config.version = appVersion;
  writeText(neutralinoConfigPath, `${JSON.stringify(config, null, 2)}\n`);
};

const syncLauncher = () => {
  const source = readText(launcherPath);
  const appVersionPattern = /(appVersion\s*=\s*)"[^"]*"/;

  if (!appVersionPattern.test(source)) {
    throw new Error(`Could not update appVersion in ${launcherPath}`);
  }

  const updated = source.replace(appVersionPattern, `$1"${appVersion}"`);
  writeText(launcherPath, updated);
};

syncNeutralinoConfig();
syncLauncher();

console.log(`Synced APP_VERSION$$ placeholders to ${appVersion}`);
