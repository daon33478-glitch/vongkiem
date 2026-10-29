export const WORLD={width:4400,height:4800};
export const START={x:2200,y:4450};
export const CAMP_CENTER={x:3100,y:1350};
export const MAPS=[
 {id:'meadow',name:'Thảo Nguyên',subtitle:'Đồng cỏ · Dễ khởi đầu',biome:'grass',floor:'#819d56',ink:'#496345',accent:'#c3e58b',difficulty:0,elite:false},
 {id:'frost',name:'Băng Nguyên',subtitle:'Slime băng · Boss Doraemon',biome:'ice',floor:'#badce7',ink:'#789eb8',accent:'#b5f4ff',difficulty:1,elite:false},
 {id:'ruins',name:'Cổ Thành',subtitle:'Tường đá · Boss Yasuo',biome:'stone',floor:'#a79b7b',ink:'#6d6957',accent:'#e8cc8b',difficulty:1,elite:false},
 {id:'astral',name:'Tử Vân Giới',subtitle:'Master Yi · Đại quân 9.999 kiếm',biome:'astral',floor:'#7466a5',ink:'#453b6f',accent:'#e3b5ff',difficulty:2,elite:true},
 {id:'ember',name:'Hỏa Diệm Sơn',subtitle:'Son Goku · Đại quân 9.999 kiếm',biome:'lava',floor:'#665352',ink:'#342d3c',accent:'#ffb36b',difficulty:3,elite:true}
];
export const CHARACTERS=[{name:'Nobita',color:'#ffe08b'},{name:'Chaien',color:'#ffa863'},{name:'Xuka',color:'#ffb1d5'},{name:'Xeko',color:'#80ded9'},{name:'Hỏa Phong',color:'#ff8171'},{name:'Bạch Vũ',color:'#d9c8ff'},{name:'Ma Tôn',color:'#d898b4',group:'new'},{name:'Bà Chủ Trọ',color:'#bde2eb',group:'new'},{name:'Đại Ca Rìu',color:'#c8d0dd',group:'new'},{name:'Son Goku',color:'#ffc26e',group:'boss'},{name:'Doraemon',color:'#76dcff',group:'boss'},{name:'Yasuo',color:'#a6e3ff',group:'boss'},{name:'Master Yi',color:'#c1ff86',group:'boss'}];
export function layout(index){
 const out=[],rect=(x,y,w,h,kind)=>out.push({x,y,w,h,kind});
 if(index===0){rect(250,490,310,180,'pond');rect(1560,1470,380,220,'pond');rect(1610,510,130,140,'tree');rect(1715,560,150,140,'tree');rect(360,1510,140,150,'tree');rect(465,1460,140,160,'tree');rect(925,1120,150,95,'rock');}
 if(index===1){rect(420,620,510,125,'ice');rect(1270,620,500,125,'ice');rect(680,1080,135,610,'ice');rect(1400,1040,135,610,'ice');rect(920,1530,300,125,'ice');rect(260,1790,290,150,'ice');rect(1750,1730,210,150,'ice');}
 if(index===2){rect(300,1720,540,110,'wall');rect(1360,1720,540,110,'wall');rect(480,740,120,610,'wall');rect(1600,740,120,610,'wall');rect(810,1080,580,105,'wall');rect(750,440,700,110,'wall');rect(320,410,120,120,'pillar');rect(1780,410,120,120,'pillar');}
 if(index===3){for(const[x,y]of[[520,650],[1560,650],[520,1550],[1560,1550],[970,1040]])rect(x,y,130,135,'crystal');rect(780,500,640,85,'rune');rect(300,1120,320,100,'rune');rect(1580,1120,320,100,'rune');}
 if(index===4){rect(260,650,610,150,'lava');rect(1330,650,610,150,'lava');rect(620,1040,150,650,'lava');rect(1430,1040,150,650,'lava');rect(925,1420,340,130,'lava');rect(220,1840,330,130,'rock');rect(1670,1840,330,130,'rock');}
 for(const o of out){o.x*=2;o.y*=2;o.w*=1.15;o.h*=1.15;}
 // Keep a clear circular courtyard for the lord and the two defensive rings.
 if(index>=3)for(let i=out.length-1;i>=0;i--){const o=out[i],dx=CAMP_CENTER.x-clamp(CAMP_CENTER.x,o.x,o.x+o.w),dy=CAMP_CENTER.y-clamp(CAMP_CENTER.y,o.y,o.y+o.h);if(Math.hypot(dx,dy)<1080)out.splice(i,1);}
 return out;
}
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const distance=(a,b)=>{const dx=a.x-b.x,dy=a.y-b.y;return Math.sqrt(dx*dx+dy*dy);};
export function blocked(x,y,r,obstacles){
 if(x<r+35||y<r+35||x>WORLD.width-r-35||y>WORLD.height-r-35)return true;
 return obstacles.some(o=>{const dx=x-clamp(x,o.x,o.x+o.w),dy=y-clamp(y,o.y,o.y+o.h);return dx*dx+dy*dy<r*r||(x>=o.x&&x<=o.x+o.w&&y>=o.y&&y<=o.y+o.h);});
}
export function lineClear(a,b,obstacles,r=0){
 // Slab intersection against expanded bounds; no hits or pickup magnets through walls.
 const dx=b.x-a.x,dy=b.y-a.y,vertical=Math.abs(dx)<1e-8,horizontal=Math.abs(dy)<1e-8;
 for(const o of obstacles){let lo=0,hi=1;
  if(vertical){if(a.x<o.x-r||a.x>o.x+o.w+r)continue;}
  else{const t1=(o.x-r-a.x)/dx,t2=(o.x+o.w+r-a.x)/dx;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)continue;}
  if(horizontal){if(a.y<o.y-r||a.y>o.y+o.h+r)continue;}
  else{const t1=(o.y-r-a.y)/dy,t2=(o.y+o.h+r-a.y)/dy;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
  if(lo<=hi)return false;
 }return true;
}
export function moveActor(a,dx,dy,obstacles,r=22){
 // Swept steps stop high-speed dashes at walls instead of tunneling.
 // Growth can enlarge a body next to a wall; project it out before moving.
 a.x=clamp(a.x,r+35,WORLD.width-r-35);a.y=clamp(a.y,r+35,WORLD.height-r-35);
 for(let pass=0;pass<3;pass++)for(const o of obstacles){
  const qx=clamp(a.x,o.x,o.x+o.w),qy=clamp(a.y,o.y,o.y+o.h),vx=a.x-qx,vy=a.y-qy,squared=vx*vx+vy*vy;
  if(squared>=r*r)continue;const d=Math.sqrt(squared);
  if(d>.0001){a.x=qx+vx/d*(r+.01);a.y=qy+vy/d*(r+.01);}
  else{const sides=[{v:Math.abs(a.x-o.x),x:o.x-r-.01,y:a.y},{v:Math.abs(a.x-o.x-o.w),x:o.x+o.w+r+.01,y:a.y},{v:Math.abs(a.y-o.y),x:a.x,y:o.y-r-.01},{v:Math.abs(a.y-o.y-o.h),x:a.x,y:o.y+o.h+r+.01}].sort((a,b)=>a.v-b.v);a.x=sides[0].x;a.y=sides[0].y;}
 }
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/10));for(let i=0;i<steps;i++){const x=a.x+dx/steps,y=a.y+dy/steps;if(!blocked(x,a.y,r,obstacles))a.x=x;if(!blocked(a.x,y,r,obstacles))a.y=y;}
}
export function findPath(start,goal,obstacles,r=30){
 if(lineClear(start,goal,obstacles,r))return[goal];
 const step=90,cols=Math.floor(WORLD.width/step),rows=Math.floor(WORLD.height/step),cell=p=>[clamp(Math.floor(p.x/step),0,cols-1),clamp(Math.floor(p.y/step),0,rows-1)],point=id=>({x:(id%cols+.5)*step,y:(Math.floor(id/cols)+.5)*step});
 const[sx,sy]=cell(start),[gx,gy]=cell(goal);let from=sy*cols+sx,near=Infinity;
 for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const cx=sx+dx,cy=sy+dy;if(cx<0||cy<0||cx>=cols||cy>=rows)continue;const id=cy*cols+cx,p=point(id),d=distance(start,p);if(d<near&&!blocked(p.x,p.y,r,obstacles)&&lineClear(start,p,obstacles,r)){from=id;near=d;}}
 if(!Number.isFinite(near))return[];
 const to=gy*cols+gx,queue=[from],prev=new Map([[from,-1]]);let best=from,bestD=distance(point(from),goal);
 for(let q=0;q<queue.length;q++){const id=queue[q];if(id===to){best=id;break;}const x=id%cols,y=Math.floor(id/cols);
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,n=ny*cols+nx;if(nx<0||ny<0||nx>=cols||ny>=rows||prev.has(n))continue;const p=point(n);if(blocked(p.x,p.y,r,obstacles)||!lineClear(point(id),p,obstacles,r))continue;prev.set(n,id);queue.push(n);const d=distance(p,goal);if(d<bestD){bestD=d;best=n;}}
 }
 const path=[];for(let id=best;id!==from&&id!==-1;id=prev.get(id)??-1)path.push(point(id));path.reverse();if(distance(start,point(from))>12)path.unshift(point(from));if(best===to&&lineClear(path.at(-1)||start,goal,obstacles,r))path.push(goal);return path;
}
