import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomHub,RECONNECT_MS} from '../rooms.mjs';
import {SnapshotDecoder} from '../../public/game/snapshot-codec.js';
import {arm} from '../../public/game/weapons.js';
import {quietWorld,peer} from './helpers.mjs';
const claim=(name='An',map=0)=>({name,map,skin:0});
function fixture(){let now=10000;const hub=new RoomHub({now:()=>now,createWorld:quietWorld});return{hub,advance(ms=20){now+=ms;hub.tick();}};}
test('RAM simulation advances continuously, normalizes input and ignores client power/position',()=>{
 const{hub,advance}=fixture(),{session:s}=hub.join(claim(),peer()),world=hub.room(0).world,p=world.humans[0];p.readyAt=0;p.x=1000;p.y=1000;
 assert.ok(hub.input(s,{seq:1,x:9,y:0,power:9999,weaponTier:12,position:{x:0,y:0}}));assert.equal(hub.input(s,{seq:1,x:-1,y:0}),false);
 for(let i=0;i<10;i++)advance(20);assert.ok(p.x>1000&&p.x<1100);assert.equal(p.power,3);assert.equal(p.weaponTier,0);assert.equal(p.inputSeq,1);assert.ok(world.time>.19);
 advance(1300);const stopped=p.x;advance(20);assert.equal(p.x,stopped);
});
test('counts include connected people, reservations expire, resume token rotates',()=>{
 const{hub,advance}=fixture(),a=hub.join(claim(),peer()),b=hub.join(claim('B',1),peer());assert.deepEqual(hub.population(),{total:2,maps:[{map:0,count:1},{map:1,count:1}]});
 hub.disconnect(a.session,a.session.peer);assert.equal(hub.population().total,1);assert.equal(hub.count(0),1);
 const next=hub.resume(a.resumeToken,peer());assert.equal(next.session.id,a.session.id);assert.notEqual(next.resumeToken,a.resumeToken);assert.throws(()=>hub.resume(a.resumeToken,peer()));
 hub.disconnect(a.session,a.session.peer);advance(RECONNECT_MS+1);assert.equal(hub.count(0),0);assert.throws(()=>hub.resume(next.resumeToken,peer()));hub.leave(b.session);assert.equal(hub.population().total,0);
});
test('eight seats per map and server-only transfer carries stats with a full fresh snapshot',()=>{
 const{hub,advance}=fixture(),channel=peer(),{session:s}=hub.join(claim(),channel),d=new SnapshotDecoder();hub.snapshot(s);d.decode(channel.packets.at(-1));
 for(let i=0;i<8;i++)hub.join(claim('B'+i,1),peer());assert.throws(()=>hub.join(claim('Overflow',1),peer()),/8/);
 let p=hub.room(0).world.humans[0];p.power=7;p.weaponTier=2;arm(p);p.run.score=100;p.appliedAction=4;p.transfer=1;hub.transfer(s);assert.equal(s.map,0);assert.equal(p.transfer,null);
 p.transfer=2;hub.transfer(s);advance();hub.snapshot(s);const state=d.decode(channel.packets.at(-1));assert.equal(s.map,2);assert.equal(state.mapIndex,2);assert.equal(state.player.power,7);assert.equal(state.player.weaponTier,2);assert.equal(state.score,100);assert.equal(state.player.appliedAction,4);assert.equal(hub.room(0).world.humans.length,0);
});
test('shared pickup can only be claimed once and slow sockets skip snapshots',()=>{
 const{hub,advance}=fixture(),a=hub.join(claim(),peer()),b=hub.join(claim('B'),peer()),g=hub.room(0).world;for(const p of g.humans){p.readyAt=0;p.x=1000;p.y=1000;p.faction='pickup-test';}
 g.addPickup(1000,1000,1,0,{drop:true});advance();assert.equal(g.humans.reduce((n,p)=>n+p.power,0),7);assert.equal(g.pickups.filter(p=>p.alive).length,0);
 a.session.peer.bufferedAmount=300000;assert.equal(hub.snapshot(a.session),false);assert.equal(a.session.encoder.seq,0);assert.equal(hub.snapshot(b.session),true);
});
