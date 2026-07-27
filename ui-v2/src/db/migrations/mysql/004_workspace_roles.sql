ALTER TABLE `project`
  ADD COLUMN `kind` VARCHAR(32) NOT NULL DEFAULT 'team';

ALTER TABLE `project_member`
  ADD COLUMN `role` VARCHAR(32) NOT NULL DEFAULT 'editor';

UPDATE `project_member`
INNER JOIN `project`
  ON `project`.`id` = `project_member`.`projectId`
SET `project_member`.`role` = 'owner'
WHERE `project`.`createdBy` = `project_member`.`userId`;

ALTER TABLE `project`
  ADD COLUMN `personalOwnerKey` VARCHAR(255)
  GENERATED ALWAYS AS (
    CASE WHEN `kind` = 'personal' THEN `createdBy` ELSE NULL END
  ) VIRTUAL;

CREATE UNIQUE INDEX `project_personal_owner_idx`
ON `project`(`personalOwnerKey`);

CREATE INDEX `project_member_role_idx`
ON `project_member`(`projectId`, `role`);
