import{clamp}from'./world.js';
export const TIERS=[
 ['Ngân nguyệt','#e9f5ff'],['Kim nguyệt','#ffe17a'],['Ngọc nguyệt','#8bef83'],
 ['Băng nguyệt','#7ee8ff'],['Lam tinh','#91adff'],['Tử điện','#cf9aff'],
 ['Huyết nguyệt','#ff717a'],['Hồng liên','#ffa0e6'],['Long viêm','#ffb75f'],
 ['Hắc sát','#ff5979'],['Thiên quang','#fff1bd'],['Vô cực','#a9ffe6']
].map(([name,color],i)=>({name,color,sprite:'blade'+i,level:i+1}));
export const swordTier=a=>TIERS[clamp(a.weaponTier??0,0,11)];
export const swordCount=a=>Math.max(0,Math.floor(typeof a==='number'?a:a.power));
export const actorScale=a=>.68+Math.log2(1+Math.max(0,a.power))*.14;
export const moveSpeed=a=>(170+(swordTier(a).level-1)*22+Math.log2(1+Math.max(0,a.power))*5)*(a.haste>0?1.55:1);
export const attackMultiplier=a=>a.rage>0?2:1;
export const rotationSpeed=a=>.65+Math.log2(1+Math.max(0,typeof a==='number'?a:a.power))*.65;
export const bodyRadius=a=>25*actorScale(a);
export const bladeSize=a=>124+Math.log2(1+Math.max(0,a.power))*2+(swordTier(a).level-1)*2;
export const ringRadius=a=>{if(typeof a==='number')a={power:a,weaponTier:0};return(42*actorScale(a)+bladeSize(a)*.4+8)/.9;};
export const combatCenter=a=>({x:a.x,y:a.y-54*actorScale(a)});
export const bodyShape=a=>({x:a.x,y:a.y-54*actorScale(a),rx:24*actorScale(a),ry:42*actorScale(a)});
export const bladeCount=power=>swordCount(power);
const BLADE_POINTS=[[.28,-.35],[-.13,-.34],[-.34,-.19],[-.4,.08],[-.19,.33],[.29,.35]];
const CHORD_ANGLE=Math.atan2(.7,.01),CHORD_X=.285;
let nextBladeId=1;
export const bladeIdState=()=>nextBladeId;
export const restoreBladeId=n=>{nextBladeId=Math.max(nextBladeId,Number(n)||1);};
export function arm(a,count=a.power){count=Math.max(0,Math.floor(count));a.power=count;a.blades=Array.from({length:count},(_,i)=>({id:nextBladeId++,offset:i*Math.PI*2/Math.max(1,count)}));return a.blades;}
export function ensureBlades(a){if(!a.blades||a.blades.length!==swordCount(a))arm(a);return a.blades;}
export function bladeGeometry(a){return{r:ringRadius(a),center:combatCenter(a),size:bladeSize(a),sin:Math.sin(a.angle),cos:Math.cos(a.angle)};}
export function bladePose(a,b,geometry=null,includePoints=true,reuse=null){
 const phase=a.angle+b.offset,g=geometry||bladeGeometry(a),{r,center,size}=g,co=b._offset===b.offset?b._cos:Math.cos(b.offset),si=b._offset===b.offset?b._sin:Math.sin(b.offset);b._offset=b.offset;b._cos=co;b._sin=si;
 const pc=g.cos*co-g.sin*si,ps=g.sin*co+g.cos*si,len=Math.hypot(pc,ps*.9),bc=pc/len,bs=ps*.9/len,cc=Math.cos(CHORD_ANGLE),cs=Math.sin(CHORD_ANGLE),c=bc*cc+bs*cs,s=bs*cc-bc*cs,rot=includePoints?0:Math.atan2(s,c);
 const x=center.x+pc*r-CHORD_X*c*size,y=center.y+ps*r*.9-CHORD_X*s*size;
 const out=reuse||{},points=includePoints?(out.points||BLADE_POINTS.map(()=>({x:0,y:0}))):null;
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 if(points)for(let i=0;i<6;i++){const[px,py]=BLADE_POINTS[i],p=points[i];p.x=x+(px*c-py*s)*size;p.y=y+(px*s+py*c)*size;minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
 Object.assign(out,{id:b.id,blade:b,actor:a,x,y,phase,rot:includePoints?Math.atan2(s,c):rot,size,radius:size*.075,points,minX,minY,maxX,maxY});return out;
}
export function bladePoses(a){return ensureBlades(a).map(b=>bladePose(a,b));}
export function ringReach(a){const size=bladeSize(a);return Math.hypot(ringRadius(a)+size*.36,size*.7)+size*.075;}
