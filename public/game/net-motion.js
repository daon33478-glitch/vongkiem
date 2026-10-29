import {clamp,distance,moveActor} from './world.js';
import {bodyRadius,moveSpeed,rotationSpeed,actorScale} from './weapons.js';
const TAU=Math.PI*2;
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const wrap=a=>(a%TAU+TAU)%TAU;
const spin=actor=>Number.isFinite(actor.power)?rotationSpeed(actor):0;

// Predicted movement has its own position. Authoritative replies correct the
// acknowledged input sample, then retain movement already made after that sample.
export class PlayerPrediction{
 constructor(actor){this.reset(actor);}
 reset(actor){this.actor={...actor};this.phase=actor.angle||0;this.samples=new Map();this.ack=0;this.offset={x:0,y:0,angle:0};this.pendingDash=0;}
 remember(seq){const p=this.actor;this.samples.set(seq,{x:p.x,y:p.y,phase:this.phase});while(this.samples.size>96)this.samples.delete(this.samples.keys().next().value);}
 reconcile(auth){
  const before=this.render(),old=this.actor,ack=auth.inputSeq||0,sample=this.samples.get(ack);
  const pendingDash=this.pendingDash>(auth.appliedAction||0);
  this.actor={...auth,x:old.x,y:old.y,angle:old.angle,walkPhase:old.walkPhase};
  if(pendingDash){this.actor.dash=old.dash;this.actor.dashCooldown=old.dashCooldown;this.actor.vx=old.vx;this.actor.vy=old.vy;}
  else this.pendingDash=0;
  if(!auth.alive){this.reset(auth);return;}
  if(ack<=this.ack)return;
  this.ack=ack;
  if(sample){
   const correction={x:auth.x-sample.x,y:auth.y-sample.y},turn=angleDelta(auth.angle,sample.phase);
   this.actor.x=old.x+correction.x;this.actor.y=old.y+correction.y;this.phase+=turn;
   for(const [seq,point]of this.samples){if(seq<=ack)this.samples.delete(seq);else{point.x+=correction.x;point.y+=correction.y;point.phase+=turn;}}
  }else{this.actor.x=auth.x;this.actor.y=auth.y;this.phase+=angleDelta(auth.angle,this.phase);}
  this.actor.angle=wrap(this.phase);
  const error=distance(before,this.actor);
  this.offset=error<220?{x:before.x-this.actor.x,y:before.y-this.actor.y,angle:angleDelta(before.angle,this.actor.angle)}:{x:0,y:0,angle:0};
 }
 dash(x,y,seq){const p=this.actor,len=Math.hypot(x,y);if(len>.05){p.vx=x/len;p.vy=y/len;}p.dash=.26;p.dashCooldown=3.2;this.pendingDash=seq;}
 step(dt,input,obstacles,ready=true){
  const p=this.actor;let left=Math.min(.12,Math.max(0,dt));
  while(left>1e-8){const step=Math.min(1/60,left);left-=step;
   if(p.alive&&ready){
    this.phase+=rotationSpeed(p)*step;p.angle=wrap(this.phase);p.dashCooldown=Math.max(0,(p.dashCooldown||0)-step);
    let x=p.airborne>0?0:input.x||0,y=p.airborne>0?0:input.y||0,len=Math.max(1,Math.hypot(x,y));x/=len;y/=len;p.moving=Math.hypot(x,y)>.08;
    if(p.moving){p.vx=x;p.vy=y;if(Math.abs(x)>.1)p.facing=x<0?-1:1;}if(p.dash>0){x=p.vx;y=p.vy;p.moving=true;}
    const before={x:p.x,y:p.y};moveActor(p,x*moveSpeed(p)*(p.dash>0?3.15:1)*step,y*moveSpeed(p)*(p.dash>0?3.15:1)*step,obstacles,bodyRadius(p));
    p.walkPhase=((p.walkPhase||0)+distance(before,p)*.085/actorScale(p))%TAU;
    for(const key of['dash','haste','rage','airborne','pickupAura'])p[key]=Math.max(0,(p[key]||0)-step);
   }
   const decay=Math.exp(-step*10);this.offset.x*=decay;this.offset.y*=decay;this.offset.angle*=decay;
  }
 }
 render(){return{...this.actor,x:this.actor.x+this.offset.x,y:this.actor.y+this.offset.y,angle:wrap(this.phase+this.offset.angle)};}
}

// Interpolation uses received frames rather than repeated easing toward an old
// point. A small, bounded extrapolation bridges occasional late packets.
export class RemoteTimeline{
 constructor(){this.frames=[];}
 push(actor,time,received){
  const last=this.frames.at(-1);let phase=actor.angle||0;
  if(last){const expected=last.phase+spin(last.actor)*Math.max(0,time-last.time);phase=expected+angleDelta(phase,expected);}
  this.frames.push({actor:{...actor},time,received,phase});if(this.frames.length>8)this.frames.shift();
 }
 sample(now,delay=140){
  const frames=this.frames;if(!frames.length)return null;const target=now-delay;
  let a=frames[0],b=a;for(let i=1;i<frames.length;i++){b=frames[i];if(b.received>=target)break;a=b;}
  let x=a.actor.x,y=a.actor.y,phase=a.phase,moving=a.actor.moving;
  if(a!==b&&b.received>a.received){const t=clamp((target-a.received)/(b.received-a.received),0,1);x+=(b.actor.x-x)*t;y+=(b.actor.y-y)*t;phase+=(b.phase-phase)*t;moving=a.actor.moving||b.actor.moving;}
  else if(target>a.received&&frames.length>1){const prev=frames[frames.length-2],elapsed=a.time-prev.time,extra=Math.min(.25,(target-a.received)/1000);if(elapsed>0&&elapsed<1&&distance(a.actor,prev.actor)<350){x+=(a.actor.x-prev.actor.x)/elapsed*extra;y+=(a.actor.y-prev.actor.y)/elapsed*extra;phase+=spin(a.actor)*extra;}}
  return{x,y,angle:wrap(phase),moving};
 }
}
