const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const appRoot = __dirname;
const workspaceRoot = path.resolve(appRoot, "../..");

const config = getDefaultConfig(appRoot);

const defaultWatchFolders = config.watchFolders ?? [];
config.watchFolders = Array.from(
  new Set([...defaultWatchFolders, workspaceRoot]),
);

const defaultNodeModulesPaths = config.resolver.nodeModulesPaths ?? [];
config.resolver.nodeModulesPaths = Array.from(
  new Set([
    ...defaultNodeModulesPaths,
    path.resolve(workspaceRoot, "node_modules"),
    path.resolve(appRoot, "node_modules"),
  ]),
);
module.exports = config;
