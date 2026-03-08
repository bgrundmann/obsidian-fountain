import * as path from "path";

const cacheDir = path.resolve(".obsidian-cache");

export const config: WebdriverIO.Config = {
    runner: 'local',
    framework: 'mocha',
    specs: ['./test/e2e/specs/**/*.e2e.ts'],
    maxInstances: 1,
    capabilities: [{
        browserName: 'obsidian',
        'wdio:obsidianOptions': {
            appVersion: 'latest',
            installerVersion: 'latest',
            plugins: ["."],
            vault: "test/e2e/vaults/basic",
        },
    }],
    services: ["obsidian"],
    reporters: ['obsidian'],
    mochaOpts: { ui: 'bdd', timeout: 60_000 },
    waitforTimeout: 5_000,
    logLevel: "warn",
    cacheDir,
};
