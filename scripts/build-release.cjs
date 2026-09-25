const { execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const root = path.resolve(__dirname, '..')
const { version } = require('../package.json')
if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version)) throw new Error('Release version must be x.y.z or x.y.z-beta.N')
const run = (file, args = []) => execFileSync(process.execPath, [path.join(root, file), ...args], { cwd: root, stdio: 'inherit' })
run('scripts/build-icon.cjs')
run('node_modules/electron-vite/bin/electron-vite.js', ['build'])
run('scripts/stage-atlas.cjs')
run('node_modules/electron-builder/out/cli/cli.js', [
  ...(process.argv.includes('--dir') ? ['--dir'] : ['--win', 'nsis']), '--x64', '--publish', 'never',
  '--config.directories.app=release/atlas-stage', `--config.directories.output=release/${version}`,
  '--config.electronDist=node_modules/electron/dist',
])
if (!process.argv.includes('--dir')) {
  // GitHub uses release/prerelease visibility and emits latest.yml by default.
  // Supply an explicit beta alias as well for the app's beta channel.
  if (version.includes('-beta.')) fs.copyFileSync(path.join(root, 'release', version, 'latest.yml'), path.join(root, 'release', version, 'beta.yml'))
  run('scripts/verify-release.cjs')
}
