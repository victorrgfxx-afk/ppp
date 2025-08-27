import crypto from "node:crypto";
import { insert } from "../../lib/db.js";
import { nanoid } from "nanoid";
function verifySignature(req){ const secret=process.env.INBOUND_SIGNING_SECRET; if(!secret) return true; const sig=req.headers["x-signature"]||req.headers["x-postmark-signature"]; if(!sig) return false; const h=crypto.createHmac("sha256",secret).update(req.rawBody||JSON.stringify(req.body)).digest("hex"); return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(h)); }
export const config={ api:{ bodyParser:{ sizeLimit:"2mb" } } };
export default async function handler(req,res){ if(req.method!=="POST") return res.status(405).send("Method not allowed"); if(!verifySignature(req)) return res.status(401).json({ok:false,error:"bad signature"}); const evt={ id:nanoid(), kind:"email_inbound", source:"postmark", received_at:new Date().toISOString(), payload:req.body }; try{ await insert("raw_events",evt); return res.status(200).json({ok:true}); } catch(e){ console.error(e); return res.status(500).json({ok:false,error:e.message}); } }
