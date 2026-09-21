create table public.mirror_claims (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (class_id, student_id)
);
-- Accessed only through the service role inside server functions; no direct client access.
alter table public.mirror_claims enable row level security;
create index mirror_claims_token_idx on public.mirror_claims (token);