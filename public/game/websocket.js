import {OnlineView,OnlineConnection} from './online.js';
import {SnapshotDecoder} from './snapshot-codec.js';
export async function createOnlineConnection(options={}){
 const fetcher=options.fetcher||((...args)=>fetch(...args));const response=await fetcher('/api/arena/config',{cache:'no-store',signal:AbortSignal.timeout(8000)});const config=await response.json();if(!response.ok)throw new Error(config.error||'Không lấy được cấu hình online.');
 return config.transport==='websocket'?new WebSocketConnection(options):new OnlineConnection(options);
}
export class WebSocketConnection{
 constructor({onStatus=()=>{},onError=()=>{},fetcher=(...args)=>fetch(...args),socketFactory=url=>new WebSocket(url),now=()=>performance.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}){
  Object.assign(this,{onStatus,onError,fetcher,socketFactory,now,schedule,cancel});this.transport='websocket';this.input={x:0,y:0};this.seq=0;this.actionSeq=0;this.actions=[];this.decoder=new SnapshotDecoder();this.active=false;this.generation=0;this.pings=new Map();this.pingId=0;this.meanRtt=0;this.attempts=0;
 }
 async join(name,skin,map){
  this.active=true;this.onStatus('starting');const response=await this.fetcher('/api/arena/ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,skin,map}),cache:'no-store',signal:AbortSignal.timeout(10000)}),data=await response.json();
  if(!response.ok)throw new Error(data.error||'Không tạo được phiên online.');this.url=data.url;this.ticket=data.ticket;
  return new Promise((resolve,reject)=>{this.joinResolve=resolve;this.joinReject=reject;this.joinTimer=this.schedule(()=>this.fail('Máy chủ miễn phí chưa khởi động xong. Hãy thử vào lại sau một lát.'),85000);this.connect();});
 }
 connect(){
  if(!this.active)return;const generation=++this.generation,ws=this.socketFactory(this.url);this.socket=ws;this.decoder.reset();this.awaitingState=true;this.ready=false;
  this.cancel(this.connectTimer);if(this.resumeToken)this.connectTimer=this.schedule(()=>{if(this.active&&generation===this.generation&&!this.ready)ws.close();},8000);
  ws.addEventListener('open',()=>{if(generation!==this.generation||!this.active)return;ws.send(JSON.stringify(this.resumeToken?{type:'hello',resumeToken:this.resumeToken}:{type:'hello',ticket:this.ticket}));});
  ws.addEventListener('message',event=>{if(!this.active||generation!==this.generation)return;try{this.receive(JSON.parse(event.data));}catch{this.send({type:'resync'});}});
  ws.addEventListener('error',()=>{});
  ws.addEventListener('close',()=>{if(!this.active||generation!==this.generation)return;this.ready=false;this.cancel(this.timer);this.cancel(this.connectTimer);this.pings.clear();if(!this.resumeToken){this.fail('Không kết nối được máy chủ WebSocket. Hãy đợi máy chủ khởi động rồi thử lại.');return;}if(++this.attempts>5){this.fail('Mất kết nối quá lâu. Hãy vào trận lại.');return;}this.onStatus('reconnecting');this.retryTimer=this.schedule(()=>this.connect(),Math.min(4000,300*2**(this.attempts-1)));});
 }
 receive(message){
  if(message.type==='welcome'){this.id=message.id;this.resumeToken=message.resumeToken;this.seq=Math.max(this.seq,message.inputSeq||0);return;}
  if(message.type==='error'){this.fail(message.message);return;}
  if(message.type==='notice'){this.onStatus('full',message.message);return;}
  if(message.type==='pong'){const sent=this.pings.get(message.id);if(sent===undefined)return;this.pings.delete(message.id);const elapsed=this.now()-sent;this.meanRtt=this.meanRtt?this.meanRtt*.8+elapsed*.2:elapsed;this.onStatus('connected',Math.round(this.meanRtt));return;}
  if(message.type!=='state')return;const snapshot=this.decoder.decode(message);if(!snapshot)return;
  if(!this.view){snapshot.events=[];this.view=new OnlineView(snapshot,this);}
  else this.view.apply(snapshot,this.awaitingState);
  this.actions=this.actions.filter(a=>a.seq>(snapshot.player.appliedAction||0));
  if(this.awaitingState){this.awaitingState=false;this.ready=true;this.attempts=0;this.cancel(this.connectTimer);this.lastPing=-Infinity;this.lastInput=-Infinity;this.pump();}
  if(this.joinResolve){const resolve=this.joinResolve;this.joinResolve=this.joinReject=null;this.cancel(this.joinTimer);resolve(this.view);}
 }
 send(data){if(!this.active||this.socket?.readyState!==1||this.socket.bufferedAmount>65536)return false;this.socket.send(JSON.stringify(data));return true;}
 sendInput(){if(!this.ready)return;const seq=++this.seq;if(this.send({type:'input',seq,...this.input,actions:this.actions})){this.view?.rememberInput(seq);this.lastInput=this.now();}}
 pump(){
  this.cancel(this.timer);if(!this.active||!this.ready)return;const now=this.now();if(now-(this.lastInput??-Infinity)>=50)this.sendInput();
  if(now-(this.lastPing??-Infinity)>=1000){const id=++this.pingId;if(this.send({type:'ping',id})){this.pings.set(id,now);this.lastPing=now;while(this.pings.size>5)this.pings.delete(this.pings.keys().next().value);}}
  const nextInput=50-(now-this.lastInput),nextPing=1000-(now-this.lastPing);
  this.timer=this.schedule(()=>this.pump(),Math.max(5,Math.min(nextInput,nextPing,50)));
 }
 command(kind){if(!this.active)return 0;const seq=++this.actionSeq;this.actions.push({kind,seq});this.actions=this.actions.slice(-6);this.sendInput();return seq;}
 fail(message){const reject=this.joinReject;this.joinResolve=this.joinReject=null;this.stop();if(reject)reject(new Error(message||'Không thể vào trận.'));else this.onError(message||'Kết nối đã kết thúc.');}
 stop(){this.send({type:'leave'});this.active=false;this.ready=false;this.generation++;for(const t of[this.timer,this.retryTimer,this.joinTimer,this.connectTimer])this.cancel(t);this.socket?.close(1000,'Left arena');this.resumeToken=null;this.pings.clear();}
}
