const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const stage = path.join(root, 'release', 'atlas-stage')
fs.mkdirSync(stage, { recursive: true })
for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, name), path.join(stage, name))
fs.cpSync(path.join(root, 'out'), path.join(stage, 'out'), { recursive: true })
const copied = new Set()
function copyDependency(name, from = root) {
  let dir = from, source
  while (dir.startsWith(root)) {
    const candidate = path.join(dir, 'node_modules', name)
    if (fs.existsSync(path.join(candidate, 'package.json'))) { source = candidate; break }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  if (!source) throw new Error(`Missing production dependency ${name} from ${from}`)
  if (copied.has(source)) return
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'))
  copied.add(source)
  fs.cpSync(source, path.join(stage, path.relative(root, source)), { recursive: true })
  for (const dependency of Object.keys(manifest.dependencies || {})) copyDependency(dependency, source)
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
for (const name of Object.keys(pkg.dependencies)) copyDependency(name)
console.log(`Staged ${copied.size} production packages in ${stage}`)
