import test from 'node:test';
import assert from 'node:assert/strict';
import {signTicket,verifyTicket} from '../../server/join-ticket.mjs';
import {handleRealtimeGateway} from '../../server/realtime-gateway.mjs';
import {SnapshotEncoder,SnapshotDecoder} from '../../public/game/snapshot-codec.js';
import {secret,origin} from './helpers.mjs';
test('signed tickets expire and reject tampering or a different secret',async()=>{
 const ticket=await signTicket(secret,{name:'An',skin:0,map:0,origin},10000);assert.equal((await verifyTicket(secret,ticket,11000)).name,'An');
 await assert.rejects(verifyTicket(secret,ticket,130000));await assert.rejects(verifyTicket(secret+'x',ticket,11000));await assert.rejects(verifyTicket(secret,'e30.'+ticket.split('.')[1],11000));
});
test('delta reconstructs changes, removals, order, and immutable rendering copies',()=>{
 const e=new SnapshotEncoder(),d=new SnapshotDecoder(),first={player:{x:1.234567},events:[],pickups:[{id:1,x:1,glow:true},{id:2,x:2}],obstacles:[{x:20}],old:true};
 const p=e.encode(first),view=d.decode(p);assert.equal(view.player.x,1.235);view.pickups[0].x=900;first.pickups[0].x=500;
 const next={player:{x:2},events:[{type:'buff'}],pickups:[{id:3,x:3},{id:1,x:4}],obstacles:[{x:30}]};
 assert.deepEqual(d.decode(e.encode(next)),next);assert.deepEqual(d.state,next);assert.equal(d.decode(p),null);
 const fresh=new SnapshotDecoder();assert.throws(()=>fresh.decode(e.encode(next)),/base mismatch/);
 e.reset();const full=e.encode(next);assert.ok(full.seq>1);assert.deepEqual(d.decode(full),next);
});
test('unchanged large entities are omitted from the wire delta',()=>{
 const e=new SnapshotEncoder(),s={time:1,npcs:Array.from({length:30},(_,id)=>({id,x:id,y:20,name:'NPC',renderBlades:Array.from({length:96},(_,j)=>({id:j,offset:j*.01}))})),pickups:Array.from({length:80},(_,id)=>({id,x:id,y:id}))};
 const full=JSON.stringify(e.encode(s));s.time=2;for(const n of s.npcs)n.x+=1;const delta=JSON.stringify(e.encode(s));assert.ok(delta.length<full.length*.1,`${delta.length}/${full.length}`);
});
const env={ARENA_WS_URL:'wss://arena.example/arena',ARENA_JOIN_SECRET:secret};
const request=(action,body,headers={})=>new Request(origin+'/api/arena/'+action,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
test('gateway preserves HTTP until configured, then issues signed ticket without exposing secret',async()=>{
 assert.equal(await handleRealtimeGateway(request('join',{}),{}),null);assert.deepEqual(await(await handleRealtimeGateway(request('config'),{})).json(),{transport:'http'});
 const config=await(await handleRealtimeGateway(request('config'),env)).json();assert.equal(config.transport,'websocket');assert.ok(!JSON.stringify(config).includes(secret));
 const result=await handleRealtimeGateway(request('ticket',{name:' An ',map:0,skin:0}),env,{now:()=>10000});const data=await result.json();assert.equal(result.status,200);assert.equal((await verifyTicket(secret,data.ticket,11000)).origin,origin);assert.ok(!JSON.stringify(data).includes(secret));
 assert.equal((await handleRealtimeGateway(request('tick',{}),env)).status,426);
});
test('gateway rejects cross-origin or malformed requests and proxies counts only',async()=>{
 assert.equal((await handleRealtimeGateway(request('ticket',{name:'An',map:0,skin:0},{Origin:'https://other.test'}),env)).status,403);
 for(const body of[null,{},[],{name:'An',map:5,skin:0},{name:'An',map:0,skin:999}])assert.equal((await handleRealtimeGateway(request('ticket',body),env)).status,400);
 assert.equal((await handleRealtimeGateway(request('config'),{...env,ARENA_WS_URL:'ws://bad/arena'})).status,503);
 const health=await handleRealtimeGateway(request('health'),env,{fetcher:async url=>{assert.equal(url,'https://arena.example/healthz');return Response.json({online:true,total:2,maps:[{map:0,count:2}],secret:'do-not-forward'});}});
 assert.deepEqual(await health.json(),{online:true,transport:'websocket',capacity:8,total:2,maps:[{map:0,count:2}]});
 assert.equal((await handleRealtimeGateway(request('health'),env,{fetcher:async()=>{throw new Error('offline');}})).status,503);
});
