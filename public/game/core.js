import{dropItem,updateItems,useItem}from'./items.js';
import{initGarrison,updateGarrison,steerGarrison,garrisonTier}from'./garrison.js';
import{updateReaction,celebrate,pickupReaction}from'./reactions.js';
import{bladeQuery}from'./blade-index.js';
import{WORLD,START,MAPS,CHARACTERS,layout,blocked,lineClear,moveActor,findPath,clamp,distance}from'./world.js';
export{WORLD,START,MAPS,CHARACTERS,clamp,distance,blocked,lineClear,moveActor,findPath};
import{TIERS,swordTier,swordCount,actorScale,moveSpeed,rotationSpeed,attackMultiplier,bodyRadius,bladeSize,ringRadius,ringReach,combatCenter,arm,ensureBlades,bladePoses}from'./weapons.js';
export{TIERS,swordTier,swordCount,actorScale,moveSpeed,rotationSpeed,bodyRadius,bladeSize,ringRadius,ringReach,combatCenter,bodyShape,bladeCount,arm,ensureBlades,bladePose,bladePoses}from'./weapons.js';
import{stepCombat,separateBodies,bladeHitsShape,needsBladeSubsteps}from'./combat.js';
export{bladesContact,bladeHitsShape,separateBodies}from'./combat.js';
import{initMonsters,updateMonsters,damageMonsters}from'./monsters.js';
export{BOSS_TYPES,CREEP_TYPES,hurtActor}from'./monsters.js';
import{initBreakables,updateBreakables}from'./props.js';
import{unlockedTier,regularDropTier,rewardTiers}from'./progression.js';
export{unlockedTier,regularDropTier,rewardTiers}from'./progression.js';
export function random(seed){const next=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};Object.defineProperty(next,"state",{get:()=>seed,set:v=>{seed=v|0;}});return next;}
export const CHEST_SPAWN={entryChance:.75,secondChance:.4,chance:.75,minDelay:6,maxDelay:10,limit:8,nearChance:.65};
export const freeNpcCount=map=>2*(8+map.difficulty);
export class Game{
 constructor(options={}){this.reset(options);}
 reset({skin=0,map=0,seed=Date.now()%2147483647}={}){
  this.rng=random(seed);this.id=0;this.time=0;this.score=0;this.rivalKills=0;this.peak=3;this.events=[];this.state='playing';this.lossReason=null;this.visits=0;this.visited=new Set();this.chestsOpened=0;this.recentLoss=0;this.monsterKills=0;this.bossKills=0;this.panicTriggered=false;this.reaction=null;this.celebration=null;this.pickupJoy=null;this.introPlaying=false;this.inventory={portal:0,haste:0,rage:0};
  this.player={id:'player',name:CHARACTERS[skin].name,skin,alive:true,power:3,weaponTier:0,peak:3,hp:100,maxHp:100,hurtUntil:0,x:START.x,y:START.y,angle:0,facing:1,vx:0,vy:-1,moving:false,dash:0,dashCooldown:0};arm(this.player);this.enterMap(map,true);
 }
 emit(type,data={}){this.events.push({type,...data});}
 get map(){return MAPS[this.mapIndex];}
 actors(){return[this.player,...this.npcs.filter(n=>n.alive&&n.active)].filter(a=>a.alive);}
 freePoint(minDistance=0,origin=this.player,r=40){for(let i=0;i<150;i++){const p={x:120+this.rng()*(WORLD.width-240),y:130+this.rng()*(WORLD.height-260)};if(!blocked(p.x,p.y,r,this.obstacles)&&distance(p,origin)>=minDistance)return p;}return{x:START.x,y:START.y};}
 enterMap(index,initial=false){
  this.introPlaying=false;this.mapIndex=clamp(index,0,MAPS.length-1);this.visits++;this.visited.add(this.mapIndex);this.mapTime=0;this.obstacles=layout(this.mapIndex);initBreakables(this);this.camp=null;this.npcs=[];this.respawns=[];this.pickups=[];this.chests=[];this.itemDrops=[];this.clashes=[];this.lastContacts=[];this.contactUntil=0;this.bladePoses=new Map();this.portal=null;
  this.portalCooldown=initial?4:14;this.dangerTime=0;this.exploreTimer=30+this.rng()*15;this.chestTimer=CHEST_SPAWN.minDelay+this.rng()*(CHEST_SPAWN.maxDelay-CHEST_SPAWN.minDelay);this.npcTimer=3;this.lootTimer=6;
  Object.assign(this.player,{x:START.x,y:START.y,dash:0,dashCooldown:0,moving:false});const startTier=unlockedTier(this.time);
  // Safe entry trail, then shared free-form loot across the arena.
  for(let row=0;row<4;row++)for(let col=0;col<3;col++){const x=START.x-90+col*90,y=START.y-140-row*110;if(!blocked(x,y,30,this.obstacles))this.addPickup(x,y,1,startTier,{recharge:15,scaling:true});}
  for(let i=0;i<90;i++)this.spawnMapPickup();
  for(let i=0;i<freeNpcCount(this.map);i++)this.spawnNpc(i);
  initGarrison(this);
  if(this.rng()<CHEST_SPAWN.entryChance){this.addChest();if(this.rng()<CHEST_SPAWN.secondChance)this.addChest();}initMonsters(this);
  if(!initial)this.emit('teleport',{map:this.map.name,index:this.mapIndex,x:this.player.x,y:this.player.y});
 }
 spawnNpc(i=0){
  const p=this.player,skin=(i+this.mapIndex)%CHARACTERS.length,pos=this.freePoint(600,p,60);
  const tier=regularDropTier(this.time,this.rng);
  const power=2+Math.floor(this.rng()*(this.time<60?3:10));
  return this.addNpc({...pos,name:CHARACTERS[skin].name+(i>=6?' · '+(i-4):''),skin,power,weaponTier:tier,bold:this.rng()>.45});
 }
 addNpc(config){
  const n={id:'npc-'+(++this.id),alive:true,active:true,hp:100,maxHp:100,hurtUntil:0,skin:0,power:3,weaponTier:0,elite:false,bold:false,think:0,pathTimer:0,path:[],intent:'Nhặt kiếm',vx:0,vy:-1,moving:false,facing:1,dash:0,angle:this.rng()*6,...config};
  n.weaponTier=config.weaponTier??0;n.peak=n.power;n.spawnPower=n.power;n.spawnTier=n.weaponTier;n.homeX=n.x;n.homeY=n.y;arm(n);this.npcs.push(n);return n;
 }
 gainSwords(owner,value,tier=owner.weaponTier){
  const previousTier=owner.weaponTier;value=Math.max(1,Math.floor(value));tier=clamp(tier,0,11);const rearmed=owner.power===0;
  if(rearmed)owner.weaponTier=tier;
  owner.pickupAura=rearmed?1.1:.85;owner.pickupAuraMax=owner.pickupAura;
  if(tier<owner.weaponTier){
   owner.pickupAura=owner.pickupAuraMax=.4;
   if(owner===this.player)this.score+=value;
   this.emit('pickup',{actorId:owner.id,value:0,lower:true,level:owner.weaponTier+1,points:value,x:owner.x,y:owner.y,color:'#d8d5b9'});return;
  }
  const old=owner.weaponTier,before=owner.power+value;let merged=false;
  if(tier>old){owner.weaponTier=tier;owner.power=1;merged=true;}
  else owner.power=before;
  owner.peak=Math.max(owner.peak||0,before);arm(owner);
  if(owner===this.player){this.score+=value*2;this.peak=Math.max(this.peak,before);pickupReaction(this,merged?0:value,tier>previousTier);}
  this.emit('pickup',{actorId:owner.id,value:merged?0:value,merged,rearmed,level:owner.weaponTier+1,x:owner.x,y:owner.y,color:swordTier(owner).color});
  if(merged)this.emit('evolve',{actorId:owner.id,name:swordTier(owner).name,level:owner.weaponTier+1,from:before,to:1,x:owner.x,y:owner.y,color:swordTier(owner).color});
 }
 lootValue(){
  const stage=Math.min(3,Math.floor(this.time/60)),one=[.9,.72,.5,.3][stage];
  return this.rng()<one?1:2+Math.floor(this.rng()*[1,3,7,15][stage]);
 }
 lootTier(){return regularDropTier(this.time,this.rng);}
 spawnMapPickup(){const pos=this.freePoint(220);return this.addPickup(pos.x,pos.y,this.lootValue(),this.lootTier(),{recharge:16+this.rng()*8,scaling:true});}
 updateLoot(dt){
  this.lootTimer-=dt;if(this.lootTimer>0)return;this.lootTimer=6;
  const target=Math.min(220,102+Math.floor(this.time/20)*4),current=this.pickups.filter(p=>p.recharge).length;
  for(let i=0;i<Math.min(4,target-current);i++)this.spawnMapPickup();
 }
 updateRespawns(dt){
  for(const r of this.respawns){if(r.at>this.time||r.config.role&&this.camp&&distance(this.player,this.camp)<1500)continue;const pos=r.config.role?{x:r.config.homeX,y:r.config.homeY}:this.freePoint(650,this.player,60);this.addNpc({...r.config,...pos,weaponTier:r.config.role?r.config.weaponTier:r.config.elite?unlockedTier(this.time):regularDropTier(this.time,this.rng)});r.done=true;}
  this.respawns=this.respawns.filter(r=>!r.done);this.npcTimer-=dt;
  if(this.npcTimer<=0){this.npcTimer=3;const target=freeNpcCount(this.map);if(this.npcs.filter(n=>n.alive&&!n.role).length+this.respawns.filter(r=>!r.config.role).length<target)this.spawnNpc(Math.floor(this.rng()*12));}
 }

