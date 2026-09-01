-- Row-level security for RUBIKS DNA State Map.
--
-- Tenant isolation is enforced by the database, not the application. Every
-- tenant-scoped table requires `app.org_id` to be set on the session or
-- transaction; a query that forgets to set it returns zero rows rather than
-- another tenant's data.
--
-- Apply after migrations:  psql "$DATABASE_URL" -f packages/db/sql/rls.sql

-- ---------------------------------------------------------------
-- Helper: the org id of the current request, or NULL if unset.
-- ---------------------------------------------------------------
create or replace function app_current_org() returns uuid
language plpgsql
stable
as $$
begin
  return nullif(current_setting('app.org_id', true), '')::uuid;
exception
  when others then
    return null;
end;
$$;

-- ---------------------------------------------------------------
-- Tenant-scoped tables: one uniform policy each.
-- ---------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables text[] := array[
    'subjects',
    'samples',
    'data_files',
    'measurements',
    'probe_features',
    'feature_matrices',
    'clock_results',
    'hallmark_scores',
    'interventions',
    'episodes',
    'delta_results',
    'reports',
    'usage_events',
    'subscriptions'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($f$
      create policy tenant_isolation on %I
        using (org_id = app_current_org())
        with check (org_id = app_current_org())
    $f$, t);
  end loop;
end;
$$;

-- `organizations` is readable only as your own row.
alter table organizations enable row level security;
alter table organizations force row level security;
drop policy if exists own_org on organizations;
create policy own_org on organizations
  using (id = app_current_org())
  with check (id = app_current_org());

-- `episode_interventions` has no org_id of its own; scope through the episode.
alter table episode_interventions enable row level security;
alter table episode_interventions force row level security;
drop policy if exists tenant_isolation on episode_interventions;
create policy tenant_isolation on episode_interventions
  using (
    exists (
      select 1 from episodes e
      where e.id = episode_interventions.episode_id
        and e.org_id = app_current_org()
    )
  )
  with check (
    exists (
      select 1 from episodes e
      where e.id = episode_interventions.episode_id
        and e.org_id = app_current_org()
    )
  );

-- Audit events are append-only and readable by their own tenant. There is
-- deliberately no update or delete policy: audit history is not editable.
alter table audit_events enable row level security;
alter table audit_events force row level security;
drop policy if exists audit_read on audit_events;
create policy audit_read on audit_events
  for select using (org_id = app_current_org());
drop policy if exists audit_append on audit_events;
create policy audit_append on audit_events
  for insert with check (org_id = app_current_org());

-- ---------------------------------------------------------------
-- Reports are immutable once issued.
-- ---------------------------------------------------------------
create or replace function reports_are_immutable() returns trigger
language plpgsql
as $$
begin
  -- The object key may be filled in once, after the PDF renders.
  if old.object_key is null and new.object_key is not null then
    if row(new.*) is distinct from row((old.*)) then
      -- allow only the object_key transition
      if new.id <> old.id
        or new.payload::text <> old.payload::text
        or new.template_version <> old.template_version
        or new.disclaimer_version <> old.disclaimer_version then
        raise exception 'reports are immutable once issued';
      end if;
    end if;
    return new;
  end if;
  raise exception 'reports are immutable once issued';
end;
$$;

drop trigger if exists reports_immutable on reports;
create trigger reports_immutable
  before update on reports
  for each row execute function reports_are_immutable();

-- ---------------------------------------------------------------
-- PHI gate: identifiable subject fields require an opted-in organization.
--
-- This is the mechanism that makes the v1 "no PHI" promise structural rather
-- than a matter of engineering discipline. Flipping organizations.phi_enabled
-- (plus a signed BAA and the checklist in docs/phi-upgrade.md) is the upgrade.
-- ---------------------------------------------------------------
create or replace function enforce_phi_gate() returns trigger
language plpgsql
as $$
declare
  allowed boolean;
begin
  if new.display_name is null then
    return new;
  end if;

  select phi_enabled into allowed from organizations where id = new.org_id;

  if allowed is not true then
    raise exception
      'identifiable subject fields require organizations.phi_enabled = true (org %)',
      new.org_id;
  end if;

  return new;
end;
$$;

drop trigger if exists subjects_phi_gate on subjects;
create trigger subjects_phi_gate
  before insert or update on subjects
  for each row execute function enforce_phi_gate();
