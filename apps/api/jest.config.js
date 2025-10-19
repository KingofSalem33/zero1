/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/?(*.)+(spec|test).ts"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "src/ai/tools/security.test.ts",
    "src/utils/contextTrimmer.test.ts",
  ],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        diagnostics: {
          ignoreCodes: [151002],
        },
      },
    ],
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/main.ts",
    "!src/main.refactored.ts",
    "!src/index.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  moduleFileExtensions: ["ts", "js", "json"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