 addPickup(x,y,value,tier=0,options={}){const item={id:++this.id,x,y,originX:x,originY:y,value,weaponTier:clamp(tier,0,11),alive:true,recharge:0,returnAt:Infinity,seed:this.rng()*6,...options};this.pickups.push(item);return item;}
 collectPickups(dt){
  const actors=this.actors();for(const item of this.pickups){if(!item.alive&&item.recharge&&item.returnAt<=this.time){Object.assign(item,{alive:true,x:item.originX,y:item.originY});if(item.scaling){item.value=this.lootValue();item.weaponTier=this.lootTier();}}if(!item.alive)continue;let owner=null,nearest=Infinity;
   for(const a of actors){if(a.collect===false)continue;const d=distance(item,a);if(d<nearest&&d<125&&lineClear(item,a,this.obstacles,3)){nearest=d;owner=a;}}if(!owner)continue;
   const f=Math.min(1,dt*(7+(125-nearest)*.12));item.x+=(owner.x-item.x)*f;item.y+=(owner.y-item.y)*f;if(distance(item,owner)>26*actorScale(owner))continue;
   item.alive=false;item.returnAt=this.time+item.recharge;this.gainSwords(owner,item.value,item.weaponTier);
  }
 }
 updateNpcs(dt){
  updateGarrison(this,dt);
  for(const n of this.npcs){if(!n.alive)continue;const focus=this.targetPlayer?.(n)||this.player;n.active=distance(n,focus)<1450||n.order==='attack'||n.order==='return';n.moving=false;if(!n.active||n.airborne>0)continue;if(n.role){steerGarrison(this,n,dt);continue;}n.think-=dt;n.pathTimer-=dt;
   if(n.think<=0){n.think=.28+this.rng()*.16;const army=this.npcs.filter(a=>a.alive&&a.role&&a.power>0&&(n.power===0||a.weaponTier>n.weaponTier||a.weaponTier===n.weaponTier&&a.power>n.power*1.15)&&distance(n,a)<(n.intent==='Bỏ chạy'?1100:900)&&lineClear(n,a,this.obstacles)).sort((a,b)=>distance(n,a)-distance(n,b))[0];
    if(army){const dx=n.x-army.x,dy=n.y-army.y,d=Math.hypot(dx,dy)||1;n.goal={x:clamp(n.x+dx/d*600,90,WORLD.width-90),y:clamp(n.y+dy/d*600,90,WORLD.height-90)};n.intent='Bỏ chạy';n.path=[];n.pathTimer=0;}
    else{let threat=null,best=Infinity;for(const a of this.actors()){if(a===n||a.faction&&a.faction===n.faction||a.power<=0||(a.human?this.time<(a.peaceUntil||0):a===this.player&&this.mapTime<7))continue;const d=distance(n,a);if(d<ringRadius(n)+ringRadius(a)+160&&d<best&&lineClear(n,a,this.obstacles)){threat=a;best=d;}}
    if(threat){const adv=n.power===0?0:n.weaponTier>threat.weaponTier?3:n.weaponTier<threat.weaponTier?.15:n.power/Math.max(1,threat.power);if(adv<(n.bold?.78:1.05)){const angle=Math.atan2(n.y-threat.y,n.x-threat.x);n.goal={x:clamp(n.x+Math.cos(angle)*350,90,WORLD.width-90),y:clamp(n.y+Math.sin(angle)*350,90,WORLD.height-90)};n.intent='Rút lui';}else{n.goal=threat;n.intent=n.elite?'Truy đuổi':'Giao đấu';}}
    else{let item=null,cost=Infinity;for(const it of this.pickups){if(!it.alive||(n.power>0&&it.weaponTier<n.weaponTier))continue;const d=distance(n,it);if(d>700)continue;const c=d-Math.max(0,it.weaponTier-n.weaponTier)*35-Math.min(it.value,70)*.5;if(c<cost){item=it;cost=c;}}
     const chest=this.chests.filter(c=>c.alive).sort((a,b)=>distance(a,n)-distance(b,n))[0];if(n.power>0&&chest&&distance(chest,n)<250&&(!item||cost>130)){n.goal=chest;n.intent='Phá rương';}else if(item){n.goal=item;n.intent='Nhặt kiếm';}else if(!n.goal||n.goal.alive===false||distance(n,n.goal)<50){n.goal=this.freePoint(0,n);n.intent='Tuần tra';}
    }
   }}
   if(!n.goal)continue;let goal=n.goal;const radius=bodyRadius(n);if(!lineClear(n,goal,this.obstacles,radius+2)){if(n.pathTimer<=0){n.path=findPath(n,goal,this.obstacles,radius+5);n.pathTimer=.9;}while(n.path.length&&distance(n,n.path[0])<30)n.path.shift();if(n.path.length)goal=n.path[0];else continue;}else n.path=[];
   let dx=goal.x-n.x,dy=goal.y-n.y,len=Math.hypot(dx,dy);if(len>15){dx/=len;dy/=len;n.vx=dx;n.vy=dy;n.facing=dx<0?-1:1;n.moving=true;const speed=moveSpeed(n)*(n.intent==='Bỏ chạy'?1.18:n.intent==='Rút lui'?.94:.82);moveActor(n,dx*speed*dt,dy*speed*dt,this.obstacles,radius);}
  }
 }
 updateClashes(){stepCombat(this);}
 eliminate(a,winner,reason='blade'){
  if(!a.alive)return;a.alive=false;a.moving=false;
  if(a===this.player){this.state='lost';this.lossReason=reason;this.emit('lost',{reason});return;}
  this.respawns.push({at:this.time+(a.role?90:4+this.rng()*2),config:{name:a.name,skin:a.skin,power:a.spawnPower??3,weaponTier:a.spawnTier??a.weaponTier,elite:a.elite,bold:a.bold,role:a.role,faction:a.faction,layer:a.layer,slot:a.slot,homeX:a.homeX,homeY:a.homeY,collect:a.collect,order:a.role?'hold':undefined}});
  if(winner===this.player){this.rivalKills++;this.score+=a.elite?1500:200;celebrate(this,'smirk');}
  this.addPickup(a.x,a.y,Math.max(1,Math.min(24,Math.round(Math.max(a.power,a.peak*.2)))),Math.min(a.weaponTier,unlockedTier(this.time)),{drop:true,source:'npc'});
  this.emit('rivalDown',{id:a.id,name:a.name,skin:a.skin,x:a.x,y:a.y,byPlayer:winner===this.player,elite:a.elite});
 }

