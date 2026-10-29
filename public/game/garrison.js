import{CAMP_CENTER,distance,lineClear,moveActor,findPath}from'./world.js';
import{unlockedTier}from'./progression.js';
import{bodyRadius,moveSpeed}from'./weapons.js';
export const garrisonTier=(time,role,layer=0)=>Math.min(11,unlockedTier(time)+(role==='lord'?3:layer+1));
export function initGarrison(g){
 g.camp=null;if(!g.map.elite)return;const hard=g.mapIndex===4,faction='camp-'+g.mapIndex,cap=unlockedTier(g.time);
 g.camp={...CAMP_CENTER,radius:850,faction,dispatch:0,guardIds:[],lordId:null,mapTier:cap};
 const lord=g.addNpc({x:g.camp.x,y:g.camp.y,name:hard?'Hỏa Thiên Tôn':'Vô Cực Tôn Giả',skin:hard?4:5,power:9999,weaponTier:garrisonTier(g.time,'lord'),elite:true,bold:true,role:'lord',faction,intent:'Trấn giữ',order:'hold',collect:false});g.camp.lordId=lord.id;
 for(const[layer,count,radius,power]of[[0,14,850,24],[1,8,500,90]])for(let i=0;i<count;i++){
  const angle=i*Math.PI*2/count+(layer?.18:0),x=g.camp.x+Math.cos(angle)*radius,y=g.camp.y+Math.sin(angle)*radius;
  const n=g.addNpc({x,y,name:layer?'Cận vệ '+(i+1):'Tiền vệ '+(i+1),skin:layer?(hard?1:5):(i+2)%6,power,weaponTier:garrisonTier(g.time,'guard',layer),elite:layer===1&&i===0,bold:true,role:'guard',faction,layer,slot:i,order:'hold',intent:layer?'Giữ vòng trong':'Giữ vòng ngoài',collect:false});g.camp.guardIds.push(n.id);
 }
}
export function updateGarrison(g,dt){
 const c=g.camp;if(!c)return;
 const guards=g.npcs.filter(n=>n.alive&&n.role==='guard'),p=g.targetPlayer?.(c)||g.player;
 for(const n of guards)if(n.order==='attack'&&(distance(p,c)>1380||distance(n,c)>1350||distance(p,n)>760)){n.order='return';n.path=[];n.intent='Về đội hình';}
 c.dispatch-=dt;if(c.dispatch>0||!p.alive||distance(p,c)>1220)return;
 if(guards.filter(n=>n.order==='attack').length>=3)return;
 const layer=guards.some(n=>n.layer===0)?0:1;
 const candidates=guards.filter(n=>n.layer===layer&&n.order==='hold'&&distance(n,p)<650&&lineClear(n,p,g.obstacles));candidates.sort((a,b)=>distance(a,p)-distance(b,p));
 const n=candidates[0];if(n){n.order='attack';n.intent='Nghênh chiến';c.dispatch=1.6;g.emit('guardAdvance',{x:n.x,y:n.y,name:n.name});}
}
export function steerGarrison(g,n,dt){
 n.moving=false;if(n.airborne>0)return;
 if(n.role==='lord'){n.intent='Thống lĩnh · Trấn giữ';return;}
 const home={x:n.homeX,y:n.homeY};let goal=n.order==='attack'?(g.targetPlayer?.(n)||g.player):home,d=distance(n,goal);
 if(n.order!=='attack'&&d<12){n.order='hold';n.intent=n.layer?'Giữ vòng trong':'Giữ vòng ngoài';return;}
 n.intent=n.order==='attack'?'Nghênh chiến':'Về đội hình';if(d<5)return;
 if(!lineClear(n,goal,g.obstacles,bodyRadius(n)+3)){n.pathTimer-=dt;if(n.pathTimer<=0){n.path=findPath(n,goal,g.obstacles,bodyRadius(n)+5);n.pathTimer=1;}while(n.path.length&&distance(n,n.path[0])<20)n.path.shift();if(!n.path.length)return;goal=n.path[0];d=distance(n,goal);}
 const dx=(goal.x-n.x)/d,dy=(goal.y-n.y)/d;n.vx=dx;n.vy=dy;n.facing=dx<0?-1:1;n.moving=true;
 moveActor(n,dx*moveSpeed(n)*.84*dt,dy*moveSpeed(n)*.84*dt,g.obstacles,bodyRadius(n));
}
