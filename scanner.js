
(function(){
  const oldRender = window.render;
  window.render = function(){
    if(!user&&!localMode) return login();
    E("root").innerHTML='<div class="shell"><aside><div class="brand">Luks Command</div><nav>'+
      ["dashboard","career","scanner","projects","sites","tasks","settings"].map(x=>'<button class="'+(page===x?"active":"")+'" onclick="go(\''+x+'\')">'+(x==="scanner"?"Job Scanner":x[0].toUpperCase()+x.slice(1))+'</button>').join("")+
      '</nav></aside><main><div id="msg"></div><div id="view">Loading…</div></main></div>';
    loadPage();
  };

  window.loadPage = async function(){
    if(page==="dashboard") return dashboard();
    if(page==="career") return career();
    if(page==="scanner") return scanner();
    if(page==="projects") return projects();
    if(page==="sites") return sites();
    if(page==="tasks") return tasks();
    if(page==="settings") return settings();
  };

  window.dashboard = async function(){
    if(localMode){
      E("view").innerHTML='<div class="row space"><h1>Dashboard</h1><button class="btn" onclick="signOut()">Exit local mode</button></div><div class="grid"><div class="card"><b>Career</b><p class="muted">Open job sources directly.</p></div><div class="card"><b>Daily Job Scanner</b><p class="muted">Sign in to see automated scans.</p></div><div class="card"><b>Projects</b><p class="muted">Open and continue your active projects.</p></div><div class="card"><b>My Sites</b><p class="muted">Open any of your live sites.</p><button class="btn primary" onclick="go(\'sites\')">Open sites</button></div></div>';
      return;
    }
    const [j,p,t,s]=await Promise.all([
      db.from("jobs").select("id,status,verified_open,match_score"),
      db.from("projects").select("*").order("created_at"),
      db.from("tasks").select("*").neq("status","completed"),
      db.from("job_scan_runs").select("*").order("started_at",{ascending:false}).limit(1)
    ]);
    const jobs=j.data||[];
    const last=s.data&&s.data[0]?s.data[0]:null;
    const openCount=jobs.filter(x=>x.verified_open).length;
    const highCount=jobs.filter(x=>(x.match_score||0)>=75).length;
    E("view").innerHTML=
      '<div class="row space"><div><h1>Dashboard</h1><div class="muted">Database-backed Command Centre</div></div><button class="btn" onclick="signOut()">Sign out</button></div>'+
      '<div class="grid">'+
      '<div class="card"><b>'+jobs.length+'</b><div class="muted">Tracked jobs</div></div>'+
      '<div class="card"><b>'+openCount+'</b><div class="muted">Verified open</div></div>'+
      '<div class="card"><b>'+highCount+'</b><div class="muted">75%+ matches</div></div>'+
      '<div class="card"><b>'+(t.data?t.data.length:0)+'</b><div class="muted">Open tasks</div></div>'+
      '</div>'+
      '<div class="card"><div class="row space"><div><b style="font-size:18px">Daily Job Scanner</b><div class="muted">'+(last?('Last scan: '+new Date(last.started_at).toLocaleString()):'No automated scan has run yet')+'</div></div><button class="btn primary" onclick="go(\'scanner\')">Open scanner</button></div>'+
      (last?'<div class="row" style="margin-top:10px"><span class="pill">'+esc(last.status)+'</span><span class="pill">'+(last.sources_checked||0)+' sources</span><span class="pill">'+(last.vacancies_found||0)+' found</span><span class="pill">'+(last.verified_open||0)+' verified</span></div>':'')+
      '</div>'+
      '<h2>Projects</h2><div class="grid">'+(p.data||[]).map(projectCard).join("")+'</div>'+
      '<h2>My Sites</h2><div class="grid">'+MY_SITES.map(siteCard).join("")+'</div>';
  };

  window.jobTable = function(rows){
    return '<div class="card" style="overflow:auto"><table id="jobsTable"><thead><tr><th>Role</th><th>Company</th><th>Match</th><th>Status</th><th>Verification</th><th>Actions</th></tr></thead><tbody>'+
    rows.map(j=>'<tr data-text="'+esc(((j.title||"")+" "+(j.company||"")+" "+(j.location||"")).toLowerCase())+'" data-score="'+(j.match_score||0)+'">'+
      '<td><b>'+esc(j.title)+'</b><div class="muted">'+esc(j.location||"")+'</div></td>'+
      '<td>'+esc(j.company)+'</td>'+
      '<td><b>'+(j.match_score==null?'—':j.match_score+'%')+'</b></td>'+
      '<td>'+esc(j.status)+'</td>'+
      '<td>'+(j.verified_open?'<span class="good">Open</span>':esc(j.verification_status||"unverified"))+'</td>'+
      '<td><div class="row">'+(j.job_url?'<button class="btn" onclick="openExternal(\''+j.job_url+'\')">Open</button>':'')+'<button class="btn" onclick="setJobStatus(\''+j.id+'\',\'reviewing\')">Review</button><button class="btn" onclick="setJobStatus(\''+j.id+'\',\'dismissed\')">Dismiss</button></div></td>'+
    '</tr>').join("")+
    '</tbody></table></div>';
  };

  window.filterJobRows = function(){
    const q=(E("jobFilter")?E("jobFilter").value:"").toLowerCase().trim();
    const min=Number(E("scoreFilter")?E("scoreFilter").value:0);
    document.querySelectorAll("#jobsTable tbody tr").forEach(tr=>{
      const okText=!q||(tr.dataset.text||"").includes(q);
      const okScore=Number(tr.dataset.score||0)>=min;
      tr.style.display=(okText&&okScore)?"":"none";
    });
  };

  window.setJobStatus = async function(id,status){
    const r=await db.from("jobs").update({status:status}).eq("id",id);
    if(r.error){msg(r.error.message,"bad");return}
    career();
  };

  window.career = async function(){
    let jobs=[];
    if(!localMode){
      const r=await db.from("jobs").select("*").order("created_at",{ascending:false});
      jobs=r.data||[];
    }
    E("view").innerHTML=
      '<div class="row space"><div><h1>Career</h1><div class="muted">Track opportunities from discovery to application.</div></div><div class="row"><button class="btn" onclick="go(\'scanner\')">Daily scanner</button><button class="btn primary" onclick="openSources()">Open job websites</button></div></div>'+
      '<div class="card"><b class="good">Current-jobs rule</b><p class="muted">Only verified-open vacancies are treated as current opportunities.</p></div>'+
      (localMode?'':'<div class="row"><input id="jobFilter" class="input" style="max-width:340px" placeholder="Filter title, company or location" oninput="filterJobRows()"><select id="scoreFilter" class="select" style="max-width:180px" onchange="filterJobRows()"><option value="0">All match scores</option><option value="75">75%+</option><option value="85">85%+</option><option value="90">90%+</option></select></div><h2>Tracked jobs</h2>'+jobTable(jobs));
  };

  window.scanner = async function(){
    if(localMode){
      E("view").innerHTML='<h1>Daily Job Scanner</h1><div class="card muted">Sign in to see automated scans and matched vacancies.</div>';
      return;
    }
    const [runs,jobs,profile,sources]=await Promise.all([
      db.from("job_scan_runs").select("*").order("started_at",{ascending:false}).limit(10),
      db.from("jobs").select("*").eq("verified_open",true).order("match_score",{ascending:false}).limit(50),
      db.from("career_profiles").select("professional_title,preferred_roles,preferred_locations,skills,master_cv_file_name").maybeSingle(),
      db.from("job_sources").select("name,domain,source_group,enabled,last_checked_at,useful_hits,rejected_hits").eq("enabled",true).order("source_group").order("name")
    ]);
    const runRows=runs.data||[];
    const jobRows=jobs.data||[];
    const p=profile.data||{};
    const sourceRows=sources.data||[];
    const sourceGroups=[...new Set(sourceRows.map(s=>s.source_group||"Other"))];
    const last=runRows[0]||null;
    E("view").innerHTML=
      '<div class="row space"><div><h1>Daily Job Scanner</h1><div class="muted">Automatic searches use your master career profile and only keep verified-open vacancies.</div></div><button class="btn" onclick="openSources()">Open sources manually</button></div>'+
      '<div class="grid">'+
      '<div class="card"><b>'+(last?new Date(last.started_at).toLocaleDateString():'—')+'</b><div class="muted">Last scan</div></div>'+
      '<div class="card"><b>'+(last?last.vacancies_found:0)+'</b><div class="muted">Found in last scan</div></div>'+
      '<div class="card"><b>'+(last?last.verified_open:0)+'</b><div class="muted">Verified open</div></div>'+
      '<div class="card"><b>'+jobRows.filter(x=>(x.match_score||0)>=75).length+'</b><div class="muted">75%+ current matches</div></div>'+
      '</div>'+
      '<div class="card"><div class="row space"><div><b>Master profile</b><p>'+esc(p.professional_title||"Architectural Technologist / BIM Coordinator")+'</p><div class="muted">CV: '+esc(p.master_cv_file_name||"Master CV")+'</div></div><div><span class="pill">'+sourceRows.length+' enabled sources</span><span class="pill">'+sourceGroups.length+' source groups</span></div></div><div style="margin-top:8px">'+((p.preferred_roles||[]).slice(0,8).map(x=>'<span class="pill">'+esc(x)+'</span>').join(""))+'</div></div>'+
      '<div class="card"><div class="row space"><div><b>Search registry from your attached source list</b><div class="muted">The daily scan uses these sources plus newly discovered relevant employers.</div></div><button class="btn" onclick="showSourceRegistry()">View sources</button></div></div>'+
      '<h2>Best current matches</h2>'+jobTable(jobRows)+
      '<h2>Source registry</h2><div class="card"><div class="row"><input id="sourceFilter" class="input" style="max-width:360px" placeholder="Filter company or source" oninput="filterSourceRegistry()"><select id="sourceGroup" class="select" style="max-width:260px" onchange="filterSourceRegistry()"><option value="">All groups</option>'+[...new Set(sourceRows.map(s=>s.source_group).filter(Boolean))].map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join("")+'</select></div><div style="overflow:auto;margin-top:10px"><table id="sourceRegistry"><thead><tr><th>Source</th><th>Group</th><th>Last checked</th><th>Open</th></tr></thead><tbody>'+sourceRows.map(s=>'<tr data-text="'+esc(((s.name||"")+" "+(s.source_group||"")).toLowerCase())+'" data-group="'+esc(s.source_group||"")+'"><td><b>'+esc(s.name)+'</b></td><td>'+esc(s.source_group||"")+'</td><td>'+((s.last_checked_at)?new Date(s.last_checked_at).toLocaleString():"Not yet")+'</td><td>'+((s.domain||"").startsWith("http")?'<button class="btn" onclick="openExternal(\''+s.domain+'\')">Open</button>':'<span class="muted">Search target</span>')+'</td></tr>').join("")+'</tbody></table></div></div><h2>Recent scans</h2><div class="card" style="overflow:auto"><table><thead><tr><th>Date</th><th>Status</th><th>Sources</th><th>Found</th><th>Verified</th><th>Imported</th></tr></thead><tbody>'+
      runRows.map(x=>'<tr><td>'+new Date(x.started_at).toLocaleString()+'</td><td>'+esc(x.status)+'</td><td>'+x.sources_checked+'</td><td>'+x.vacancies_found+'</td><td>'+x.verified_open+'</td><td>'+x.imported_count+'</td></tr>').join("")+
      '</tbody></table></div>';
  };


  window.showSourceRegistry = async function(){
    const r=await db.from("job_sources").select("name,domain,source_group,enabled,last_checked_at,useful_hits,rejected_hits").eq("enabled",true).order("source_group").order("name");
    if(r.error){msg(r.error.message,"bad");return}
    const rows=r.data||[];
    const groups=[...new Set(rows.map(x=>x.source_group||"Other"))];
    const html=groups.map(g=>{
      const items=rows.filter(x=>(x.source_group||"Other")===g);
      return '<div class="card"><b>'+esc(g)+'</b><div class="muted">'+items.length+' sources</div><div style="margin-top:10px">'+items.map(s=>{
        const clickable=(s.domain||"").startsWith("http");
        return '<div class="row space" style="padding:6px 0;border-bottom:1px solid #eef2f7"><span>'+esc(s.name)+'</span>'+(clickable?'<button class="btn" onclick="openExternal(\''+s.domain+'\')">Open</button>':'<span class="muted">search target</span>')+'</div>';
      }).join("")+'</div></div>';
    }).join("");
    document.body.insertAdjacentHTML("beforeend",'<div class="overlay"><div class="modal"><div class="row space"><div><h2>Job Source Registry</h2><div class="muted">'+rows.length+' enabled sources used by the daily scan.</div></div><button class="btn" onclick="closeModal()">Close</button></div>'+html+'</div></div>');
  };

  window.settings = function(){
    E("view").innerHTML='<h1>Settings</h1><div class="card"><b>Mode</b><p class="muted">'+(localMode?"Local mode":"Online Supabase mode")+'</p></div><div class="card"><b>Daily Job Search</b><p class="muted">Uses your master career profile, verifies that vacancies are still open, and prioritizes strong matches.</p></div>';
  };

  if(user||localMode) render();
})();

window.filterSourceRegistry = function(){
  const q=(E("sourceFilter")?.value||"").toLowerCase().trim();
  const g=E("sourceGroup")?.value||"";
  document.querySelectorAll("#sourceRegistry tbody tr").forEach(tr=>{
    const textOk=!q||(tr.dataset.text||"").includes(q);
    const groupOk=!g||tr.dataset.group===g;
    tr.style.display=(textOk&&groupOk)?"":"none";
  });
};
