import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {verifyTicket} from '../server/join-ticket.mjs';
import {RoomHub,CAPACITY} from './rooms.mjs';
export function createRealtimeServer({secret,origins,now=Date.now,hub=new RoomHub({now}),autoTick=true}={}){
 if(typeof secret!=='string'||secret.length<32)throw new Error('ARENA_JOIN_SECRET must be configured (32+ characters)');
 const allowed=new Set(origins);if(!allowed.size)throw new Error('SITE_ORIGIN is required');
 const used=new Map(),peers=new Set();let tickTimer,broadcastTimer,heartbeatTimer,closed=false;
 const http=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method==='GET'&&req.url==='/healthz'){res.end(JSON.stringify({online:!closed,transport:'websocket',capacity:CAPACITY,...hub.population()}));return;}
  res.writeHead(404);res.end('{"error":"Not found"}');
 });
 const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
 http.on('upgrade',(req,socket,head)=>{
  if(closed||req.url!=='/arena'||!allowed.has(req.headers.origin)||peers.size>=64){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',(ws,req)=>{
  let session=null,authenticating=false,seenPong=true,tokens=60,refill=now();const origin=req.headers.origin;
  const peer={get bufferedAmount(){return ws.bufferedAmount;},send(data){if(ws.readyState!==WebSocket.OPEN)return false;try{ws.send(JSON.stringify(data));return true;}catch{ws.close();return false;}},close:(code,reason)=>ws.close(code,reason)};
  peers.add(peer);const handshake=setTimeout(()=>{if(!session)ws.close(4003,'Join timed out');},5000);handshake.unref();
  ws.on('pong',()=>{seenPong=true;});ws.on('error',()=>{});
  ws.on('close',()=>{clearTimeout(handshake);peers.delete(peer);if(session)hub.disconnect(session,peer);});
  ws.on('message',async(raw,binary)=>{
   const at=now();tokens=Math.min(60,tokens+(at-refill)*.06);refill=at;if(binary||--tokens<0){ws.close(1008,'Invalid traffic');return;}
   let message;try{message=JSON.parse(raw.toString());}catch{ws.close(1008,'Invalid JSON');return;}if(!message||typeof message!=='object'||Array.isArray(message)){ws.close(1008,'Invalid message');return;}
   if(session&&session.peer!==peer){ws.close(4001,'Session resumed');return;}
   if(!session){
    if(authenticating||message.type!=='hello'){ws.close(4003,'Join required');return;}authenticating=true;
    try{
     let joined;if(message.resumeToken){joined=hub.resume(message.resumeToken,peer);}
     else{
      const claims=await verifyTicket(secret,message.ticket,now());if(ws.readyState!==WebSocket.OPEN)return;
      for(const[k,exp]of used)if(exp<=now())used.delete(k);if(claims.origin!==origin||used.has(claims.jti))throw new Error('Vé vào trận không còn hợp lệ. Hãy thử lại.');
      joined=hub.join(claims,peer);used.set(claims.jti,claims.exp);
     }
     if(ws.readyState!==WebSocket.OPEN){hub.leave(joined.session);return;}session=joined.session;clearTimeout(handshake);
     peer.send({type:'welcome',id:session.id,resumeToken:joined.resumeToken,inputSeq:session.seq});hub.snapshot(session);
    }catch(error){peer.send({type:'error',message:error instanceof Error?error.message:'Không thể vào trận.'});ws.close(4003,'Join rejected');}finally{authenticating=false;}
    return;
   }
   if(message.type==='input')hub.input(session,message);
   else if(message.type==='ping'&&Number.isSafeInteger(message.id))peer.send({type:'pong',id:message.id});
   else if(message.type==='resync'){session.encoder.reset();session.forceFull=true;hub.snapshot(session);}
   else if(message.type==='leave'){hub.leave(session);session=null;ws.close(1000,'Left arena');}
  });
  peer.heartbeat=()=>{if(!seenPong||ws.bufferedAmount>1048576){ws.terminate();return;}seenPong=false;ws.ping();};
 });
 if(autoTick){tickTimer=setInterval(()=>hub.tick(),1000/60);broadcastTimer=setInterval(()=>hub.broadcast(),50);heartbeatTimer=setInterval(()=>{for(const p of peers)p.heartbeat();},10000);for(const t of[tickTimer,broadcastTimer,heartbeatTimer])t.unref();}
 async function close(){if(closed)return;closed=true;for(const t of[tickTimer,broadcastTimer,heartbeatTimer])clearInterval(t);for(const peer of peers)peer.close(1012,'Server restarting');const force=setTimeout(()=>{for(const ws of wss.clients)ws.terminate();},1000);force.unref();await new Promise(resolve=>http.close(resolve));clearTimeout(force);wss.close();}
 return{http,wss,hub,close};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const app=createRealtimeServer({secret:process.env.ARENA_JOIN_SECRET,origins:(process.env.SITE_ORIGIN||'').split(',').map(s=>s.trim()).filter(Boolean)});
 app.http.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Vong Kiem WebSocket server ready'));
 for(const signal of['SIGTERM','SIGINT'])process.once(signal,()=>{app.close().then(()=>process.exit(0));});
}
