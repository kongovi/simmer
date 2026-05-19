-- Move eating-out to individual dish level
alter table meal_plan_slots
  add column is_eating_out boolean not null default false;

-- Remove the per-slot table (superseded by per-dish column)
drop table if exists meal_plan_slot_settings;
