import {Game,random,CHARACTERS,START,WORLD,clamp,distance,blocked,lineClear,moveActor,unlockedTier} from '../public/game/core.js';
import {arm,actorScale,bodyRadius,moveSpeed,rotationSpeed,bladeIdState,restoreBladeId} from '../public/game/weapons.js';
import {damageMonsters,updateMonsters} from '../public/game/monsters.js';
import {updateBreakables} from '../public/game/props.js';
import {updateReaction,celebrate} from '../public/game/reactions.js';
import {immutableSnapshot} from '../public/game/snapshot-codec.js';

const RING_VIEWS=new WeakMap();
function renderRing(blades){let view=RING_VIEWS.get(blades);if(!view){const list=[],stride=Math.max(1,Math.ceil(blades.length/96));for(let i=0;i<blades.length;i+=stride)list.push({id:blades[i].id,offset:blades[i].offset});view=immutableSnapshot(list);RING_VIEWS.set(blades,view);}return view;}

const RUN_KEYS=['score','rivalKills','peak','chestsOpened','monsterKills','bossKills','recentLoss','lastCombat','inventory','portal','portalCooldown','dangerTime','exploreTimer','panicTriggered','reaction','celebration','pickupJoy','sight'];
export const freshRun=()=>({score:0,rivalKills:0,peak:3,survivalTime:0,chestsOpened:0,monsterKills:0,bossKills:0,recentLoss:0,lastCombat:0,inventory:{portal:0,haste:0,rage:0},portal:null,portalCooldown:4,dangerTime:0,exploreTimer:35,panicTriggered:false,reaction:null,celebration:null,pickupJoy:null,sight:null});
const WORLD_KEYS=['id','time','mapIndex','mapTime','visits','npcs','pickups','chests','obstacles','respawns','monsters','projectiles','hazards','camp','chestTimer','npcTimer','lootTimer','humans','eventLog','eventSeq','lastContacts','contactUntil'];
export class OnlineWorld extends Game{
 constructor(map=0,seed=Date.now()%2147483647){super({map,seed});this.humans=[];this.eventLog=[];this.eventSeq=0;this.player.alive=false;this.player.id='anchor';this.events=[];}
 actors(){if(!this.humans)return super.actors();return [...this.humans.filter(p=>p.alive&&p.transfer==null&&this.time>=p.readyAt),...this.npcs.filter(n=>n.alive&&n.active)];}
 reactionActors(){return [...this.npcs,...this.humans];}
 recordLoss(a,count){if(a.human){a.run.recentLoss+=count;a.run.lastCombat=this.time;}}
 targetPlayer(at){return this.humans?.filter(p=>p.alive&&p.transfer==null&&this.time>=p.readyAt).sort((a,b)=>distance(a,at)-distance(b,at))[0]||this.player;}
 emit(type,data={}){if(!this.eventLog)return super.emit(type,data);this.eventLog.push({seq:++this.eventSeq,at:this.time,type,...data,viewerId:this._contextPlayer?.id||null});}
 withPlayer(p,fn){const before={player:this.player,context:this._contextPlayer};for(const k of RUN_KEYS)before[k]=this[k];this.player=p;this._contextPlayer=p;for(const k of RUN_KEYS)this[k]=p.run[k];try{return fn();}finally{for(const k of RUN_KEYS){p.run[k]=this[k];this[k]=before[k];}this.player=before.player;this._contextPlayer=before.context;}}
 enterMap(index,initial=false){if(this.humans&&this._contextPlayer){this._contextPlayer.transfer=index;this.portal=null;return;}return super.enterMap(index,initial);}
 freePoint(minDistance=0,origin=this.player,r=40){if(!this.humans?.length)return super.freePoint(minDistance,origin,r);for(let i=0;i<150;i++){const q={x:120+this.rng()*(WORLD.width-240),y:130+this.rng()*(WORLD.height-260)};if(!blocked(q.x,q.y,r,this.obstacles)&&distance(q,origin)>=minDistance&&this.humans.every(p=>!p.alive||distance(p,q)>=Math.min(minDistance,650)))return q;}return super.freePoint(minDistance,origin,r);}
 addHuman(session,carry=null){
  if(this.humans.some(p=>p.id===session.id))return this.humans.find(p=>p.id===session.id);
  const skin=clamp(session.skin,0,CHARACTERS.length-1),p={id:session.id,human:true,name:session.name,skin,alive:true,active:true,power:3,weaponTier:0,peak:3,hp:100,maxHp:100,hurtUntil:0,x:START.x,y:START.y,angle:0,facing:1,vx:0,vy:-1,moving:false,dash:0,dashCooldown:0,walkPhase:0,run:freshRun(),appliedAction:0,peaceUntil:this.time+7,readyAt:this.time+(this.camp?3.6:.7),transfer:null};
  if(carry){for(const k of['power','weaponTier','hp','maxHp','peak','haste','rage','run'])if(carry[k]!==undefined)p[k]=carry[k];p.run.portal=null;p.run.portalCooldown=14;}
  let pos=null;for(let i=0;i<60;i++){const q={x:START.x+(this.rng()-.5)*1000,y:START.y-this.rng()*450};if(!blocked(q.x,q.y,bodyRadius(p)+20,this.obstacles)&&this.humans.every(a=>!a.alive||distance(a,q)>330)&&this.npcs.every(a=>!a.alive||distance(a,q)>300)){pos=q;break;}}
  Object.assign(p,pos||this.freePoint(600,this.player,bodyRadius(p)+20));arm(p);this.humans.push(p);this.emit('playerJoined',{name:p.name,actorId:p.id});return p;
 }
 gainSwords(owner,value,tier){if(owner.human)return this.withPlayer(owner,()=>super.gainSwords(owner,value,tier));return super.gainSwords(owner,value,tier);}
 eliminate(a,winner,reason='blade'){
  if(!a.alive)return;
  if(a.human){a.alive=false;a.moving=false;a.lossReason=reason;a.run.portal=null;this.emit('lost',{actorId:a.id,reason});this.addPickup(a.x,a.y,Math.max(1,Math.min(24,Math.round(Math.max(a.power,a.peak*.2)))),Math.min(a.weaponTier,unlockedTier(this.time)),{drop:true,source:'player'});if(winner?.human)this.withPlayer(winner,()=>{this.rivalKills++;this.score+=200;celebrate(this,'smirk');});this.emit('rivalDown',{id:a.id,name:a.name,skin:a.skin,x:a.x,y:a.y,attackerId:winner?.id,byPlayer:false});return;}
  if(winner?.human)return this.withPlayer(winner,()=>super.eliminate(a,winner,reason));return super.eliminate(a,winner,reason);
 }
 addChest(...args){const alive=this.humans?.filter(p=>p.alive&&p.transfer==null&&this.time>=p.readyAt)||[],p=alive[Math.floor(this.rng()*alive.length)];return p?this.withPlayer(p,()=>super.addChest(...args)):super.addChest(...args);}
 openChest(chest,actor){return actor.human?this.withPlayer(actor,()=>super.openChest(chest,actor)):super.openChest(chest,actor);}
 awardMonster(m,attacker){if(attacker.human)this.withPlayer(attacker,()=>{this.monsterKills++;if(m.boss)this.bossKills++;this.score+=m.boss?1800:35;});}
 updateHumanItems(dt){
  for(const p of this.humans)if(p.alive&&this.time>=p.readyAt&&p.transfer==null){p.haste=Math.max(0,(p.haste||0)-dt);p.rage=Math.max(0,(p.rage||0)-dt);}
  for(const item of this.itemDrops){item.life-=dt;if(item.life<=0){item.alive=false;continue;}const p=this.humans.filter(p=>p.alive&&this.time>=p.readyAt&&p.transfer==null&&distance(p,item)<125&&lineClear(item,p,this.obstacles,3)).sort((a,b)=>distance(a,item)-distance(b,item))[0];if(!p)continue;const f=Math.min(1,dt*11);item.x+=(p.x-item.x)*f;item.y+=(p.y-item.y)*f;if(distance(item,p)<26*actorScale(p)){item.alive=false;p.run.inventory[item.kind]++;this.emit('itemPickup',{kind:item.kind,actorId:p.id,x:p.x,y:p.y});}}
  this.itemDrops=this.itemDrops.filter(p=>p.alive);
 }
 actions(p,packet){if(!p.alive||p.transfer!=null)return;if((packet.actions||[]).some(a=>a.kind==='ready'&&a.seq>p.appliedAction))p.readyAt=this.time;if(this.time<p.readyAt)return;for(const a of packet.actions||[]){if(a.seq<=p.appliedAction)continue;p.appliedAction=a.seq;this.withPlayer(p,()=>{if(a.kind==='dash')super.dash(packet.x,packet.y);else if(['portal','haste','rage'].includes(a.kind))super.useItem(a.kind);});}}
 advance(elapsed,sessions,now){
  const live=new Map(sessions.map(s=>[s.id,s]));this.humans=this.humans.filter(p=>live.has(p.id));for(const s of sessions){let p=this.humans.find(p=>p.id===s.id);if(!p)p=this.addHuman(s,s.carry?decode(s.carry):null);p.packet=s.input?JSON.parse(s.input):{x:0,y:0,actions:[]};p.inputSeq=s.seq||0;if(now-(p.packet.receivedAt??s.last_seen)>1200){p.packet={x:0,y:0,actions:[]};}this.actions(p,p.packet);}
  let left=Math.max(0,Math.min(.75,elapsed));while(left>1e-8){const dt=Math.min(1/60,left);super.update(dt,{x:0,y:0});left-=dt;}
  for(const p of this.humans)delete p.packet;
  this.eventLog=this.eventLog.filter(e=>this.time-e.at<8).slice(-280);this.events=[];
 }
 step(dt){
  this.time+=dt;this.mapTime+=dt;this.updateHumanItems(dt);
  // Footstep phase and sprite bobbing are client presentation, not game physics.
  for(const a of this.actors()){a.angle=(a.angle+rotationSpeed(a)*dt)%(Math.PI*2);a.pickupAura=Math.max(0,(a.pickupAura||0)-dt);a.airborne=Math.max(0,(a.airborne||0)-dt);}
  for(const p of this.humans){if(!p.alive||p.transfer!=null||this.time<p.readyAt)continue;p.run.survivalTime=(p.run.survivalTime||0)+dt;p.dashCooldown=Math.max(0,p.dashCooldown-dt);let dx=p.airborne>0?0:p.packet?.x||0,dy=p.airborne>0?0:p.packet?.y||0,l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}p.moving=l>.08;if(p.moving){p.vx=dx;p.vy=dy;if(Math.abs(dx)>.1)p.facing=dx<0?-1:1;}if(p.dash>0){dx=p.vx;dy=p.vy;p.moving=true;}moveActor(p,dx*moveSpeed(p)*(p.dash>0?3.15:1)*dt,dy*moveSpeed(p)*(p.dash>0?3.15:1)*dt,this.obstacles,bodyRadius(p));p.dash=Math.max(0,p.dash-dt);}
  this.updateNpcs(dt);
  for(const p of this.humans)if(p.alive&&p.transfer==null&&this.time>=p.readyAt)this.withPlayer(p,()=>{this.recentLoss=(this.recentLoss||0)*Math.exp(-dt*1.4);this.sight={x:p.x,y:p.y-80,w:700,h:1100};updateReaction(this,dt);this.updatePortal(dt);});
  this.collectPickups(dt);this.updateClashes();damageMonsters(this,dt);updateMonsters(this,dt);this.updateChests(dt);updateBreakables(this,dt);this.updateLoot(dt);
  const focus=this.camp?this.targetPlayer(this.camp):this.targetPlayer(START);const old=this.player;this.player=focus;super.updateRespawns(dt);this.player=old;
  if(this.npcs.length>64)this.npcs=this.npcs.filter(n=>n.alive);if(this.pickups.length>260)this.pickups=this.pickups.filter(i=>i.alive||i.recharge);
 }
 save(){const data={rng:this.rng.state,nextBlade:bladeIdState(),itemDrops:this.itemDrops};for(const key of WORLD_KEYS)data[key]=this[key];return encode(data);}
 static restore(text){const d=decode(text),g=Object.create(OnlineWorld.prototype);Object.assign(g,d);g.rng=random(d.rng);restoreBladeId(d.nextBlade);g.state='playing';g.events=[];g.clashes=[];g.bladePoses=new Map();g.visited=new Set([g.mapIndex]);g.player={id:'anchor',x:START.x,y:START.y,alive:false,power:0,weaponTier:0};Object.assign(g,freshRun());g.introPlaying=false;return g;}
 view(id,since=0,frame=null){
  const p=this.humans.find(p=>p.id===id);if(!p)return null;
  const shared=frame?.visual||new WeakMap(),visible=v=>{let out=shared.get(v);if(!out){out=visual(v);shared.set(v,out);}return out;};
  const rename=v=>v===id?'player':v,actor=a=>{const o={...visible(a)};o.id=rename(a.id);o.renderBlades=a.blades&&(a===p||this.time<p.readyAt||distance(a,p)<1800)?renderRing(a.blades):[];return o;};
  const ev=this.eventLog.filter(e=>e.seq>since&&(!(e.type==='lost')||e.actorId===id)).map(e=>{const o={...e};for(const k of['actorId','a','b','id'])if(o[k])o[k]=rename(o[k]);o.byPlayer=e.viewerId===id||e.attackerId===id;if(e.viewerId&&e.viewerId!==id&&['panic','panicRun','reaction','itemUse','portalSpawn','dash'].includes(e.type))o.type='remote';return o;});
  return {protocol:1,time:this.time,survivalTime:p.run.survivalTime||0,mapTime:this.mapTime,mapIndex:this.mapIndex,player:actor(p),npcs:[...this.npcs.filter(n=>n.alive),...this.humans.filter(a=>a.id!==id&&a.alive&&a.transfer==null)].map(actor),pickups:this.pickups.filter(i=>i.alive).map(visible),chests:this.chests.filter(c=>c.alive).map(visible),obstacles:this.obstacles.map(visible),monsters:this.monsters.filter(m=>m.alive).map(visible),projectiles:this.projectiles.map(visible),hazards:this.hazards.map(visible),itemDrops:this.itemDrops.map(visible),camp:this.camp,clashes:(this.time<(this.contactUntil||0)?this.lastContacts||[]:[]).map(c=>({...c,a:rename(c.a),b:rename(c.b)})),portal:p.run.portal,inventory:p.run.inventory,score:p.run.score,peak:p.run.peak,rivalKills:p.run.rivalKills,monsterKills:p.run.monsterKills,bossKills:p.run.bossKills,chestsOpened:p.run.chestsOpened,state:p.alive?'playing':'lost',lossReason:p.lossReason,transferTo:p.transfer,readyIn:Math.max(0,p.readyAt-this.time),leaderboard:this.humans.filter(a=>a.alive&&a.transfer==null).sort((a,b)=>b.weaponTier-a.weaponTier||b.power-a.power||b.run.rivalKills-a.run.rivalKills||a.id.localeCompare(b.id)).slice(0,3).map(a=>({id:rename(a.id),name:a.name,tier:a.weaponTier+1,power:a.power,kills:a.run.rivalKills})),playersOnline:this.humans.filter(a=>a.alive&&a.transfer==null).length,events:ev,eventSeq:this.eventSeq};
 }
}
const HIDDEN=new Set(['run','packet','blades','goal','path','hitTimes','hitActors','source','walkX','walkY','walkPhase','think','pathTimer','homeX','homeY','spawnPower','spawnTier','bold','collect','order','layer','slot','peaceUntil','readyAt','transfer','returnAt','originX','originY','recharge','scaling','spawnedAt','cooldown','cooldownBase','respawnAt','speed','damage','range','cast']);
function visual(v){const out={};for(const k in v)if(Object.hasOwn(v,k)&&!k.startsWith('_')&&!HIDDEN.has(k)&&typeof v[k]!=='function')out[k]=v[k];return out;}
export function encode(value){return JSON.stringify(value,(k,v)=>{
 if(k==='packet'||k.startsWith('_'))return undefined;if(k==='goal'&&v)return{x:v.x,y:v.y};
 if(k==='blades'&&Array.isArray(v)){const first=v[0]?.id||0,n=v.length,uniform=v.every((b,i)=>b.id===first+i&&Math.abs(b.offset-i*Math.PI*2/Math.max(1,n))<1e-9);return uniform?{$blades:n,first}:{$pairs:v.flatMap(b=>[b.id,b.offset])};}
 if(v instanceof Map)return{$map:[...v]};if(v instanceof Set)return{$set:[...v]};if(typeof v==='number'&&!Number.isFinite(v))return{$number:String(v)};return v;
 });}
export function decode(text){return JSON.parse(text,(k,v)=>{if(!v||typeof v!=='object')return v;if('$blades'in v)return Array.from({length:v.$blades},(_,i)=>({id:v.first+i,offset:i*Math.PI*2/Math.max(1,v.$blades)}));if('$pairs'in v){const a=[];for(let i=0;i<v.$pairs.length;i+=2)a.push({id:v.$pairs[i],offset:v.$pairs[i+1]});return a;}if('$map'in v)return new Map(v.$map);if('$set'in v)return new Set(v.$set);if('$number'in v)return Number(v.$number);return v;});}
export function carryHuman(p){const c={};for(const k of['power','weaponTier','hp','maxHp','peak','haste','rage','run'])c[k]=p[k];return encode(c);}
