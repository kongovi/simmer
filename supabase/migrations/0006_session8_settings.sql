-- Session 8: family_stores, family_invites, RLS updates, accept_family_invite RPC

-- ── 1. family_stores ─────────────────────────────────────────────────────────

create table family_stores (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null,
  name       text not null,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table family_stores enable row level security;

create policy "family_stores: family access"
  on family_stores for all
  using  (family_id = get_my_family_id())
  with check (family_id = get_my_family_id());

-- ── 2. family_invites ─────────────────────────────────────────────────────────

create table family_invites (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null,
  invited_by  uuid references auth.users,
  token       text not null unique default encode(gen_random_bytes(16), 'hex'),
  email       text,
  role        text not null check (role in ('planner','member')) default 'member',
  accepted_by uuid references auth.users,
  accepted_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now()
);

alter table family_invites enable row level security;

-- Family members can manage invites for their own family
create policy "family_invites: family members can select"
  on family_invites for select
  using (family_id = get_my_family_id());

create policy "family_invites: family members can insert"
  on family_invites for insert
  with check (family_id = get_my_family_id());

create policy "family_invites: family members can delete"
  on family_invites for delete
  using (family_id = get_my_family_id());

-- ── 3. Fix family_members SELECT policy so users can see all family members ──

-- The old policy (user_id = auth.uid()) only lets you see your own row.
-- Replace it with family-scoped access using the SECURITY DEFINER helper.
drop policy if exists "family_members: read own row" on family_members;

create policy "family_members: read own family"
  on family_members for select
  using (family_id = get_my_family_id());

-- ── 4. accept_family_invite RPC ───────────────────────────────────────────────
-- SECURITY DEFINER so it can bypass RLS to read the invite and write the member row.

create or replace function accept_family_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite   family_invites%rowtype;
  v_user_id  uuid := auth.uid();
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  -- Fetch valid, unexpired, unaccepted invite
  select * into v_invite
  from family_invites
  where token = p_token
    and accepted_at is null
    and expires_at > now();

  if not found then
    return jsonb_build_object('error', 'Invalid or expired invite link');
  end if;

  -- Already a member of that family?
  if exists (
    select 1 from family_members
    where user_id = v_user_id and family_id = v_invite.family_id
  ) then
    -- Return success — they're already in; the caller navigates to /grocery
    return jsonb_build_object('success', true, 'family_id', v_invite.family_id, 'already_member', true);
  end if;

  -- Remove any existing family memberships (initial solo family from sign-up)
  delete from family_members where user_id = v_user_id;

  -- Insert as a member of the inviting family
  insert into family_members (family_id, user_id, role)
  values (v_invite.family_id, v_user_id, v_invite.role);

  -- Update user_settings family_id
  update user_settings
  set family_id = v_invite.family_id, updated_at = now()
  where user_id = v_user_id;

  -- Mark invite accepted
  update family_invites
  set accepted_by = v_user_id, accepted_at = now()
  where id = v_invite.id;

  return jsonb_build_object('success', true, 'family_id', v_invite.family_id);
end;
$$;