 addChest(pos=null,rare=this.rng()<.25){
  if(!pos){const near=this.rng()<CHEST_SPAWN.nearChance;
   for(let i=0;i<60;i++){
    let q;if(near&&i<40){const angle=this.rng()*Math.PI*2,r=320+this.rng()*380;q={x:this.player.x+Math.cos(angle)*r,y:this.player.y+Math.sin(angle)*r};if(blocked(q.x,q.y,55,this.obstacles)||!lineClear(this.player,q,this.obstacles,20))continue;}else q=this.freePoint(220,this.player,55);
    if(distance(q,this.player)<220||this.chests.some(c=>c.alive&&distance(c,q)<190)||this.actors().some(a=>distance(a,q)<100))continue;pos=q;break;
   }
   if(!pos)return null;
  }
  if(blocked(pos.x,pos.y,50,this.obstacles))pos=this.freePoint(300);
  const hp=(rare?450:180)+this.map.difficulty*100+Math.min(1200,this.player.power*.25),c={id:'chest-'+(++this.id),...pos,hp,maxHp:hp,alive:true,rare,flash:0,spawnedAt:this.time};this.chests.push(c);return c;
 }
 openChest(chest,actor){
  if(!chest.alive)return;chest.alive=false;if(actor===this.player){this.chestsOpened++;this.score+=chest.rare?150:60;}const drops=(chest.rare?4:3)+Math.floor(this.rng()*3),loot=[],tiers=rewardTiers(this.time,drops,chest.rare?'rareChest':'chest',this.rng);
  for(let i=0;i<drops;i++){const tier=tiers[i],value=(chest.rare?10:6)+Math.floor(this.rng()*(chest.rare?13:9)),angle=i*Math.PI*2/drops,pos={x:chest.x+Math.cos(angle)*62,y:chest.y+Math.sin(angle)*62};if(blocked(pos.x,pos.y,12,this.obstacles)){pos.x=chest.x;pos.y=chest.y;}this.addPickup(pos.x,pos.y,value,tier,{drop:true,source:'chest',rareDrop:tier>unlockedTier(this.time)});loot.push({value,tier});}
  dropItem(this,chest.x,chest.y,chest.rare?'rareChest':'chest');
  this.emit('chestOpen',{x:chest.x,y:chest.y,loot,byPlayer:actor===this.player});
 }
 updateChests(dt){
  for(const c of this.chests){
   if(!c.alive)continue;c.flash=Math.max(0,c.flash-dt);c.hitTimes??=new Map();
   for(const a of this.actors()){
    if(!a.power||distance(a,c)>ringReach(a)+70||!lineClear(a,c,this.obstacles))continue;
    const shape={x:c.x,y:c.y-22,rx:36,ry:32};
    bladeQuery(a).near(shape,36,s=>{
     if(this.time-(c.hitTimes.get(s.id)??-10)<.22)return false;
     const hit=bladeHitsShape(s,shape);if(!hit)return false;
     c.hitTimes.set(s.id,this.time);c.hp-=(18+swordTier(a).level*7)*attackMultiplier(a);c.flash=.18;
     this.emit('chestHit',{x:hit.x,y:hit.y,actorId:a.id,level:a.weaponTier+1});
     if(c.hp<=0){c.hp=0;this.openChest(c,a);return true;}return false;
    });
    if(!c.alive)break;
   }
  }
  this.chestTimer-=dt;if(this.chestTimer<=0){this.chestTimer=CHEST_SPAWN.minDelay+this.rng()*(CHEST_SPAWN.maxDelay-CHEST_SPAWN.minDelay);if(this.chests.filter(c=>c.alive).length<CHEST_SPAWN.limit&&this.rng()<CHEST_SPAWN.chance)this.addChest();}if(this.chests.length>16)this.chests=this.chests.filter(c=>c.alive);
 }

