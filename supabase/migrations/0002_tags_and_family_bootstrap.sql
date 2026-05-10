-- Add tags array to recipes
alter table recipes add column if not exists tags text[] default '{}';
alter table recipes add column if not exists difficulty text default null;

-- Bootstrap function — creates first family for a new user
create or replace function create_initial_family()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_family_id uuid;
  v_existing  uuid;
begin
  select family_id into v_existing from public.user_settings where user_id = auth.uid();
  if v_existing is not null then return v_existing; end if;
  v_family_id := gen_random_uuid();
  insert into public.family_members (family_id, user_id, role) values (v_family_id, auth.uid(), 'planner');
  update public.user_settings set family_id = v_family_id where user_id = auth.uid();
  return v_family_id;
end;
$$;
