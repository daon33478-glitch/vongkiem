import {MAPS,clamp,distance} from './world.js';
import {actorScale} from './weapons.js';
import {PlayerPrediction,RemoteTimeline} from './net-motion.js';
export class OnlineView{
 constructor(snapshot,connection){this.online=true;this.connection=connection;this.events=[];this.introPlaying=false;this.tracks=new Map();this.snapshotInterval=140;this.interpolationDelay=140;this.apply(snapshot,true);}
 rememberInput(seq){this.prediction.remember(seq);}
 apply(s,first=false){
  const now=this.connection.now(),mapChanged=this.mapIndex!==s.mapIndex;
  if(!first&&this.received){const interval=now-this.received;if(interval>25&&interval<1500)this.snapshotInterval=this.snapshotInterval*.7+interval*.3;}
  const pending=this.events,player=s.player;Object.assign(this,s);this.events=[...pending,...(s.events||[])];this.map=MAPS[s.mapIndex];this.received=now;
  if(first||mapChanged){this.prediction=new PlayerPrediction(player);this.tracks.clear();this.snapshotInterval=this.interpolationDelay=140;}else this.prediction.reconcile(player);
  this.player=this.prediction.render();
  const ids=new Set();for(const[kind,list]of[['n',this.npcs],['m',this.monsters],['p',this.projectiles]])for(const a of list){const key=kind+a.id;ids.add(key);let track=this.tracks.get(key);if(!track){track=new RemoteTimeline();this.tracks.set(key,track);}track.push(a,s.time,now);}
  for(const key of this.tracks.keys())if(!ids.has(key))this.tracks.delete(key);
  if(mapChanged&&!first)this.events.push({type:'teleport',map:this.map.name,index:this.mapIndex,x:this.player.x,y:this.player.y});
 }
 update(dt,input={x:0,y:0}){
  this.connection.input=this.introPlaying?{x:0,y:0}:{x:input.x||0,y:input.y||0};
  const now=this.connection.now();if(now-this.received>1500)return;this.readyIn=Math.max(0,(this.readyIn||0)-dt);
  this.prediction.step(dt,input,this.obstacles,!this.introPlaying&&this.readyIn<=0&&this.transferTo==null);this.player=this.prediction.render();
  const target=clamp(this.snapshotInterval*1.15,100,500);this.interpolationDelay+=(target-this.interpolationDelay)*Math.min(1,dt*3);
  for(const[kind,list]of[['n',this.npcs],['m',this.monsters],['p',this.projectiles]])for(const a of list){const pose=this.tracks.get(kind+a.id)?.sample(now,this.interpolationDelay);if(!pose)continue;const travel=distance(a,pose);Object.assign(a,pose);if(kind==='n'&&travel>.001)a.walkPhase=((a.walkPhase||0)+travel*.085/actorScale(a))%(Math.PI*2);}
 }
 dash(x,y){if(this.player.dashCooldown>0||this.introPlaying||!this.player.alive||this.readyIn>0)return false;const seq=this.connection.command('dash');this.prediction.dash(x,y,seq);this.player=this.prediction.render();return true;}
 useItem(kind){if(!this.inventory[kind]||this.player[kind]>0||this.introPlaying||!this.player.alive||this.readyIn>0)return false;this.connection.command(kind);return true;}
}
export class OnlineConnection{
 constructor({onStatus=()=>{},onError=()=>{},fetcher=(...args)=>fetch(...args),now=()=>performance.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}){
  this.onStatus=onStatus;this.onError=onError;this.fetcher=fetcher;this.now=now;this.schedule=schedule;this.cancel=cancel;this.input={x:0,y:0};this.seq=0;this.actionSeq=0;this.actions=[];this.since=0;this.revision=-1;this.active=false;this.failures=0;this.inFlight=0;this.lastSent=-Infinity;this.controllers=new Set();this.generation=0;this.meanRtt=0;
 }
 async request(action,data={}){const controller=new AbortController();this.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),5000);try{const response=await this.fetcher('/api/arena/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:this.token,...data}),signal:controller.signal,cache:'no-store'});const result=await response.json();if(!response.ok){const err=new Error(result.error||'Không kết nối được máy chủ.');err.status=response.status;throw err;}return result;}finally{clearTimeout(timer);this.controllers.delete(controller);}}
 connected(elapsed){this.meanRtt=this.meanRtt?this.meanRtt*.8+elapsed*.2:elapsed;this.failures=0;this.retryAt=0;this.onStatus('connected',Math.round(this.meanRtt));}
 async join(name,skin,map){
  this.active=true;const joined=await this.request('join',{name,skin,map});this.token=joined.token;this.id=joined.id;
  for(let i=0;i<8&&this.active;i++){const start=this.now(),s=await this.request('tick',{seq:++this.seq,x:0,y:0,since:0,actions:[]});if(s.waiting){await new Promise(r=>this.schedule(r,120));continue;}this.since=s.eventSeq;this.revision=s.revision;s.events=[];this.view=new OnlineView(s,this);this.connected(this.now()-start);this.schedulePump(0);return this.view;}
  throw new Error('Đấu trường đang bận, hãy vào lại.');
 }
 command(kind){if(!this.active)return 0;const seq=++this.actionSeq;this.actions.push({kind,seq});this.actions=this.actions.slice(-6);this.schedulePump(0);return seq;}
 schedulePump(ms=25){this.cancel(this.timer);if(this.active)this.timer=this.schedule(()=>this.pump(),ms);}
 handleError(error){if(!this.active)return;if(error.status===410){this.stop();this.onError(error.message);return;}if(error.status===409){if(this.view)this.view.transferTo=null;this.onStatus('full',error.message);}else{this.failures++;this.retryAt=this.now()+700;this.onStatus('reconnecting');}}
 pump(){
  if(!this.active)return;
  if(this.transferring){this.schedulePump(25);return;}
  if(this.view?.transferTo!=null){if(this.inFlight){this.schedulePump(25);return;}this.transfer();return;}
  if(this.inFlight<2&&this.now()>=this.lastSent+100&&this.now()>=(this.retryAt||0))this.sendTick();
  this.schedulePump(25);
 }
 async sendTick(){
  const started=this.now(),generation=this.generation,seq=++this.seq;this.lastSent=started;this.inFlight++;this.view?.rememberInput(seq);
  try{
   const s=await this.request('tick',{seq,...this.input,actions:[...this.actions],since:this.since});if(!this.active||generation!==this.generation)return;
   if(s.population&&this.view&&(this.populationSeq||0)<seq){this.view.population=s.population;this.populationSeq=seq;}
   // Late/duplicate replies must not rewind movement, replay effects or reopen a portal.
   if(!s.waiting&&s.revision>this.revision){this.revision=s.revision;this.since=s.eventSeq;this.actions=this.actions.filter(a=>a.seq>(s.player.appliedAction||0));this.view.apply(s);}
   this.connected(this.now()-started);
  }catch(error){if(generation===this.generation)this.handleError(error);}finally{this.inFlight--;}
 }
 async transfer(){
  this.transferring=true;try{const moved=await this.request('transfer');if(!this.active)return;if(moved.transferred){this.generation++;this.seq=0;this.populationSeq=0;this.since=0;this.revision=-1;this.actions=[];this.actionSeq=0;this.input={x:0,y:0};this.view.transferTo=null;this.lastSent=-Infinity;}}
  catch(error){this.handleError(error);}finally{this.transferring=false;this.schedulePump(120);}
 }
 stop(){this.active=false;this.generation++;this.cancel(this.timer);for(const c of this.controllers)c.abort();this.controllers.clear();if(this.token){this.fetcher('/api/arena/leave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:this.token}),keepalive:true}).catch(()=>{});this.token=null;}}
}