 spawnPortal(reason='danger'){
  if(this.portal&&reason!=='item')return false;const p=this.player,threats=this.npcs.filter(n=>n.alive).sort((a,b)=>distance(a,p)-distance(b,p)),base=threats[0]?Math.atan2(p.y-threats[0].y,p.x-threats[0].x):this.rng()*Math.PI*2;let pos=null;
  if(reason==='item'){const facing=Math.atan2(p.vy||0,p.vx||(p.vy?0:p.facing));for(const r of[100,140,180]){for(const delta of[0,.25,-.25,.5,-.5,.8,-.8,1.1,-1.1,1.45,-1.45]){const q={x:p.x+Math.cos(facing+delta)*r,y:p.y+Math.sin(facing+delta)*r};if(!blocked(q.x,q.y,60,this.obstacles)&&lineClear(p,q,this.obstacles,25)){pos=q;break;}}if(pos)break;}}
  else for(let i=0;i<40;i++){const angle=base+(this.rng()-.5)*Math.PI*1.5,r=130+this.rng()*65,q={x:p.x+Math.cos(angle)*r,y:p.y+Math.sin(angle)*r};if(!blocked(q.x,q.y,60,this.obstacles)&&lineClear(p,q,this.obstacles,25)){pos=q;break;}}
  if(!pos)return false;const options=MAPS.map((_,i)=>i).filter(i=>i!==this.mapIndex),dest=options[Math.floor(this.rng()*options.length)];this.portal={...pos,dest,reason,life:reason==='danger'?9:14,age:0};this.portalCooldown=22;this.emit('portalSpawn',{...pos,dest,name:MAPS[dest].name,reason});return true;
 }
 updatePortal(dt){
  this.portalCooldown=Math.max(0,this.portalCooldown-dt);this.exploreTimer-=dt;const p=this.player,threat=this.npcs.find(n=>n.alive&&n.power>0&&distance(n,p)<ringReach(n)+ringReach(p)+130&&lineClear(n,p,this.obstacles)),danger=!!threat&&(p.power<3||threat.weaponTier>p.weaponTier||threat.power>p.power*1.5||this.recentLoss>p.power*.2);this.dangerTime=danger?this.dangerTime+dt:Math.max(0,this.dangerTime-dt*2);
  if(!this.portal&&this.portalCooldown<=0){if(danger&&this.dangerTime>.3&&this.rng()<1-Math.exp(-2.8*dt))this.spawnPortal('danger');else if(this.exploreTimer<=0){this.spawnPortal('explore');this.exploreTimer=32+this.rng()*15;}}
  if(this.portal){this.portal.life-=dt;this.portal.age+=dt;if(this.portal.life<=0)this.portal=null;else if(this.portal.age>.35&&distance(p,this.portal)<46){const dest=this.portal.dest;this.enterMap(dest);this.recentLoss=0;return true;}}return false;
 }
 useItem(kind){return useItem(this,kind);}
 dash(dx,dy){const p=this.player;if(this.state!=='playing'||this.introPlaying||p.dashCooldown>0||p.airborne>0)return false;const l=Math.hypot(dx,dy);if(l>.05){p.vx=dx/l;p.vy=dy/l;}p.dash=.26;p.dashCooldown=3.2;this.emit('dash',{x:p.x,y:p.y});return true;}
 update(dt,input={x:0,y:0}){
  if(this.state!=='playing'||this.introPlaying)return;dt=clamp(dt,0,.08);if(!dt)return;
  // Each substep moves blade tips at most about five world pixels. This prevents
  // fast dashes and spinning tips from skipping another blade or a body.
  let maxTravel=0;for(const a of this.actors())if(needsBladeSubsteps(this,a,dt))maxTravel=Math.max(maxTravel,rotationSpeed(a)*ringReach(a)+moveSpeed(a)*(a.dash>0?3.15:1));
  const steps=Math.max(1,Math.ceil(dt*120),Math.ceil(maxTravel*dt/5)),sub=dt/steps;
  for(let i=0;i<steps&&this.state==='playing';i++)this.step(sub,input);
 }
 step(dt,input){
  this.time+=dt;this.mapTime+=dt;const p=this.player;updateItems(this,dt);this.recentLoss=(this.recentLoss||0)*Math.exp(-dt*1.4);
  for(const a of this.actors()){a.walkX=a.x;a.walkY=a.y;a.angle=(a.angle+rotationSpeed(a)*dt)%(Math.PI*2);a.pickupAura=Math.max(0,(a.pickupAura||0)-dt);a.airborne=Math.max(0,(a.airborne||0)-dt);}
  p.dashCooldown=Math.max(0,p.dashCooldown-dt);let dx=p.airborne>0?0:input.x||0,dy=p.airborne>0?0:input.y||0,l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}
  p.moving=l>.08;if(p.moving){p.vx=dx/Math.min(l,1);p.vy=dy/Math.min(l,1);if(Math.abs(dx)>.1)p.facing=dx<0?-1:1;}
  const dashing=p.dash>0;if(dashing){dx=p.vx;dy=p.vy;p.moving=true;}const speed=moveSpeed(p)*(dashing?3.15:1);
  moveActor(p,dx*speed*dt,dy*speed*dt,this.obstacles,bodyRadius(p));
  this.updateNpcs(dt);for(const a of this.actors()){const travel=Math.hypot(a.x-(a.walkX??a.x),a.y-(a.walkY??a.y));a.walkPhase=((a.walkPhase||0)+travel*.085/actorScale(a))%(Math.PI*2);if(travel<.001)a.moving=false;}updateReaction(this,dt);this.collectPickups(dt);if(this.updatePortal(dt))return;
  this.updateClashes();p.dash=Math.max(0,p.dash-dt);if(this.state!=='playing')return;
  damageMonsters(this,dt);updateMonsters(this,dt);if(this.state!=='playing')return;this.updateChests(dt);updateBreakables(this,dt);this.updateLoot(dt);this.updateRespawns(dt);
  if(this.npcs.length>64)this.npcs=this.npcs.filter(n=>n.alive);if(this.pickups.length>260)this.pickups=this.pickups.filter(i=>i.alive||i.recharge);
 }
}
