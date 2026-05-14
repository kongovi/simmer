-- Performance indexes for grocery list queries

create index if not exists grocery_list_items_list_id_idx
  on grocery_list_items(grocery_list_id);

create index if not exists grocery_lists_family_week_idx
  on grocery_lists(family_id, week_start, is_active);
