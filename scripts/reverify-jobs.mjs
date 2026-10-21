// Usage: node scripts/reverify-jobs.mjs input.json output.json
// Input: read-only export of id, title, job_url, deadline, verified_at, updated_at.
// Output: evidence only. No database writes; persist only conclusive rows with an
// optimistic updated_at comparison and never write status/notes/application fields.
import {readFileSync,writeFileSync} from 'node:fs';
import {verifySavedJob} from '../supabase/functions/_shared/verification.ts';
const [input,output]=process.argv.slice(2);
if(!input||!output||input===output)throw Error('Provide distinct input.json and output.json paths');
const jobs=JSON.parse(readFileSync(input,'utf8'));
if(!Array.isArray(jobs))throw Error('Input must be an array');
const results=[];let cursor=0;
async function worker(){
  while(cursor<jobs.length){
    const job=jobs[cursor++];
    const evidence=await verifySavedJob(job);
    results.push({id:job.id,expected_updated_at:job.updated_at,...evidence});
    writeFileSync(output,JSON.stringify(results,null,2));
  }
}
await Promise.all(Array.from({length:6},worker));
console.log(JSON.stringify({checked:results.length,conclusive:results.filter(x=>x.conclusive).length,states:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));
