
(function(){
'use strict';
const C=window.LuksCore,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,refs=null,refsOwner=null,refsRevision=null,previousFocus=null;
const bridge=()=>window.LuksBridge;
const uid=()=>bridge()?.user()?.id;
const el=id=>document.getElementById(id);
const fail=e=>{if(el('workspaceMessage'))el('workspaceMessage').textContent=e.message||String(e);else alert(e.message||String(e));};
const requireOwner=owner=>{if(!owner||uid()!==owner)throw Error('Your account changed. Reopen the workspace.');};
const requireState=ticket=>{requireOwner(ticket.owner);if(state!==ticket)throw Error('The workspace changed. Reopen the action.');};
const field=(id,label,value='',large=false)=>'<label class="workspace-field">'+esc(label)+(large?'<textarea id="'+id+'" class="textarea" rows="9">':'<input id="'+id+'" class="input" value="'+esc(value)+'">')+(large?esc(value)+'</textarea>':'')+'</label>';
function close(force=false){
 if(!force&&state?.dirty&&!confirm('Close without saving your latest changes?'))return;
 const refresh=!!state?.job;el('luksWorkspace')?.remove();state=null;previousFocus?.focus?.();if(refresh)bridge()?.refresh?.();
}
function modal(title,body){
 el('luksWorkspace')?.remove();previousFocus=document.activeElement;
 const wrap=document.createElement('div');wrap.id='luksWorkspace';wrap.className='overlay workspace-overlay';
 wrap.innerHTML='<section class="modal job-workspace" role="dialog" aria-modal="true" aria-labelledby="workspaceTitle"><header class="workspace-top"><div><div class="kicker">LUKS COMMAND · JOB WORKSPACE</div><h2 id="workspaceTitle">'+esc(title)+'</h2></div><button class="btn" data-work="close">Close</button></header><div id="workspaceMessage" role="status" aria-live="polite"></div>'+body+'</section>';
 document.body.append(wrap);
 wrap.addEventListener('click',async e=>{const b=e.target.closest('[data-work]');if(!b)return;b.disabled=true;try{await action(b.dataset.work);}catch(error){fail(error);}finally{b.disabled=false;}});
 wrap.addEventListener('input',()=>{if(state)state.dirty=true;});
 wrap.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();close();}
  if(e.key==='Tab'){
   const f=[...wrap.querySelectorAll('button,input,textarea,select,a[href]')].filter(x=>!x.disabled&&x.getClientRects().length);
   if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1)?.focus();}
   else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0]?.focus();}
  }
 });
 wrap.querySelector('button')?.focus();
}
async function loadRefs(){
 const owner=uid();requireOwner(owner);
 if(refsOwner===owner&&refs)return refs;
 const r=await bridge().db.from('job_application_references').select('content,revision').eq('user_id',owner).maybeSingle();requireOwner(owner);
 if(r.error)throw Error('Master-document storage is not ready: '+r.error.message);
 refs=r.data?.content||{cv:'',example:'',header:{}};refsOwner=owner;refsRevision=r.data?.revision??null;return refs;
}
function capture(){
 if(!state)return {};
 return {application:el('draftApplication')?.value||'',cv_page1:el('draftCv1')?.value||'',cv_page2:el('draftCv2')?.value||'',advert:el('workspaceAdvert')?.value||'',notes:el('workspaceNotes')?.value||'',follow_up:el('workspaceFollowup')?.value||''};
}
async function saveRow(table,key,content,revision){
 const owner=uid();requireOwner(owner);
 const db=bridge().db;let r;
 if(revision===null){r=await db.from(table).insert({...key,user_id:owner,content}).select('revision').single();}
 else{
  let q=db.from(table).update({content}).eq('user_id',owner).eq('revision',revision);
  for(const [k,v] of Object.entries(key))q=q.eq(k,v);
  r=await q.select('revision').maybeSingle();
 }
 requireOwner(owner);
 if(r.error)throw Error(r.error.code==='23505'?'Another window saved this record. Reopen it before saving again.':r.error.message);
 if(!r.data)throw Error('This record changed in another window. Reopen it before saving again.');
 return r.data.revision;
}
window.openMasterDocuments=async function(){
 if(state?.dirty&&!confirm('Open master documents and discard unsaved job edits?'))return;
 try{
  const owner=uid();const r=await loadRefs();requireOwner(owner);state={owner,reference:true,dirty:false};
  modal('My master documents','<p class="muted">Private to your signed-in account. PDF text is extracted on this device; Save stores the extracted text and header settings, not the original files.</p><div class="workspace-two"><section>'+field('refCv','Master CV — factual source',r.cv,true)+'<label class="workspace-field">Import CV PDF<input type="file" id="cvPdf" accept="application/pdf" data-pdf="refCv"></label></section><section>'+field('refExample','Example application — style reference',r.example,true)+'<label class="workspace-field">Import example PDF<input type="file" id="letterPdf" accept="application/pdf" data-pdf="refExample"></label></section></div><h3>Shared document header</h3><p class="muted">Check these against your master CV. Both documents use the same navy/teal, left-aligned header.</p><div class="workspace-two">'+field('refName','Full name',r.header?.name)+field('refContacts','Contact line (separate items with |)',r.header?.contacts)+field('refTitleDa','Application professional title — Danish',r.header?.titleDa)+field('refTitleEn','CV professional title — English',r.header?.titleEn)+'</div><button class="btn primary" data-work="saveReferences">Save private references</button>');
  el('luksWorkspace').addEventListener('change',async e=>{
   const target=e.target.dataset.pdf;if(!target)return;
   try{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>12*1024*1024)throw Error('Use a PDF smaller than 12 MB.');
    el('workspaceMessage').textContent='Reading PDF on this device…';
    const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;
    const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
    if(doc.numPages>12)throw Error('Use a master document with at most 12 pages.');
    const pages=[];for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i);const data=await p.getTextContent();let t='';for(const item of data.items)t+=item.str+(item.hasEOL?'\n':' ');pages.push(t);}
    requireOwner(owner);el(target).value=pages.join('\n\n');state.dirty=true;
    el('workspaceMessage').textContent='PDF text extracted. Review names, dates and line breaks before saving.';
   }catch(error){fail(error);}
  });
 }catch(error){fail(error);}
};
window.openJobWorkspace=async function(id){
 if(state?.dirty&&!confirm('Discard unsaved changes and open another job?'))return;
 try{
  const owner=uid();requireOwner(owner);
  const r=await bridge().db.from('jobs').select('*').eq('id',id).eq('user_id',owner).maybeSingle();requireOwner(owner);
  if(r.error||!r.data)throw Error(r.error?.message||'This job is unavailable in your account.');
  const saved=await bridge().db.from('job_workspaces').select('content,revision').eq('user_id',owner).eq('job_id',id).maybeSingle();requireOwner(owner);
  if(saved.error)throw Error('Workspace storage is not ready: '+saved.error.message);
  state={owner,job:r.data,revision:saved.data?.revision??null,dirty:false};
  let references;try{references=await loadRefs();}catch{references={cv:'',example:'',header:{}};}
  requireOwner(owner);
  const j=state.job,d=saved.data?.content||{},proof=C.evidence(j,references.cv,d.advert||j.description),url=C.safeUrl(j.job_url);
  modal(j.title||'Vacancy','<div class="workspace-jobline"><strong>'+esc(j.company||'Unknown employer')+'</strong><span>'+esc(j.location||'Location unspecified')+'</span><span class="pill">'+(C.current(j)?'Verified current':'Needs vacancy check')+'</span>'+(url?'<a class="btn" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Original advert ↗</a>':'')+'</div><nav class="workspace-tabs" aria-label="Workspace sections"><a href="#workAdvert">Advert & match</a><a href="#workDrafts">Drafts & downloads</a><a href="#workTracking">Tracking</a></nav><section id="workAdvert"><h3>Advert and match evidence</h3>'+field('workspaceAdvert','Complete advert — paste and review the original text',d.advert||j.description||'',true)+'<div class="workspace-two"><div class="card"><b>Terms also found in your master CV</b><p>'+esc(proof.supported.join(' · ')||'No shared terms identified yet.')+'</p></div><div class="card"><b>Advert terms not found in the master CV</b><p>'+esc(proof.notFound.join(' · ')||'No additional terms identified.')+'</p></div></div><p class="muted">This is a keyword comparison, not an AI assessment. It does not establish experience level or infer missing qualifications. The saved match score is '+esc(j.match_score??'unavailable')+'. Compare the full advert with your CV.</p><div class="row"><button class="btn" data-work="refreshEvidence">Refresh comparison</button><button class="btn" data-work="verify">Verify live vacancy</button><button class="btn" data-work="references">My master documents</button></div></section><section id="workDrafts"><h3>Prepare with your ChatGPT</h3><p class="muted">This version prepares a packet for you to paste into ChatGPT. It does not connect to your subscription or generate automatically inside this website. No packet is sent to OpenAI by LUKS COMMAND.</p><ol class="workspace-steps"><li>Check the full advert and your master documents.</li><li>Copy the packet, open ChatGPT, and paste it there.</li><li>Paste the returned JSON below and review every claim.</li></ol><div class="row"><button class="btn primary" data-work="packet">Copy ChatGPT packet</button><a class="btn" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT ↗</a></div><label class="workspace-field">Packet preview / manual copy<textarea class="textarea" id="workspacePacket" readonly rows="4"></textarea></label>'+field('workspaceResponse','Paste ChatGPT response (JSON)','',true)+'<button class="btn" data-work="importDraft">Load returned drafts</button><div class="workspace-two">'+field('draftApplication','Danish application — one A4 page',d.application||'',true)+'<div>'+field('draftCv1','English CV — page 1',d.cv_page1||'',true)+field('draftCv2','English CV — page 2',d.cv_page2||'',true)+'</div></div><label class="workspace-review"><input type="checkbox" id="workspaceReviewed"> I checked all facts, names, dates and employer details against my master CV and advert.</label><p class="muted">PDF exports enforce 1 application page and 2 CV pages. If text does not fit, shorten it. Word pagination can vary by editor; check it before submitting. Both formats use Arial/Helvetica-compatible typography and matching headers.</p><div class="row"><button class="btn" data-work="applicationPdf">Application PDF</button><button class="btn" data-work="applicationWord">Application Word</button><button class="btn" data-work="cvPdf">CV PDF</button><button class="btn" data-work="cvWord">CV Word</button></div></section><section id="workTracking"><h3>Tracking and private notes</h3><div class="workspace-two"><label class="workspace-field">Job stage<select class="select" id="workspaceStage">'+['discovered','saved','ready','applied','interview','offer','rejected','closed'].map(s=>'<option value="'+s+'"'+(s===j.status?' selected':'')+'>'+s+'</option>').join('')+'</select></label>'+field('workspaceFollowup','Personal follow-up date',d.follow_up||'','')+'</div>'+field('workspaceNotes','Private workspace notes',d.notes||'',true)+'<div class="row"><button class="btn" data-work="stage">Update job stage</button><button class="btn primary" data-work="save">Save drafts and notes</button></div><p class="muted">Drafts and follow-up dates do not mark a job as applied. Your existing applications remain intact. Nothing is sent to employers.</p></section>');
  el('workspaceFollowup').type='date';
 }catch(error){fail(error);}
};
function download(data,name,type){
 const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function pdfBytes(kind,draft,header){
 const {PDFDocument,StandardFonts,rgb}=window.PDFLib||{};if(!PDFDocument)throw Error('PDF export tools are unavailable. Reload the page and retry.');
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const bodies=kind==='application'?[draft.application]:[draft.cv_page1,draft.cv_page2];
 const plain=s=>String(s||'').replace(/[\u2010\u2011]/g,'-').replace(/[\u00a0\u202f]/g,' ');
 for(const [n,body] of bodies.entries()){
  const page=pdf.addPage([595.28,841.89]);const size=kind==='application'?11:10.5,width=487.28,leading=kind==='application'?15:13.3;
  const hdr=[{text:header.name,size:20,font:bold,color:rgb(.12,.25,.36)},{text:kind==='application'?header.titleDa:header.titleEn,size:10,font:bold,color:rgb(.05,.36,.39)},{text:header.contacts,size:8.5,font,color:rgb(.25,.3,.35)}];
  let y=790;
  for(const h of hdr){const ls=C.lines(plain(h.text),h.font,h.size,width);for(const line of ls){page.drawText(line,{x:54,y,size:h.size,font:h.font,color:h.color});y-=h.size*1.35;}y-=6;}
  page.drawLine({start:{x:54,y},end:{x:541.28,y},thickness:.5,color:rgb(.35,.55,.58)});y-=22;
  let ls;try{ls=C.lines(plain(body),font,size,width);}catch{throw Error('A character cannot be exported with the standard PDF font. Replace decorative symbols in the draft.');}
  const height=ls.reduce((h,line)=>h+(line?leading:leading*.6),0);
  if(height>y-65)throw Error((kind==='application'?'Application':'CV page '+(n+1))+' is too long for A4. Shorten the draft; the export will not shrink it or cut text off.');
  for(const line of ls){if(line)page.drawText(line,{x:54,y,size,font,color:rgb(.14,.18,.23)});y-=line?leading:leading*.6;}
  page.drawText((header.name||'')+' | '+(n+1),{x:54,y:35,size:8,font,color:rgb(.4,.45,.5)});
 }
 return pdf.save();
}
async function exportFile(kind,word){
 const ticket=state,job=state.job;requireState(ticket);if(!el('workspaceReviewed').checked)throw Error('Check the factual review box before exporting.');
 const draft=C.cleanDraft(capture()),r=await loadRefs(),h=r.header||{};
 if(!h.name||!h.contacts||!h.titleDa||!h.titleEn)throw Error('Complete the shared header in My master documents first.');
 const pdf=await pdfBytes(kind,draft,h);requireState(ticket); // Preflight both formats against the fixed A4 layout.
 if(!word){download(pdf,C.filename(job,kind,'pdf'),'application/pdf');return;}
 const blob=await wordBlob(kind,draft,h);requireState(ticket);download(blob,C.filename(job,kind,'docx'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
async function wordBlob(kind,draft,h,api){
 const D=api||window.docx;if(!D)throw Error('Word export tools are unavailable. Reload the page and retry.');
 const bodies=kind==='application'?[draft.application]:[draft.cv_page1,draft.cv_page2];
 const sections=bodies.map(body=>({properties:{page:{size:{width:11906,height:16838},margin:{top:1030,right:1080,bottom:1080,left:1080}}},children:[
  new D.Paragraph({children:[new D.TextRun({text:h.name,bold:true,color:'1F405C',size:40})],spacing:{after:120}}),
  new D.Paragraph({children:[new D.TextRun({text:kind==='application'?h.titleDa:h.titleEn,bold:true,color:'0D5C64',size:20})],spacing:{after:100}}),
  new D.Paragraph({children:[new D.TextRun({text:h.contacts,size:17,color:'40505F'})],spacing:{after:240},border:{bottom:{color:'8AAFB3',style:D.BorderStyle.SINGLE,size:4,space:8}}}),
  ...body.replace(/\r/g,'').split('\n').map(text=>new D.Paragraph({children:[new D.TextRun({text,size:kind==='application'?22:21})],spacing:{after:text?55:100,line:kind==='application'?285:265}}))
 ]}));
 const doc=new D.Document({styles:{default:{document:{run:{font:'Arial',size:21}}}},sections});
 return D.Packer.toBlob(doc);
}

async function action(name){
 if(name==='close'){close();return;}if(!state)return;const ticket=state;requireState(ticket);
 if(name==='references'){await window.openMasterDocuments();return;}
 if(name==='saveReferences'){
  const cv=el('refCv').value.trim(),example=el('refExample').value.trim();
  if(cv.length<200||example.length<100)throw Error('Import and review both master documents first.');
  if(cv.length>150000||example.length>60000)throw Error('Reference documents are too large.');
  const value={cv,example,header:{name:el('refName').value.trim(),contacts:el('refContacts').value.trim(),titleDa:el('refTitleDa').value.trim(),titleEn:el('refTitleEn').value.trim()}};
  refsRevision=await saveRow('job_application_references',{},value,refsRevision);requireState(ticket);refs=value;refsOwner=state.owner;state.dirty=false;el('workspaceMessage').textContent='Private master documents saved.';return;
 }
 if(name==='save'){
  const data=capture();if(data.follow_up&&!/^\d{4}-\d{2}-\d{2}$/.test(data.follow_up))throw Error('Use a valid follow-up date.');
  const revision=await saveRow('job_workspaces',{job_id:ticket.job.id},data,ticket.revision);requireState(ticket);state.revision=revision;state.dirty=false;el('workspaceMessage').textContent='Drafts and notes saved to your private account.';return;
 }
 if(name==='packet'){
  const r=await loadRefs();requireState(ticket);if(!bridge().denmarkJob(ticket.job))throw Error('Only Denmark vacancies can be prepared here.');const text=C.packet(ticket.job,r,el('workspaceAdvert').value);
  el('workspacePacket').value=text;
  try{await navigator.clipboard.writeText(text);el('workspaceMessage').textContent='Packet copied. Paste it into ChatGPT yourself.';}catch{el('workspaceMessage').textContent='Select and copy the packet preview manually.';}
  return;
 }
 if(name==='importDraft'){
  const d=C.cleanDraft(el('workspaceResponse').value);el('draftApplication').value=d.application;el('draftCv1').value=d.cv_page1;el('draftCv2').value=d.cv_page2;el('workspaceReviewed').checked=false;state.dirty=true;el('workspaceMessage').textContent='Drafts loaded. Review every factual claim before exporting.';return;
 }
 if(name==='refreshEvidence'){
  const r=await loadRefs();requireState(ticket);const p=C.evidence(ticket.job,r.cv,el('workspaceAdvert').value);el('workspaceMessage').textContent='Shared terms: '+(p.supported.join(', ')||'none')+'. Not found in master CV: '+(p.notFound.join(', ')||'none')+'.';return;
 }
 if(name==='verify'){
  const job=state.job,owner=state.owner;
  const r=await bridge().db.functions.invoke('verify-job',{body:{url:job.job_url,title:job.title,deadline:job.deadline}});requireOwner(owner);
  if(r.error)throw r.error;if(!r.data?.conclusive)throw Error(r.data?.reason||'Verification was inconclusive. Existing job state preserved.');
  const patch={verified_open:!!r.data.verified_open,verification_status:r.data.status,verified_at:r.data.verified_at||new Date().toISOString(),verification_evidence:r.data.reason||''};
  const q=await bridge().db.from('jobs').update(patch).eq('user_id',owner).eq('id',job.id);requireState(ticket);if(q.error)throw q.error;Object.assign(job,patch);
  el('workspaceMessage').textContent=r.data.reason;return;
 }
 if(name==='stage'){
  const value=el('workspaceStage').value;if(!['discovered','saved','ready','applied','interview','offer','rejected','closed'].includes(value))throw Error('Invalid stage.');
  const r=await bridge().db.from('jobs').update({status:value,updated_at:new Date().toISOString()}).eq('id',state.job.id).eq('user_id',state.owner);requireState(ticket);if(r.error)throw r.error;state.job.status=value;el('workspaceMessage').textContent='Job stage updated. Application records were preserved.';return;
 }
 if(name==='applicationPdf'||name==='applicationWord'||name==='cvPdf'||name==='cvWord'){await exportFile(name.startsWith('cv')?'cv':'application',name.endsWith('Word'));return;}
}
function theme(value){
 if(!['system','light','dark'].includes(value))value='system';
 try{localStorage.setItem('luks-theme',value);}catch{}
 document.documentElement.dataset.theme=value==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):value;
 window.__luksTheme=value;document.querySelectorAll('[data-theme-picker]').forEach(s=>s.value=value);
}
function controls(){
 if(state&&state.owner!==uid()){close(true);refs=null;refsOwner=null;refsRevision=null;}
 const aside=document.querySelector('.shell aside');
 if(aside&&!aside.querySelector('.workspace-tools')){
  const node=document.createElement('div');node.className='workspace-tools';node.innerHTML='<label>Appearance<select class="select" data-theme-picker aria-label="Appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><button class="btn" type="button" data-master-docs>My master documents</button>';
  aside.insertBefore(node,aside.querySelector('nav'));node.querySelector('select').value=window.__luksTheme||'system';node.querySelector('select').addEventListener('change',e=>theme(e.target.value));node.querySelector('button').onclick=window.openMasterDocuments;
 }
}
let initial='system';try{initial=localStorage.getItem('luks-theme')||'system';}catch{}theme(initial);
matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(window.__luksTheme==='system')theme('system');});
new MutationObserver(controls).observe(document.getElementById('root'),{childList:true,subtree:true});controls();
window.addEventListener('beforeunload',e=>{if(state?.dirty){e.preventDefault();e.returnValue='';}});
window.LuksWorkspaceExports={pdfBytes,wordBlob}; // Pure document function, also used by release tests.
})();
