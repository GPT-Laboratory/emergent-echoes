
do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'user');
  end if;
end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create table if not exists public.account_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
grant select, insert on public.account_requests to authenticated;
grant update on public.account_requests to authenticated;
grant all on public.account_requests to service_role;
alter table public.account_requests enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_approved(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.account_requests where user_id = _user_id and status = 'approved')
$$;

drop policy if exists "read own role" on public.user_roles;
create policy "read own role" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "read own request" on public.account_requests;
create policy "read own request" on public.account_requests for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "create own request" on public.account_requests;
create policy "create own request" on public.account_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "admins decide requests" on public.account_requests;
create policy "admins decide requests" on public.account_requests for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

insert into public.account_requests (user_id, email, status, decided_at)
select u.id, coalesce(u.email, ''), 'approved', now() from auth.users u
on conflict (user_id) do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role from auth.users u where lower(u.email) = 'pekka@abrahamsson.in'
on conflict do nothing;

do $$
declare t text;
begin
  foreach t in array array['runs','worlds','agents','steps','scratch','alerts','experiments'] loop
    execute format('drop policy if exists %I on public.%I', 'authenticated read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'approved read ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_approved(auth.uid()))', 'approved read ' || t, t);
  end loop;
end $$;
