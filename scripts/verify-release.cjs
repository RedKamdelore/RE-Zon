const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const asar = require('@electron/asar'), yaml = require('js-yaml')
const root = path.resolve(__dirname, '..')
const { version } = require('../package.json')
const folder = path.join(root, 'release', version)
const exeName = `ReZon-Setup-${version}-x64.exe`
const exe = fs.readFileSync(path.join(folder, exeName))
if (exe.subarray(0, 2).toString() !== 'MZ') throw new Error('Invalid Windows executable')
const channel = version.includes('-beta.') ? 'beta' : 'latest'
const metadata = yaml.load(fs.readFileSync(path.join(folder, `${channel}.yml`), 'utf8'))
if (metadata.version !== version) throw new Error('Metadata version mismatch')
const entry = metadata.files.find(f => f.url === exeName)
if (!entry || entry.sha512 !== crypto.createHash('sha512').update(exe).digest('base64') || entry.size !== exe.length) throw new Error('Update metadata checksum mismatch')
const archive = path.join(folder, 'win-unpacked', 'resources', 'app.asar')
const files = new Set(asar.listPackage(archive).map(f => f.replaceAll('\\', '/')))
const privateName = /(?:^|\/)(?:player-data\.json|updates-settings\.json|\.env(?:\.[^/]*)?|[^/]+\.(?:pem|pfx|p12|key))$/i
const privateEntries = [...files].filter(file => privateName.test(file))
if (privateEntries.length) throw new Error(`Private or credential-like files found in app.asar: ${privateEntries.join(', ')}`)
const resourceNames = fs.readdirSync(path.join(folder, 'win-unpacked', 'resources'))
const allowedResources = new Set(['app.asar', 'app-update.yml', 'default_app.asar', 'demo', 'elevate.exe', 'icon.png', 'updates.json'])
const unexpectedResources = resourceNames.filter(name => !allowedResources.has(name))
if (unexpectedResources.length) throw new Error(`Unexpected packaged resources: ${unexpectedResources.join(', ')}`)
const readJson = file => JSON.parse(asar.extractFile(archive, file.split('/').join(path.sep)).toString())
const seen = new Set()
function verifyPackage(folder) {
  if (seen.has(folder)) return
  seen.add(folder)
  const pkg = readJson(folder ? folder+'/package.json' : 'package.json')
  for (const dependency of Object.keys(pkg.dependencies || {})) {
    let dir = folder, found
    while (true) {
      const candidate = (dir ? dir+'/' : '')+'node_modules/'+dependency
      if (files.has('/'+candidate+'/package.json')) { found = candidate; break }
      if (!dir) break
      dir = path.posix.dirname(dir)
      if (dir === '.') dir = ''
    }
    if (!found) throw new Error(`Missing packaged dependency ${dependency} in ${folder}`)
    verifyPackage(found)
  }
}
verifyPackage('')
const feed = JSON.parse(fs.readFileSync(path.join(folder, 'win-unpacked/resources/updates.json'), 'utf8'))
if (feed.feedUrl !== 'https://github.com/RedKamdelore/RE-Zon/') throw new Error('Wrong update source')
if (!fs.existsSync(path.join(folder, 'win-unpacked/resources/app-update.yml'))) throw new Error('Missing updater configuration')
const sums = [...new Set([exeName,exeName+'.blockmap',channel+'.yml','latest.yml'])].map(name => crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,name))).digest('hex')+'  '+name).join('\n')+'\n'
fs.writeFileSync(path.join(folder, 'SHA256SUMS.txt'), sums)
console.log(`Verified installer ${(exe.length/1024/1024).toFixed(1)} MiB, ${channel} metadata, SHA-512, ${seen.size-1} runtime packages and packaged file names`)
