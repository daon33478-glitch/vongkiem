import{distance,lineClear}from'./world.js';
import{combatCenter}from'./weapons.js';
// Short celebrations never modify combat stats. Loot picked immediately after a
// kill waits for the smirk to finish, so both requested expressions are visible.
export function celebrate(g,phase){
 if(!g.player.alive)return;
 if(phase==='delight'&&g.celebration?.phase==='smirk'){g.celebration.next='delight';return;}
 g.reaction=null;g.celebration={phase,left:phase==='smirk'?2.2:2.8};g.player.emotion=phase;
}
export function pickupReaction(g,value,upgraded=false){
 const combo=g.pickupJoy;
 g.pickupJoy={count:(combo&&g.time-combo.at<=2.5?combo.count:0)+value,at:g.time};
 if(upgraded||value>=6||g.pickupJoy.count>=8){g.pickupJoy.count=0;celebrate(g,'delight');}
}
export function updateReaction(g,dt){
 const p=g.player;if(!p.alive)return;const rivals=g.reactionActors?.()||g.npcs;
 const happy=g.celebration;if(happy){happy.left-=dt;if(happy.left<=0){if(happy.next){g.celebration=null;celebrate(g,happy.next);}else{g.celebration=null;p.emotion=null;}}}
 let r=g.reaction;
 if(!g.panicTriggered){
  const s=g.sight,candidates=rivals.filter(n=>n!==p&&n.alive&&n.power>0&&n.weaponTier>(p.power?p.weaponTier:-1)&&distance(n,p)<650&&lineClear(n,p,g.obstacles)&&(!s||Math.abs(n.x-s.x)<s.w/2+20&&Math.abs(combatCenter(n).y-s.y)<s.h/2+20));
  candidates.sort((a,b)=>distance(a,p)-distance(b,p));const n=candidates[0];if(!n)return;
  g.panicTriggered=true;g.celebration=null;r=g.reaction={phase:'shock',left:1.15,window:10,threatId:n.id,x:n.x,y:n.y};p.emotion='shock';g.emit('panic',{x:p.x,y:p.y,enemy:n.name,level:n.weaponTier+1});
 }
 if(!r)return;const n=rivals.find(n=>n.id===r.threatId&&n.alive);if(n){r.x=n.x;r.y=n.y;}
 r.left-=dt;r.window-=dt;
 if(r.phase==='shock'&&r.left<=0){r.phase='worried';p.emotion='worried';}
 if(r.phase==='worried'&&p.moving){const dx=p.x-r.x,dy=p.y-r.y;if((dx*p.vx+dy*p.vy)/Math.max(1,Math.hypot(dx,dy))>.15){r.phase='cry';r.left=4.2;p.emotion='cry';g.emit('panicRun',{x:p.x,y:p.y});}}
 if(r.phase==='cry'&&r.left<=0||r.window<=0){p.emotion=null;g.reaction=null;}
}
