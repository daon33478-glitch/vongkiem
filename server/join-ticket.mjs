const encoder=new TextEncoder(),decoder=new TextDecoder();
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unbase64=s=>{if(!/^[A-Za-z0-9_-]+$/.test(s))throw new Error('Invalid ticket');return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));};
async function key(secret,usage){if(typeof secret!=='string'||secret.length<32)throw new Error('Join secret must have at least 32 characters');return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,[usage]);}
export async function signTicket(secret,claims,now=Date.now()){
 const body=base64(encoder.encode(JSON.stringify({...claims,aud:'vong-kiem-realtime',iat:now,exp:now+120000,jti:crypto.randomUUID()})));
 const signature=await crypto.subtle.sign('HMAC',await key(secret,'sign'),encoder.encode(body));return body+'.'+base64(new Uint8Array(signature));
}
export async function verifyTicket(secret,ticket,now=Date.now()){
 if(typeof ticket!=='string'||ticket.length>3000)throw new Error('Invalid ticket');const parts=ticket.split('.');if(parts.length!==2)throw new Error('Invalid ticket');
 if(!await crypto.subtle.verify('HMAC',await key(secret,'verify'),unbase64(parts[1]),encoder.encode(parts[0])))throw new Error('Invalid ticket');
 const claims=JSON.parse(decoder.decode(unbase64(parts[0])));
 if(claims.aud!=='vong-kiem-realtime'||!Number.isFinite(claims.exp)||!Number.isFinite(claims.iat)||claims.exp<=now||claims.iat>now+5000||claims.exp-claims.iat>120000||typeof claims.jti!=='string')throw new Error('Expired ticket');
 return claims;
}
