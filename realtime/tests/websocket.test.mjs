import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from 'ws';
import {WebSocketConnection} from '../../public/game/websocket.js';
import {SnapshotDecoder} from '../../public/game/snapshot-codec.js';
import {signTicket} from '../../server/join-ticket.mjs';
import {startServer,connect,until,origin,secret} from './helpers.mjs';
test('real sockets share the room, report counts and ping, reject replay and invalid origin',async t=>{
 const app=await startServer(t),ticket=await signTicket(secret,{name:'An',map:0,skin:0,origin}),a=await connect(t,app,{ticket}),welcome=await a.next(m=>m.type==='welcome');await a.next(m=>m.type==='state');
 const b=await connect(t,app,{name:'Bình'});await b.next(m=>m.type==='welcome');const state=(await b.next(m=>m.type==='state')).full;assert.equal(state.population.total,2);assert.equal(state.leaderboard.length,2);assert.ok(state.npcs.some(n=>n.id===welcome.id));
 a.ws.send(JSON.stringify({type:'ping',id:123}));assert.equal((await a.next(m=>m.type==='pong')).id,123);
 const health=await(await fetch(app.health)).json();assert.equal(health.total,2);assert.equal(health.transport,'websocket');
 const replay=await connect(t,app,{ticket});assert.equal((await replay.next(m=>m.type==='error')).type,'error');
 const invalid=new WebSocket(app.url,{origin:'https://other.test'});invalid.on('error',()=>{});t.after(()=>invalid.terminate());const error=await new Promise(resolve=>invalid.once('error',resolve));assert.match(error.message,/403/);
});
test('real socket resume preserves actor and rejects previous token; resync sequence stays ordered',async t=>{
 const app=await startServer(t),a=await connect(t,app),w=await a.next(m=>m.type==='welcome'),d=new SnapshotDecoder();d.decode(await a.next(m=>m.type==='state'));
 a.ws.send(JSON.stringify({type:'resync'}));assert.ok(d.decode(await a.next(m=>m.type==='state')));const closed=once(a.ws,'close');a.ws.terminate();await closed;await until(()=>app.hub.population().total===0);
 const b=await connect(t,app,{resumeToken:w.resumeToken}),w2=await b.next(m=>m.type==='welcome');assert.equal(w2.id,w.id);assert.notEqual(w2.resumeToken,w.resumeToken);assert.equal(app.hub.sessions.size,1);
 const stale=await connect(t,app,{resumeToken:w.resumeToken});await stale.next(m=>m.type==='error');assert.equal(app.hub.population().total,1);
 b.ws.send(JSON.stringify({type:'leave'}));await until(()=>app.hub.sessions.size===0);
});
test('browser connection uses live RAM state, measures actual pong RTT, and resumes after disconnect',async t=>{
 const app=await startServer(t,{autoTick:true}),statuses=[],errors=[];
 const connection=new WebSocketConnection({onStatus:(...s)=>statuses.push(s),onError:m=>errors.push(m),socketFactory:url=>new WebSocket(url,{origin}),fetcher:async(_url,options)=>Response.json({url:app.url,ticket:await signTicket(secret,{...JSON.parse(options.body),origin})})});t.after(()=>connection.stop());
 const view=await connection.join('An',0,0),id=connection.id,p=app.hub.room(0).world.humans[0];p.readyAt=0;p.x=1000;p.y=1000;connection.input={x:1,y:0};
 await until(()=>p.x>1020);assert.equal(view.online,true);await until(()=>statuses.some(s=>s[0]==='connected'));assert.ok(Number.isFinite(connection.meanRtt));
 const token=connection.resumeToken;connection.socket.terminate();await until(()=>connection.resumeToken!==token&&connection.ready);assert.equal(connection.id,id);assert.equal(app.hub.sessions.size,1);assert.ok(statuses.some(s=>s[0]==='reconnecting'));assert.deepEqual(errors,[]);
 connection.stop();await until(()=>app.hub.sessions.size===0);
});
test('binary, oversized and malformed messages do not alter the simulation',async t=>{
 const app=await startServer(t);
 for(const payload of[Buffer.from('binary'),'{bad',JSON.stringify({junk:'x'.repeat(5000)})]){const c=await connect(t,app);await c.next(m=>m.type==='welcome');const closed=once(c.ws,'close');c.ws.send(payload);const[code]=await closed;assert.ok([1008,1009].includes(code));}
});
