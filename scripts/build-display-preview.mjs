// Render the real UI against isolated sample data, only on Netlify PR previews.
import {readFileSync, writeFileSync} from 'node:fs';
import vm from 'node:vm';
if (process.env.CONTEXT !== 'deploy-preview') process.exit(0);
const html=readFileSync('index.html','utf8');
const style=html.match(/<style>([\s\S]*?)<\/style>/)[1]+'\n'+readFileSync('theme.css','utf8')+'\n'+readFileSync('job-workspace.css','utf8');
writeFileSync('dist/preview-workspace-runtime.js',readFileSync('scripts/preview-workspace-runtime.js','utf8'));
const now=new Date().toISOString();
const jobs=[
  ['BIM Coordinator','Example Engineering','Copenhagen',92,'discovered'],
  ['Architectural Technologist','Example Architecture','Ishøj',87,'saved'],
  ['Technical Documentation Coordinator','Example Construction','Roskilde',81,'ready'],
  ['Junior Project Coordinator','Example Projects','Copenhagen',78,'applied'],
  ['Revit Designer','Example Studio','Odense',85,'interview'],
  ['Facilities Coordinator','Example Facilities','Køge',76,'closed']
].map(([title,company,location,match_score,status],i)=>({id:String(i),title,company,location,match_score,status,verified_open:status!=='closed',verification_status:status==='closed'?'closed':'open',verified_at:now,created_at:now,published_at:now,updated_at:new Date(Date.now()-10*86400000).toISOString(),deadline:status==='closed'?'2020-01-01':new Date(Date.now()+3*86400000).toISOString(),work_mode:'Hybrid',employment_type:'Full time',source_name:'Sample employer',job_url:'https://example.com/vacancy/'+i}));
const tables={jobs,projects:[],tasks:[],applications:[],career_profiles:{professional_title:'Architectural Technologist / BIM Coordinator',preferred_roles:['BIM Coordinator','Architectural Technologist','Revit Designer','Facilities Coordinator'],master_cv_file_name:'Sample profile'},job_sources:[{name:'Sample employer',source_group:'Employers',last_checked_at:now}],job_scan_requests:[{status:'partial',requested_at:now,message:'Sample scan completed. Some sources could not be checked.'}],job_scan_runs:[{status:'partial',started_at:now,sources_checked:36,vacancies_found:18,verified_open:5,imported_count:4,rejected_count:13,metadata:{failed_sources:2}}],job_discoveries:jobs};
const db={from(name){const q={then(resolve){return Promise.resolve({data:tables[name]||[]}).then(resolve)}};for(const method of ['select','order','limit','eq','neq','maybeSingle','range'])q[method]=()=>q;return q;}};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const page of ['dashboard','scanner','career']){
  const nodes=new Map();
  const E=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:''});return nodes.get(id)};
  const context=vm.createContext({db,E,esc,page,user:null,localMode:false,window:null,document:{querySelectorAll:()=>[]},URL,Intl,Date,console,setTimeout:()=>0,clearInterval(){},MY_SITES:[],projectCard:()=>'',siteCard:()=>''});
  context.window=context;
  vm.runInContext(readFileSync('job-role-categories.js','utf8'),context);
  vm.runInContext(readFileSync('scanner.js','utf8'),context);
  context.user={id:'sample-owner'};
  context.render();
  await context[page]();
  let view=E('view').innerHTML;
  for(const id of ['bestMatchesGrid','careerResults'])view=view.replace('id="'+id+'"></div>','id="'+id+'">'+E(id).innerHTML+'</div>');
  view=view.replace('id="careerCount" class="muted"></span>','id="careerCount" class="muted">'+E('careerCount').textContent+'</span>');
  // Static review only: keep disclosure controls, remove database/action controls.
  const shell=E('root').innerHTML.replace('<div id="view">Loading…</div>','<div id="view">'+view+'</div>').replace(/ on\w+="[^"]*"/g,'');
  const metricScript=page==='scanner'?'<script>window.LuksScannerMetrics='+JSON.stringify(context.LuksScannerMetrics).replace(/</g,'\\u003c')+';window.openScannerMetric='+context.openScannerMetric.toString()+';document.querySelectorAll(\'[data-scan-metric]\').forEach(b=>{b.disabled=false;b.onclick=()=>openScannerMetric(b.dataset.scanMetric)});</script>':'';
  const banner='<div style="padding:12px;background:#15344b;color:white">Display preview · sample data · sample actions only · <button onclick="openJobWorkspace(&quot;sample-job&quot;)">Try workspace</button> · <a href="display-preview.html">All screens</a></div>';
  writeFileSync('dist/display-'+page+'.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LUKS display preview</title><style>'+style+'</style>'+banner+shell.replace(/<button /g,'<button disabled ')+'<script src="theme-init.js"></script><script src="workspace-core.js"></script><script src="preview-workspace-runtime.js"></script><script src="vendor/pdf-lib.min.js"></script><script src="vendor/fontkit.umd.min.js"></script><script src="vendor/docx.umd.js"></script><script src="job-workspace.js"></script>'+metricScript);
}
writeFileSync('dist/display-preview.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LUKS display review</title><style>body{background:#050a12;color:#e8f3ff;font:16px/1.5 system-ui;margin:24px}a{color:#35d9ff}iframe{border:1px solid #215579;border-radius:12px;max-width:100%}nav{display:flex;gap:20px;flex-wrap:wrap}</style><h1>LUKS COMMAND display review</h1><p>Sample data only. Preview pages have no database connection or active job actions.</p><nav><a href="display-dashboard.html">Dashboard</a><a href="display-scanner.html">Scanner</a><a href="display-career.html">Tracking board</a></nav><h2>Mobile dashboard · 390px</h2><iframe title="Mobile dashboard preview" src="display-dashboard.html" width="390" height="1100"></iframe><h2>Desktop dashboard</h2><iframe title="Desktop dashboard preview" src="display-dashboard.html" width="1400" height="1100"></iframe></html>');

