// Bundles the extension.
//
// This exists instead of a plain `esbuild` CLI line because of one resolution
// quirk. src/extension.js requires ../../src/lib/lint-html.js — the linter
// lives in the parent repo and is shared with the CLI, deliberately, so the
// editor and the terminal can never disagree about what a violation is.
//
// esbuild resolves a bare import from the directory of the file that wrote it.
// lint-html.js sits at the repo root, so `import 'node-html-parser'` is looked
// up in <repo>/node_modules and never in vscode-extension/node_modules — even
// though this package declares node-html-parser itself. The build then only
// works on a machine that happens to have the root dependencies installed, and
// fails in CI, which installs this package alone.
//
// nodePaths adds our own node_modules as a fallback, so the copy we declare is
// the copy we ship, and `npm install && npm run build` in this directory is
// enough. Root deps (Playwright, Vosk) stay out of the extension's CI job.

const esbuild = require('esbuild');

const options = {
  entryPoints: ['src/extension.js'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'], // provided by the editor at runtime, never bundled
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  nodePaths: ['node_modules'],
  sourcemap: process.argv.includes('--sourcemap'),
  minify: process.argv.includes('--minify'),
};

async function main() {
  if (process.argv.includes('--watch')) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('watching for changes...');
    return;
  }

  await esbuild.build(options);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
