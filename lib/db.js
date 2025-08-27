import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE;
export const sb = createClient(url, serviceKey, { auth: { persistSession: false }, global: { fetch } });
export async function upsert(table, values, conflict='id'){ const { data, error } = await sb.from(table).upsert(values,{ onConflict: conflict }).select(); if(error) throw error; return data;}
export async function insert(table, values){ const { data, error } = await sb.from(table).insert(values).select(); if(error) throw error; return data;}
export async function select(table, match, opts={}){ let q = sb.from(table).select(opts.columns||"*"); if(match) q=q.match(match); if(opts.limit) q=q.limit(opts.limit); if(opts.order) q=q.order(opts.order,{ascending:!!opts.ascending}); const { data, error } = await q; if(error) throw error; return data;}
