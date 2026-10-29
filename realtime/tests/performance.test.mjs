import test from 'node:test';
import assert from 'node:assert/strict';
import {SnapshotEncoder,SnapshotDecoder,immutableSnapshot} from '../../public/game/snapshot-codec.js';
import {WebSocketConnection} from '../../public/game/websocket.js';
import {OnlineView} from '../../public/game/online.js';
import {arm} from '../../public/game/weapons.js';
import {quietWorld} from './helpers.mjs';
import {lineClear,layout} from '../../public/game/world.js';

const wire=v=>JSON.parse(JSON.stringify(v,(_k,n)=>typeof n==='number'&&Number.isFinite(n)?Math.round(n*1000)/1000:n));
test('delta normalization matches JSON values through mutable nested changes and reordering',()=>{
 const e=new SnapshotEncoder(),d=new SnapshotDecoder(),s={time:0,player:{x:0,missing:undefined,optional:true},pickups:[{id:1,x:0},{id:2,x:3}],values:[NaN,Infinity,undefined,null],nested:{a:[{b:1}]}};
 for(let i=0;i<80;i++){s.time=i/7;s.player.x+=.01783;s.nested.a[0].b=i;if(i%3===0)s.pickups.reverse();if(i%5===0)delete s.player.optional;else s.player.optional=i;if(i===40)s.pickups.push({id:3,x:20});
  const result=d.decode(wire(e.encode(s)));assert.deepEqual(result,wire(s));result.nested.a[0].b=-999;assert.equal(d.state.nested.a[0].b,i);
 }
});
test('cached immutable geometry is detached and still invalidates when swords change',()=>{
 const original=[{id:1,offset:.123456}],stable=immutableSnapshot(original);original[0].offset=9;assert.equal(stable[0].offset,.123);assert.throws(()=>{stable[0].offset=4;},TypeError);
 const g=quietWorld(0),p=g.addHuman({id:'a',name:'An',skin:0});p.readyAt=0;const first=g.view('a');assert.equal(first.player.renderBlades.length,3);arm(p,9);const second=g.view('a');assert.equal(second.player.renderBlades.length,9);assert.equal(first.player.renderBlades.length,3);assert.ok(!('walkPhase'in second.player));assert.ok(!('peaceUntil'in second.player));
 const e=new SnapshotEncoder(),d=new SnapshotDecoder();d.decode(wire(e.encode(first)));const decoded=d.decode(wire(e.encode(second)));decoded.player.renderBlades[0].offset=999;assert.notEqual(p.blades[0].offset,999);
});
test('client runs walking animation between 20 Hz snapshots and uses a shorter WebSocket buffer',()=>{
 let now=1000;const g=quietWorld(0),p=g.addHuman({id:'a',name:'An',skin:0}),n=g.addHuman({id:'b',name:'Bình',skin:1});p.readyAt=n.readyAt=0;p.x=500;p.y=1000;n.x=1000;n.y=1000;
 const view=new OnlineView(g.view('a'),{transport:'websocket',now:()=>now});assert.equal(view.interpolationDelay,60);
 let previousPhase=0;for(let i=1;i<=20;i++){now+=50;g.time=i*.05;n.x+=5;n.moving=true;view.apply(g.view('a'));const a=view.npcs.find(x=>x.id==='b');assert.equal(a.walkPhase,previousPhase);view.update(.05,{x:0,y:0});previousPhase=a.walkPhase;}
 assert.ok(previousPhase>0);assert.ok(view.interpolationDelay<75);const http=new OnlineView(g.view('a'),{now:()=>now});assert.equal(http.interpolationDelay,140);
});
test('input scheduler sends at 50 ms deadlines without polling quantization, ping reports real time',()=>{
 let now=0,next;const packets=[],c=new WebSocketConnection({now:()=>now,schedule:(fn,ms)=>{next={fn,ms};return 1;},cancel:()=>{}});c.active=c.ready=true;c.socket={readyState:1,bufferedAmount:0,send:s=>packets.push({at:now,...JSON.parse(s)})};c.pump();
 for(let i=0;i<20;i++){now+=next.ms;next.fn();}assert.deepEqual(packets.filter(p=>p.type==='input').map(p=>p.at),Array.from({length:21},(_,i)=>i*50));
 now=1137;c.receive({type:'pong',id:2});assert.equal(c.meanRtt,137);
});
test('allocation-free wall queries preserve corner, parallel and expanded-bound contacts',()=>{
 const reference=(a,b,obstacles,r)=>{for(const o of obstacles){let lo=0,hi=1;for(const[start,delta,min,max]of[[a.x,b.x-a.x,o.x-r,o.x+o.w+r],[a.y,b.y-a.y,o.y-r,o.y+o.h+r]]){if(Math.abs(delta)<1e-8){if(start<min||start>max){lo=2;break;}}else{let t1=(min-start)/delta,t2=(max-start)/delta;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);}}if(lo<=hi&&hi>=0&&lo<=1)return false;}return true;};
 let seed=937;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let map=0;map<5;map++){const obstacles=layout(map);for(let i=0;i<1500;i++){const a={x:rand()*4400,y:rand()*4800},b={x:i%3?rand()*4400:a.x,y:i%5?rand()*4800:a.y},r=rand()*100;assert.equal(lineClear(a,b,obstacles,r),reference(a,b,obstacles,r));}
  for(const o of obstacles)for(const r of[0,20,80])for(const x of[o.x-r,o.x+o.w+r]){const a={x,y:o.y-500},b={x,y:o.y+o.h+500};assert.equal(lineClear(a,b,obstacles,r),reference(a,b,obstacles,r));}
 }
});
