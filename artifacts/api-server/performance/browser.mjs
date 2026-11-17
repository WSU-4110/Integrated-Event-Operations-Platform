import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Developer-only browser checks. The caller owns a disposable fake-data fixture.
export async function checkBrowser({base,session,email,id,resetFixtureAttendance}) {
  assert.equal(typeof resetFixtureAttendance,'function');
  const {chromium}=await import(process.env.PERF_PLAYWRIGHT_MODULE || 'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PERF_CHROMIUM?{executablePath:process.env.PERF_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer','--use-gl=disabled','--single-process','--no-zygote']});
  try {
    const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
    await context.addCookies([{name:'sid',value:session,url:base}]);
    const page=await context.newPage();page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.getByText('Load test announcement',{exact:true}).waitFor();
    await page.goto(base+'/admin');await page.getByTestId('input-admin-search').fill(email);
    const button=page.getByTestId('button-check-in-'+id);await button.waitFor();
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow');
    }
    let confirm=false,posts=0;
    page.on('dialog',async d=>{if(confirm)await d.accept();else await d.dismiss();});
    page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/check-in'))posts++;});
    await button.click();assert.equal(posts,0,'Cancel makes no check-in request');
    assert.equal((await (await context.request.get(base+'/api/admin/stats')).json()).checked_in,0);
    confirm=true;
    await Promise.all([page.waitForResponse(r=>r.url().endsWith(`/registrations/${id}/check-in`)&&r.status()===200),button.click()]);
    await page.getByTestId('status-check-in-'+id).waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-testid="text-admin-stat-2"]')?.textContent==='1');
    await page.reload();await page.getByTestId('input-admin-search').fill(email);
    await page.getByTestId('status-check-in-'+id).waitFor();
    assert.equal((await context.request.post(`${base}/api/admin/registrations/${id}/check-in`)).status(),409);
    assert.equal((await (await context.request.get(base+'/api/admin/stats')).json()).checked_in,1);
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByTestId('link-export-csv').click()]);
    assert.equal(await download.failure(),null);
    const lines=(await readFile(await download.path(),'utf8')).trim().split(/\r?\n/);
    assert.equal(lines.length,1001);assert.match(lines[0],/email/);
    const emailColumn=lines[0].split(',').indexOf('email');
    assert.equal(new Set(lines.slice(1).map(line=>line.split(',')[emailColumn])).size,1000);
    await resetFixtureAttendance();
    assert.equal((await (await context.request.get(base+'/api/admin/stats')).json()).checked_in,0);
    await context.clearCookies();
    assert.equal((await context.request.get(base+'/api/admin/registrations')).status(),401);
    await page.route('**/api/login**',route=>route.fulfill({status:200,contentType:'text/plain',body:'Sign in required'}));
    await page.goto(base+'/admin');await page.getByText('Sign in required',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    return {passed:true,widths:[1440,390],javascript_errors:0,csv_records:1000,fixture_reset:true,
      external_oauth:'not exercised; login destination stubbed',
      scope:'published content, search, cancel, confirmed check-in persisted after reload, duplicate rejection, CSV download, signed-out protection'};
  } finally {await browser.close();}
}
