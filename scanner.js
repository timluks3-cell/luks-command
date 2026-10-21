
(function(){
  function icon(name){
    const paths={
      dashboard:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
      career:'<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a20 20 0 0 0 18 0M12 11v4"/>',
      scanner:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5M8 10.5h5M10.5 8v5"/>',
      projects:'<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
      sites:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
      tasks:'<rect x="5" y="4" width="15" height="17" rx="2"/><path d="M9 3h7v4H9zM9 12l2 2 4-4M9 18h6"/>',
      settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
      star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
      applied:'<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>',
      interview:'<path d="M21 11a8 8 0 0 1-8 8H7l-4 3v-7a8 8 0 1 1 18-4Z"/><path d="M8 10h8M8 14h5"/>',
      clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      saved:'<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
      check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
      alert:'<path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01"/>',
      mark:'<path d="M5 4v15h14M10 4v10h9"/>'
    };
    return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(paths[name]||paths.dashboard)+'</svg>';
  }
  function matchBadge(value){
    if(value==null||!Number.isFinite(Number(value)))return '<span class="match-score unknown">No score</span>';
    const score=Math.max(0,Math.min(100,Number(value)));
    return '<span class="score-ring" role="img" aria-label="'+score+'% match" style="--score:'+score+'"><span>'+esc(score)+'<small>%</small></span></span>';
  }
  const oldRender = window.render;
  window.render = function(){
    if(!user&&!localMode) return login();
    E("root").innerHTML='<div class="shell"><aside><div class="brand"><span class="brand-mark">'+icon('mark')+'</span><span>Luks Command<small>Career workspace</small></span></div><nav aria-label="Main navigation">'+
      ["dashboard","career","scanner","projects","sites","tasks","settings"].map(x=>'<button class="'+(page===x?"active":"")+'"'+(page===x?' aria-current="page"':'')+' onclick="go(\''+x+'\')">'+icon(x)+'<span>'+(x==="scanner"?"Job Scanner":x[0].toUpperCase()+x.slice(1))+'</span></button>').join("")+
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
    if(s==="partial") return {label:"PARTIAL",cls:"status-warning"};
    if(["running","scanning","searching"].includes(s)) return {label:"SCANNING",cls:"status-scanning"};
    if(["failed","error","blocked"].includes(s)) return {label:"ERROR",cls:"status-error"};
    return {label:"STANDBY",cls:"status-standby"};
  }
  function statusChip(status){
    const x=missionStatus(status);
    return '<span class="status-chip '+x.cls+'">'+x.label+'</span>';
  }
  function metric(value,label){
    const text=label.toLowerCase();
    const kind=text.includes('strong')?'star':text.includes('interview')?'interview':text.includes('applied')||text.includes('application')?'applied':text.includes('error')?'alert':text.includes('current')||text.includes('target')?'career':'scanner';
    return '<div class="metric metric-'+kind+'"><div class="metric-head"><span class="metric-icon">'+icon(kind)+'</span><div class="label">'+esc(label)+'</div></div><div class="value">'+esc(value)+'</div></div>';
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
  function unavailableVacancy(j,now=Date.now()){
    const deadline=Date.parse(j.deadline||'');
    return closedJob(j)||String(j.status||'').toLowerCase()==='expired'
      ||(Number.isFinite(deadline)&&deadline<now)
      ||/closed\/expired|deadline (?:has )?passed|no longer accepting applications|not currently accepting applications/i.test(String(j.rejected_reason||j.verification_evidence||''));
  }
  function searchedDate(j){return Date.parse(j.last_searched_at||j.last_scanned_at||j.scanned_at||j.last_seen_at||j.discovered_at||j.created_at||j.published_at||"")||0;}
  // Historical application states remain in Supabase and are never deleted by view filters.
  const HISTORY_STATUSES=new Set(["applied","interview","offer","rejected","closed","dismissed"]);
  function historicalJob(j){return HISTORY_STATUSES.has(String(j.status||"").toLowerCase())}
  // Current matches require verification within seven days; history remains visible.
  function verifiedCurrent(j, now=Date.now()){
    const verified=Date.parse(j.verified_at||'');
    const deadline=Date.parse(j.deadline||'');
    return j.verified_open===true && !unavailableVacancy(j,now) && Number.isFinite(verified)
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
    const historyView=mode==="applied"||mode==="closed";
    let rows=vacancyRows(storedMatches).filter(j=>mode==="review"?missingJobLocation(j):denmarkJob(j)).filter(j=>historyView||!unavailableVacancy(j)).filter(j=>mode==="current"?verifiedCurrent(j)&&(showAppliedInCurrent||!historicalJob(j)):mode==="applied"?String(j.status||"").toLowerCase()==="applied":mode==="closed"?closedJob(j):true);
    rows.sort((a,b)=>order==="newest"?searchedDate(b)-searchedDate(a):order==="oldest"?searchedDate(a)-searchedDate(b):order==="applied"?(Number(String(b.status).toLowerCase()==="applied")-Number(String(a.status).toLowerCase()==="applied"))||searchedDate(b)-searchedDate(a):order==="closed"?(Number(closedJob(b))-Number(closedJob(a)))||searchedDate(b)-searchedDate(a):Number(b.match_score||0)-Number(a.match_score||0));
    if(E("bestMatchesGrid"))E("bestMatchesGrid").innerHTML=jobTable(rows);
    if(E("bestMatchesCount"))E("bestMatchesCount").textContent=rows.length+(mode==="review"?" missing locations":" Denmark jobs");
  };

  function vacancyCard(j){
    const score=matchBadge(j.match_score);
    const verification=verifiedCurrent(j)?"Verified open":unavailableVacancy(j)?"Closed / expired":j.verified_open?"Needs recheck":safeText(j.verification_status,"Unverified");
    const ver='<span class="pill '+(verifiedCurrent(j)?'good':unavailableVacancy(j)?'bad':'')+'">'+esc(verification)+'</span>';
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
      '<div class="job-actions"><button class="btn" onclick="openJobWorkspace(\''+esc(j.id)+'\')">Job workspace</button>'+
        (j.job_url?'<button class="btn primary" onclick="openExternal(\''+esc(j.job_url)+'\')">Open job advert</button>':'')+
        '<button class="btn '+(applied?'primary':'')+'" onclick="setJobStatus(\''+j.id+'\',\'applied\')">'+(applied?'Applied ✓':'Mark applied')+'</button>'+
        '<button class="btn '+(closed?'danger':'')+'" onclick="setJobStatus(\''+j.id+'\',\'closed\')">'+(closed?'Closed ✓':'Mark closed')+'</button>'+
      '</div></article>';
  }
  function sourceNode(s){
    const st=s.last_checked_at?statusChip("online"):statusChip("standby");
    return '<div class="source-node"><div class="row space"><div class="name">'+esc(s.name||"Source")+'</div>'+st+'</div><div class="stamp">'+esc(s.source_group||"Other")+' · '+(s.last_checked_at?new Date(s.last_checked_at).toLocaleString():"Not checked yet")+'</div></div>';
  }

  function dashboardAttention(rows,now=Date.now()){
    const available=vacancyRows(rows).filter(j=>denmarkJob(j)&&verifiedCurrent(j,now));
    const deadline=j=>Date.parse(j.deadline||'');
    return {
      due:available.filter(j=>!historicalJob(j)&&Number.isFinite(deadline(j))&&deadline(j)<=now+7*86400000).sort((a,b)=>deadline(a)-deadline(b)),
      saved:available.filter(j=>['saved','ready'].includes(String(j.status||'').toLowerCase())),
      followups:available.filter(j=>{
        const updated=Date.parse(j.updated_at||j.created_at||'');
        return String(j.status||'').toLowerCase()==='applied'&&Number.isFinite(updated)&&updated<=now-7*86400000;
      })
    };
  }
  let requestedCareerStage='';
  window.openCurrentJobs=function(){showAppliedInCurrent=false;go('scanner');};
  window.openCareerStage=function(stage){requestedCareerStage=TRACK_STAGES.includes(stage)?stage:'';go('career');};
  function dashboardVacancyCard(j){
    return '<article class="vacancy dashboard-vacancy"><div class="vacancy-top"><div><div class="job-title">'+esc(j.title||'Vacancy')+'</div><div class="company">'+esc(j.company||'Unknown company')+'</div></div>'+matchBadge(j.match_score)+'</div>'+
      '<div class="muted">'+esc(safeText(j.location))+' · '+esc(safeText(j.work_mode,'Work mode unspecified'))+'</div>'+
      '<div class="dashboard-job-facts"><span><b>Deadline</b> '+esc(safeDate(j.deadline))+'</span><span class="good">Verified '+esc(safeDate(j.verified_at))+'</span></div>'+
      '<div class="job-actions"><button class="btn" onclick="openJobWorkspace(\''+esc(j.id)+'\')">Job workspace</button>'+(j.job_url?'<button class="btn primary" onclick="openExternal(\''+esc(j.job_url)+'\')">Open advert</button>':'')+'<button class="btn" onclick="setJobStatus(\''+esc(j.id)+'\',\'applied\')">Mark applied</button></div></article>';
  }
  function attentionPanel(title,rows,description,action,actionLabel){
    const kind=title==='Closing soon'?'clock':title==='Saved and ready'?'saved':'interview';
    return '<section class="card attention-card attention-'+kind+'"><div class="row space"><h3><span class="attention-icon">'+icon(kind)+'</span>'+esc(title)+'</h3><span class="pill">'+rows.length+'</span></div><p class="muted">'+esc(description)+'</p>'+
      (rows.length?'<ul class="attention-list">'+rows.slice(0,3).map(j=>'<li><b>'+esc(j.title||'Vacancy')+'</b><span class="muted">'+esc(j.company||'')+(title==='Closing soon'?' · '+esc(safeDate(j.deadline)):'')+'</span></li>').join('')+'</ul>':'<p class="muted attention-empty">Nothing to review here.</p>')+
      '<button class="btn" onclick="'+action+'">'+esc(actionLabel)+'</button></section>';
  }
  window.dashboard = async function(){
    if(localMode){
      E('view').innerHTML='<div class="mission-header"><div><div class="kicker">YOUR WORKSPACE</div><h1 class="command-title">Career dashboard</h1><div class="command-sub">Sign in to see current Danish vacancies and your application progress.</div></div><button class="btn" onclick="signOut()">Exit local mode</button></div><div class="empty-state"><strong>Your job-search overview</strong>Live vacancies, deadlines and applications appear here after sign-in.</div><h2>Quick links</h2><div class="row"><button class="btn" onclick="go(\'projects\')">Projects</button><button class="btn" onclick="go(\'sites\')">My sites</button></div>';
      return;
    }
    const [j,s,r,src]=await Promise.all([
      loadJobs(),
      db.from('job_scan_runs').select('*').order('started_at',{ascending:false}).limit(1),
      db.from('job_scan_requests').select('*').order('requested_at',{ascending:false}).limit(1),
      db.from('job_sources').select('name,domain,source_group,enabled,last_checked_at,useful_hits,rejected_hits').eq('enabled',true).order('last_checked_at',{ascending:false}).limit(12)
    ]);
    const jobs=vacancyRows(j.data||[]),sources=src.data||[],last=s.data?.[0]||null,latestRequest=r.data?.[0]||null;
    const current=jobs.filter(currentUnapplied).sort((a,b)=>(b.match_score||0)-(a.match_score||0));
    const count=stage=>jobs.filter(j=>String(j.status||'').toLowerCase()===stage).length;
    const active=latestRequest&&['pending','running'].includes(latestRequest.status);
    const activeStatus=active?latestRequest.status:(last?.status||'standby');
    const attention=dashboardAttention(jobs),sourceErrors=Number(last?.metadata?.failed_sources||0);
    const scanError=s.error||r.error||src.error;
    E('view').innerHTML=
      '<div class="mission-header dashboard-header"><div><div class="kicker">YOUR JOB SEARCH · DENMARK</div><h1 class="command-title">Career dashboard</h1><div class="command-sub">Current opportunities and your next steps.</div></div><div class="row"><span id="scannerLiveState">'+statusChip(activeStatus)+'</span><button id="dashboardScanBtn" class="btn primary" onclick="requestJobScan()">Run job scan</button><button class="btn" onclick="signOut()">Sign out</button></div></div>'+
      '<div class="dashboard-summary" aria-label="Your tracked jobs">'+metric(current.length,'Current vacancies')+metric(current.filter(j=>(j.match_score||0)>=75).length,'Strong matches · 75%+')+metric(count('applied'),'Applied')+metric(count('interview'),'Interviews')+'</div>'+
      '<div class="section-heading"><div><h2>Best current jobs</h2><p class="muted">Verified within 7 days · Expired and applied jobs excluded</p></div><button class="btn" onclick="openCurrentJobs()">View all '+current.length+' jobs</button></div>'+
      '<div class="vacancy-grid dashboard-jobs">'+(current.slice(0,6).map(dashboardVacancyCard).join('')||'<div class="empty-state"><strong>No verified current matches</strong>Run a scan to refresh available vacancies.</div>')+'</div>'+
      '<h2>Needs attention</h2><div class="attention-grid">'+
        attentionPanel('Closing soon',attention.due,'Current vacancies with a deadline in the next 7 days.',"openCurrentJobs()",'Review vacancies')+
        attentionPanel('Saved and ready',attention.saved,'Current jobs you have shortlisted for an application.',"go('career')",'Review shortlisted jobs')+
        attentionPanel('Follow-up review',attention.followups,'Applied jobs with no tracking update for 7+ days. Review whether a follow-up is appropriate.',"openCareerStage('applied')",'Review applications')+'</div>'+
      '<div class="section-heading"><div><h2>Application progress</h2><p class="muted">Tracked jobs by stage · Includes your existing history</p></div><button class="btn" onclick="go(\'career\')">Open tracking board</button></div>'+
      '<div class="application-progress">'+['saved','ready','applied','interview','offer'].map(stage=>'<button class="progress-stage stage-'+stage+'" onclick="openCareerStage(\''+stage+'\')"><span>'+icon(stage==='ready'||stage==='offer'?'check':stage)+esc(stage[0].toUpperCase()+stage.slice(1))+'</span><b>'+count(stage)+'</b></button>').join('')+'</div>'+
      '<details class="card dashboard-scan"><summary>Scan details <span class="muted">'+(active?'Scan in progress':last?'Last run: '+esc(safeDate(last.started_at)):'No scan runs yet')+(sourceErrors?' · '+sourceErrors+' source errors':'')+'</span></summary>'+
        (scanError?'<p class="bad">Some scan details could not be loaded. Open the scanner to retry.</p>':'')+
        '<div id="scanRequestStatus" role="status" aria-live="polite">'+scanRequestCard(latestRequest)+'</div>'+
        '<h3>Last scan</h3><div class="metric-grid">'+metric(last?.vacancies_found||0,'Candidate pages found')+metric(last?.sources_checked||0,'Sources checked')+metric(last?.imported_count||0,'Imported')+metric(sourceErrors,'Source errors')+'</div>'+
        '<p class="muted">These numbers describe the last scan. The summary above describes your current tracked jobs. Daily scans start at 08:00 Denmark time.</p>'+
        '<button class="btn" onclick="go(\'scanner\')">Open scanner and diagnostics</button><h3 class="source-heading">Recently checked sources</h3><div class="source-list">'+(sources.slice(0,6).map(sourceNode).join('')||'<p class="muted">No sources available.</p>')+'</div></details>'+
      '<h2>Quick links</h2><div class="dashboard-shortcuts"><button class="btn" onclick="go(\'projects\')">Projects</button><button class="btn" onclick="go(\'sites\')">My sites</button><button class="btn" onclick="go(\'tasks\')">Tasks</button><button class="btn" onclick="go(\'settings\')">Settings</button></div>';
    if(active)setTimeout(()=>pollScanRequest(latestRequest.id),0);
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
    let rows=careerJobs.filter(j=>(HISTORY_STATUSES.has(stage)||!unavailableVacancy(j))&&(!q||[j.title,j.company,j.location,j.source_name].join(" ").toLowerCase().includes(q))&&(!stage||String(j.status||"discovered").toLowerCase()===stage)&&(!region||String(j.location||"").toLowerCase().includes(region))&&(!mode||String(j.work_mode||"").toLowerCase().includes(mode))&&Number(j.match_score||0)>=min);
    rows.sort((a,b)=>order==="newest"?searchedDate(b)-searchedDate(a):order==="deadline"?(Date.parse(a.deadline)||Infinity)-(Date.parse(b.deadline)||Infinity):Number(b.match_score||0)-Number(a.match_score||0));
    if(E("careerResults")) E("careerResults").innerHTML=jobTable(rows)+'<div class="card"><b>Verify vacancies</b><p class="muted">On-demand link check; inconclusive responses leave history unchanged.</p>'+rows.slice(0,30).map(j=>'<div class="row space" style="padding:7px 0"><span>'+esc(j.title||"Vacancy")+' · '+esc(j.company||"")+'</span><button class="btn" onclick="verifyTrackedJob(\''+j.id+'\')">Verify</button></div>').join("")+'</div>';
    if(E("careerCount")) E("careerCount").textContent=rows.length+" jobs";
  };
  function trackingBoard(rows){
    return '<div class="card"><div class="panel-title">Application Tracking Board</div><div class="muted board-hint">Scroll sideways to see all stages. Use the dropdown to move a job.</div><div class="tracking-scroll" tabindex="0" role="region" aria-label="Application stages">'+TRACK_STAGES.map(stage=>{
      const items=rows.filter(j=>String(j.status||"discovered").toLowerCase()===stage);
      return '<section class="tracking-column"><b>'+esc(stage[0].toUpperCase()+stage.slice(1))+' <span class="muted">'+items.length+'</span></b>'+items.slice(0,40).map(j=>'<div class="tracking-card"><b>'+esc(j.title||"Job")+'</b><div class="muted">'+esc(j.company||"")+'</div><button class="btn" onclick="openJobWorkspace(\''+esc(j.id)+'\')">Workspace</button><select class="select" aria-label="Stage for '+esc(j.title||"job")+'" style="margin-top:8px" onchange="setJobStatus(\''+j.id+'\',this.value)">'+TRACK_STAGES.map(st=>'<option value="'+st+'"'+(st===stage?' selected':'')+'>'+esc(st)+'</option>').join("")+'</select></div>').join("")+(items.length>40?'<p class="muted">Showing 40 of '+items.length+'. Use the stage filter below to view all.</p>':'')+(!items.length?'<p class="muted">No jobs yet</p>':'')+'</section>';
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
      '<select id="careerStage" aria-label="Application stage" class="select" onchange="careerFilter()"><option value="">Available jobs (all stages)</option>'+TRACK_STAGES.map(x=>'<option value="'+x+'">'+x+'</option>').join("")+'</select>'+
      '<select id="careerRegion" aria-label="Region" class="select" onchange="careerFilter()"><option value="">All regions</option><option value="københavn">Copenhagen</option><option value="copenhagen">Copenhagen (English)</option><option value="sjælland">Zealand</option><option value="zealand">Zealand (English)</option><option value="fyn">Funen</option><option value="jylland">Jutland</option></select>'+
      '<select id="careerWorkMode" aria-label="Work mode" class="select" onchange="careerFilter()"><option value="">All work modes</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select>'+
      '<select id="careerScore" aria-label="Minimum match score" class="select" onchange="careerFilter()"><option value="0">All matches</option><option value="75">75%+</option><option value="85">85%+</option><option value="90">90%+</option></select>'+
      '<select id="careerSort" aria-label="Sort tracked jobs" class="select" onchange="careerFilter()"><option value="score">Best match</option><option value="newest">Most recently discovered</option><option value="deadline">Upcoming deadline</option></select></div></div>'+
      '<div id="careerResults"></div>';
    if(requestedCareerStage&&E('careerStage')){E('careerStage').value=requestedCareerStage;requestedCareerStage='';}
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
      '<h2>Best Current Matches <span id="bestMatchesCount" class="muted"></span></h2><div class="jobs-toolbar"><select id="matchOrder" aria-label="Sort matches" class="select" onchange="refreshBestMatches()"><option value="score">Best match</option><option value="newest">Date searched: newest</option><option value="oldest">Date searched: oldest</option><option value="applied">Applied first</option><option value="closed">Closed first</option></select><select id="matchStatus" aria-label="Vacancy status" class="select" onchange="refreshBestMatches()"><option value="current">Current jobs</option><option value="applied">Applied history</option><option value="closed">Closed history</option><option value="all">All available Denmark jobs</option><option value="review">Review missing locations</option></select><label class="pill" style="cursor:pointer"><input type="checkbox" id="showAppliedInCurrent" onchange="toggleAppliedInCurrent(this.checked)"> Show applied / history jobs</label><span class="muted">Current matches require verification within 7 days and an unexpired deadline · History is preserved · Denmark only</span></div><div id="bestMatchesGrid"></div>'+
      '<details class="card scan-profile"><summary>Search profile and sources · '+(p.preferred_roles||[]).length+' target roles</summary><div class="scan-console scan-targeting"><div class="mission-panel"><div class="panel-title">Career Profile / Scan Targeting</div><div style="font-size:19px;font-weight:800;margin:10px 0">'+esc(p.professional_title||"Architectural Technologist / BIM Coordinator")+'</div><div class="muted">Master CV: '+esc(p.master_cv_file_name||"Master CV")+'</div><div style="margin-top:14px" class="panel-title">Target Roles</div><div id="roleChips" class="row" style="margin-top:10px">'+((p.preferred_roles||[]).map(x=>roleChip(x)).join(""))+'</div><div class="row" style="margin-top:12px"><input id="newRoleInput" aria-label="New target role" class="input" style="max-width:360px" placeholder="Add role, e.g. BIM Specialist" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addPreferredRole()}"><button class="btn primary" onclick="addPreferredRole()">Add role</button></div></div>'+
      categorySummary(p.preferred_roles||[])+
       '<div class="mission-panel"><div class="panel-title">Registry Status</div><div class="metric-grid" style="grid-template-columns:1fr 1fr;margin-top:14px">'+metric(sourceRows.length,"Enabled Sources")+metric(sourceGroups.length,"Source Groups")+'</div><button class="btn" onclick="showSourceRegistry()">View source registry</button></div></div></details>'+
      '<h2>Discovered Postings</h2><p class="muted">Expired and closed postings are excluded. Unverified postings still need a live vacancy check.</p><div class="card"><div class="jobs-toolbar"><input id="discoveryFilter" aria-label="Search discovered postings" class="input" style="max-width:360px" placeholder="Filter discovered postings" oninput="filterDiscoveries()"><select id="discoveryStatus" aria-label="Verification state" class="select" style="max-width:220px" onchange="filterDiscoveries()"><option value="">All verification states</option><option value="open">Verified open</option><option value="unverified">Unverified</option><option value="blocked">Blocked</option><option value="error">Error</option></select></div>'+discoveryTable(discoveryRows)+'</div>'+
      '<h2>Job Source Status</h2><div class="source-list">'+sourceRows.slice(0,24).map(sourceNode).join("")+'</div>'+
      (failedDiagnostics.length?'<h2>Source Errors — Last Scan</h2><div class="card"><div class="muted" style="margin-bottom:10px">These sources were processed but not successfully read, so they are not counted as checked.</div><div class="source-list">'+failedDiagnostics.map(d=>'<div class="source-node"><div class="row space"><div class="name">'+esc(d.source||"Source")+'</div>'+statusChip("error")+'</div><div class="stamp">'+esc(d.provider||"generic")+' · '+esc(d.error||"Source could not be read")+'</div></div>').join("")+'</div></div>':'')+
      '<h2>Recent Scan Runs</h2><div class="card" style="overflow:auto"><table><thead><tr><th>Date</th><th>Status</th><th>Sources</th><th>Found</th><th>Verified</th><th>Imported</th></tr></thead><tbody>'+
      runRows.map(x=>'<tr><td>'+new Date(x.started_at).toLocaleString()+'</td><td>'+statusChip(x.status)+'</td><td>'+x.sources_checked+'</td><td>'+x.vacancies_found+'</td><td>'+x.verified_open+'</td><td>'+x.imported_count+'</td></tr>').join("")+
      '</tbody></table></div>';
    refreshBestMatches();
  };


  function discoveryTable(rows){
    rows=rows.filter(j=>!unavailableVacancy(j));
    if(!rows.length) return '<div class="empty-state"><strong>No available discovered postings</strong>Expired and closed postings are excluded.</div>';
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

  window.LuksBridge={user:()=>user,get db(){return db;},denmarkJob,refresh:()=>loadPage()};
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



