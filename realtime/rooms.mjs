import {OnlineWorld,carryHuman,decode} from '../server/arena-engine.mjs';
import {cleanInput,cleanName} from '../server/arena-input.mjs';
import {CHARACTERS} from '../public/game/world.js';
import {SnapshotEncoder} from '../public/game/snapshot-codec.js';
import {randomBytes,createHash} from 'node:crypto';
export const CAPACITY=8,RECONNECT_MS=15000;
const digest=s=>createHash('sha256').update(s).digest('hex');
export class RoomHub{
 constructor({now=Date.now,createWorld=map=>new OnlineWorld(map)}={}){this.now=now;this.createWorld=createWorld;this.rooms=new Map();this.sessions=new Map();this.resumeKeys=new Map();this.revision=0;this.lastTick=now();this.lastBroadcast=0;}
 room(map){let r=this.rooms.get(map);if(!r){r={world:this.createWorld(map),emptyAt:null};this.rooms.set(map,r);}return r;}
 count(map){return[...this.sessions.values()].filter(s=>s.map===map).length;}
 population(){const maps=[];let total=0;for(let map=0;map<5;map++){const count=[...this.sessions.values()].filter(s=>s.map===map&&s.peer).length;if(count){maps.push({map,count});total+=count;}}return{total,maps};}
 join(claims,peer){
  const name=cleanName(claims.name),map=claims.map,skin=claims.skin;if(!name||!Number.isInteger(map)||map<0||map>4||!Number.isInteger(skin)||skin<0||skin>=CHARACTERS.length)throw new Error('Tên, map hoặc nhân vật không hợp lệ.');
  if(this.count(map)>=CAPACITY)throw new Error('Map này đã đủ 8 người. Hãy chọn map khác.');
  const now=this.now(),s={id:'human-'+crypto.randomUUID(),name,skin,map,seq:0,last_seen:now,input:JSON.stringify({x:0,y:0,actions:[],receivedAt:now}),peer,encoder:new SnapshotEncoder(),since:0,epoch:crypto.randomUUID(),forceFull:true};
  this.sessions.set(s.id,s);this.room(map).world.addHuman(s);return{session:s,...this.rotateResume(s)};
 }
 rotateResume(s){if(s.resumeHash)this.resumeKeys.delete(s.resumeHash);const resumeToken=randomBytes(32).toString('hex');s.resumeHash=digest(resumeToken);this.resumeKeys.set(s.resumeHash,s.id);return{resumeToken};}
 resume(token,peer){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new Error('Phiên đã hết. Hãy vào trận lại.');const s=this.sessions.get(this.resumeKeys.get(digest(token)));
  if(!s||!s.peer&&this.now()-s.last_seen>RECONNECT_MS)throw new Error('Máy chủ đã khởi động lại hoặc phiên đã hết. Hãy vào trận lại.');
  const old=s.peer;s.peer=peer;if(old&&old!==peer)old.close(4001,'Session resumed');s.last_seen=this.now();s.encoder.reset();s.forceFull=true;return{session:s,...this.rotateResume(s)};
 }
 input(s,message){if(!Number.isSafeInteger(message.seq)||message.seq<=s.seq||message.seq>=1e9)return false;const now=this.now();s.seq=message.seq;s.last_seen=now;s.input=JSON.stringify({...cleanInput(message),receivedAt:now});return true;}
 disconnect(s,peer){if(s.peer!==peer)return;s.peer=null;s.last_seen=this.now();s.input=JSON.stringify({x:0,y:0,actions:[],receivedAt:this.now()});}
 leave(s){this.sessions.delete(s.id);this.resumeKeys.delete(s.resumeHash);const room=this.rooms.get(s.map);if(room)room.world.humans=room.world.humans.filter(p=>p.id!==s.id);}
 transfer(s){
  const old=this.rooms.get(s.map),p=old?.world.humans.find(p=>p.id===s.id);if(!p?.alive||p.transfer==null)return;
  const dest=p.transfer;if(this.count(dest)>=CAPACITY){p.transfer=null;p.readyAt=old.world.time+.5;s.peer?.send({type:'notice',message:'Map đích đã đủ 8 người. Bạn vẫn ở map hiện tại.'});return;}
  const carry=decode(carryHuman(p));old.world.humans=old.world.humans.filter(a=>a!==p);s.map=dest;s.input=JSON.stringify({x:0,y:0,actions:[],receivedAt:this.now()});s.epoch=crypto.randomUUID();s.encoder.reset();s.forceFull=true;s.since=0;
  const next=this.room(dest).world.addHuman(s,carry);next.appliedAction=p.appliedAction;next.inputSeq=s.seq;
 }
 tick(){
  const now=this.now(),elapsed=Math.min(.1,Math.max(0,(now-this.lastTick)/1000));this.lastTick=now;
  for(const s of this.sessions.values())if(!s.peer&&now-s.last_seen>RECONNECT_MS)this.leave(s);
  for(const[map,r]of this.rooms){const sessions=[...this.sessions.values()].filter(s=>s.map===map);if(!sessions.length){r.emptyAt??=now;if(now-r.emptyAt>30000)this.rooms.delete(map);continue;}r.emptyAt=null;r.world.advance(elapsed,sessions,now);}
  for(const s of this.sessions.values())this.transfer(s);this.revision++;
 }
 broadcast(){for(const s of this.sessions.values())this.snapshot(s);}
 snapshot(s){
  if(!s.peer||s.peer.bufferedAmount>262144)return false;const world=this.rooms.get(s.map)?.world,view=world?.view(s.id,s.since);if(!view)return false;
  const packet=s.encoder.encode({...view,revision:this.revision,epoch:s.epoch,population:this.population()},s.forceFull);
  if(!s.peer.send(packet))return false;s.forceFull=false;s.since=view.eventSeq;return true;
 }
}
