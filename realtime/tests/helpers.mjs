import {once} from 'node:events';
import WebSocket from 'ws';
import {OnlineWorld} from '../../server/arena-engine.mjs';
import {signTicket} from '../../server/join-ticket.mjs';
import {RoomHub} from '../rooms.mjs';
import {createRealtimeServer} from '../server.mjs';
export const secret='test-only-secret-never-used-in-production-0123456789';
export const origin='https://game.test';
export function quietWorld(map=0){const g=new OnlineWorld(map,42);g.npcs=[];g.monsters=[];g.chests=[];g.obstacles=[];g.pickups=[];g.itemDrops=[];g.projectiles=[];g.hazards=[];g.camp=null;g.respawns=[];g.npcTimer=g.chestTimer=g.lootTimer=Infinity;return g;}
export function peer(){return{packets:[],bufferedAmount:0,send(p){this.packets.push(p);return true;},close(){}};}
export function mailbox(ws){const messages=[],waiters=[];ws.on('message',raw=>{const value=JSON.parse(raw);const index=waiters.findIndex(w=>w.match(value));if(index<0)messages.push(value);else{const w=waiters.splice(index,1)[0];clearTimeout(w.timer);w.resolve(value);}});return(match,timeout=2500)=>{const index=messages.findIndex(match);if(index>=0)return Promise.resolve(messages.splice(index,1)[0]);return new Promise((resolve,reject)=>{const w={match,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('WebSocket message timeout'));},timeout)};waiters.push(w);});};}
export async function startServer(t,{autoTick=false,hub=new RoomHub({createWorld:quietWorld})}={}){const app=createRealtimeServer({secret,origins:[origin],hub,autoTick});app.http.listen(0,'127.0.0.1');await once(app.http,'listening');const port=app.http.address().port;app.url=`ws://127.0.0.1:${port}/arena`;app.health=`http://127.0.0.1:${port}/healthz`;t.after(()=>app.close());return app;}
export async function connect(t,app,{name='An',skin=0,map=0,ticket,resumeToken}={}){const ws=new WebSocket(app.url,{origin});ws.on('error',()=>{});const next=mailbox(ws);t.after(()=>ws.terminate());await once(ws,'open');ws.send(JSON.stringify({type:'hello',...(resumeToken?{resumeToken}:{ticket:ticket||await signTicket(secret,{name,skin,map,origin})})}));return{ws,next};}
export async function until(fn,timeout=2500){const end=performance.now()+timeout;while(!fn()){if(performance.now()>end)throw new Error('Condition timeout');await new Promise(r=>setTimeout(r,10));}}
