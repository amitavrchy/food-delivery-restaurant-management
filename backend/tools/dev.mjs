import {spawn,spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const backend=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const npm=process.env.npm_execpath;
if(!npm)throw new Error('Run npm run dev:all from backend.');
const children=[backend,resolve(backend,'../frontend')].map(cwd=>spawn(process.execPath,[npm,'run','dev'],{cwd,stdio:'inherit',windowsHide:true,detached:process.platform!=='win32'}));
let closing=false;
function stop(code=0){if(closing)return;closing=true;for(const child of children){if(!child.pid)continue;try{if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});else process.kill(-child.pid,'SIGTERM');}catch{}}process.exit(code);}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
children.forEach(child=>child.on('exit',code=>stop(code||0)));
