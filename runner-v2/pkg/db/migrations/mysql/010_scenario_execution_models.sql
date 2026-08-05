ALTER TABLE scenarios
    ADD COLUMN execution_model VARCHAR(32) NOT NULL DEFAULT 'legacy-tests' AFTER description,
    ADD COLUMN environment_config LONGTEXT NOT NULL DEFAULT ('null') AFTER test_order,
    ADD COLUMN steps_config LONGTEXT NOT NULL DEFAULT ('[]') AFTER environment_config,
    ADD COLUMN step_order LONGTEXT NOT NULL DEFAULT ('[]') AFTER steps_config;
