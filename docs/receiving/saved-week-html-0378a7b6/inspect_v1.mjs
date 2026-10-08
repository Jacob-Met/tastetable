import {chromium} from "file:///C:/hamon-receiving-b47cbcf18759/dependencies/playwright-core-1.62.1/index.mjs";
import fs from "node:fs/promises";
import {fileURLToPath,pathToFileURL} from "node:url";
import {dirname,join} from "node:path";
const out=join(dirname(fileURLToPath(import.meta.url)),"browser-v1");
const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",args:["--no-sandbox"]});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},offline:true});
  const page=await context.newPage();
  await page.goto(pathToFileURL(join(out,"edited-literal-duplicates.html")).href);
  const sizes=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll("*")].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,130)}))}));
  await page.screenshot({path:join(out,"phone-overflow-v1.png"),fullPage:true});
  await fs.writeFile(join(out,"overflow-inspection.json"),JSON.stringify(sizes,null,2));
  console.log(JSON.stringify(sizes));
} finally {await browser.close();}
