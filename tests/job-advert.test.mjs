import test from 'node:test';import assert from 'node:assert/strict';
import {allowedAdvertJob,advertUrl,publicAddress,publicAdvertFetch,extractAdvert} from '../supabase/functions/_shared/job-advert.ts';
import {advertHandler} from '../supabase/functions/job-advert/index.ts';
const id='11111111-1111-4111-8111-111111111111',job={id,user_id:'owner',title:'BIM Coordinator',location:'Copenhagen, Denmark',job_url:'https://employer.dk/jobs/one',match_score:74,status:'saved',verified_open:true,verification_status:'open',verified_at:new Date().toISOString(),deadline:new Date(Date.now()+86400000).toISOString()};
const description='<h2>Your tasks</h2><p>'+('Coordinate Revit models and technical drawings with the construction team. '.repeat(12))+'</p><h2>Apply now</h2><p>Send your application.</p>';
const html='<h1>BIM Coordinator</h1><div class="csa_jobadText">'+description+'</div><form>Do not include private application form fields</form>';
const resolver=async()=>['93.184.215.14'];
test('advert retrieval requires current Denmark vacancy strictly above 70 percent',()=>{
 assert.equal(allowedAdvertJob(job),true);for(const patch of [{match_score:70},{match_score:'74'},{location:'Copenhagen, Sweden'},{deadline:'2020-01-01'},{verified_open:false},{status:'closed'},{verified_at:'2020-01-01'}])assert.equal(allowedAdvertJob({...job,...patch}),false);
});
test('advert extraction preserves sections and excludes application form and unrelated pages',()=>{
 const r=extractAdvert(job,html,job.job_url);assert.match(r.text,/Your tasks\nCoordinate/);assert.doesNotMatch(r.text,/private application form/);
 for(const h of [html.replace('BIM Coordinator','Nurse Supervisor'),html+'<p>Position has been filled</p>',html.replace(description,'Short teaser')])assert.throws(()=>extractAdvert(job,h,job.job_url));
 const structured='<h1>BIM Coordinator</h1><script type="application/ld+json">'+JSON.stringify({'@type':'JobPosting',title:job.title,description,jobLocation:{address:{addressLocality:'Copenhagen',addressCountry:'DK'}}})+'</script><p>Apply now</p>';
 assert.match(extractAdvert(job,structured,job.job_url).text,/Coordinate Revit/);
 assert.throws(()=>extractAdvert(job,structured.replace('"DK"','"SE"'),job.job_url),/Denmark-only/);
});
test('public URL and DNS checks reject private, metadata, mixed-address and redirect targets',async()=>{
 for(const u of ['http://127.0.0.1/','http://169.254.169.254/','https://u:p@employer.dk/','https://[::1]/','https://employer.dk:8443/','https://service.local/'])assert.throws(()=>advertUrl(u));
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','100.64.0.1','192.168.1.1','172.20.1.1','::1','::ffff:7f00:1','2001:db8::1','fe80::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('93.184.215.14'),true);
 let calls=0;await assert.rejects(publicAdvertFetch(job.job_url,async()=>{calls++;return new Response(html);},async()=>['93.184.215.14','127.0.0.1']),/public addresses/);assert.equal(calls,0);
 await assert.rejects(publicAdvertFetch(job.job_url,async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://169.254.169.254/'}});},resolver),/public employer/);assert.equal(calls,1);
});
test('retrieval enforces HTTP restrictions and bounded response size',async()=>{
 await assert.rejects(publicAdvertFetch(job.job_url,async()=>new Response('Blocked',{status:403}),resolver),/403/);
 await assert.rejects(publicAdvertFetch(job.job_url,async()=>new Response('x'.repeat(900001),{headers:{'content-type':'text/html'}}),resolver),/size limit/);
 const page=await publicAdvertFetch(job.job_url,async()=>new Response(html,{headers:{'content-type':'text/html'}}),resolver);assert.equal(page.html,html);
});
const env=k=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'test-key'}[k]);
const request=(body={job_id:id},auth='Bearer signed-user')=>new Request('https://project.supabase.co/functions/v1/job-advert',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify(body)});
function api(rows=[job],authStatus=200){return async(url,options)=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner'},{status:authStatus});
 if(url.includes('/rest/v1/jobs?')){assert.equal(options.headers.Authorization,'Bearer signed-user');assert.match(url,/user_id=eq.owner/);return Response.json(rows);}
 return new Response(html,{headers:{'content-type':'text/html'}});
};}
test('authenticated endpoint restricts lookups to the caller and never accepts a free URL',async()=>{
 const handle=advertHandler(env,api(),resolver);assert.equal((await handle(request({},''))).status,401);assert.equal((await handle(request({url:job.job_url}))).status,400);
 assert.equal((await advertHandler(env,api([],200),resolver)(request())).status,404);assert.equal((await advertHandler(env,api([job],401),resolver)(request())).status,401);
 assert.equal((await advertHandler(env,api([{...job,status:'closed'}]),resolver)(request())).status,409);
 const response=await handle(request()),data=await response.json();assert.equal(response.status,200);assert.ok(data.text.length>500);assert.equal(data.source_url,job.job_url);
});
