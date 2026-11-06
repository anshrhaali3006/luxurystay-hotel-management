import React from 'react';

/** 0–4 score: length plus character variety. Purely a hint — the server enforces the 10-character minimum. */
export function passwordScore(pw=''){
  if(!pw)return 0;
  let s=0;
  if(pw.length>=10)s++;
  if(pw.length>=14)s++;
  if(/[a-z]/.test(pw)&&/[A-Z]/.test(pw))s++;
  if(/\d/.test(pw)&&/[^A-Za-z0-9]/.test(pw))s++;
  if(pw.length<10)s=Math.min(s,1);
  return Math.min(4,Math.max(pw.length?1:0,s));
}
const LABELS=['','Too short or weak','Okay','Good','Strong'];

export default function PasswordStrength({value}){
  const score=passwordScore(value);
  if(!value)return null;
  return <div className={`pw-meter pw-${score}`} role="status" aria-live="polite">
    <span className="pw-bars" aria-hidden="true"><i/><i/><i/><i/></span>
    <small>{LABELS[score]}{value.length<10?` · ${10-value.length} more character${10-value.length===1?'':'s'} needed`:''}</small>
  </div>;
}
