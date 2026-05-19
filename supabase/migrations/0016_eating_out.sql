-- Per-slot "eating out" flag (one row per family × slot_date × meal_type when flagged)
create table meal_plan_slot_settings (
  family_id     uuid not null,
  week_start    date not null,
  slot_date     date not null,
  meal_type     text not null check (meal_type in ('breakfast','lunch','dinner')),
  is_eating_out boolean not null default false,
  primary key (family_id, slot_date, meal_type)
);

alter table meal_plan_slot_settings enable row level security;

create policy "family members can manage their slot settings"
  on meal_plan_slot_settings for all
  using  (family_id = get_my_family_id())
  with check (family_id = get_my_family_id());
