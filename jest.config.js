/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  roots: ["<rootDir>"],
  testEnvironment: "node",
  transform: {
    "^.+.tsx?$": ["ts-jest", {}],
  },
};
