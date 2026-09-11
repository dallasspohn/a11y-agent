const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index.js');

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-extensions',
        '--disable-gpu',
        '--disable-workspace-trust',
        path.resolve(extensionDevelopmentPath, '../samples'),
      ],
    });
  } catch (error) {
    console.error('Integration tests failed:', error);
    process.exit(1);
  }
}

main();
