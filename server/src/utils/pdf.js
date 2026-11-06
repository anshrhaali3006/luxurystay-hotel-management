const esc = (s='') => String(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7E]/g,' ');
export function makePdf(title, lines=[]) {
 const all=[title,'LuxuryStay Hospitality','',...lines];
 const commands=['BT','/F1 18 Tf','50 790 Td'];
 all.forEach((line,i)=>{if(i)commands.push('0 -25 Td');commands.push(`/F1 ${i===0?18:11} Tf (${esc(line)}) Tj`);});commands.push('ET');
 const stream=commands.join('\n');
 const objs=[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
 let out='%PDF-1.4\n', offsets=[0];for(let i=0;i<objs.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`;}const xref=Buffer.byteLength(out);out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)out+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;out+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(out,'binary');
}
