import {signTicket} from './join-ticket.mjs';
import {cleanName} from './arena-input.mjs';
import {CHARACTERS} from '../public/game/world.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function handleRealtimeGateway(request,env,{fetcher=fetch,now=Date.now}={}){
 const action=new URL(request.url).pathname.split('/').at(-1),configured=!!env.ARENA_WS_URL;
 if(!configured)return action==='config'?json({transport:'http'}):null;
 let endpoint;try{endpoint=new URL(env.ARENA_WS_URL);if(endpoint.protocol!=='wss:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/arena'||!env.ARENA_JOIN_SECRET||env.ARENA_JOIN_SECRET.length<32)throw new Error();}catch{return json({error:'Cấu hình máy chủ online chưa hoàn tất.'},503);}
 if(action==='config'&&request.method==='GET')return json({transport:'websocket',url:endpoint.href});
 if(action==='health'&&request.method==='GET'){
  const health=new URL('/healthz',endpoint);health.protocol='https:';
  try{const response=await fetcher(health.href,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error();const data=await response.json();return json({online:!!data.online,transport:'websocket',capacity:8,total:data.total,maps:data.maps});}
  catch{return json({online:false,error:'Máy chủ miễn phí đang khởi động. Vui lòng đợi một lát.'},503);}
 }
 if(action==='ticket'&&request.method==='POST'){
  const url=new URL(request.url),origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Yêu cầu phải được gửi từ game.'},403);
  if(!request.headers.get('Content-Type')?.includes('application/json'))return json({error:'Cần dữ liệu JSON.'},415);
  const text=await request.text();if(text.length>1024)return json({error:'Dữ liệu quá lớn.'},413);
  let body;try{body=JSON.parse(text);}catch{return json({error:'Dữ liệu không hợp lệ.'},400);}
  const name=cleanName(body?.name),map=body?.map,skin=body?.skin;
  if(!name||!Number.isInteger(map)||map<0||map>4||!Number.isInteger(skin)||skin<0||skin>=CHARACTERS.length)return json({error:'Nhập tên và chọn nhân vật, map hợp lệ.'},400);
  try{return json({url:endpoint.href,ticket:await signTicket(env.ARENA_JOIN_SECRET,{name,map,skin,origin:url.origin},now())});}catch{return json({error:'Máy chủ online chưa sẵn sàng.'},503);}
 }
 return json({error:'Game đã đổi máy chủ online. Hãy tải lại trang để vào trận.'},426);
}
