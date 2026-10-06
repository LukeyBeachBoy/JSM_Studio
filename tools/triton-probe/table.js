const fs=require('fs'); const buf=fs.readFileSync('IBEX_FW_6AA43B55.fw').subarray(32); const base=0x8000;
const t=0x50338-base;
for(let i=0;i<0x56;i++){ const o=t+i*12; const h=[]; for(let k=0;k<6;k++) h.push(buf.readInt16LE(o+2*k));
  const w1=buf.readUInt32LE(o+4), w2=buf.readUInt32LE(o+8);
  let extra=''; for(const w of [w1,w2]){ if(w>=0x50000&&w<0x66000){ const so=w-base; let s=''; for(let j=0;j<40&&buf[so+j]>=0x20&&buf[so+j]<0x7f;j++) s+=String.fromCharCode(buf[so+j]); if(s) extra+=' "'+s+'"'; } }
  console.log(`id ${i.toString().padStart(2)} (0x${i.toString(16).padStart(2,'0')}): ${h.map(v=>String(v).padStart(6)).join(' ')}   words: ${w1.toString(16)} ${w2.toString(16)}${extra}`); }
