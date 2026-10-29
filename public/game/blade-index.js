import{ensureBlades,bladeGeometry,bladePose}from'./weapons.js';
const TAU=Math.PI*2,wrap=n=>(n%TAU+TAU)%TAU;
// Sorted surviving offsets allow conservative angular queries. Every returned
// blade still uses its exact capsule geometry; this is not a sampled collider.
export class BladeQuery{
 constructor(a){this.actor=a;this.blades=ensureBlades(a);this.geometry=bladeGeometry(a);this.x=a.x;this.y=a.y;this.angle=a.angle;this.power=a.power;this.tier=a.weaponTier;this.poses=[];this.next=null;this.poseCount=0;}
 live(i){if(!this.next)return i;let j=i;while(this.next[j]!==j)j=this.next[j];while(i!==j){const n=this.next[i];this.next[i]=j;i=n;}return j;}
 remove(s){if(!this.next){this.next=new Int32Array(this.blades.length+1);for(let i=0;i<this.next.length;i++)this.next[i]=i;}s.blade.broken=true;this.next[s.index]=this.live(s.index+1);}
 pose(i){if(!this.poses[i]){const b=this.blades[i],p=bladePose(this.actor,b,this.geometry,true,b._pose);b._pose=p;p.index=i;this.poses[i]=p;this.poseCount++;}return this.poses[i];}
 lower(v){let lo=0,hi=this.blades.length;while(lo<hi){const m=(lo+hi)>>>1;if(this.blades[m].offset<v)lo=m+1;else hi=m;}return lo;}
 range(lo,hi,fn){const end=this.lower(hi+1e-9);for(let i=this.live(this.lower(lo-1e-9));i<end;i=this.live(i+1)){if(this.blades[i].broken)continue;if(fn(this.pose(i)))return true;}return false;}
 near(target,radius,fn,preferred=false){
  const{center,r,size}=this.geometry,dx=target.x-center.x,dy=(target.y-center.y)/.9,d=Math.hypot(dx,dy),R=(radius+size*.78)/.9;
  if(d-R>r||d+R<r)return false;
  if(d<1e-9||R>=d+r)return this.range(0,TAU,fn);
  const half=Math.acos(Math.max(-1,Math.min(1,(r*r+d*d-R*R)/(2*r*d)))),mid=wrap(Math.atan2(dy,dx)-this.angle),lo=mid-half,hi=mid+half;
  if(preferred&&mid>.08&&mid<TAU-.08&&this.range(Math.max(lo,mid-.08),Math.min(hi,mid+.08),fn))return true;
  if(lo<0)return this.range(0,hi,fn)||this.range(lo+TAU,TAU,fn);
  if(hi>=TAU)return this.range(0,hi-TAU,fn)||this.range(lo,TAU,fn);
  return this.range(lo,hi,fn);
 }
}
export function bladeQuery(a){const q=a._bladeQuery;if(q&&q.blades===a.blades&&q.x===a.x&&q.y===a.y&&q.angle===a.angle&&q.power===a.power&&q.tier===a.weaponTier)return q;return a._bladeQuery=new BladeQuery(a);}
