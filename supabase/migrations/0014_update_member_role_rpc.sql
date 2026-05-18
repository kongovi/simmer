-- RPC: update_member_role
-- Allows a 'planner' (admin) to change another family member's role.
-- Prevents changing your own role (safety guard).

CREATE OR REPLACE FUNCTION update_member_role(p_member_id uuid, p_new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id   uuid;
  v_caller_role text;
  v_target_uid  uuid;
BEGIN
  -- Validate role value
  IF p_new_role NOT IN ('planner', 'member') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  -- Get the caller's family
  v_family_id := get_my_family_id();
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no family';
  END IF;

  -- Check caller is a planner in that family
  SELECT role INTO v_caller_role
  FROM family_members
  WHERE user_id = auth.uid() AND family_id = v_family_id;

  IF v_caller_role IS DISTINCT FROM 'planner' THEN
    RAISE EXCEPTION 'Only admins can change member roles';
  END IF;

  -- Prevent self-role-change
  SELECT user_id INTO v_target_uid
  FROM family_members
  WHERE id = p_member_id AND family_id = v_family_id;

  IF v_target_uid IS NULL THEN
    RAISE EXCEPTION 'Member not found in this family';
  END IF;

  IF v_target_uid = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  -- Apply the update
  UPDATE family_members
  SET role = p_new_role
  WHERE id = p_member_id AND family_id = v_family_id;
END;
$$;
