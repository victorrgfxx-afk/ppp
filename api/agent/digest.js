import dayjs from "dayjs";
import { sb } from "../../lib/db.js";
import { sendMail } from "../../lib/email.js";

export default async function handler(req,res){
  try{
    const since=dayjs().subtract(24,"hour").toISOString();
    const { data: leads } = await sb.from("leads").select("*, documents(title,author,source)").gt("created_at", since).order("score",{ascending:false});
    const { data: derivs } = await sb.from("derivatives").select("*, documents(title)").gt("created_at", since);
    const { data: raws } = await sb.from("raw_events").select("*").gt("received_at", since);

    const html = `
      <h2>Chaos Digest (last 24h)</h2>
      <h3>Leads</h3>
      <ul>${(leads||[]).map(l=>`<li><b>${l.score}</b> — ${l.documents?.title||""} (${l.status})</li>`).join("")||"<i>none</i>"}</ul>
      <h3>Repurposed drafts</h3>
      <ul>${(derivs||[]).map(d=>`<li>${d.documents?.title||""}</li>`).join("")||"<i>none</i>"}</ul>
      <h3>Raw events</h3>
      <ul>${(raws||[]).map(r=>`<li>${r.kind} — ${r.source}</li>`).join("")||"<i>none</i>"}</ul>
    `;
    if(process.env.OWNER_EMAIL){
      await sendMail({ to: process.env.OWNER_EMAIL, subject: "Chaos Digest — last 24h", html });
    }
    res.status(200).json({ ok:true, sent: !!process.env.OWNER_EMAIL });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
}
