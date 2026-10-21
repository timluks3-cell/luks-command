
(function(){
  const oldRender = window.render;
  window.render = function(){
    if(!user&&!localMode) return login();
    E("root").innerHTML='<div class="shell"><aside><div class="brand">Luks Command</div><nav>'+
      ["dashboard","career","scanner","projects","sites","tasks","settings"].map(x=>'<button class="'+(page===x?"active":"")+'"'+(page===x?' aria-current="page"':'')+' onclick="go(\''+x+'\')">'+(x==="scanner"?"Job Scanner":x[0].toUpperCase()+x.slice(1))+'</button>').join("")+
      '</nav><div class="sidebar-status"><div class="kicker">WORKSPACE</div><span class="status-chip '+(localMode?'status-standby':'status-online')+'">'+(localMode?'LOCAL MODE':'SIGNED IN')+'</span></div></aside><main><div id="msg" role="status"></div><div id="view">Loading…</div></main></div>';
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
    if(["completed","complete","open","online"].includes(s)) return {label:s==="open"?"Verified open":s==="online"?"Online":"Complete",cls:"status-complete"};
    if(s==="pending") return {label:"QUEUED",cls:"status-scanning"};
    if(s==="partial") return {label:"PARTIAL",cls:"status-error"};
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

const DK_CITIES = ["denmark","danmark","københavn","copenhagen","sjælland","zealand","jylland","jutland","fyn","funen","ishøj","greve","taastrup","hvidovre","brøndby","herlev","ballerup","roskilde","køge","holbæk","ringsted","næstved","slagelse","kalundborg","odense","svendborg","fredericia","vejle","kolding","esbjerg","aarhus","århus","randers","silkeborg","viborg","horsens","aalborg","ålborg","hjørring","frederikshavn","herning","holstebro","sønderborg","haderslev","aabenraa","vordingborg","bornholm","rønne","glostrup","rødovre","frederiksberg","lyngby","hillerød","helsingør","gentofte","kastrup","farum","hørsholm","solrød","allerød"];
const OTHER_COUNTRIES = ["sweden","sverige","norway","norge","germany","deutschland","finland","poland","netherlands","holland","belgium","france","spain","italy","united kingdom","england","ireland","united states","usa","canada","india","australia"];
// Country names in the feed languages, including countries absent from the old list.
const FOREIGN_COUNTRY_NAMES = (() => {
  const names=new Set(OTHER_COUNTRIES);
  const displays=[new Intl.DisplayNames(["en"],{type:"region"}),new Intl.DisplayNames(["da"],{type:"region"})];
  for(let a=65;a<=90;a++) for(let b=65;b<=90;b++){
    const code=String.fromCharCode(a,b);
    if(code==="DK") continue;
    for(const display of displays){
      const name=display.of(code);
      if(name && name!==code) names.add(name.toLowerCase());
    }
  }
  return [...names];
})();

// This server policy is mandatory; request.country is never trusted as evidence.
function inDenmark(location, country) {
  const v=String(location||"").normalize("NFC").trim().toLowerCase();
  const explicit=String(country||"").trim().toLowerCase();
  if(explicit && !["dk","dnk","denmark","danmark"].includes(explicit)) return false;
  if(!v) return !!explicit;
  const has=(term)=>new RegExp("(^|[^\\p{L}])"+term+"(?=$|[^\\p{L}])","iu").test(v);
  // Explicit foreign countries take precedence over a matching city or region.
  const foreign=FOREIGN_COUNTRY_NAMES;
  const trailingCode=v.match(/(?:^|[,;·/])\s*([a-z]{2,3})\s*$/u)?.[1];
  if(trailingCode && !["dk","dnk"].includes(trailingCode)) return false;
  return !foreign.some(has) && (!!explicit || [...DK_CITIES,"dk","dnk"].some(has));
}

  function denmarkJob(j){return inDenmark(j.location,j.country_code||j.country);}
  function missingJobLocation(j){return !String(j.location||"").trim()&&!String(j.country_code||j.country||"").trim();}
  function closedJob(j){return ["closed","dismissed"].includes(String(j.status||"").toLowerCase())||["closed","expired"].includes(String(j.verification_status||"").toLowerCase());}
  function searchedDate(j){return Date.parse(j.last_searched_at||j.last_scanned_at||j.scanned_at||j.last_seen_at||j.discovered_at||j.created_at||j.published_at||"")||0;}
  // Historical application states remain in Supabase and are never deleted by view filters.
  const HISTORY_STATUSES=new Set(["applied","interview","offer","rejected","closed","dismissed"]);
  function historicalJob(j){return HISTORY_STATUSES.has(String(j.status||"").toLowerCase())}
  // Current matches require verification within seven days; history remains visible.
  function verifiedCurrent(j, now=Date.now()){
    const verified=Date.parse(j.verified_at||'');
    const deadline=Date.parse(j.deadline||'');
    return j.verified_open===true && !closedJob(j) && Number.isFinite(verified)
      && verified<=now && now-verified<=7*24*60*60*1000
      && (!Number.isFinite(deadline)||deadline>=now);
  }
  function currentUnapplied(j){return denmarkJob(j)&&verifiedCurrent(j)&&!historicalJob(j)}
  function vacancyRows(rows){
    const groups=new Map();
    for(const j of rows){
      const key=canonicalJobUrl(j.job_url)||('id:'+j.id);
      const old=groups.get(key);
      if(!old || (historicalJob(j)&&!historicalJob(old))) groups.set(key,j);
    }
    return [...groups.values()];
  }
  async function loadJobs(){
    const rows=[];
    for(let offset=0;;offset+=500){
      const result=await db.from('jobs').select('*').order('id').range(offset,offset+499);
      if(result.error) throw new Error(result.error.message);
      rows.push(...(result.data||[]));
      if((result.data||[]).length<500) return {data:rows};
    }
  }
  let showAppliedInCurrent=false;
  window.toggleAppliedInCurrent=function(checked){showAppliedInCurrent=!!checked;refreshBestMatches()};
  let storedMatches=[];
  window.refreshBestMatches=function(){
    const mode=E("matchStatus")?.value||"current",order=E("matchOrder")?.value||"score";
    let rows=vacancyRows(storedMatches).filter(j=>mode==="review"?missingJobLocation(j):denmarkJob(j)).filter(j=>mode==="current"?verifiedCurrent(j)&&(showAppliedInCurrent||!historicalJob(j)):mode==="applied"?String(j.status||"").toLowerCase()==="applied":mode==="closed"?closedJob(j):true);
    rows.sort((a,b)=>order==="newest"?searchedDate(b)-searchedDate(a):order==="oldest"?searchedDate(a)-searchedDate(b):order==="applied"?(Number(String(b.status).toLowerCase()==="applied")-Number(String(a.status).toLowerCase()==="applied"))||searchedDate(b)-searchedDate(a):order==="closed"?(Number(closedJob(b))-Number(closedJob(a)))||searchedDate(b)-searchedDate(a):Number(b.match_score||0)-Number(a.match_score||0));
    if(E("bestMatchesGrid"))E("bestMatchesGrid").innerHTML=jobTable(rows);
    if(E("bestMatchesCount"))E("bestMatchesCount").textContent=rows.length+(mode==="review"?" missing locations":" Denmark jobs");
  };

  function vacancyCard(j){
    const score=j.match_score==null?'<div class="match-score unknown">NO SCORE</div>':'<div class="match-score">'+esc(j.match_score)+'% MATCH</div>';
    const verification=verifiedCurrent(j)?"Verified open":closedJob(j)?"Closed / expired":j.verified_open?"Needs recheck":safeText(j.verification_status,"Unverified");
    const ver='<span class="pill '+(verifiedCurrent(j)?'good':closedJob(j)?'bad':'')+'">'+esc(verification)+'</span>';
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
      '<div class="verification-line"><div class="row">'+ver+'<span class="pill">'+esc(j.status||"discovered")+'</span></div><div class="muted">Last verified: '+esc(safeDate(j.verified_at))+'</div></div>'+
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
      E("view").innerHTML='<div class="mission-header"><div><div class="kicker">LUKS COMMAND — MISSION CONTROL</div><h1 class="command-title">Career Operations</h1><div class="command-sub">Sign in to see your saved jobs, track applications and scan Danish vacancies.</div></div><button class="btn" onclick="signOut()">Exit local mode</button></div><div class="grid"><div class="card"><div class="panel-title">Career</div><p class="muted">Open source registry and target vacancies.</p></div><div class="card"><div class="panel-title">Job Scanner</div><p class="muted">Live scanning requires sign-in.</p></div><div class="card"><div class="panel-title">Projects</div><p class="muted">Continue project operations.</p></div><div class="card"><div class="panel-title">My Sites</div><p class="muted">Launch your connected web apps.</p><button class="btn primary" onclick="go(\'sites\')">Open sites</button></div></div>';
      return;
    }
    const [j,p,t,s,r,src,apps]=await Promise.all([
      loadJobs(),
      db.from("projects").select("*").order("created_at"),
      db.from("tasks").select("*").neq("status","completed"),
      db.from("job_scan_runs").select("*").order("started_at",{ascending:false}).limit(1),
      db.from("job_scan_requests").select("*").order("requested_at",{ascending:false}).limit(1),
      db.from("job_sources").select("name,domain,source_group,enabled,last_checked_at,useful_hits,rejected_hits").eq("enabled",true).order("last_checked_at",{ascending:false}).limit(12),
      db.from("applications").select("id")
    ]);
    const jobs=vacancyRows(j.data||[]), projects=p.data||[], tasks=t.data||[], sources=src.data||[];
    const last=s.data&&s.data[0]?s.data[0]:null;
    const latestRequest=r.data&&r.data[0]?r.data[0]:null;
    const current=jobs.filter(currentUnapplied).sort((a,b)=>(b.match_score||0)-(a.match_score||0));
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
        '<div class="row space" style="margin-top:10px"><span class="muted">Sources</span>'+statusChip(Number(last?.metadata?.failed_sources||0)>0?"error":(sources.length?"online":"standby"))+'</div>'+
      '</div></section></div>'+
      '<div id="scanRequestStatus" role="status" aria-live="polite">'+scanRequestCard(latestRequest)+'</div>'+
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
    return '<div id="jobsGrid" class="vacancy-grid">'+(rows.map(vacancyCard).join("")||'<div class="empty-state"><strong>No jobs match this view</strong>Try another status or broader filters. Current jobs need fresh vacancy verification.</div>')+'</div>';
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



  function canonicalJobUrl(raw){
    try {
      const u=new URL(raw);u.hash='';
      for(const key of [...u.searchParams.keys()]) if(/^(utm_.*|fbclid|gclid)$/i.test(key)) u.searchParams.delete(key);
      u.searchParams.sort();
      return u.hostname.toLowerCase().replace(/^www\./,'')+u.pathname.replace(/\/+$/,'')+u.search;
    } catch {return String(raw||'').trim();}
  }
  window.verifyTrackedJob=async function(id){
    const j=careerJobs.find(x=>String(x.id)===String(id));
    if(!j?.job_url)return msg("No job URL available","bad");
    const response=await db.functions.invoke("verify-job",{body:{url:j.job_url,title:j.title,published_at:j.published_at,deadline:j.deadline}});
    if(response.error||!response.data)return msg(response.error?.message||"Verification failed","bad");
    const d=response.data;
    if(["blocked","error","unverified"].includes(d.status)){msg("Verification inconclusive; job status preserved.","bad");return;}
    const update=await db.from("jobs").update({verified_open:!!d.verified_open,verification_status:d.status,verification_evidence:d.reason||"",verified_at:new Date().toISOString()}).eq("id",id);
    if(update.error)return msg(update.error.message,"bad");
    await career();msg("Vacancy verification updated","good");
  };

  let careerJobs=[];
  const TRACK_STAGES=["discovered","saved","ready","applied","interview","offer","rejected","closed"];
  window.careerFilter=function(){
    const q=(E("careerSearch")?.value||"").trim().toLowerCase(),stage=E("careerStage")?.value||"",region=E("careerRegion")?.value||"",mode=E("careerWorkMode")?.value||"",min=Number(E("careerScore")?.value||0),order=E("careerSort")?.value||"score";
    let rows=careerJobs.filter(j=>(!q||[j.title,j.company,j.location,j.source_name].join(" ").toLowerCase().includes(q))&&(!stage||String(j.status||"discovered").toLowerCase()===stage)&&(!region||String(j.location||"").toLowerCase().includes(region))&&(!mode||String(j.work_mode||"").toLowerCase().includes(mode))&&Number(j.match_score||0)>=min);
    rows.sort((a,b)=>order==="newest"?searchedDate(b)-searchedDate(a):order==="deadline"?(Date.parse(a.deadline)||Infinity)-(Date.parse(b.deadline)||Infinity):Number(b.match_score||0)-Number(a.match_score||0));
    if(E("careerResults")) E("careerResults").innerHTML=jobTable(rows)+'<div class="card"><b>Verify vacancies</b><p class="muted">On-demand link check; inconclusive responses leave history unchanged.</p>'+rows.slice(0,30).map(j=>'<div class="row space" style="padding:7px 0"><span>'+esc(j.title||"Vacancy")+' · '+esc(j.company||"")+'</span><button class="btn" onclick="verifyTrackedJob(\''+j.id+'\')">Verify</button></div>').join("")+'</div>';
    if(E("careerCount")) E("careerCount").textContent=rows.length+" jobs";
  };
  function trackingBoard(rows){
    return '<div class="card"><div class="panel-title">Application Tracking Board</div><div class="muted board-hint">Scroll sideways to see all stages. Use the dropdown to move a job.</div><div class="tracking-scroll" tabindex="0" role="region" aria-label="Application stages">'+TRACK_STAGES.map(stage=>{
      const items=rows.filter(j=>String(j.status||"discovered").toLowerCase()===stage);
      return '<section class="tracking-column"><b>'+esc(stage[0].toUpperCase()+stage.slice(1))+' <span class="muted">'+items.length+'</span></b>'+items.slice(0,40).map(j=>'<div class="tracking-card"><b>'+esc(j.title||"Job")+'</b><div class="muted">'+esc(j.company||"")+'</div><select class="select" aria-label="Stage for '+esc(j.title||"job")+'" style="margin-top:8px" onchange="setJobStatus(\''+j.id+'\',this.value)">'+TRACK_STAGES.map(st=>'<option value="'+st+'"'+(st===stage?' selected':'')+'>'+esc(st)+'</option>').join("")+'</select></div>').join("")+(items.length>40?'<p class="muted">Showing 40 of '+items.length+'. Use the stage filter below to view all.</p>':'')+(!items.length?'<p class="muted">No jobs yet</p>':'')+'</section>';
    }).join("")+'</div></div>';
  }

  window.career = async function(){
    if(localMode){E("view").innerHTML='<h1>Career Operations</h1><p>Sign in for job tracking.</p>';return;}
    const r=await loadJobs();
    if(r.error){msg(r.error.message,"bad");return;}
    careerJobs=r.data||[];
    // Keep every record on the board; only current opportunities collapse duplicates.
    const active=vacancyRows(careerJobs).filter(currentUnapplied);
    E("view").innerHTML=
      '<div class="mission-header"><div><div class="kicker">OPPORTUNITY CONTROL</div><h1 class="command-title">Career Operations</h1><div class="command-sub">Denmark job filtering and application tracking</div></div><div class="row"><button class="mission-run" onclick="requestJobScan()">RUN JOB SCAN</button><button class="btn" onclick="go(\'scanner\')">Scanner console</button></div></div>'+
      trackingBoard(careerJobs)+
      '<h2>Advanced Job Filters <span id="careerCount" class="muted"></span></h2>'+
      '<div class="card"><div class="jobs-toolbar" style="display:flex;flex-wrap:wrap;gap:10px">'+
      '<input id="careerSearch" aria-label="Search jobs" class="input" placeholder="Title, company, location" oninput="careerFilter()">'+
      '<select id="careerStage" aria-label="Application stage" class="select" onchange="careerFilter()"><option value="">All stages</option>'+TRACK_STAGES.map(x=>'<option value="'+x+'">'+x+'</option>').join("")+'</select>'+
      '<select id="careerRegion" aria-label="Region" class="select" onchange="careerFilter()"><option value="">All regions</option><option value="københavn">Copenhagen</option><option value="copenhagen">Copenhagen (English)</option><option value="sjælland">Zealand</option><option value="zealand">Zealand (English)</option><option value="fyn">Funen</option><option value="jylland">Jutland</option></select>'+
      '<select id="careerWorkMode" aria-label="Work mode" class="select" onchange="careerFilter()"><option value="">All work modes</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select>'+
      '<select id="careerScore" aria-label="Minimum match score" class="select" onchange="careerFilter()"><option value="0">All matches</option><option value="75">75%+</option><option value="85">85%+</option><option value="90">90%+</option></select>'+
      '<select id="careerSort" aria-label="Sort tracked jobs" class="select" onchange="careerFilter()"><option value="score">Best match</option><option value="newest">Most recently discovered</option><option value="deadline">Upcoming deadline</option></select></div></div>'+
      '<div id="careerResults"></div>';
    careerFilter();
  };

  window.scanner = async function(){
    if(localMode){
      E("view").innerHTML='<div class="mission-header"><div><div class="kicker">SCANNER CONSOLE</div><h1 class="command-title">Job Scanner</h1><div class="command-sub">Sign in to activate live scanning.</div></div>'+statusChip("standby")+'</div>';
      return;
    }
    const [runs,jobs,profile,sources,requests,discoveries]=await Promise.all([
      db.from("job_scan_runs").select("*").order("started_at",{ascending:false}).limit(10),
      loadJobs(),
      db.from("career_profiles").select("professional_title,preferred_roles,preferred_locations,skills,master_cv_file_name").maybeSingle(),
      db.from("job_sources").select("name,domain,source_group,enabled,last_checked_at,useful_hits,rejected_hits").eq("enabled",true).order("source_group").order("name"),
      db.from("job_scan_requests").select("*").order("requested_at",{ascending:false}).limit(5),
      db.from("job_discoveries").select("*").order("created_at",{ascending:false}).limit(500)
    ]);
    const runRows=runs.data||[], jobRows=jobs.data||[], p=profile.data||{}, sourceRows=sources.data||[], requestRows=requests.data||[], discoveryRows=discoveries.data||[];
    storedMatches=jobRows;
    const latestRequest=requestRows[0]||null, sourceGroups=[...new Set(sourceRows.map(s=>s.source_group||"Other"))], last=runRows[0]||null;
    if(latestRequest&&["pending","running"].includes(latestRequest.status)) setTimeout(()=>pollScanRequest(latestRequest.id),0);
    const scannerState=latestRequest&&["pending","running"].includes(latestRequest.status)?latestRequest.status:(last?.status||"standby");
    const resumableRun=false; // The server worker resumes saved progress automatically.
    const scanButtonLabel=resumableRun?"RESUME JOB SCAN":"RUN JOB SCAN";
    const failedSources=Number(last?.metadata?.failed_sources||0);
    const diagRows=Array.isArray(last?.metadata?.diagnostics)?last.metadata.diagnostics:[];
    const failedDiagnostics=diagRows.filter(x=>!x.ok);
    E("view").innerHTML=
      '<div class="mission-header"><div><div class="kicker">LIVE SEARCH OPERATIONS</div><h1 class="command-title">Job Scanner Console</h1><div class="command-sub">Search Danish vacancies, check live adverts and review your matches.</div></div><div class="row"><span id="scannerLiveState">'+statusChip(scannerState)+'</span><button id="scanNowBtn" class="mission-run" onclick="requestJobScan()">'+scanButtonLabel+'</button><button class="btn" onclick="openSources()">Open sources manually</button></div></div>'+
      '<div id="scanRequestStatus" role="status" aria-live="polite">'+scanRequestCard(latestRequest)+'</div>'+
      '<div class="metric-grid">'+
        metric(last?last.vacancies_found:0,"Jobs Found")+
        metric(vacancyRows(jobRows).filter(x=>currentUnapplied(x)&&(x.match_score||0)>=75).length,"Strong Matches")+
        metric(last?last.sources_checked:sourceRows.length,"Sources Checked")+
        metric(last?last.imported_count:0,"Imported")+
        metric(last?last.rejected_count:0,"Filtered Out")+
        metric(failedSources,"Source Errors")+
        metric(vacancyRows(jobRows).filter(currentUnapplied).length,"Current Vacancies")+
      '</div>'+
      '<div class="card"><div class="panel-title">How scan results are counted</div><p class="muted" style="margin-bottom:0"><b>Filtered Out</b> means candidate pages that were checked but did not qualify as a current matching vacancy. This can include generic career pages, expired or closed jobs, internships, student, trainee, elev or praktik roles, unrelated positions, or pages without enough evidence that the vacancy is still open. <b>Source Errors</b> means an entire source could not be read successfully.</p></div>'+
      '<h2>Best Current Matches <span id="bestMatchesCount" class="muted"></span></h2><div class="jobs-toolbar"><select id="matchOrder" aria-label="Sort matches" class="select" onchange="refreshBestMatches()"><option value="score">Best match</option><option value="newest">Date searched: newest</option><option value="oldest">Date searched: oldest</option><option value="applied">Applied first</option><option value="closed">Closed first</option></select><select id="matchStatus" aria-label="Vacancy status" class="select" onchange="refreshBestMatches()"><option value="current">Current jobs</option><option value="applied">Applied</option><option value="closed">Closed</option><option value="all">All Denmark statuses</option><option value="review">Review missing locations</option></select><label class="pill" style="cursor:pointer"><input type="checkbox" id="showAppliedInCurrent" onchange="toggleAppliedInCurrent(this.checked)"> Show applied / history jobs</label><span class="muted">Current matches require verification within 7 days and an unexpired deadline · History is preserved · Denmark only</span></div><div id="bestMatchesGrid"></div>'+
      '<details class="card scan-profile"><summary>Search profile and sources · '+(p.preferred_roles||[]).length+' target roles</summary><div class="scan-console scan-targeting"><div class="mission-panel"><div class="panel-title">Career Profile / Scan Targeting</div><div style="font-size:19px;font-weight:800;margin:10px 0">'+esc(p.professional_title||"Architectural Technologist / BIM Coordinator")+'</div><div class="muted">Master CV: '+esc(p.master_cv_file_name||"Master CV")+'</div><div style="margin-top:14px" class="panel-title">Target Roles</div><div id="roleChips" class="row" style="margin-top:10px">'+((p.preferred_roles||[]).map(x=>roleChip(x)).join(""))+'</div><div class="row" style="margin-top:12px"><input id="newRoleInput" aria-label="New target role" class="input" style="max-width:360px" placeholder="Add role, e.g. BIM Specialist" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addPreferredRole()}"><button class="btn primary" onclick="addPreferredRole()">Add role</button></div></div>'+
      categorySummary(p.preferred_roles||[])+
       '<div class="mission-panel"><div class="panel-title">Registry Status</div><div class="metric-grid" style="grid-template-columns:1fr 1fr;margin-top:14px">'+metric(sourceRows.length,"Enabled Sources")+metric(sourceGroups.length,"Source Groups")+'</div><button class="btn" onclick="showSourceRegistry()">View source registry</button></div></div></details>'+
      '<h2>All Job Postings Found</h2><div class="card"><div class="jobs-toolbar"><input id="discoveryFilter" aria-label="Search discovered postings" class="input" style="max-width:360px" placeholder="Filter discovered postings" oninput="filterDiscoveries()"><select id="discoveryStatus" aria-label="Verification state" class="select" style="max-width:220px" onchange="filterDiscoveries()"><option value="">All verification states</option><option value="open">Verified open</option><option value="unverified">Unverified</option><option value="closed">Closed</option><option value="expired">Expired</option><option value="blocked">Blocked</option><option value="error">Error</option></select></div>'+discoveryTable(discoveryRows)+'</div>'+
      '<h2>Job Source Status</h2><div class="source-list">'+sourceRows.slice(0,24).map(sourceNode).join("")+'</div>'+
      (failedDiagnostics.length?'<h2>Source Errors — Last Scan</h2><div class="card"><div class="muted" style="margin-bottom:10px">These sources were processed but not successfully read, so they are not counted as checked.</div><div class="source-list">'+failedDiagnostics.map(d=>'<div class="source-node"><div class="row space"><div class="name">'+esc(d.source||"Source")+'</div>'+statusChip("error")+'</div><div class="stamp">'+esc(d.provider||"generic")+' · '+esc(d.error||"Source could not be read")+'</div></div>').join("")+'</div></div>':'')+
      '<h2>Recent Scan Runs</h2><div class="card" style="overflow:auto"><table><thead><tr><th>Date</th><th>Status</th><th>Sources</th><th>Found</th><th>Verified</th><th>Imported</th></tr></thead><tbody>'+
      runRows.map(x=>'<tr><td>'+new Date(x.started_at).toLocaleString()+'</td><td>'+statusChip(x.status)+'</td><td>'+x.sources_checked+'</td><td>'+x.vacancies_found+'</td><td>'+x.verified_open+'</td><td>'+x.imported_count+'</td></tr>').join("")+
      '</tbody></table></div>';
    refreshBestMatches();
  };


  function discoveryTable(rows){
    if(!rows.length) return '<div class="muted">No discovered postings are stored yet.</div>';
    return '<div class="table-scroll" tabindex="0" role="region" aria-label="Discovered postings"><table id="discoveryTable"><thead><tr><th>Role</th><th>Company</th><th>Source</th><th>Match</th><th>Verification</th><th>Reason</th><th>Link</th></tr></thead><tbody>'+
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

  function categorySummary(preferredRoles){
    const configured=new Set((preferredRoles||[]).map(x=>String(x).toLocaleLowerCase()));
    const groups=window.LUKS_JOB_CATEGORIES||{};
    return '<section class="mission-panel target-categories"><div class="panel-title">Job-search categories · Denmark only</div>'+
      '<p class="muted">Configured roles from your saved career profile.</p><div class="role-categories">'+
      Object.entries(groups).map(([name,titles])=>{
        const included=titles.filter(x=>configured.has(x.toLocaleLowerCase()));
        return '<details style="margin:8px 0;padding:10px;border:1px solid #21425a;border-radius:8px"><summary style="cursor:pointer">'+esc(name)+' <span class="muted">('+included.length+'/'+titles.length+' configured)</span></summary><div class="row" style="margin-top:9px">'+titles.map(t=>'<span class="pill" style="'+(configured.has(t.toLocaleLowerCase())?'':'opacity:.45')+'">'+esc(t)+'</span>').join('')+'</div></details>';
      }).join('')+'</div></section>';
  }

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
    if(localMode||!user) return msg("Sign in to run a scan.","bad");
    if(window.__liveScanRunning) return;
    window.__liveScanRunning=true;
    const buttons=[E("scanNowBtn"),E("dashboardScanBtn")].filter(Boolean);
    buttons.forEach(b=>{b.disabled=true;b.textContent="QUEUING…";});
    try{
      const result=await db.functions.invoke("scan-jobs",{body:{country:"DK"}});
      if(result.error||result.data?.error) throw new Error(result.error?.message||result.data.error);
      const id=result.data?.request_id;
      if(!id) throw new Error("The server did not return a scan request.");
      if(page==="scanner") await scanner(); else if(page==="dashboard") await dashboard();
      pollScanRequest(id);
      msg("Background scan queued. You can close the browser.","good");
    }catch(error){msg(error.message||String(error),"bad");}
    finally{
      window.__liveScanRunning=false;
      buttons.forEach(b=>{b.disabled=false;b.textContent="RUN JOB SCAN";});
    }
  };

  function liveProgressCard(p){
    const total=Number(p.total||0);
    const checked=Number(p.checked||0);
    const percent=Number.isFinite(p.percent)?p.percent:(total?Math.round((checked/total)*100):0);
    const label=p.status==="completed"?"Completed":p.status==="failed"?"Failed":p.status==="paused"?"Paused — ready to resume":"Searching now";
    return '<div class="card">'+
      '<div class="row space"><div><div class="panel-title">LIVE FULL-SOURCE SCAN</div><b>'+esc(label)+'</b><div class="muted">'+esc(p.message||"")+'</div></div>'+statusChip(p.status==="paused"?"standby":(p.status||"running"))+'</div>'+
      '<div class="progress-track"><div class="progress-fill" style="width:'+Math.max(0,Math.min(100,percent))+'%;transition:width .2s"></div></div>'+
      '<div class="row"><span class="pill">'+checked+(total?(" / "+total):"")+' sources checked</span><span class="pill">'+Number(p.found||0)+' candidate pages</span><span class="pill">'+Number(p.verified||0)+' verified open</span><span class="pill">'+Number(p.imported||0)+' imported</span><span class="pill">'+Number(p.rejected||0)+' rejected</span></div>'+
    '</div>';
  }

    function scanRequestCard(req){
    if(!req){
      return '<div class="card"><div class="row space"><div><b>Background scan</b><div class="muted">Press RUN JOB SCAN to queue a background scan. Daily scans start at 08:00 Denmark time.</div></div></div></div>';
    }
    const labels={pending:"Queued",running:"Searching",completed:"Completed",partial:"Completed with limits",failed:"Failed"};
    const label=labels[req.status]||req.status;
    const when=req.requested_at?new Date(req.requested_at).toLocaleString():"";
    return '<div class="card"><div class="row space"><div><div class="panel-title">JOB SCAN STATUS</div><b>Background scan: '+esc(label)+'</b><div class="muted">Requested '+esc(when)+'</div></div>'+statusChip(req.status)+'</div>'+
      '<p class="muted">'+esc(req.message||(
        req.status==="pending"?"Queued on the server; the browser can be closed.":
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
      if(!user){clearInterval(window.__scanPoll);window.__scanPoll=null;return;}
      checks++;
      const r=await db.from("job_scan_requests").select("*").eq("id",id).maybeSingle();
      if(r.error) return;
      const req=r.data;
      const holder=E("scanRequestStatus");
      if(holder&&req) holder.innerHTML=scanRequestCard(req);
      const liveState=E("scannerLiveState");
      if(liveState&&req) liveState.innerHTML=statusChip(req.status);
      if(req&&["completed","partial","failed"].includes(req.status)){
        clearInterval(window.__scanPoll);
        window.__scanPoll=null;
        if(page==="scanner") scanner(); else if(page==="dashboard") dashboard();
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
    E("view").innerHTML='<div class="mission-header"><div><div class="kicker">SYSTEM CONFIGURATION</div><h1 class="command-title">Settings</h1></div>'+statusChip("online")+'</div><div class="card"><b>Mode</b><p class="muted">'+(localMode?"Local mode":"Online Supabase mode")+'</p></div><div class="card"><b>Daily Job Search</b><p class="muted">Starts at 08:00 Denmark time using your saved career profile. Collection continues with the browser closed; unavailable sources are reported.</p></div>';
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


