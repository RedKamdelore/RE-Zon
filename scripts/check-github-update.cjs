// Read-only release discovery using the application's real GitHub update provider.
// Never installs or reads the user's profile. Optional argument: simulated old version.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { NsisUpdater } = require('electron-updater')
const { NodeHttpExecutor } = require('builder-util/out/nodeHttpExecutor')
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor')
const root = path.resolve(__dirname, '..'), { version } = require('../package.json')
const from = process.argv[2] || '0.4.0-beta.1'
const data = fs.mkdtempSync(path.join(root, 'release', 'github-update-check-'))
const forbidden = () => { throw new Error('This check must not install or restart anything') }
const updater = new NsisUpdater(null, {
  version: from, name: 'rezon-update-check', isPackaged: true,
  appUpdateConfigPath: path.join(root, 'release', version, 'win-unpacked/resources/app-update.yml'),
  userDataPath: data, baseCachePath: data, whenReady: async () => {}, onQuit: () => {}, quit: forbidden, relaunch: forbidden,
})
const executor = new ElectronHttpExecutor()
executor.createRequest = NodeHttpExecutor.prototype.createRequest
executor.addRedirectHandlers = NodeHttpExecutor.prototype.addRedirectHandlers
updater.httpExecutor = executor
updater.logger = null
updater.autoDownload = false
updater.autoInstallOnAppQuit = false
updater.channel = 'beta'
updater.allowPrerelease = true
updater.allowDowngrade = false
updater.setFeedURL({ provider: 'github', owner: 'RedKamdelore', repo: 'RE-Zon', private: false })
updater.on('error', () => {})
let available = false
updater.on('update-available', () => { available = true })
const deadline = setTimeout(() => { console.error('GitHub update check timed out'); process.exit(1) }, 45_000)
updater.checkForUpdates().then(result => {
  assert.equal(result.updateInfo.version, version)
  assert.equal(available, from !== version)
  console.log(JSON.stringify({ from, found: result.updateInfo.version, updateAvailable: available, authenticated: false, installed: false }))
}).catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => clearTimeout(deadline))
