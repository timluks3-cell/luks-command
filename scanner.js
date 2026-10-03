
(function(){
  const oldRender = window.render;
  window.render = function(){
    if(!user&&!localMode) return login();
    E("root").innerHTML='<div class="shell"><aside><div class="brand">Luks Command</div><nav>'+
      ["dashboard","career","scanner","projects","sites","tasks","settings"].map(x=>'<button class="'+(page===x?"active":"")+'" onclick="go(\''+x+'\')">'+(x==="scanner"?"Job Scanner":x[0].toUpperCase()+x.slice(1))+'</button>').join("")+
      '</nav><div style="position:absolute;bottom:18px;left:26px"><div class="kicker">SYSTEM STATUS</div><span class="status-chip status-online">ONLINE</span></div></aside><main><div id="msg"></div><div id="view">Loading…</div></main></div>';
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


  function missionStatus(status){
    const s=String(status||"standby").toLowerCase();
    if(["completed","complete","open","online"].includes(s)) return {label:s==="open"?"ONLINE":"COMPLETE",cls:"status-complete"};
    if(["running","scanning","searching"].includes(s)) return {label:"SCANNING",cls:"status-scanning"};
    if(["failed","error","blocked"].includes(s)) return {label:"ERROR",cls:"status-error"};
    return {label:"STANDBY",cls:"status-standby"};
  }
  function statusChip(status){
    const x=missionStatus(status);
    return '<span class="status-chip '+x.cls+'">'+x.label+'</span>';
  }
  function metric(value,label){
    return '<div class="metric"><div class="label">'+esc(label)+'</div><div class="value">'+esc(value)+'</div></div>';
  }
  function safeDate(v){return v?new Date(v).toLocaleDateString("en-GB"):"—"}
  function safeText(v,fallback="—"){return (v===null||v===undefined||v==="")?fallback:String(v)}
  function vacancyCard(j){
    const score=j.match_score==null?'<div class="match-score unknown">NO SCORE</div>':'<div class="match-score">'+esc(j.match_score)+'% MATCH</div>';
    const ver=j.verified_open?statusChip("online"):statusChip(j.verification_status||"standby");
    const applied=String(j.status||"").toLowerCase()==="applied";
    const closed=["closed","dismissed"].includes(String(j.status||"").toLowerCase())||["closed","expired"].includes(String(j.verification_status||"").toLowerCase());
    return '<article class="vacancy" data-job-row data-text="'+esc(((j.title||"")+" "+(j.company||"")+" "+(j.location||"")+" "+(j.source_name||"")).toLowerCase())+'" data-score="'+Number(j.match_score||0)+'">'+
      '<div class="vacancy-top"><div><div class="job-title">'+esc(j.title||"Untitled vacancy")+'</div><div class="company">'+esc(j.company||"Unknown company")+'</div></div>'+score+'</div>'+
      '<div class="job-meta">'+
        '<div><b>Location</b><br>'+esc(safeText(j.location))+'</div>'+
        '<div><b>Published</b><br>'+esc(safeDate(j.published_at))+'</div>'+
        '<div><b>Deadline</b><br>'+esc(safeDate(j.deadline))+'</div>'+
        '<div><b>Work mode</b><br>'+esc(safeText(j.work_mode))+'</div>'+
        '<div><b>Employment</b><br>'+esc(safeText(j.employment_type))+'</div>'+
        '<div><b>Source</b><br>'+esc(safeText(j.source_name))+'</div>'+
      '</div>'+
      '<div class="row"><span class="muted">Verification</span>'+ver+'<span class="pill">'+esc((j.status||"discovered").toUpperCase())+'</span></div>'+
      '<div class="job-actions">'+
        (j.job_url?'<button class="btn primary" onclick="openExternal(\''+esc(j.job_url)+'\')">Open job advert</button>':'')+
        '<button class="btn '+(applied?'primary':'')+'" onclick="setJobStatus(\''+j.id+'\',\'applied\')">'+(applied?'Applied ✓':'Mark applied')+'</button>'+
        '<button class="btn '+(closed?'danger':'')+'" onclick="setJobStatus(\''+j.id+'\',\'closed\')">'+(closed?'Closed ✓':'Mark closed')+'</button>'+
      '</div></article>';
  }
  function sourceNode(s){
    const st=s.last_checked_at?statusChip("online"):statusChip("standby");
    return '<div class="source-node"><div class="row space"><div class="name">'+esc(s.name||"Source")+'</div>'+st+'</div><div class="stamp">'+esc(s.source_group||"Other")+' · '+(s.last_checked_at?new Date(s.last_checked_at).toLocaleString():"Not checked yet")+'</div></div>';
  }

  window.dashboard = async function(){
    if(localMode){
      E("view").innerHTML='<div class="mission-header"><div><div class="kicker">LUKS COMMAND — MISSION CONTROL</div><h1 class="command-title">Career Operations</h1><div class="command-sub">Sign in to activate live mission data and Supabase-backed job scanning.</div></div><button class="btn" onclick="signOut()">Exit local mode</button></div><div class="grid"><div class="card"><div class="panel-title">Career</div><p class="muted">Open source registry and target vacancies.</p></div><div class="card"><div class="panel-title">Job Scanner</div><p class="muted">Live scanning requires sign-in.</p></div><div class="card"><div class="panel-title">Projects</div><p class="muted">Continue project operations.</p></div><div class="card"><div class="panel-title">My Sites</div><p class="muted">Launch your connected web apps.</p><button class="btn primary" onclick="go(\'sites\')">Open sites</button></div></div>';
      return;
    }
    const [j,p,t,s,r,src,apps]=await Promise.all([
      db.from("jobs").select("*"),
      db.from("projects").select("*").order("created_at"),
      db.from("tasks").select("*").neq("status","completed"),
      db.from("job_scan_runs").select("*").order("started_at",{ascending:false}).limit(1),
      db.from("job_scan_requests").select("*").order("requested_at",{ascending:false}).limit(1),
      db.from("job_sources").select("name,domain,source_group,enabled,last_checked_at,useful_hits,rejected_hits").eq("enabled",true).order("last_checked_at",{ascending:false}).limit(12),
      db.from("applications").select("id")
    ]);
    const jobs=j.data||[], projects=p.data||[], tasks=t.data||[], sources=src.data||[];
    const last=s.data&&s.data[0]?s.data[0]:null;
    const latestRequest=r.data&&r.data[0]?r.data[0]:null;
    const current=jobs.filter(x=>x.verified_open&&!["closed","dismissed"].includes(String(x.status||"").toLowerCase())).sort((a,b)=>(b.match_score||0)-(a.match_score||0));
    const strong=current.filter(x=>(x.match_score||0)>=75);
    const appliedJobs=jobs.filter(x=>String(x.status||"").toLowerCase()==="applied").length;
    const applications=Math.max(appliedJobs,(apps.data||[]).length);
    const closed=jobs.filter(x=>["closed","dismissed"].includes(String(x.status||"").toLowerCase())||["closed","expired"].includes(String(x.verification_status||"").toLowerCase())).length;
    const activeStatus=latestRequest&&["pending","running"].includes(latestRequest.status)?latestRequest.status:(last?.status||"standby");
    E("view").innerHTML=
      '<div class="mission-header"><div><div class="kicker">LUKS COMMAND — MISSION CONTROL</div><h1 class="command-title">Career Mission Dashboard</h1><div class="command-sub">BIM & construction opportunity intelligence · Copenhagen / Zealand / Denmark</div></div><div class="row">'+statusChip(activeStatus)+'<button class="btn" onclick="signOut()">Sign out</button></div></div>'+
      '<div class="scan-console"><section class="scan-hero"><div class="row space"><div><div class="panel-title">Job Scan Status</div><div style="font-size:24px;font-weight:850;margin:9px 0">'+(latestRequest&&["pending","running"].includes(latestRequest.status)?"SCAN IN PROGRESS":last?"SYSTEM READY":"READY FOR FIRST SCAN")+'</div></div>'+statusChip(activeStatus)+'</div><div class="signal">'+esc(latestRequest?.message||(last?("Last scan completed "+new Date(last.started_at).toLocaleString()+". "+(last.summary||"Scanner standing by.")):"Run a full-source scan across the enabled source registry. Verified vacancies will be ranked against your career profile."))+'</div><div style="margin-top:16px"><button id="dashboardScanBtn" class="mission-run" onclick="requestJobScan()">RUN JOB SCAN</button> <button class="btn" onclick="go(\'scanner\')">Open scanner console</button></div></section>'+
      '<section class="mission-panel"><div class="panel-title">Mission Telemetry</div><div style="margin-top:12px">'+
        '<div class="row space"><span class="muted">Scanner</span>'+statusChip(activeStatus)+'</div>'+
        '<div class="row space" style="margin-top:10px"><span class="muted">Authentication</span>'+statusChip("online")+'</div>'+
        '<div class="row space" style="margin-top:10px"><span class="muted">Database</span>'+statusChip("online")+'</div>'+
        '<div class="row space" style="margin-top:10px"><span class="muted">Sources</span>'+statusChip(sources.length?"online":"standby")+'</div>'+
      '</div></section></div>'+
      '<div id="scanRequestStatus">'+scanRequestCard(latestRequest)+'</div>'+
      '<div class="metric-grid">'+
        metric(last?.vacancies_found||0,"Jobs Found")+
        metric(strong.length,"Strong Matches")+
        metric(last?.sources_checked||sources.length,"Sources Checked")+
        metric(applications,"Applications")+
        metric(closed,"Closed Jobs")+
        metric(current.length,"Target Opportunities")+
      '</div>'+
      '<h2>Target Opportunities / Current Vacancies</h2><div class="vacancy-grid">'+(current.slice(0,8).map(vacancyCard).join("")||'<div class="card muted">No verified current vacancies yet. Run a scan to refresh opportunities.</div>')+'</div>'+
      '<h2>Job Source Status</h2><div class="source-list">'+(sources.map(sourceNode).join("")||'<div class="card muted">No enabled sources found.</div>')+'</div>'+
      '<h2>My Sites / Projects</h2><div class="projects-sites"><div><div class="panel-title" style="margin-bottom:10px">Projects</div><div class="grid">'+projects.map(projectCard).join("")+'</div></div><div><div class="panel-title" style="margin-bottom:10px">Sites</div><div class="grid">'+MY_SITES.map(siteCard).join("")+'</div></div></div>';
  };

  window.jobTable = function(rows){
    return '<div id="jobsGrid" class="vacancy-grid">'+(rows.map(vacancyCard).join("")||'<div class="card muted">No jobs in this view.</div>')+'</div>';
  };

  window.filterJobRows = function(){
    const q=(E("jobFilter")?E("jobFilter").value:"").toLowerCase().trim();
    const min=Number(E("scoreFilter")?E("scoreFilter").value:0);
    document.querySelectorAll("[data-job-row]").forEach(el=>{
      const okText=!q||(el.dataset.text||"").includes(q);
      const okScore=Number(el.dataset.score||0)>=min;
      el.style.display=(okText&&okScore)?"":"none";
    });
  };

  window.setJobStatus = async function(id,status){
    const r=await db.from("jobs").update({status:status,updated_at:new Date().toISOString()}).eq("id",id);
    if(r.error){msg(r.error.message,"bad");return}
    if(page==="dashboard") return dashboard();
    if(page==="scanner") return scanner();
    return career();
  };

  window.career = async function(){
    let jobs=[];
    if(!localMode){
      const r=await db.from("jobs").select("*").order("match_score",{ascending:false});
      jobs=r.data||[];
    }
    const current=jobs.filter(j=>j.verified_open&&!["closed","dismissed"].includes(String(j.status||"").toLowerCase()));
    E("view").innerHTML=
      '<div class="mission-header"><div><div class="kicker">OPPORTUNITY CONTROL</div><h1 class="command-title">Career Operations</h1><div class="command-sub">Review, verify and action BIM / construction opportunities.</div></div><div class="row"><button class="mission-run" onclick="requestJobScan()">RUN JOB SCAN</button><button class="btn" onclick="go(\'scanner\')">Scanner console</button><button class="btn" onclick="openSources()">Source websites</button></div></div>'+
      '<div class="card"><div class="row space"><div><div class="panel-title">Current-vacancy protocol</div><p class="muted">Only verified-open jobs are treated as active targets. Closed and expired roles remain visible in the database for history.</p></div>'+statusChip("online")+'</div></div>'+
      (localMode?'':'<div class="jobs-toolbar"><input id="jobFilter" class="input" style="max-width:360px" placeholder="Filter title, company, location or source" oninput="filterJobRows()"><select id="scoreFilter" class="select" style="max-width:180px" onchange="filterJobRows()"><option value="0">All match scores</option><option value="75">75%+</option><option value="85">85%+</option><option value="90">90%+</option></select></div><h2>Target Opportunities / Current Vacancies</h2>'+jobTable(current)+'<h2>Tracked History</h2>'+jobTable(jobs.filter(j=>!current.includes(j))));
  };

  window.scanner = async function(){
    if(localMode){
      E("view").innerHTML='<div class="mission-header"><div><div class="kicker">SCANNER CONSOLE</div><h1 class="command-title">Job Scanner</h1><div class="command-sub">Sign in to activate live scanning.</div></div>'+statusChip("standby")+'</div>';
      return;
    }
    const [runs,jobs,profile,sources,requests,discoveries]=await Promise.all([
      db.from("job_scan_runs").select("*").order("started_at",{ascending:false}).limit(10),
      db.from("jobs").select("*").eq("verified_open",true).order("match_score",{ascending:false}).limit(50),
      db.from("career_profiles").select("professional_title,preferred_roles,preferred_locations,skills,master_cv_file_name").maybeSingle(),
      db.from("job_sources").select("name,domain,source_group,enabled,last_checked_at,useful_hits,rejected_hits").eq("enabled",true).order("source_group").order("name"),
      db.from("job_scan_requests").select("*").order("requested_at",{ascending:false}).limit(5),
      db.from("job_discoveries").select("*").order("created_at",{ascending:false}).limit(500)
    ]);
    const runRows=runs.data||[], jobRows=jobs.data||[], p=profile.data||{}, sourceRows=sources.data||[], requestRows=requests.data||[], discoveryRows=discoveries.data||[];
    const latestRequest=requestRows[0]||null, sourceGroups=[...new Set(sourceRows.map(s=>s.source_group||"Other"))], last=runRows[0]||null;
    const scannerState=latestRequest&&["pending","running"].includes(latestRequest.status)?latestRequest.status:(last?.status||"standby");
    E("view").innerHTML=
      '<div class="mission-header"><div><div class="kicker">LIVE SEARCH OPERATIONS</div><h1 class="command-title">Job Scanner Console</h1><div class="command-sub">Supabase-backed search, verification and match ranking.</div></div><div class="row">'+statusChip(scannerState)+'<button id="scanNowBtn" class="mission-run" onclick="requestJobScan()">RUN JOB SCAN</button><button class="btn" onclick="openSources()">Open sources manually</button></div></div>'+
      '<div id="scanRequestStatus">'+scanRequestCard(latestRequest)+'</div>'+
      '<div class="metric-grid">'+
        metric(last?last.vacancies_found:0,"Jobs Found")+
        metric(jobRows.filter(x=>(x.match_score||0)>=75).length,"Strong Matches")+
        metric(last?last.sources_checked:sourceRows.length,"Sources Checked")+
        metric(last?last.imported_count:0,"Imported")+
        metric(last?last.rejected_count:0,"Rejected")+
        metric(jobRows.length,"Current Vacancies")+
      '</div>'+
      '<div class="scan-console"><div class="mission-panel"><div class="panel-title">Career Profile / Scan Targeting</div><div style="font-size:19px;font-weight:800;margin:10px 0">'+esc(p.professional_title||"Architectural Technologist / BIM Coordinator")+'</div><div class="muted">Master CV: '+esc(p.master_cv_file_name||"Master CV")+'</div><div style="margin-top:14px" class="panel-title">Target Roles</div><div id="roleChips" class="row" style="margin-top:10px">'+((p.preferred_roles||[]).map(x=>roleChip(x)).join(""))+'</div><div class="row" style="margin-top:12px"><input id="newRoleInput" class="input" style="max-width:360px" placeholder="Add role, e.g. BIM Specialist" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addPreferredRole()}"><button class="btn primary" onclick="addPreferredRole()">Add role</button></div></div>'+
      '<div class="mission-panel"><div class="panel-title">Registry Status</div><div class="metric-grid" style="grid-template-columns:1fr 1fr;margin-top:14px">'+metric(sourceRows.length,"Enabled Sources")+metric(sourceGroups.length,"Source Groups")+'</div><button class="btn" onclick="showSourceRegistry()">View source registry</button></div></div>'+
      '<h2>Best Current Matches</h2>'+jobTable(jobRows)+
      '<h2>All Job Postings Found</h2><div class="card"><div class="jobs-toolbar"><input id="discoveryFilter" class="input" style="max-width:360px" placeholder="Filter discovered postings" oninput="filterDiscoveries()"><select id="discoveryStatus" class="select" style="max-width:220px" onchange="filterDiscoveries()"><option value="">All verification states</option><option value="open">Verified open</option><option value="unverified">Unverified</option><option value="closed">Closed</option><option value="expired">Expired</option><option value="blocked">Blocked</option><option value="error">Error</option></select></div>'+discoveryTable(discoveryRows)+'</div>'+
      '<h2>Job Source Status</h2><div class="source-list">'+sourceRows.slice(0,24).map(sourceNode).join("")+'</div>'+
      '<h2>Recent Scan Runs</h2><div class="card" style="overflow:auto"><table><thead><tr><th>Date</th><th>Status</th><th>Sources</th><th>Found</th><th>Verified</th><th>Imported</th></tr></thead><tbody>'+
      runRows.map(x=>'<tr><td>'+new Date(x.started_at).toLocaleString()+'</td><td>'+statusChip(x.status)+'</td><td>'+x.sources_checked+'</td><td>'+x.vacancies_found+'</td><td>'+x.verified_open+'</td><td>'+x.imported_count+'</td></tr>').join("")+
      '</tbody></table></div>';
  };


  function discoveryTable(rows){
    if(!rows.length) return '<div class="muted">No discovered postings are stored yet.</div>';
    return '<div style="overflow:auto"><table id="discoveryTable"><thead><tr><th>Role</th><th>Company</th><th>Source</th><th>Match</th><th>Verification</th><th>Reason</th><th>Link</th></tr></thead><tbody>'+
      rows.map(d=>{
        const text=((d.title||"")+" "+(d.company||"")+" "+(d.location||"")+" "+(d.source_name||"")).toLowerCase();
        const state=d.verification_status||"unverified";
        return '<tr data-text="'+esc(text)+'" data-status="'+esc(state)+'">'+
          '<td><b>'+esc(d.title||"Untitled posting")+'</b><div class="muted">'+esc(d.location||"")+'</div></td>'+
          '<td>'+esc(d.company||"")+'</td>'+
          '<td>'+esc(d.source_name||"")+'</td>'+
          '<td><b>'+(d.match_score==null?'—':d.match_score+'%')+'</b></td>'+
          '<td>'+(d.verified_open?'<span class="good">Open</span>':'<span class="muted">'+esc(state)+'</span>')+'</td>'+
          '<td><div class="muted">'+esc(d.rejected_reason||d.verification_evidence||"")+'</div></td>'+
          '<td>'+(d.job_url?'<button class="btn" onclick="openExternal(\''+d.job_url+'\')">Open posting</button>':'—')+'</td>'+
        '</tr>';
      }).join("")+
    '</tbody></table></div>';
  }

  window.filterDiscoveries = function(){
    const q=(E("discoveryFilter")?.value||"").toLowerCase().trim();
    const status=E("discoveryStatus")?.value||"";
    document.querySelectorAll("#discoveryTable tbody tr").forEach(tr=>{
      const textOk=!q||(tr.dataset.text||"").includes(q);
      const statusOk=!status||tr.dataset.status===status;
      tr.style.display=(textOk&&statusOk)?"":"none";
    });
  };

  function roleChip(role){
    const safe=esc(role);
    const encoded=encodeURIComponent(role);
    return '<span class="pill" style="display:inline-flex;align-items:center;gap:6px">'+safe+'<button type="button" aria-label="Remove '+safe+'" title="Remove role" onclick="removePreferredRole(decodeURIComponent(\''+encoded+'\'))" style="border:0;background:transparent;cursor:pointer;font-size:17px;line-height:1;padding:0 2px">×</button></span>';
  }

  window.addPreferredRole = async function(){
    if(localMode||!user){alert("Sign in to edit target roles.");return}
    const input=E("newRoleInput");
    const role=(input?.value||"").trim().replace(/\s+/g," ");
    if(!role) return;
    if(role.length>80){alert("Please use a shorter role title.");return}

    const r=await db.from("career_profiles").select("preferred_roles").eq("user_id",user.id).maybeSingle();
    if(r.error){msg(r.error.message,"bad");return}
    const roles=Array.isArray(r.data?.preferred_roles)?r.data.preferred_roles:[];
    if(roles.some(x=>String(x).toLowerCase()===role.toLowerCase())){
      alert("That role is already in the list.");
      return;
    }
    const updated=[...roles,role];
    const u=await db.from("career_profiles").update({preferred_roles:updated,updated_at:new Date().toISOString()}).eq("user_id",user.id);
    if(u.error){msg(u.error.message,"bad");return}
    if(input) input.value="";
    await scanner();
  };

  window.removePreferredRole = async function(role){
    if(localMode||!user){alert("Sign in to edit target roles.");return}
    const r=await db.from("career_profiles").select("preferred_roles").eq("user_id",user.id).maybeSingle();
    if(r.error){msg(r.error.message,"bad");return}
    const roles=Array.isArray(r.data?.preferred_roles)?r.data.preferred_roles:[];
    const updated=roles.filter(x=>String(x)!==String(role));
    const u=await db.from("career_profiles").update({preferred_roles:updated,updated_at:new Date().toISOString()}).eq("user_id",user.id);
    if(u.error){msg(u.error.message,"bad");return}
    await scanner();
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


  window.requestJobScan = async function(){
    if(localMode||!user){
      alert("Sign in to run a live scan.");
      return;
    }
    if(window.__liveScanRunning) return;
    window.__liveScanRunning=true;

    const btn=E("scanNowBtn");
    if(btn){btn.disabled=true;btn.textContent="SCANNING…";} const dbtn=E("dashboardScanBtn"); if(dbtn){dbtn.disabled=true;dbtn.textContent="SCANNING…";}

    let req=null;
    let runId=null;
    let offset=0;
    let total=0;
    let checked=0;
    let found=0;
    let verified=0;
    let imported=0;
    let rejected=0;

    try{
      const inserted=await db.from("job_scan_requests")
        .insert({
          user_id:user.id,
          requested_scope:"all_sources",
          status:"pending",
          message:"Starting live scan from Luks Command"
        })
        .select()
        .single();

      if(inserted.error) throw inserted.error;
      req=inserted.data;

      const holder=E("scanRequestStatus");
      if(holder) holder.innerHTML=liveProgressCard({status:"running",checked:0,total:0,found:0,verified:0,imported:0,message:"Connecting to the live job scanner…"});

      while(true){
        const invoke=await db.functions.invoke("scan-jobs",{
          body:{
            scan_request_id:req.id,
            run_id:runId,
            offset:offset,
            limit:8
          }
        });

        if(invoke.error) throw invoke.error;
        const data=invoke.data||{};
        if(data.error) throw new Error(data.error);

        runId=data.run_id||runId;
        offset=data.next_offset||offset;
        total=data.total||total;
        checked=offset;
        found+=Number(data.found||0);
        verified+=Number(data.verified||0);
        imported+=Number(data.imported||0);
        rejected+=Number(data.rejected||0);

        if(holder){
          const pct=total?Math.min(100,Math.round((checked/total)*100)):0;
          holder.innerHTML=liveProgressCard({
            status:data.done?"completed":"running",
            checked:checked,total:total,found:found,verified:verified,imported:imported,rejected:rejected,
            percent:pct,
            message:data.done?"Live scan completed. Refreshing current jobs and source timestamps…":"Searching source registry and verifying direct job postings…"
          });
        }

        if(data.done) break;

        // Small pause keeps the UI responsive and avoids hammering external sites.
        await new Promise(r=>setTimeout(r,250));
      }

      await scanner();
    }catch(err){
      console.error(err);
      const holder=E("scanRequestStatus");
      if(holder) holder.innerHTML=liveProgressCard({status:"failed",checked,total,found,verified,imported,rejected,message:(err&&err.message)?err.message:String(err)});
      if(req&&req.id){
        await db.from("job_scan_requests").update({
          status:"failed",
          completed_at:new Date().toISOString(),
          message:(err&&err.message)?err.message:String(err)
        }).eq("id",req.id);
      }
    }finally{
      window.__liveScanRunning=false;
      const b=E("scanNowBtn");
      if(b){b.disabled=false;b.textContent="RUN JOB SCAN";} const dbtn=E("dashboardScanBtn"); if(dbtn){dbtn.disabled=false;dbtn.textContent="RUN JOB SCAN";}
    }
  };

  function liveProgressCard(p){
    const total=Number(p.total||0);
    const checked=Number(p.checked||0);
    const percent=Number.isFinite(p.percent)?p.percent:(total?Math.round((checked/total)*100):0);
    const label=p.status==="completed"?"Completed":p.status==="failed"?"Failed":"Searching now";
    return '<div class="card">'+
      '<div class="row space"><div><div class="panel-title">LIVE FULL-SOURCE SCAN</div><b>'+esc(label)+'</b><div class="muted">'+esc(p.message||"")+'</div></div>'+statusChip(p.status||"running")+'</div>'+
      '<div class="progress-track"><div class="progress-fill" style="width:'+Math.max(0,Math.min(100,percent))+'%;transition:width .2s"></div></div>'+
      '<div class="row"><span class="pill">'+checked+(total?(" / "+total):"")+' sources checked</span><span class="pill">'+Number(p.found||0)+' candidate pages</span><span class="pill">'+Number(p.verified||0)+' verified open</span><span class="pill">'+Number(p.imported||0)+' imported</span><span class="pill">'+Number(p.rejected||0)+' rejected</span></div>'+
    '</div>';
  }

    function scanRequestCard(req){
    if(!req){
      return '<div class="card"><div class="row space"><div><b>Manual full scan</b><div class="muted">Press “Scan all sources now” to start a live server-side search across the enabled source registry.</div></div></div></div>';
    }
    const labels={pending:"Queued",running:"Searching",completed:"Completed",partial:"Completed with limits",failed:"Failed"};
    const label=labels[req.status]||req.status;
    const when=req.requested_at?new Date(req.requested_at).toLocaleString():"";
    return '<div class="card"><div class="row space"><div><div class="panel-title">JOB SCAN STATUS</div><b>Manual full scan: '+esc(label)+'</b><div class="muted">Requested '+esc(when)+'</div></div>'+statusChip(req.status)+'</div>'+
      '<p class="muted">'+esc(req.message||(
        req.status==="pending"?"Ready to start a live server-side search.":
        req.status==="running"?"Searching configured sources and verifying live vacancies.":
        req.status==="completed"?"Results have been written to the job list below.":
        req.status==="partial"?"Scan completed, but some sources could not be checked.":
        "The scan could not complete."
      ))+'</p></div>';
  }

  window.pollScanRequest = function(id){
    if(window.__scanPoll) clearInterval(window.__scanPoll);
    let checks=0;
    const tick=async()=>{
      checks++;
      const r=await db.from("job_scan_requests").select("*").eq("id",id).maybeSingle();
      if(r.error) return;
      const req=r.data;
      const holder=E("scanRequestStatus");
      if(holder&&req) holder.innerHTML=scanRequestCard(req);
      if(req&&["completed","partial","failed"].includes(req.status)){
        clearInterval(window.__scanPoll);
        window.__scanPoll=null;
        if(page==="scanner") scanner();
      }
      if(checks>=480){
        clearInterval(window.__scanPoll);
        window.__scanPoll=null;
      }
    };
    tick();
    window.__scanPoll=setInterval(tick,15000);
  };

  window.settings = function(){
    E("view").innerHTML='<div class="mission-header"><div><div class="kicker">SYSTEM CONFIGURATION</div><h1 class="command-title">Settings</h1></div>'+statusChip("online")+'</div><div class="card"><b>Mode</b><p class="muted">'+(localMode?"Local mode":"Online Supabase mode")+'</p></div><div class="card"><b>Daily Job Search</b><p class="muted">Uses your master career profile, verifies that vacancies are still open, and prioritizes strong matches.</p></div>';
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
