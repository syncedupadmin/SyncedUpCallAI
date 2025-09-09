"use strict";(()=>{var e={};e.id=657,e.ids=[657],e.modules={399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},8678:e=>{e.exports=import("pg")},3042:(e,t,r)=>{r.a(e,async(e,a)=>{try{r.r(t),r.d(t,{originalPathname:()=>y,patchFetch:()=>l,requestAsyncStorage:()=>u,routeModule:()=>d,serverHooks:()=>h,staticGenerationAsyncStorage:()=>p});var n=r(9303),o=r(8716),i=r(670),s=r(1578),c=e([s]);s=(c.then?(await c)():c)[0];let d=new n.AppRouteRouteModule({definition:{kind:o.x.APP_ROUTE,page:"/api/jobs/batch/route",pathname:"/api/jobs/batch",filename:"route",bundlePath:"app/api/jobs/batch/route"},resolvedPagePath:"C:\\Users\\nicho\\OneDrive\\Desktop\\SyncedUpCallAI\\src\\app\\api\\jobs\\batch\\route.ts",nextConfigOutput:"",userland:s}),{requestAsyncStorage:u,staticGenerationAsyncStorage:p,serverHooks:h}=d,y="/api/jobs/batch/route";function l(){return(0,i.patchFetch)({serverHooks:h,staticGenerationAsyncStorage:p})}a()}catch(e){a(e)}})},1578:(e,t,r)=>{r.a(e,async(e,a)=>{try{r.r(t),r.d(t,{GET:()=>s});var n=r(7070),o=r(6341),i=e([o]);async function s(){let{rows:e}=await o.db.query(`
    with eligible as (
      select c.id, c.recording_url
      from calls c
      left join transcripts t on t.call_id = c.id
      where c.started_at > now() - interval '2 days'
        and c.duration_sec >= 10
        and c.recording_url is not null
        and t.call_id is null
      order by c.started_at desc
      limit 200
    )
    select * from eligible
  `);for(let t of e)await fetch(`${process.env.APP_URL}/api/jobs/transcribe`,{method:"POST",headers:{Authorization:`Bearer ${process.env.JOBS_SECRET}`,"Content-Type":"application/json"},body:JSON.stringify({callId:t.id,recordingUrl:t.recording_url})});return n.NextResponse.json({ok:!0,queued:e.length})}o=(i.then?(await i)():i)[0],a()}catch(e){a(e)}})},6341:(e,t,r)=>{r.a(e,async(e,a)=>{try{r.d(t,{db:()=>s});var n=r(8678),o=e([n]);let i=new(n=(o.then?(await o)():o)[0]).default.Pool({connectionString:process.env.DATABASE_URL}),s={query:(e,t)=>i.query(e,t),one:async(e,t)=>(await i.query(e,t)).rows[0],oneOrNone:async(e,t)=>(await i.query(e,t)).rows[0]||null,none:async(e,t)=>{await i.query(e,t)}};a()}catch(e){a(e)}})}};var t=require("../../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),a=t.X(0,[276,972],()=>r(3042));module.exports=a})();