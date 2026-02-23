const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const appRoot = __dirname;
const workspaceRoot = path.resolve(appRoot, "../..");

const config = getDefaultConfig(appRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(workspaceRoot, "node_modules"),
  path.resolve(appRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  react: path.resolve(workspaceRoot, "node_modules/react"),
  "react-dom": path.resolve(workspaceRoot, "node_modules/react-dom"),
};

module.exports = config;
