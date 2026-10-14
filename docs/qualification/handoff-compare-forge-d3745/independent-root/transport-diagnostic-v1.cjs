'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root='/home/jacob/tastetable-handoff-compare-d3745-receiving';
const out=path.join(root,'transport-diagnostic-v1');fs.mkdirSync(out);fs.mkdirSync(path.join(out,'tmp'));
(async()=>{let browser;const result={scope:'Source-free Firefox return-value transport diagnostic; no TasteTable source imported or file input loaded.',started:new Date().toISOString()};try{
 const puppeteer=require('/home/jacob/.local/lib/node_modules/@wonderwhy-er/desktop-commander/node_modules/puppeteer');
 browser=await puppeteer.launch({browser:'firefox',executablePath:'/usr/bin/firefox',headless:true,userDataDir:path.join(out,'profile'),env:{...process.env,TMPDIR:path.join(out,'tmp')}});
 const child=browser.process();result.browser_pid=child.pid;result.version=await browser.version();const page=await browser.newPage();
 result.raw=await page.evaluate(()=>{const visit={date:'2027-01-04'};return {right:[visit],changes:[{after:visit}]};});
 result.raw_after_present=Object.hasOwn(result.raw.changes[0],'after');result.raw_after_type=typeof result.raw.changes[0].after;
 result.json_string=await page.evaluate(()=>{const visit={date:'2027-01-04'};return JSON.stringify({right:[visit],changes:[{after:visit}]});});
 result.json_parsed=JSON.parse(result.json_string);assert.equal(result.json_parsed.changes[0].after.date,'2027-01-04');
 await browser.close();result.browser_exit=child.exitCode;result.browser_signal=child.signalCode;assert.equal(child.exitCode,0);assert.equal(child.signalCode,null);browser=null;result.closed=true;
 }catch(e){result.error=String(e);process.exitCode=1;}finally{if(browser)await browser.close();result.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));}
})();