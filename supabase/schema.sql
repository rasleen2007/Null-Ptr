-- JARVIS AI Harness — Supabase schema
-- Apply this in the Supabase SQL editor before enabling the Supabase adapter.
-- Access is intended exclusively through the service role key on the server.
-- Never expose the service role key to the browser.

create table if not exists public.jarvis_conversations (
  id text primary key,
  title text not null,
  model text not null,
  system_prompt text,
  pinned boolean not null default false,
  message_count integer not null default 0,
  last_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_messages (
  id text primary key,
  conversation_id text not null references public.jarvis_conversations(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text not null default '',
  tool_calls jsonb,
  tool_call_id text,
  tool_name text,
  provider text check (provider in ('gemini', 'groq', 'openrouter', 'ollama')),
  model text,
  token_estimate integer,
  created_at timestamptz not null default now()
);

create table if not exists public.jarvis_memories (
  id text primary key,
  content text not null,
  tags text[] not null default '{}',
  source text,
  importance double precision not null default 0.5 check (importance >= 0 and importance <= 1),
  access_count integer not null default 0,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_logs (
  id text primary key,
  run_id text,
  conversation_id text,
  level text not null check (level in ('debug', 'info', 'warn', 'error')),
  event text not null,
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.jarvis_runs (
  id text primary key,
  conversation_id text references public.jarvis_conversations(id) on delete cascade,
  kind text not null default 'chat' check (kind in ('chat', 'agent')),
  status text not null default 'running'
    check (status in ('running', 'awaiting_approval', 'completed', 'cancelled', 'failed')),
  input text not null,
  state jsonb not null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_settings (
  id text primary key default 'global',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists jarvis_conversations_updated_idx
  on public.jarvis_conversations (updated_at desc);

create index if not exists jarvis_conversations_pinned_idx
  on public.jarvis_conversations (pinned desc, updated_at desc);

create index if not exists jarvis_messages_conversation_idx
  on public.jarvis_messages (conversation_id, created_at asc);

create index if not exists jarvis_messages_content_ilike_idx
  on public.jarvis_messages (content);

create index if not exists jarvis_memories_updated_idx
  on public.jarvis_memories (updated_at desc);

create index if not exists jarvis_memories_tags_idx
  on public.jarvis_memories using gin (tags);

create index if not exists jarvis_logs_created_idx
  on public.jarvis_logs (created_at desc);

create index if not exists jarvis_logs_run_idx
  on public.jarvis_logs (run_id, created_at desc);

create index if not exists jarvis_logs_conversation_idx
  on public.jarvis_logs (conversation_id, created_at desc);

create index if not exists jarvis_runs_created_idx
  on public.jarvis_runs (created_at desc);

create index if not exists jarvis_runs_conversation_idx
  on public.jarvis_runs (conversation_id, created_at desc);

create index if not exists jarvis_runs_status_idx
  on public.jarvis_runs (status);

-- RLS: enable and intentionally create no public policies.
-- The server uses the service role key, which bypasses RLS.
-- Anonymous and authenticated clients should have no access.
alter table public.jarvis_conversations enable row level security;
alter table public.jarvis_messages enable row level security;
alter table public.jarvis_memories enable row level security;
alter table public.jarvis_logs enable row level security;
alter table public.jarvis_runs enable row level security;
alter table public.jarvis_settings enable row level security;

revoke all on table public.jarvis_conversations from anon, authenticated;
revoke all on table public.jarvis_messages from anon, authenticated;
revoke all on table public.jarvis_memories from anon, authenticated;
revoke all on table public.jarvis_logs from anon, authenticated;
revoke all on table public.jarvis_runs from anon, authenticated;
revoke all on table public.jarvis_settings from anon, authenticated;

-- Seed the global settings row. The application also upserts this on first use.
insert into public.jarvis_settings (id, data)
values ('global', '{}'::jsonb)
on conflict (id) do nothing;

comment on table public.jarvis_conversations is 'JARVIS chat conversations. Server-only access.';
comment on table public.jarvis_messages is 'JARVIS conversation messages, including tool calls and results.';
comment on table public.jarvis_memories is 'JARVIS long-term memories retrieved by lexical scoring.';
comment on table public.jarvis_logs is 'JARVIS execution logs for observability.';
comment on table public.jarvis_runs is 'JARVIS run records, including approval state and cancellation status.';
comment on table public.jarvis_settings is 'JARVIS global settings stored as a JSON document.';
