-- Let agents customize the property-page section titles/copy that were
-- previously hardcoded in the template (or only settable on demo listings).
ALTER TABLE agent_properties ADD COLUMN IF NOT EXISTS story_kicker      TEXT;
ALTER TABLE agent_properties ADD COLUMN IF NOT EXISTS story_heading     TEXT;
ALTER TABLE agent_properties ADD COLUMN IF NOT EXISTS story_body        TEXT;
ALTER TABLE agent_properties ADD COLUMN IF NOT EXISTS amenities_kicker  TEXT;
ALTER TABLE agent_properties ADD COLUMN IF NOT EXISTS amenities_heading TEXT;
ALTER TABLE agent_properties ADD COLUMN IF NOT EXISTS setting_kicker    TEXT;
ALTER TABLE agent_properties ADD COLUMN IF NOT EXISTS setting_heading   TEXT;
ALTER TABLE agent_properties ADD COLUMN IF NOT EXISTS setting_body      TEXT;
ALTER TABLE agent_properties ADD COLUMN IF NOT EXISTS setting_pills     TEXT;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS amenities_kicker  TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS amenities_heading TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS setting_kicker    TEXT;
