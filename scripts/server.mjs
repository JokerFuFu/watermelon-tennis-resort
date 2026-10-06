import http from 'node:http'
import {createReadStream,realpathSync} from 'node:fs'
import {stat,realpath,access} from 'node:fs/promises'
import {dirname,extname,resolve,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {isIP} from 'node:net'
import {spawn} from 'node:child_process'
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'}
const entries=new Set(['/','/web','/web/','/mobile','/mobile/','/play','/play/','/factors','/factors/'])
export function parseServerArgs(args){const options={port:5173,host:'127.0.0.1',open:false,help:false};for(let i=0;i<args.length;i++){const a=args[i];if(a==='--open')options.open=true;else if(a==='--help')options.help=true;else if(a==='--port'){const value=args[++i];if(!value||!/^\d+$/.test(value)||Number(value)<1||Number(value)>65535)throw Error('端口需为1至65535的整数');options.port=Number(value)}else if(a==='--host'){const value=args[++i];if(value!=='localhost'&&!isIP(value??''))throw Error('host需为IP地址或localhost');options.host=value}else throw Error(`未知参数：${a}`)}return options}
export function createStaticServer({root=resolve(projectRoot,'dist')}={}){
  const directory=resolve(root)
  return http.createServer(async(req,res)=>{
    const respond=(code,text)=>{res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:text)}
    if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');respond(405,'Method not allowed');return}
    let path;try{path=decodeURIComponent((req.url??'/').split('?')[0])}catch{respond(400,'Invalid path');return}
    if(!path.startsWith('/')||path.includes('\\')||path.includes('\0')){respond(400,'Invalid path');return}
    if(path.split('/').some(s=>s.startsWith('.'))){respond(403,'Forbidden');return}
    const relative=entries.has(path)?'index.html':path.slice(1)
    const candidate=resolve(directory,relative)
    if(!candidate.startsWith(directory+sep)){respond(403,'Forbidden');return}
    try{
      const file=await realpath(candidate),realRoot=await realpath(directory)
      if(!file.startsWith(realRoot+sep)){respond(403,'Forbidden');return}
      const info=await stat(file);if(!info.isFile()){respond(404,'Not found');return}
      const cache=relative==='index.html'?'no-store':/^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(relative)?'public, max-age=31536000, immutable':'no-cache'
      res.writeHead(200,{'Content-Type':mime[extname(file).toLowerCase()]??'application/octet-stream','Content-Length':info.size,'Cache-Control':cache,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'})
      if(req.method==='HEAD'){res.end();return}
      const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res)
    }catch{respond(404,'Not found')}
  })
}
function openBrowser(url){const command=process.platform==='darwin'?'open':process.platform==='win32'?'rundll32.exe':'xdg-open';const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];const child=spawn(command,args,{stdio:'ignore',detached:true});child.on('error',()=>console.log(`请手动打开：${url}`));child.unref()}
async function main(){
  if(Number(process.versions.node.split('.')[0])<22)throw Error('请先安装 Node.js 22 或更高版本。')
  const options=parseServerArgs(process.argv.slice(2));if(options.help){console.log('node scripts/server.mjs [--port 5173] [--host 127.0.0.1] [--open]\n先运行 npm ci 与 npm run build；默认仅本机可访问。');return}
  try{await access(resolve(projectRoot,'dist','index.html'))}catch{throw Error('未找到网页运行文件。源码版请先执行 npm ci 和 npm run build，运行包请完整解压。')}
  const server=createStaticServer();await new Promise((ok,fail)=>{server.once('error',fail);server.listen(options.port,options.host,ok)})
  const host=['0.0.0.0','::'].includes(options.host)?'127.0.0.1':options.host;const url=`http://${host.includes(':')?'['+host+']':host}:${options.port}/web`
  console.log(`西瓜网球度假酒店已启动：${url}\n保持此窗口运行，按 Ctrl+C 停止。方案与游戏存档保存在浏览器中。`)
  if(options.open)openBrowser(url)
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)))
}
let isMain=false
try{isMain=!!process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)}catch{}
if(isMain)main().catch(error=>{console.error(error?.code==='EADDRINUSE'?'端口已被占用。若原工作台已启动，请直接打开 http://127.0.0.1:5173/web；或用 --port 5180 启动独立服务。':error.message);process.exitCode=1})
