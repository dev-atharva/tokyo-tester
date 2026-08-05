ALTER TABLE scenarios
    ADD COLUMN execution_model VARCHAR(32) NOT NULL DEFAULT 'legacy-tests',
    ADD COLUMN environment_config TEXT NOT NULL DEFAULT 'null',
    ADD COLUMN steps_config TEXT NOT NULL DEFAULT '[]',
    ADD COLUMN step_order TEXT NOT NULL DEFAULT '[]';
