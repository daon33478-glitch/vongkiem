import{dropItem}from'./items.js';
import{bladeQuery}from'./blade-index.js';
import{unlockedTier,regularDropTier,rewardTiers}from'./progression.js';
import{distance,clamp,moveActor,blocked,lineClear,findPath,WORLD}from'./world.js';
import{attackMultiplier,bodyRadius,bodyShape,combatCenter,ringReach,swordTier}from'./weapons.js';
import{bladeHitsShape}from'./combat.js';
export const BOSS_TYPES=[
 {name:'Son Goku',sprite:'boss0',hp:4600,height:184,radius:44,speed:82,color:'#ffc26e',attack:'slam',damage:32,range:600,cast:1.1,cooldown:2.7,aoe:126},
 {name:'Doraemon',sprite:'boss1',hp:3400,height:172,radius:49,speed:60,color:'#76dcff',attack:'volley',damage:24,range:590,cast:.95,cooldown:2.4,aoe:95},
 {name:'Yasuo',sprite:'boss2',hp:3600,height:180,radius:42,speed:92,color:'#a6e3ff',attack:'tornado',damage:30,range:650,cast:1.05,cooldown:2.6,aoe:40},
 {name:'Master Yi',sprite:'boss3',hp:4100,height:184,radius:44,speed:100,color:'#c1ff86',attack:'dash',damage:34,range:440,cast:1.05,cooldown:2.9,aoe:48}
];
export const CREEP_TYPES=[
 {name:'Heo rừng',sprite:'creep0',hp:85,height:67,radius:23,speed:61,color:'#edb88c'},
 {name:'Slime băng',sprite:'creep1',hp:100,height:60,radius:23,speed:48,color:'#a1eeff'},
 {name:'Yêu tinh',sprite:'creep2',hp:140,height:74,radius:22,speed:70,color:'#d2b5ff'},
 {name:'Golem lửa',sprite:'creep3',hp:230,height:88,radius:29,speed:49,color:'#ffb183'}
];
function makeMonster(g,kind,boss,pos){
 const spec=(boss?BOSS_TYPES:CREEP_TYPES)[kind],hp=Math.round(spec.hp*(boss?1+Math.min(1,g.time/900):1+g.map.difficulty*.16));
 return{id:'monster-'+(++g.id),kind,boss,...spec,...pos,homeX:pos.x,homeY:pos.y,hp,maxHp:hp,alive:true,active:true,phase:'idle',cooldown:1.6+g.rng(),cooldownBase:spec.cooldown??2.3,clock:0,flash:0,path:[],pathTimer:0,seed:g.rng()*6,hitTimes:new Map(),respawnAt:Infinity,moving:false,facing:1};
}
export function initMonsters(g){
 g.monsters=[];g.projectiles=[];g.hazards=[];
 if(g.mapIndex!==2){const kind=[0,1,0,2,3][g.mapIndex];for(let i=0;i<6+g.map.difficulty;i++)g.monsters.push(makeMonster(g,kind,false,g.freePoint(600,g.player,38)));}
 const bossIndex=[-1,1,2,3,0][g.mapIndex];
 if(bossIndex>=0){let pos={x:1100,y:660};if(blocked(pos.x,pos.y,60,g.obstacles))pos=g.freePoint(1100,g.player,60);g.monsters.push(makeMonster(g,bossIndex,true,pos));}
}
export function hurtActor(g,a,amount,source){
 if(!a.alive||!source.boss&&g.time<(a.hurtUntil||0))return false;
 if(source.boss)amount=a.hp??100;
 a.hp=Math.max(0,(a.hp??100)-amount);a.hurtUntil=g.time+.6;
 g.emit('actorHurt',{actorId:a.id,x:a.x,y:a.y-35,amount,hp:a.hp,source:source.name});
 if(a.hp<=0)g.eliminate(a,source,source.boss?'boss':'monster');return true;
}
function killMonster(g,m,attacker){
 if(!m.alive)return;m.alive=false;m.hp=0;m.phase='idle';m.respawnAt=g.time+(m.boss?80:26)+g.rng()*10;
 if(g.awardMonster)g.awardMonster(m,attacker);else if(attacker===g.player){g.monsterKills++;if(m.boss)g.bossKills++;g.score+=m.boss?1800:35;}
 const count=m.boss?12+Math.floor(g.rng()*5):1+Math.floor(g.rng()*2),tiers=m.boss?rewardTiers(g.time,count,'boss',g.rng):Array.from({length:count},()=>regularDropTier(g.time,g.rng));
 let total=0;for(let i=0;i<count;i++){
  const angle=i*Math.PI*2/count+g.rng()*.3,r=m.boss?80+g.rng()*100:25+g.rng()*28,pos={x:m.x+Math.cos(angle)*r,y:m.y+Math.sin(angle)*r};
  if(blocked(pos.x,pos.y,14,g.obstacles)){pos.x=m.x;pos.y=m.y;}
  const value=m.boss?8+Math.floor(g.rng()*19):1+Math.floor(g.rng()*3);total+=value;g.addPickup(pos.x,pos.y,value,tiers[i],{drop:true,source:m.boss?'boss':'creep',rareDrop:tiers[i]>unlockedTier(g.time)});
 }
 if(m.boss)dropItem(g,m.x,m.y,'boss');
 g.emit('monsterDown',{x:m.x,y:m.y,name:m.name,sprite:m.sprite,height:m.height,boss:m.boss,byPlayer:attacker===g.player,attackerId:attacker.id,total});
}
export function damageMonsters(g,dt){
 for(const m of g.monsters||[]){
  if(!m.alive)continue;m.flash=Math.max(0,m.flash-dt);
  const shape={x:m.x,y:m.y-m.height*.48,rx:m.radius*.95,ry:m.height*.43};
  for(const a of g.actors()){
   if(!a.power||distance(combatCenter(a),shape)>ringReach(a)+m.height*.5||!lineClear(combatCenter(a),shape,g.obstacles))continue;
   bladeQuery(a).near(shape,Math.max(shape.rx,shape.ry),s=>{
    if(g.time-(m.hitTimes.get(s.id)??-10)<.25)return false;
    const hit=bladeHitsShape(s,shape);if(!hit)return false;
    const amount=(8+swordTier(a).level*6)*attackMultiplier(a);m.hitTimes.set(s.id,g.time);m.hp=Math.max(0,m.hp-amount);m.flash=.13;
    g.emit('monsterHit',{x:hit.x,y:hit.y,actorId:a.id,amount,boss:m.boss,color:m.color,level:a.weaponTier+1});
    if(m.hp<=0){killMonster(g,m,a);return true;}return false;
   });
   if(!m.alive)break;
  }
  if(m.hitTimes.size>200){for(const[id,t]of m.hitTimes)if(g.time-t>2)m.hitTimes.delete(id);}
 }
}
function steer(g,m,target,dt){
 let goal=target;if(!lineClear(m,target,g.obstacles,m.radius+3)){
  m.pathTimer-=dt;if(m.pathTimer<=0){m.path=findPath(m,target,g.obstacles,m.radius+4);m.pathTimer=1.1;}
  while(m.path.length&&distance(m,m.path[0])<25)m.path.shift();if(!m.path.length)return;goal=m.path[0];
 }
 const dx=goal.x-m.x,dy=goal.y-m.y,d=Math.hypot(dx,dy);if(d<15)return;
 m.facing=dx<0?-1:1;m.moving=true;moveActor(m,dx/d*m.speed*dt,dy/d*m.speed*dt,g.obstacles,m.radius);
}
function cast(g,m,target){
 m.phase='cast';m.clock=m.boss?m.cast:.65;m.castLength=m.clock;
 const dx=target.x-m.x,dy=target.y-m.y,len=Math.hypot(dx,dy)||1;
 m.target={x:target.x,y:target.y,dx:dx/len,dy:dy/len,fromX:m.x,fromY:m.y,shotX:bodyShape(target).x,shotY:bodyShape(target).y};
 g.emit('monsterWarning',{x:m.x,y:m.y,boss:m.boss,name:m.name});
}
function resolveAttack(g,m){
 const t=m.target;
 if(!m.boss||m.attack==='slam'){
  const radius=m.boss?m.aoe:58;
  g.hazards.push({kind:'circle',x:t.x,y:t.y,radius,color:m.color,life:.32,max:.32});
  for(const a of g.actors())if(distance(a,t)<radius+bodyRadius(a)*.45&&lineClear(m,a,g.obstacles))hurtActor(g,a,m.boss?m.damage:12+g.map.difficulty*2,m);
  g.emit('monsterSlam',{x:t.x,y:t.y,radius,color:m.color,boss:m.boss});
 }else if(m.attack==='volley'){
  const angle=Math.atan2(t.shotY-(m.y-m.height*.45),t.shotX-m.x);
  for(const delta of[-.2,0,.2])g.projectiles.push({x:m.x+Math.cos(angle+delta)*58,y:m.y-m.height*.45+Math.sin(angle+delta)*58,vx:Math.cos(angle+delta)*300,vy:Math.sin(angle+delta)*300,radius:13,life:3,alive:true,source:m,color:m.color});
  g.emit('monsterSlam',{x:m.x,y:m.y-65,radius:35,color:m.color,boss:true});
 }else if(m.attack==='tornado'){
  const x=m.x+t.dx*72,y=m.y+t.dy*72;
  g.projectiles.push({kind:'tornado',x,y,vx:t.dx*270,vy:t.dy*270,radius:40,life:2.35,age:0,alive:true,source:m,color:m.color,hitActors:new Set()});
  g.emit('tornadoCast',{x,y,color:m.color});
 }else if(m.attack==='dash'){m.phase='charge';m.clock=.45;m.hitActors=new Set();return;}
 m.phase='idle';m.cooldown=m.boss?m.cooldownBase*(m.hp<m.maxHp*.35?.8:1):2.3;
}
function pointLine(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);}
function separateMonster(g,m){
 for(const a of g.actors()){
  const dx=a.x-m.x,dy=(a.y-m.y)/.9,d=Math.hypot(dx,dy),r=m.radius+bodyRadius(a);if(d>=r)continue;
  moveActor(a,(d?dx/d:1)*(r-d+.05),(d?dy/d:0)*.9*(r-d+.05),g.obstacles,bodyRadius(a));
 }
}
export function updateMonsters(g,dt){
 for(let i=0;i<(g.monsters||[]).length;i++){
  let m=g.monsters[i];if(!m.alive){if(g.time>=m.respawnAt){const pos=g.freePoint(700,g.player,m.radius+5);g.monsters[i]=m=makeMonster(g,m.kind,m.boss,pos);g.emit('monsterRespawn',{name:m.name,boss:m.boss});}else continue;}
  const focus=g.targetPlayer?.(m)||g.player;m.active=distance(m,focus)<1450;if(!m.active)continue;m.moving=false;m.cooldownBase??=m.cooldown;
  if(m.phase==='cast'){m.clock-=dt;if(m.clock<=0)resolveAttack(g,m);}
  else if(m.phase==='charge'){
   const t=m.target,old={x:m.x,y:m.y};moveActor(m,t.dx*620*dt,t.dy*620*dt,g.obstacles,m.radius);m.moving=true;m.clock-=dt;
   for(const a of g.actors())if(!m.hitActors.has(a.id)&&pointLine(a,old,m)<m.radius+bodyRadius(a)+5){hurtActor(g,a,m.damage,m);m.hitActors.add(a.id);}
   if(m.clock<=0||distance(old,m)<dt*20){m.phase='idle';m.cooldown=m.cooldownBase;}
  }else{
   m.cooldown-=dt;const target=g.actors().filter(a=>distance(m,a)<(m.boss?m.range:350)&&lineClear(m,a,g.obstacles)).sort((a,b)=>distance(m,a)-distance(m,b))[0];
   if(target){const d=distance(m,target);if(d>(m.boss?155:75))steer(g,m,target,dt);if(m.cooldown<=0&&d<(m.boss?m.range:130))cast(g,m,target);}
   else if(distance(m,focus)<950)steer(g,m,{x:clamp(m.homeX+Math.sin(g.time*.2+m.seed)*90,80,WORLD.width-80),y:clamp(m.homeY+Math.cos(g.time*.17+m.seed)*90,80,WORLD.height-80)},dt);
  }
  separateMonster(g,m);if(g.state!=='playing')return;
 }
 for(const shot of g.projectiles||[]){
  shot.life-=dt;shot.age=(shot.age||0)+dt;const before={x:shot.x,y:shot.y};shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;
  if(shot.life<=0||!lineClear(before,shot,g.obstacles,shot.kind==='tornado'?shot.radius:0)||blocked(shot.x,shot.y,shot.radius,g.obstacles)){shot.alive=false;continue;}
  if(shot.kind==='tornado'){
   for(const a of g.actors())if(!shot.hitActors.has(a.id)&&pointLine(a,before,shot)<shot.radius+bodyRadius(a)){
    shot.hitActors.add(a.id);
    if(hurtActor(g,a,shot.source.damage,shot.source)&&a.alive){
     a.airborne=a.airborneMax=.55;a.dash=0;
     const speed=Math.hypot(shot.vx,shot.vy)||1;moveActor(a,shot.vx/speed*42,shot.vy/speed*42,g.obstacles,bodyRadius(a));
     g.emit('tornadoHit',{actorId:a.id,x:a.x,y:a.y,color:shot.color});
    }
   }
   continue;
  }
  const shape={x:shot.x,y:shot.y,rx:shot.radius,ry:shot.radius};
  for(const a of g.actors()){
   if(distance(combatCenter(a),shot)>ringReach(a)+20)continue;
   if(bladeQuery(a).near(shape,shot.radius,s=>!!bladeHitsShape(s,shape))){shot.alive=false;g.emit('projectileBlock',{x:shot.x,y:shot.y,color:shot.color,actorId:a.id,level:a.weaponTier+1});break;}
   const body=bodyShape(a);if(((shot.x-body.x)/(body.rx+shot.radius))**2+((shot.y-body.y)/(body.ry+shot.radius))**2<=1){hurtActor(g,a,shot.source.damage,shot.source);shot.alive=false;break;}
  }
 }
 g.projectiles=(g.projectiles||[]).filter(p=>p.alive);for(const h of g.hazards||[])h.life-=dt;g.hazards=(g.hazards||[]).filter(h=>h.life>0);
}
