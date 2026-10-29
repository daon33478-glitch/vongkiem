import{clamp}from'./world.js';
// A global run clock, independent of current map or an early lucky upgrade.
export const LEVEL_INTERVAL=60;
export const unlockedTier=time=>clamp(Math.floor(Math.max(0,time)/LEVEL_INTERVAL),0,11);
export function regularDropTier(time,rng){
 const cap=unlockedTier(time);if(cap===0)return 0;
 const roll=rng();return Math.max(0,cap-(roll<.04?2:roll<.22?1:0));
}
export const RARE_REWARD_CHANCE={chest:.03,rareChest:.06,boss:.08};
export function rewardTiers(time,count,kind,rng){
 const cap=unlockedTier(time),tiers=Array.from({length:count},()=>kind==='boss'?regularDropTier(time,rng):cap);
 // Roll once per reward event, not once per cluster. A large boss pile must not
 // turn a rare reward into an almost guaranteed early high-level weapon.
 if(cap<11&&count>0&&rng()<(RARE_REWARD_CHANCE[kind]||0)){
  const at=Math.min(count-1,Math.floor(rng()*count));tiers[at]=Math.min(11,cap+(rng()<.15?2:1));
 }
 return tiers;
}
