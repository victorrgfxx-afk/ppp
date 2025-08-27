create table if not exists raw_events (
  id text primary key,
  kind text not null,
  source text,
  received_at timestamptz default now(),
  payload jsonb
);
create table if not exists documents (
  id text primary key,
  ext_id text,
  source text,
  kind text,
  title text,
  author text,
  url text,
  content text,
  metadata jsonb,
  published_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists documents_ext_id_idx on documents(ext_id);
create table if not exists leads (
  id text primary key,
  doc_id text references documents(id) on delete cascade,
  score int,
  status text,
  data jsonb,
  created_at timestamptz default now()
);
create table if not exists derivatives (
  id text primary key,
  doc_id text references documents(id) on delete cascade,
  payload jsonb,
  created_at timestamptz default now()
);
