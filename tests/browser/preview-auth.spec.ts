import {test,expect} from '@playwright/test';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {readFileSync} from 'node:fs';
/**
 * Real-browser check of the credentials modes behind the preview 403 fix. A gateway that mimics Studio's preview
 * authentication (cookie required for /api) and a second origin that records any cookie it receives.
 * Needs a Playwright Chromium; it makes no wallet or chain requests.
 */
// This gateway is HTTP-only; use an owned test cookie rather than claiming
// production HTTPS __Host- cookie attributes. Credential-mode checks below
// still require the session and reject omitted/cross-origin credentials.
const COOKIE_NAME='bell_owned_preview_session';
async function listen(handler:Parameters<typeof createServer>[1]){
  const server:Server=createServer(handler);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  return {server,origin:`http://localhost:${(server.address() as AddressInfo).port}`};
}
test('authenticated same-origin API reads succeed; cross-origin reads never carry the cookie; failed reads are errors',async({page,context})=>{
  const seen:Array<string|undefined>=[];
  const other=await listen((req,res)=>{seen.push(req.headers.cookie);res.setHeader('access-control-allow-origin','*');res.setHeader('content-type','application/json');res.end('{"ok":true}');});
  const gateway=await listen((req,res)=>{
    if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>gate</title>');return;}
    if(!req.headers.cookie?.includes(`${COOKIE_NAME}=ok`)){res.statusCode=403;res.end('{"error":"forbidden"}');return;}
    res.setHeader('content-type','application/json');res.end('{"ok":true}');
  });
  try{
    await context.addCookies([{name:COOKIE_NAME,value:'ok',url:gateway.origin+'/',httpOnly:true,sameSite:'Strict'}]);
    await page.goto(gateway.origin+'/');
    const result=await page.evaluate(async(otherOrigin)=>{
      const status=async(url:string,credentials:RequestCredentials)=>{try{return (await fetch(url,{credentials,cache:'no-store'})).status;}catch{return 'error';}};
      return {sameOrigin:await status('/api/state','same-origin'),omit:await status('/api/state','omit'),cross:await status(`${otherOrigin}/api/state`,'same-origin')};
    },other.origin);
    expect(result.sameOrigin).toBe(200);
    expect(result.omit).toBe(403);
    expect(result.cross).toBe(200);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(cookie=>cookie===undefined)).toBe(true);
    // The shipped transport uses the mode proven above and nothing else.
    const source=readFileSync(new URL('../../src/adapter/transport.ts',import.meta.url),'utf8');
    expect(source).toContain("credentials:'same-origin'");
    expect(source).not.toContain("credentials:'omit'");
    expect(source).not.toContain("credentials:'include'");
  }finally{
    await new Promise<void>(r=>{gateway.server.closeAllConnections();gateway.server.close(()=>r());});
    await new Promise<void>(r=>{other.server.closeAllConnections();other.server.close(()=>r());});
  }
});
