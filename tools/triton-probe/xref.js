// usage: node xref.js <fw> <base-hex> <addr-hex>... ; scans every 2-byte-aligned 32-bit word for addr or addr|1
const fs=require('fs'); const [,, file, baseHex, ...addrs]=process.argv;
const buf=fs.readFileSync(file).subarray(32); const base=parseInt(baseHex,16);
const targets=addrs.map(a=>parseInt(a,16));
for(const t of targets){ const hits=[];
  for(let o=0;o+4<=buf.length;o+=2){ const v=buf.readUInt32LE(o); if(v===t||v===(t|1)) hits.push(`${(base+o).toString(16).padStart(8,'0')}${v&1?'(+1)':''}`); }
  console.log(`0x${t.toString(16)}: ${hits.length} refs: ${hits.join(' ')}`); }
