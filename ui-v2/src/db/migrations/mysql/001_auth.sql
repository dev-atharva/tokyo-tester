CREATE TABLE IF NOT EXISTS `user` (
  `id` VARCHAR(255) PRIMARY KEY NOT NULL,
  `name` VARCHAR(255),
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `emailVerified` TIMESTAMP NULL,
  `image` TEXT,
  `passwordHash` TEXT,
  `role` VARCHAR(64) NOT NULL DEFAULT 'normal',
  `setupCompletedAt` TIMESTAMP NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `account` (
  `userId` VARCHAR(255) NOT NULL,
  `type` VARCHAR(255) NOT NULL,
  `provider` VARCHAR(255) NOT NULL,
  `providerAccountId` VARCHAR(255) NOT NULL,
  `refresh_token` TEXT,
  `access_token` TEXT,
  `expires_at` INT,
  `token_type` VARCHAR(255),
  `scope` TEXT,
  `id_token` TEXT,
  `session_state` VARCHAR(255),
  PRIMARY KEY (`provider`, `providerAccountId`),
  CONSTRAINT `fk_account_user`
    FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `session` (
  `sessionToken` VARCHAR(255) PRIMARY KEY NOT NULL,
  `userId` VARCHAR(255) NOT NULL,
  `expires` TIMESTAMP NOT NULL,
  CONSTRAINT `fk_session_user`
    FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `verificationToken` (
  `identifier` VARCHAR(255) NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `expires` TIMESTAMP NOT NULL,
  PRIMARY KEY (`identifier`, `token`)
);

CREATE INDEX `user_email_idx` ON `user`(`email`);
