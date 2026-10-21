import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
mkdirSync(new URL('../test-results/', import.meta.url), { recursive: true });
(async () => {
 const browser = await chromium.launch({channel: 'chromium-headless-shell', headless: true, args:['--no-first-run','--password-store=basic','--use-mock-keychain']});
 try {
 const page = await browser.newPage({viewport:{width:560,height:740}});
 await page.addInitScript(() => { window.__TAURI__={core:{invoke:async (cmd,payload)=> {
 if(cmd==='get_settings')return {settings:{replaceDashes:true,replaceQuotes:true,fontSize:12,pasteShortcut:'Ctrl+Alt+Shift+V',repairShortcut:'',showFeedback:true,autoUpdates:false},openAtLogin:false,version:'1.1.1',updatesConfigured:false};
 if(cmd==='save_settings'){window.saved=payload;return;}
 if(cmd==='check_update')throw 'Updates are not configured in this preview. Use the installer supplied by Eryk.';
 }},event:{listen:()=>{}}}; });
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(new URL('../app/ui/index.html', import.meta.url).href);
 await page.screenshot({path:fileURLToPath(new URL('../test-results/light.png', import.meta.url)),fullPage:true});
 await page.locator('#pasteShortcut').focus();await page.keyboard.press('Control+Alt+Shift+P');
 await page.locator('button[type=submit]').click();
 const saved=await page.evaluate(()=>window.saved);
 if(saved.settings.pasteShortcut!=='Ctrl+Alt+Shift+P'||saved.settings.fontSize!==12)throw Error('Settings payload mismatch');
 await page.locator('#theme').click();await page.screenshot({path:fileURLToPath(new URL('../test-results/dark.png', import.meta.url)),fullPage:true});
 await page.locator('#checkUpdate').click();
 if(!(await page.locator('#status').textContent()).includes('not configured'))throw Error('Missing updater notice');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('UI QA passed: rendering, shortcut recording, save payload, dark theme, updater notice; 0 page errors');
 } finally { await browser.close(); }
})();
