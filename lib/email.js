import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);
export async function sendMail({ to, subject, html, text }){
  const from = `${process.env.BRAND_FROM_NAME || "IE Studio Ops"} <${process.env.BRAND_FROM_EMAIL || "ops@yourdomain.com"}>`;
  return await resend.emails.send({ from, to, subject, html, text: text || html?.replace(/<[^>]+>/g,'') });
}
