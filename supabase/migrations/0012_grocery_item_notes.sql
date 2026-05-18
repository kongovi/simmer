-- Per-item notes on grocery list items (independent of catalog brand_note)
ALTER TABLE grocery_list_items ADD COLUMN notes text;
