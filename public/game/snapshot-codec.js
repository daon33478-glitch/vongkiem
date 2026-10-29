const ENTITY_LISTS=new Set(['npcs','monsters','projectiles','pickups','chests','obstacles','itemDrops','hazards']);
const IMMUTABLE=new WeakSet();
// Normalize once without round-tripping every snapshot through JSON. Reuse
// unchanged, detached branches so comparing large blade lists is constant time.
function same(a,b){
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);if(keys.length!==Object.keys(b).length)return false;
 for(const k of keys)if(!Object.hasOwn(b,k)||!same(a[k],b[k]))return false;return true;
}
function clone(v,before){
 if(typeof v==='number')return Number.isFinite(v)?Math.round(v*1000)/1000:null;
 if(v===null||typeof v==='string'||typeof v==='boolean')return v;
 if(typeof v==='bigint')throw new TypeError('Snapshot cannot contain BigInt');
 if(typeof v!=='object')return undefined;
 if(IMMUTABLE.has(v))return v;
 if(typeof v.toJSON==='function')return clone(v.toJSON(),before);
 if(Array.isArray(v)){
  const prior=Array.isArray(before)?before:[],out=new Array(v.length);let equal=Array.isArray(before)&&prior.length===v.length;
  for(let i=0;i<v.length;i++){out[i]=clone(v[i],prior[i])??null;if(out[i]!==prior[i])equal=false;}return equal?before:out;
 }
 const prior=before&&typeof before==='object'&&!Array.isArray(before)?before:{},out={};let equal=prior===before,count=0;
 for(const k of Object.keys(v)){const value=clone(v[k],prior[k]);if(value===undefined)continue;if(k==='__proto__')Object.defineProperty(out,k,{value,writable:true,enumerable:true,configurable:true});else out[k]=value;count++;if(!Object.hasOwn(prior,k)||value!==prior[k])equal=false;}
 return equal&&count===Object.keys(prior).length?before:out;
}
// Only this factory can mark a normalized tree as immutable. Freezing caller
// objects alone is insufficient because their children might still mutate.
export function immutableSnapshot(value){const out=clone(value);const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);IMMUTABLE.add(v);}};freeze(out);return out;}
function fields(before,after){const set={},unset=[];for(const[k,v]of Object.entries(after))if(!same(before[k],v))set[k]=v;for(const k of Object.keys(before))if(!(k in after))unset.push(k);return{set,unset};}
function entityList(list){return Array.isArray(list)&&list.every(a=>a&&a.id!==undefined)&&new Set(list.map(a=>a.id)).size===list.length;}
export class SnapshotEncoder{
 constructor(){this.reset();}
 reset(){this.previous=null;this.seq??=0;} // keep ordering across resyncs and map transfers
 encode(snapshot,full=false){
  const next=clone(snapshot,this.previous),seq=this.seq+1;let packet;
  if(full||!this.previous)packet={type:'state',seq,full:next};
  else{
   const patch=fields(this.previous,next),lists={};
   for(const key of ENTITY_LISTS)if(key in patch.set&&entityList(this.previous[key])&&entityList(next[key])){
    const old=new Map(this.previous[key].map(a=>[a.id,a])),put=[],change=[],ids=new Set();
    for(const a of next[key]){ids.add(a.id);const previous=old.get(a.id);if(!previous)put.push(a);else{const d=fields(previous,a);if(Object.keys(d.set).length||d.unset.length)change.push({id:a.id,...d});}}
    const remove=[...old.keys()].filter(id=>!ids.has(id));lists[key]={put,change,remove};
    if(!same(this.previous[key].map(a=>a.id),next[key].map(a=>a.id)))lists[key].order=next[key].map(a=>a.id);
    delete patch.set[key];
   }
   packet={type:'state',seq,base:this.seq,...patch,lists};
  }
  this.previous=next;this.seq=seq;return packet;
 }
}
export class SnapshotDecoder{
 constructor(){this.reset();}
 reset(){this.state=null;this.seq=0;}
 decode(packet){
  if(!packet||packet.type!=='state'||!Number.isInteger(packet.seq)||packet.seq<=this.seq)return null;
  let next;if(packet.full)next=structuredClone(packet.full);
  else{
   if(!this.state||packet.base!==this.seq)throw new Error('Snapshot base mismatch');next=structuredClone(this.state);Object.assign(next,packet.set);for(const k of packet.unset||[])delete next[k];
   for(const[key,delta]of Object.entries(packet.lists||{})){
    if(!ENTITY_LISTS.has(key))throw new Error('Invalid snapshot list');const values=new Map((next[key]||[]).map(a=>[a.id,a]));
    for(const id of delta.remove)values.delete(id);for(const a of delta.put)values.set(a.id,a);
    for(const d of delta.change){const a=values.get(d.id);if(!a)throw new Error('Unknown snapshot entity');Object.assign(a,d.set);for(const k of d.unset)delete a[k];}
    next[key]=delta.order?delta.order.map(id=>{if(!values.has(id))throw new Error('Unknown snapshot order');return values.get(id);}):[...values.values()];
   }
  }
  this.state=next;this.seq=packet.seq;return structuredClone(next); // rendering is allowed to mutate its own copy
 }
}
