create extension if not exists pgcrypto;

create type public.license_plan as enum ('personal', 'company');
create type public.license_status as enum ('active', 'refunded', 'revoked');
create type public.member_role as enum ('admin', 'member');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id),
  max_members integer not null default 20 check (max_members = 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create unique index one_admin_per_organization
  on public.organization_members (organization_id)
  where role = 'admin';

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  stripe_checkout_session_id text not null unique,
  stripe_customer_id text,
  stripe_payment_link_id text not null,
  purchaser_email text not null,
  plan public.license_plan not null,
  status public.license_status not null default 'active',
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  purchased_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_active_license_per_purchase_email
  on public.licenses (lower(purchaser_email), plan)
  where status = 'active';

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table public.work_projects (
  id text primary key,
  owner_user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_user_id is not null) <> (organization_id is not null))
);

create table public.work_records (
  project_id text not null references public.work_projects(id) on delete cascade,
  record_id text not null,
  data jsonb not null,
  revision bigint not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, record_id)
);

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members members
    join public.licenses licenses on licenses.organization_id = members.organization_id
    where members.organization_id = target_organization_id
      and members.user_id = auth.uid()
      and licenses.plan = 'company'
      and licenses.status = 'active'
  );
$$;

create or replace function public.is_organization_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members members
    join public.licenses licenses on licenses.organization_id = members.organization_id
    where members.organization_id = target_organization_id
      and members.user_id = auth.uid()
      and members.role = 'admin'
      and licenses.plan = 'company'
      and licenses.status = 'active'
  );
$$;

create or replace function public.shares_organization(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.organization_id = mine.organization_id
    join public.licenses licenses on licenses.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and theirs.user_id = target_user_id
      and licenses.plan = 'company' and licenses.status = 'active'
  );
$$;

create or replace function public.enforce_organization_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
  member_limit integer;
begin
  select max_members into member_limit
  from public.organizations
  where id = new.organization_id
  for update;

  select count(*) into member_count
  from public.organization_members
  where organization_id = new.organization_id;

  if member_count >= member_limit then
    raise exception '会社版の利用者は管理者を含め20名までです';
  end if;
  return new;
end;
$$;

create trigger enforce_organization_member_limit_before_insert
before insert on public.organization_members
for each row execute function public.enforce_organization_member_limit();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.licenses enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.work_projects enable row level security;
alter table public.work_records enable row level security;

create policy "profiles_select_self" on public.profiles for select using (id = auth.uid());
create policy "profiles_select_organization_members" on public.profiles for select using (public.shares_organization(id));
create policy "profiles_update_self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "organizations_select_members" on public.organizations for select using (public.is_organization_member(id));
create policy "organizations_update_admin" on public.organizations for update using (public.is_organization_admin(id)) with check (public.is_organization_admin(id));
create policy "members_select_members" on public.organization_members for select using (public.is_organization_member(organization_id));
create policy "members_delete_admin" on public.organization_members for delete using (public.is_organization_admin(organization_id) and role <> 'admin');
create policy "licenses_select_owner" on public.licenses for select using (user_id = auth.uid() or public.is_organization_member(organization_id));
create policy "invitations_select_admin" on public.organization_invitations for select using (public.is_organization_admin(organization_id));
create policy "projects_select_owner_or_member" on public.work_projects for select using (owner_user_id = auth.uid() or public.is_organization_member(organization_id));
create policy "projects_insert_owner_or_member" on public.work_projects for insert with check (owner_user_id = auth.uid() or public.is_organization_member(organization_id));
create policy "projects_update_owner_or_member" on public.work_projects for update using (owner_user_id = auth.uid() or public.is_organization_member(organization_id)) with check (owner_user_id = auth.uid() or public.is_organization_member(organization_id));
create policy "projects_delete_owner_or_admin" on public.work_projects for delete using (owner_user_id = auth.uid() or public.is_organization_admin(organization_id));
create policy "records_select_project_access" on public.work_records for select using (exists (select 1 from public.work_projects p where p.id = project_id and (p.owner_user_id = auth.uid() or public.is_organization_member(p.organization_id))));
create policy "records_insert_project_access" on public.work_records for insert with check (exists (select 1 from public.work_projects p where p.id = project_id and (p.owner_user_id = auth.uid() or public.is_organization_member(p.organization_id))));
create policy "records_update_project_access" on public.work_records for update using (exists (select 1 from public.work_projects p where p.id = project_id and (p.owner_user_id = auth.uid() or public.is_organization_member(p.organization_id)))) with check (exists (select 1 from public.work_projects p where p.id = project_id and (p.owner_user_id = auth.uid() or public.is_organization_member(p.organization_id))));
create policy "records_delete_project_access" on public.work_records for delete using (exists (select 1 from public.work_projects p where p.id = project_id and (p.owner_user_id = auth.uid() or public.is_organization_admin(p.organization_id))));
