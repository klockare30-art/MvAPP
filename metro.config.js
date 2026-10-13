// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web ships a WebAssembly build of SQLite (used only for the browser preview).
config.resolver.assetExts.push('wasm');

module.exports = config;
