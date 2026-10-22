
(function(){
 const cv='Architectural Technologist. Example Engineering | 2022–2026. Revit modelling, Navisworks clash detection, Dalux issue tracking, technical drawings and documentation. English and Danish. This is fictional sample data.';
 const example='Kære Example. Jeg arbejder med BIM, Revit og tekniske tegninger. Jeg vil gerne bidrage til klare digitale leverancer hos jer. Venlig hilsen Sample Candidate. This is a fictional example for UI review only.';
 const profile={cv,example,header:{name:'Sample Candidate',titleDa:'Bygningskonstruktør | BIM | Revit',titleEn:'Architectural Technologist | BIM Coordinator',contacts:'candidate@example.test | Ishøj, Denmark'}};
 const store={job_application_references:{content:profile,revision:1},job_workspaces:null};
 const job={id:'sample-job',user_id:'sample-owner',title:'BIM Coordinator',company:'Example Engineering',location:'Copenhagen, Denmark',status:'saved',verified_open:true,verified_at:new Date().toISOString(),verification_status:'open',match_score:92,job_url:'https://example.com/',description:'Example Engineering is looking for a BIM Coordinator in Copenhagen. You will work with Revit models, Navisworks clash detection, Dalux issues and clear technical drawings. The role supports architecture, structure and MEP coordination. Danish and English communication is useful. This is a fictional sample advert for interface testing.'};
 window.LuksBridge={user:()=>({id:'sample-owner'}),denmarkJob:()=>true,refresh(){},db:{functions:{async invoke(name){return name==='job-advert'?{data:{text:'Example Engineering is looking for a BIM Coordinator in Copenhagen, Denmark. '+('Work with Revit models, Navisworks clash detection, Dalux issues, technical drawings and clear documentation. '.repeat(8))+'This is fictional sample advert text for testing automatic retrieval.'}}:{error:{message:'Sample verification is unavailable'}};}},from(table){
  let mode='select',value;const q={select(){return q},eq(){return q},maybeSingle(){return q},single(){return q},insert(v){mode='insert';value=v;return q},update(v){mode='update';value=v;return q},then(resolve){
   if(table==='jobs'){if(value)Object.assign(job,value);return Promise.resolve({data:job}).then(resolve);}
   if(mode!=='select')store[table]={content:value.content,revision:(store[table]?.revision||0)+1};
   return Promise.resolve({data:store[table]||null}).then(resolve);
  }};return q;
 }}};
})();
