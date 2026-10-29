import{distance,lineClear,moveActor}from'./world.js';
import{bodyRadius,bodyShape,combatCenter,bladePoses,ringReach,swordTier,ensureBlades,moveSpeed}from'./weapons.js';
import{bladeQuery}from'./blade-index.js';
const clamp01=n=>Math.max(0,Math.min(1,n));
function pointDistance(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,t=clamp01(((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1)),qx=ax+dx*t,qy=ay+dy*t;return(px-qx)**2+(py-qy)**2;}
function contactPoint(a,b,c,d){
 const ax=b.x-a.x,ay=b.y-a.y,bx=d.x-c.x,by=d.y-c.y,den=ax*by-ay*bx,cx=c.x-a.x,cy=c.y-a.y;
 if(Math.abs(den)>1e-10){const t=(cx*by-cy*bx)/den,u=(cx*ay-cy*ax)/den;if(t>=0&&t<=1&&u>=0&&u<=1)return{x:a.x+ax*t,y:a.y+ay*t};}
 let best=Infinity,hit;for(const[p,q,r]of[[a,c,d],[b,c,d],[c,a,b],[d,a,b]]){const dx=r.x-q.x,dy=r.y-q.y,t=clamp01(((p.x-q.x)*dx+(p.y-q.y)*dy)/(dx*dx+dy*dy||1)),x=q.x+dx*t,y=q.y+dy*t,ds=(p.x-x)**2+(p.y-y)**2;if(ds<best){best=ds;hit={x:(p.x+x)/2,y:(p.y+y)/2};}}return hit;
}
function segmentTouches(a,b,c,d,rr){
 const ax=b.x-a.x,ay=b.y-a.y,bx=d.x-c.x,by=d.y-c.y,den=ax*by-ay*bx,cx=c.x-a.x,cy=c.y-a.y;
 if(Math.abs(den)>1e-10){const t=(cx*by-cy*bx)/den,u=(cx*ay-cy*ax)/den;if(t>=0&&t<=1&&u>=0&&u<=1)return true;}
 return pointDistance(a.x,a.y,c.x,c.y,d.x,d.y)<=rr||pointDistance(b.x,b.y,c.x,c.y,d.x,d.y)<=rr||pointDistance(c.x,c.y,a.x,a.y,b.x,b.y)<=rr||pointDistance(d.x,d.y,a.x,a.y,b.x,b.y)<=rr;
}
export function bladesContact(a,b){
 const radius=a.radius+b.radius;
 if(a.maxX+radius<b.minX||b.maxX+radius<a.minX||a.maxY+radius<b.minY||b.maxY+radius<a.minY)return null;
 const broad=(a.size+b.size)*.55;if((a.x-b.x)**2+(a.y-b.y)**2>broad*broad)return null;
 const rr=radius*radius;
 for(let i=1;i<a.points.length;i++)for(let j=1;j<b.points.length;j++)if(segmentTouches(a.points[i-1],a.points[i],b.points[j-1],b.points[j],rr)){
  return contactPoint(a.points[i-1],a.points[i],b.points[j-1],b.points[j]);
 }return null;
}
export function bladeHitsShape(s,shape){
 const rx=shape.rx+s.radius,ry=shape.ry+s.radius;
 if(s.maxX+s.radius<shape.x-shape.rx||s.minX-s.radius>shape.x+shape.rx||s.maxY+s.radius<shape.y-shape.ry||s.minY-s.radius>shape.y+shape.ry)return null;
 for(let i=1;i<s.points.length;i++){
  const ax=(s.points[i-1].x-shape.x)/rx,ay=(s.points[i-1].y-shape.y)/ry,bx=(s.points[i].x-shape.x)/rx,by=(s.points[i].y-shape.y)/ry,dx=bx-ax,dy=by-ay,t=clamp01(-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)),x=ax+dx*t,y=ay+dy*t;
  if(x*x+y*y<=1)return{x:shape.x+x*shape.rx,y:shape.y+y*shape.ry};
 }return null;
}
export const friendly=(a,b)=>!!a.faction&&a.faction===b.faction;
export function separateBodies(g,actors=g.actors()){
 const radii=actors.map(bodyRadius);
 for(let pass=0;pass<5;pass++){let overlaps=false;for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
  const a=actors[i],b=actors[j],dx=b.x-a.x,dy=(b.y-a.y)/.9,min=radii[i]+radii[j];if(dx*dx+dy*dy>=min*min)continue;const d=Math.hypot(dx,dy);overlaps=true;
  const nx=d>1e-6?dx/d:1,ny=d>1e-6?dy/d:0,penetration=min-d+.04,ax=a.x,ay=a.y;
  moveActor(a,-nx*penetration*.5,-ny*.9*penetration*.5,g.obstacles,bodyRadius(a));const moved=Math.hypot(a.x-ax,(a.y-ay)/.9);
  moveActor(b,nx*(penetration-moved),ny*.9*(penetration-moved),g.obstacles,bodyRadius(b));
 }if(!overlaps)break;}
}
export function stepCombat(g){
 const actors=g.actors();g.clashes=[];separateBodies(g,actors);const changed=new Set(),contacts=[],deaths=new Map(),info=actors.map(a=>({a,center:combatCenter(a),shape:bodyShape(a),reach:ringReach(a)})),pairs=[];
 for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
  const ia=info[i],ib=info[j];let a=ia.a,b=ib.a;if(friendly(a,b))continue;const ca=ia.center,cb=ib.center,reach=ia.reach+ib.reach;if((ca.x-cb.x)**2+(ca.y-cb.y)**2>reach*reach||!lineClear(ca,cb,g.obstacles))continue;pairs.push([ia,ib]);
  // Probe the weaker side so an invincible high-tier blade never has to sweep
  // the entire opposing ring. Equal tiers stop after one physical interception.
  if(a.weaponTier>b.weaponTier||(a.weaponTier===b.weaponTier&&a.power>b.power))[a,b]=[b,a];
  const qa=bladeQuery(a),qb=bladeQuery(b),pair=[];
  qa.near(combatCenter(b),ringReach(b),s=>{
   if(s.blade.broken)return false;const x=(s.minX+s.maxX)/2,y=(s.minY+s.maxY)/2,rr=Math.hypot(s.maxX-s.minX,s.maxY-s.minY)/2+s.radius;
   qb.near({x,y},rr,t=>{
    const hit=bladesContact(s,t);if(!hit)return false;
    qa.remove(s);changed.add(a);const both=a.weaponTier===b.weaponTier;if(both){qb.remove(t);changed.add(b);}
    pair.push({a:a.id,b:b.id,x:hit.x,y:hit.y,color:swordTier(a).color,colorB:swordTier(b).color,amountA:1,amountB:both?1:0,ax:a.x,ay:a.y,bx:b.x,by:b.y,bladeA:s.id,bladeB:t.id,level:Math.max(a.weaponTier,b.weaponTier)+1});return true;
   },true);return false;
  });
  if(pair.length){g.clashes.push(pair[0]);if(pair.length<=24)contacts.push(...pair);else{const bins=new Map();for(const c of pair){const key=Math.floor(c.x/70)+':'+Math.floor(c.y/70);if(!bins.has(key))bins.set(key,{...c,amountA:0,amountB:0});const bin=bins.get(key);bin.amountA+=c.amountA;bin.amountB+=c.amountB;}contacts.push(...bins.values());}}
 }
 // Shattered blades cannot stab a body during this step. Skip allies in camps.
 for(const pair of pairs)for(let direction=0;direction<2;direction++){
  const ia=pair[direction],ib=pair[1-direction],a=ia.a,b=ib.a;if(!a.alive||!b.alive)continue;const center=ia.center,target=ib.shape,r=ia.reach+Math.max(target.rx,target.ry);
  if((center.x-target.x)**2+(center.y-target.y)**2>r*r)continue;
  bladeQuery(a).near(target,Math.max(target.rx,target.ry),s=>{const hit=bladeHitsShape(s,target);if(!hit)return false;if(!deaths.has(b.id))deaths.set(b.id,{victim:b,attacker:a,hit});return true;});
 }
 for(const a of changed){const before=a.power;a.blades=ensureBlades(a).filter(s=>!s.broken);a.power=a.blades.length;if(g.recordLoss)g.recordLoss(a,before-a.power);if(a===g.player){g.recentLoss+=before-a.power;g.lastCombat=g.time;}}
 for(const c of contacts)g.emit('clash',c);
 if(contacts.length){g.lastContacts=g.clashes;g.contactUntil=g.time+.12;}else if(g.time<(g.contactUntil||0))g.clashes=g.lastContacts||[];
 for(const{victim,attacker,hit}of deaths.values()){g.emit('bodyHit',{actorId:victim.id,x:hit.x,y:hit.y,color:swordTier(attacker).color,level:attacker.weaponTier+1});g.eliminate(victim,attacker,'blade');}
}

// An isolated huge ring must not force fine substeps across the entire camp.
// Include a swept movement margin so approaching enemies are never skipped.
export function needsBladeSubsteps(g,a,dt){
 if(a.power<=256)return true;
 const center=combatCenter(a),reach=ringReach(a),travel=moveSpeed(a)*3.15*dt+12;
 for(const b of g.actors())if(a!==b&&!friendly(a,b)&&distance(center,combatCenter(b))<reach+ringReach(b)+travel+moveSpeed(b)*3.15*dt)return true;
 for(const m of g.monsters||[])if(m.alive&&distance(center,{x:m.x,y:m.y-m.height*.48})<reach+m.height+travel+620*dt)return true;
 for(const c of g.chests)if(c.alive&&distance(center,c)<reach+100+travel)return true;
 for(const o of g.obstacles)if(o.destructible&&distance(center,{x:o.x+o.w/2,y:o.y+o.h/2})<reach+Math.hypot(o.w,o.h)+travel)return true;
 for(const s of g.projectiles||[])if(s.alive&&distance(center,s)<reach+s.radius+travel+Math.hypot(s.vx,s.vy)*dt)return true;
 return false;
}
