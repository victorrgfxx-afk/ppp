import fs from "node:fs";
import { Client } from "pg";
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).send("Method not allowed");
  const token = req.headers["x-agent-token"] || req.query.token;
  if(!process.env.AGENT_BOOTSTRAP_TOKEN || token !== process.env.AGENT_BOOTSTRAP_TOKEN){
    return res.status(401).json({ ok:false, error:"unauthorized" });
  }
  if(!process.env.DATABASE_URL){
    return res.status(400).json({ ok:false, error:"DATABASE_URL not set" });
  }
  try{
    const sql=fs.readFileSync("./sql/schema.sql","utf8");
    const client=new (await import("pg")).Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query(sql);
    await client.end();
    res.status(200).json({ ok:true, message:"Schema applied" });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
}
