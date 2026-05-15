-- Add emoji override column to family_stores
-- Allows users to set a custom emoji for any store (overrides the built-in
-- storeIcons map). NULL means "use the automatic icon/emoji from the map".
ALTER TABLE family_stores ADD COLUMN IF NOT EXISTS emoji text;
