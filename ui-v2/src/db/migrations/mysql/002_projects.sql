CREATE TABLE IF NOT EXISTS `project` (
  `id` VARCHAR(255) PRIMARY KEY NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `createdBy` VARCHAR(255) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_project_created_by`
    FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `project_member` (
  `projectId` VARCHAR(255) NOT NULL,
  `userId` VARCHAR(255) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`projectId`, `userId`),
  CONSTRAINT `fk_project_member_project`
    FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_project_member_user`
    FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE INDEX `project_created_by_idx` ON `project`(`createdBy`);
CREATE INDEX `project_member_user_idx` ON `project_member`(`userId`);
