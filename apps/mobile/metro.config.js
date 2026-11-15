// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Our shared TypeScript packages (packages/domain) use ESM-style `./x.js` imports that point at `./x.ts`.
// Metro does not map these by itself, so retry relative `.js` imports without the extension.
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  if (moduleName.startsWith('.') && moduleName.endsWith('.js') && context.originModulePath.includes('/packages/')) {
    try {
      return resolve(context, moduleName.slice(0, -3), platform);
    } catch {
      /* fall through to the normal lookup */
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
