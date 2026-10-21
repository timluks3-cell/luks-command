
import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const deps=[
 ['pdf-lib.min.js','https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'],
 ['docx.umd.js','https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.umd.cjs'],
 ['pdf.mjs','https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.296/build/pdf.mjs'],
 ['pdf.worker.mjs','https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.296/build/pdf.worker.mjs'],
 ['pdf-lib-LICENSE.txt','https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/LICENSE.md'],
 ['docx-LICENSE.txt','https://cdn.jsdelivr.net/npm/docx@9.5.1/LICENSE'],
 ['pdfjs-LICENSE.txt','https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.296/LICENSE']
];
await mkdir('dist/vendor',{recursive:true});
for(const p of ['index.html','scanner.js','job-role-categories.js','theme.css','workspace-core.js','job-workspace.js','job-workspace.css','theme-init.js'])await copyFile(p,'dist/'+p);
const hashes={};
let lock={};try{lock=JSON.parse(await readFile('vendor-lock.json','utf8'));}catch{}
for(const [file,url] of deps){
 const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(url+' returned '+r.status);
 const data=Buffer.from(await r.arrayBuffer());if(data.length>8000000)throw Error('Vendor exceeds size budget');
 const sha=createHash('sha256').update(data).digest('hex');if(lock[file]&&sha!==lock[file])throw Error('Vendor integrity mismatch: '+file);
 hashes[file]=sha;await writeFile('dist/vendor/'+file,data);
}
await writeFile('dist/vendor/manifest.json',JSON.stringify(hashes,null,2));
console.log('WORKSPACE_VENDOR_HASHES '+JSON.stringify(hashes));
