
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),PDFLib=require('../dist/vendor/pdf-lib.min.js'),docx=require('../dist/vendor/docx.umd.js');
const document={documentElement:{dataset:{}},getElementById(){return {}},querySelector(){return null},querySelectorAll(){return []}};
const ctx=vm.createContext({URL,Intl,Date,console,document,PDFLib,docx,localStorage:{getItem(){return 'dark'},setItem(){}},matchMedia:()=>({matches:false,addEventListener(){}}),MutationObserver:class{observe(){}},window:null,addEventListener(){}});ctx.window=ctx;
vm.runInContext(readFileSync('workspace-core.js','utf8'),ctx);vm.runInContext(readFileSync('job-workspace.js','utf8'),ctx);
const h={name:'Sample Candidate',titleDa:'Bygningskonstruktør | BIM',titleEn:'Architectural Technologist | BIM',contacts:'candidate@example.test | Ishøj, Denmark'};
const d={application:'Til Example A/S\n\nAnsøgning: BIM-koordinator\n\nJeg arbejder med Revit, modeller og tekniske tegninger. Jeg bruger klare oplysninger og følger op på kvaliteten. Ærlig erfaring, åben dialog og præcis dokumentation er vigtig for mig.\n\nMed venlig hilsen\nSample Candidate',cv_page1:'PROFESSIONAL PROFILE\nArchitectural technologist with documented Revit experience.\n\nPROFESSIONAL EXPERIENCE\nExample employer | 2022–2026\n• Produced drawings and coordinated models.',cv_page2:'EDUCATION\nExample education | 2019–2022\n\nTECHNICAL TOOLS\nRevit, Navisworks and Dalux.\n\nLANGUAGES\nEnglish and Danish.'};
test('PDF exports have one application page and two CV pages with Danish glyphs',async()=>{
 for(const [kind,count] of [['application',1],['cv',2]]){const bytes=await ctx.LuksWorkspaceExports.pdfBytes(kind,d,h),pdf=await PDFLib.PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),count);assert.equal(pdf.getPage(0).getWidth(),595.28);}
});
test('PDF export refuses overflow instead of shrinking or dropping content',async()=>{await assert.rejects(ctx.LuksWorkspaceExports.pdfBytes('application',{...d,application:'Too much text '.repeat(6000)},h),/too long/);});
test('Word exports preserve both CV sections and Danish text in real OOXML',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'luks-docx-'));try{
  const blob=await ctx.LuksWorkspaceExports.wordBlob('cv',d,h,docx),path=join(dir,'cv.docx');writeFileSync(path,Buffer.from(await blob.arrayBuffer()));
  const xml=execFileSync('unzip',['-p',path,'word/document.xml'],{encoding:'utf8'});
  assert.match(xml,/EDUCATION/);assert.match(xml,/PROFESSIONAL EXPERIENCE/);assert.match(xml,/Ishøj/);assert.equal((xml.match(/<w:sectPr[ >]/g)||[]).length,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
