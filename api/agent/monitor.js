import dayjs from "dayjs";
import OpenAI from "openai";
import { sb } from "../../lib/db.js";
import cronHandler from "../cron.js";
import { sendMail } from "../../lib/email.js";

export default async function handler(req,res){
  const report={ ok:true, checks:[] };
  function push(ok,name,detail){ report.checks.push({ok,name,detail}); if(!ok) report.ok=false; }

  try{ const { error } = await sb.from("documents").select("id").limit(1); if(error) throw error; push(true,"Supabase","Connected"); } catch(e){ push(false,"Supabase",e.message); }
  try{ const client=new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); await client.models.list({ limit: 1 }); push(true,"OpenAI","Key valid"); } catch(e){ push(false,"OpenAI",e.message); }

  try{
    const twoHoursAgo = dayjs().subtract(2,"hour").toISOString();
    const { count, error } = await sb.from("raw_events").select("*",{ count:"exact", head:true }).lt("received_at", twoHoursAgo);
    if(error) throw error;
    push(true,"Backlog",`Old events: ${count}`);
    if((count||0)>0){ const resp=await callCron(); push(true,"Cron-kick","Triggered due to backlog"); }
  } catch(e){ push(false,"Backlog",e.message); }

  try{
    const since=dayjs().subtract(24,"hour").toISOString();
    const { count, error } = await sb.from("documents").select("*",{ count:"exact", head:true }).gt("created_at", since);
    if(error) throw error;
    push(true,"Freshness",`Docs last 24h: ${count}`);
    if((count||0)===0){ const resp=await callCron(); push(true,"Cron-kick","Triggered due to staleness"); }
  } catch(e){ push(false,"Freshness",e.message); }

  if(!report.ok && process.env.OWNER_EMAIL){
    await sendMail({ to: process.env.OWNER_EMAIL, subject: "⚠️ Chaos Agent Monitor — Issues detected", html: `<pre>${JSON.stringify(report,null,2)}</pre>` });
  }
  res.status(200).json(report);
}

async function callCron(){
  try{
    const result = await new Promise((resolve)=>{
      const r = { status:(c)=>({ json:(obj)=>resolve({ status:c, ...obj }) }) };
      cronHandler({ method:"GET" }, r);
    });
    return { ok: true, result };
  } catch(e){ return { ok:false, error:e.message }; }
}
