CREATE TABLE `change_audit` (
  `id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `actor` varchar(191) NOT NULL,
  `action` varchar(64) NOT NULL,
  `entity_type` varchar(64) NOT NULL,
  `entity_id` varchar(191) NOT NULL,
  `summary` varchar(1000) NOT NULL,
  `details` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `change_audit_user_created_idx` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
