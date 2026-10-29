import{bladeQuery}from'./blade-index.js';
import{blocked,distance,lineClear,clamp,START,CAMP_CENTER}from'./world.js';
import{combatCenter,ringReach,swordTier,attackMultiplier}from'./weapons.js';
function segmentBox(a,b,o,r){
 let lo=0,hi=1;for(const[start,delta,min,max]of[[a.x,b.x-a.x,o.x-r,o.x+o.w+r],[a.y,b.y-a.y,o.y-r,o.y+o.h+r]]){
  if(Math.abs(delta)<1e-8){if(start<min||start>max)return null;}else{let t1=(min-start)/delta,t2=(max-start)/delta;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);}
 }if(lo>hi||lo>1||hi<0)return null;return{x:clamp(a.x+(b.x-a.x)*lo,o.x,o.x+o.w),y:clamp(a.y+(b.y-a.y)*lo,o.y,o.y+o.h)};
}
export function bladeHitsBox(blade,o){for(let i=1;i<blade.points.length;i++){const hit=segmentBox(blade.points[i-1],blade.points[i],o,blade.radius);if(hit)return hit;}return null;}
export function initBreakables(g){
 for(const o of g.obstacles)if((o.kind==='rock'||o.kind==='crystal')&&o.w<190)Object.assign(o,{destructible:true,hp:360+g.map.difficulty*80,maxHp:360+g.map.difficulty*80,flash:0,hitTimes:new Map()});
 for(const[x,y]of[[START.x-320,START.y-280],[START.x+250,START.y-280],[1860,1660],[3700,1940],[650,2670],[3260,3120]]){
  if((g.mapIndex===3||g.mapIndex===4)&&distance({x:x+35,y:y+35},CAMP_CENTER)<1080)continue;
  if(blocked(x+35,y+35,52,g.obstacles))continue;
  const hp=150+g.map.difficulty*45;g.obstacles.push({x,y,w:70,h:70,kind:'crate',destructible:true,hp,maxHp:hp,flash:0,hitTimes:new Map()});
 }
}
export function updateBreakables(g,dt){
 for(const o of [...g.obstacles]){
  if(!o.destructible||o.hp<=0)continue;o.flash=Math.max(0,o.flash-dt);o.hitTimes??=new Map();
  const center={x:o.x+o.w/2,y:o.y+o.h/2},others=g.obstacles.filter(p=>p!==o);
  for(const a of g.actors()){
   if(!a.power||distance(combatCenter(a),center)>ringReach(a)+Math.hypot(o.w,o.h)*.5)continue;
   bladeQuery(a).near(center,Math.hypot(o.w,o.h)*.5,blade=>{
    if(g.time-(o.hitTimes.get(blade.id)??-10)<.25)return false;
    const hit=bladeHitsBox(blade,o);if(!hit||!lineClear(combatCenter(a),hit,others))return false;
    o.hitTimes.set(blade.id,g.time);o.hp=Math.max(0,o.hp-(12+swordTier(a).level*7)*attackMultiplier(a));o.flash=.18;g.emit('propHit',{...hit,actorId:a.id,kind:o.kind,level:a.weaponTier+1});
    if(o.hp<=0){g.obstacles=g.obstacles.filter(p=>p!==o);for(const n of g.npcs){n.path=[];n.pathTimer=0;}for(const m of g.monsters||[]){m.path=[];m.pathTimer=0;}g.emit('propBreak',{...center,kind:o.kind});return true;}return false;
   });
   if(o.hp<=0)break;
  }
  if(o.hitTimes.size>200)for(const[id,t]of o.hitTimes)if(g.time-t>2)o.hitTimes.delete(id);
 }
}
