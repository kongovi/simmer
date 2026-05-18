-- Add avatar_url to family_members so Google profile photos are stored and displayed
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS avatar_url text;
