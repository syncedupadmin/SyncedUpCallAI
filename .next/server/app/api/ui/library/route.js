"use strict";(()=>{var e={};e.id=949,e.ids=[949],e.modules={399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},8678:e=>{e.exports=import("pg")},7127:(e,a,r)=>{r.a(e,async(e,t)=>{try{r.r(a),r.d(a,{originalPathname:()=>m,patchFetch:()=>u,requestAsyncStorage:()=>l,routeModule:()=>d,serverHooks:()=>y,staticGenerationAsyncStorage:()=>p});var n=r(9303),s=r(8716),i=r(670),o=r(6238),c=e([o]);o=(c.then?(await c)():c)[0];let d=new n.AppRouteRouteModule({definition:{kind:s.x.APP_ROUTE,page:"/api/ui/library/route",pathname:"/api/ui/library",filename:"route",bundlePath:"app/api/ui/library/route"},resolvedPagePath:"C:\\Users\\nicho\\OneDrive\\Desktop\\SyncedUpCallAI\\src\\app\\api\\ui\\library\\route.ts",nextConfigOutput:"",userland:o}),{requestAsyncStorage:l,staticGenerationAsyncStorage:p,serverHooks:y}=d,m="/api/ui/library/route";function u(){return(0,i.patchFetch)({serverHooks:y,staticGenerationAsyncStorage:p})}t()}catch(e){t(e)}})},6238:(e,a,r)=>{r.a(e,async(e,t)=>{try{r.r(a),r.d(a,{GET:()=>o});var n=r(7070),s=r(6341),i=e([s]);async function o(){let e=await s.db.query(`
    select c.id, c.started_at, ag.name agent, an.qa_score, an.reason_primary, an.summary
    from calls c
    join analyses an on an.call_id=c.id
    left join agents ag on ag.id=c.agent_id
    where an.qa_score >= 85
    order by an.qa_score desc, c.started_at desc
    limit 50
  `),a=await s.db.query(`
    select c.id, c.started_at, ag.name agent, an.qa_score, an.reason_primary, an.summary
    from calls c
    join analyses an on an.call_id=c.id
    left join agents ag on ag.id=c.agent_id
    where (an.qa_score < 55) or (an.reason_primary in ('trust_scam_fear','bank_decline'))
    order by an.qa_score asc, c.started_at desc
    limit 50
  `);return n.NextResponse.json({best:e.rows,worst:a.rows})}s=(i.then?(await i)():i)[0],t()}catch(e){t(e)}})},6341:(e,a,r)=>{r.a(e,async(e,t)=>{try{r.d(a,{db:()=>o});var n=r(8678),s=e([n]);let i=new(n=(s.then?(await s)():s)[0]).default.Pool({connectionString:process.env.DATABASE_URL}),o={query:(e,a)=>i.query(e,a),one:async(e,a)=>(await i.query(e,a)).rows[0],oneOrNone:async(e,a)=>(await i.query(e,a)).rows[0]||null,none:async(e,a)=>{await i.query(e,a)}};t()}catch(e){t(e)}})}};var a=require("../../../../webpack-runtime.js");a.C(e);var r=e=>a(a.s=e),t=a.X(0,[276,972],()=>r(7127));module.exports=t})();