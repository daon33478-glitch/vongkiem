import{blocked,distance,lineClear}from'./world.js';
import{actorScale}from'./weapons.js';
export const ITEMS={portal:{name:'Cổng',full:'Cổng dịch chuyển',color:'#c297ff',icon:'portal'},haste:{name:'Tăng tốc',full:'Tăng tốc',color:'#7fe2c3',icon:'dash'},rage:{name:'Cuồng nộ',full:'Cuồng nộ',color:'#ffab58',icon:'fire'}};
export const ITEM_CHANCE={chest:.3,rareChest:.45,boss:.8};
export function dropItem(g,x,y,source){
 if(g.rng()>=(ITEM_CHANCE[source]||0))return null;
 const kinds=Object.keys(ITEMS),kind=kinds[Math.min(2,Math.floor(g.rng()*3))],angle=g.rng()*Math.PI*2;let pos={x:x+Math.cos(angle)*48,y:y+Math.sin(angle)*48};if(blocked(pos.x,pos.y,20,g.obstacles))pos={x,y};
 const item={id:'item-'+(++g.id),kind,...pos,life:90,alive:true};g.itemDrops.push(item);g.emit('itemDrop',{...pos,kind});return item;
}
export function updateItems(g,dt){
 const p=g.player;p.haste=Math.max(0,(p.haste||0)-dt);p.rage=Math.max(0,(p.rage||0)-dt);
 for(const item of g.itemDrops){item.life-=dt;if(item.life<=0){item.alive=false;continue;}const d=distance(item,p);if(!p.alive||d>125||!lineClear(item,p,g.obstacles,3))continue;
  const f=Math.min(1,dt*11);item.x+=(p.x-item.x)*f;item.y+=(p.y-item.y)*f;
  if(distance(item,p)<26*actorScale(p)){item.alive=false;g.inventory[item.kind]++;g.emit('itemPickup',{x:p.x,y:p.y,kind:item.kind});}
 }
 g.itemDrops=g.itemDrops.filter(i=>i.alive);
}
export function useItem(g,kind){
 if(!ITEMS[kind]||g.state!=='playing'||g.introPlaying||!g.player.alive||!g.inventory[kind])return false;
 if(kind==='portal'){if(!g.spawnPortal('item'))return false;}
 else{if(g.player[kind]>0)return false;g.player[kind]=10;}
 g.inventory[kind]--;g.emit('itemUse',{kind,x:g.player.x,y:g.player.y});return true;
}
