// Exercises the real updater with the built installer, using a loopback-only fixture.
// Does not install, publish, or access the user's application data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const {NsisUpdater}=require('electron-updater')
const {NodeHttpExecutor}=require('builder-util/out/nodeHttpExecutor')
const {ElectronHttpExecutor}=require('electron-updater/out/electronHttpExecutor')
const yaml=require('js-yaml')
const root=path.resolve(__dirname,'..'),{version}=require('../package.json')
const folder=path.join(root,'release',version),installer=`ReZon-Setup-${version}-x64.exe`
const metadata=yaml.load(fs.readFileSync(path.join(folder,version.includes('-')?'beta.yml':'latest.yml'),'utf8'))
const testDir=fs.mkdtempSync(path.join(root,'release','update-smoke-'))
const requests=[]
const server=http.createServer((req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;requests.push(route)
  if(route.endsWith('/beta.yml')||route.endsWith('/latest.yml')){
    const info=JSON.parse(JSON.stringify(metadata))
    if(route.startsWith('/bad/')){info.files[0].sha512=Buffer.alloc(64).toString('base64');info.sha512=info.files[0].sha512}
    res.setHeader('Content-Type','text/yaml');res.end(yaml.dump(info));return
  }
  if(route.endsWith('/'+installer)){
    res.setHeader('Content-Length',fs.statSync(path.join(folder,installer)).size)
    fs.createReadStream(path.join(folder,installer)).pipe(res);return
  }
  res.writeHead(404).end()
})
async function exercise(kind,baseUrl){
  const data=path.join(testDir,kind);fs.mkdirSync(data,{recursive:true})
  const updater=new NsisUpdater(null,{version:'0.3.0',name:'rezon-smoke',isPackaged:true,
    appUpdateConfigPath:path.join(folder,'win-unpacked/resources/app-update.yml'),userDataPath:data,baseCachePath:data,
    whenReady:async()=>{},onQuit:()=>{},quit:()=>{throw new Error('Installation must not run in this test')},relaunch:()=>{throw new Error('Unexpected relaunch')}})
  const executor=new ElectronHttpExecutor()
  // Use Node's loopback transport while retaining the updater's download/hash pipeline.
  executor.createRequest=NodeHttpExecutor.prototype.createRequest
  executor.addRedirectHandlers=NodeHttpExecutor.prototype.addRedirectHandlers
  updater.httpExecutor=executor;updater.logger=null
  updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.disableDifferentialDownload=true;updater.disableWebInstaller=true
  updater.channel=version.includes('-')?'beta':'latest';updater.allowPrerelease=version.includes('-');updater.allowDowngrade=false
  updater.setFeedURL({provider:'generic',url:baseUrl+kind+'/'})
  const events=[];updater.on('update-downloaded',()=>events.push('downloaded'));updater.on('error',()=>{})
  const info=await updater.checkForUpdates();assert.equal(info.updateInfo.version,version)
  if(kind==='bad'){
    await assert.rejects(updater.downloadUpdate(),/checksum/i)
    assert.equal(events.length,0)
    console.log('PASS: corrupted checksum rejected; installer not marked ready')
  }else{
    const files=await updater.downloadUpdate();assert.equal(events[0],'downloaded')
    assert.equal(crypto.createHash('sha512').update(fs.readFileSync(files[0])).digest('base64'),metadata.files[0].sha512)
    console.log('PASS: actual installer discovered, downloaded and verified by electron-updater')
  }
}
server.listen(0,'127.0.0.1',async()=>{
  try{const base=`http://127.0.0.1:${server.address().port}/`;await exercise('good',base);await exercise('bad',base);console.log('No installation performed. Local requests:',requests.length)}
  catch(e){console.error(e);process.exitCode=1}
  finally{server.closeAllConnections();server.close()}
})
