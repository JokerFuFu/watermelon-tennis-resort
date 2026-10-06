import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const label='local.courtside.studio'
const domain=`gui/${process.getuid()}`
const service=`${domain}/${label}`
const file=join(homedir(),'Library','LaunchAgents',`${label}.plist`)
const logs=join(root,'.courtside-server')
const action=process.argv[2]||'start'
function run(...args){return spawnSync('/bin/launchctl',args,{encoding:'utf8'})}
function xml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
function loaded(){return run('print',service).status===0}
async function healthy(){try{const response=await fetch('http://127.0.0.1:5173/',{signal:AbortSignal.timeout(1500)});return response.ok&&(await response.text()).includes('西瓜网球')}catch{return false}}
async function waitHealthy(){const deadline=Date.now()+18000;while(Date.now()<deadline){if(await healthy())return;await new Promise(r=>setTimeout(r,350))}throw Error(`服务暂未就绪。请查看 ${join(logs,'error.log')}`)}
async function start(){
  if(process.platform!=='darwin')throw Error('后台启动器当前用于 Mac；其他系统可使用 npm run dev。')
  const vite=join(root,'node_modules','vite','bin','vite.js')
  if(!existsSync(vite))throw Error('依赖尚未安装，请先运行 npm install。')
  if(await healthy()){
    if(!loaded())throw Error('5173端口已有临时工作台服务。请先停止原服务，再用此启动器开启后台服务。')
    console.log('酒店与游戏服务已在后台运行：http://127.0.0.1:5173');return
  }
  mkdirSync(dirname(file),{recursive:true});mkdirSync(logs,{recursive:true})
  const stableNode=['/opt/homebrew/bin/node','/usr/local/bin/node'].find(p=>existsSync(p))||process.execPath
  const content=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(stableNode)}</string><string>${xml(vite)}</string><string>--host</string><string>127.0.0.1</string><string>--port</string><string>5173</string><string>--strictPort</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>3</integer>
<key>StandardOutPath</key><string>${xml(join(logs,'output.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(logs,'error.log'))}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
</dict></plist>
`
  const changed=!existsSync(file)||readFileSync(file,'utf8')!==content
  if(changed){if(loaded())run('bootout',service);writeFileSync(file,content,{mode:0o644})}
  run('enable',service)
  if(!loaded()){const result=run('bootstrap',domain,file);if(result.status!==0)throw Error(`后台服务未能启动：${result.stderr.trim()}`)}
  const result=run('kickstart',service);if(result.status!==0)throw Error(`后台服务未能唤起：${result.stderr.trim()}`)
  await waitHealthy();console.log('酒店与游戏服务已在后台运行：http://127.0.0.1:5173')
}
try{
  if(action==='start')await start()
  else if(action==='stop'){if(loaded()){const result=run('bootout',service);if(result.status!==0)throw Error(result.stderr.trim())}run('disable',service);console.log('本机服务已停止；再次启动会恢复。')}
  else if(action==='status'){console.log(await healthy()?'服务正常：http://127.0.0.1:5173':'服务未响应');const result=run('print',service);if(result.status===0)console.log(result.stdout.split('\n').filter(line=>/state =|pid =|runs =|last exit code/.test(line)).join('\n'))}
  else throw Error('用法：node scripts/local-service.mjs start | stop | status')
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1}
