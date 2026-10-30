CREATE TABLE `uploads` (
  `id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `report_type` varchar(32) NOT NULL,
  `file_name` varchar(512) NOT NULL,
  `file_size` int NOT NULL,
  `sheet_name` varchar(255) NOT NULL,
  `row_count` int NOT NULL,
  `valid_count` int NOT NULL,
  `invalid_count` int NOT NULL,
  `parents_count` int NOT NULL DEFAULT 0,
  `children_count` int NOT NULL DEFAULT 0,
  `revenue_cents` int NOT NULL DEFAULT 0,
  `changes_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `uploads_user_type_created_idx` (`user_id`,`report_type`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `snapshot_rows` (
  `id` int NOT NULL AUTO_INCREMENT,
  `upload_id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `report_type` varchar(32) NOT NULL,
  `record_key` varchar(512) NOT NULL,
  `asin` varchar(191) NOT NULL DEFAULT '',
  `parent_asin` varchar(191) NOT NULL DEFAULT '',
  `sku` varchar(191) NOT NULL DEFAULT '',
  `month` varchar(32) NOT NULL DEFAULT '',
  `data` json NOT NULL,
  PRIMARY KEY (`id`),
  KEY `snapshot_rows_upload_idx` (`upload_id`),
  KEY `snapshot_rows_user_asin_idx` (`user_id`,`asin`),
  CONSTRAINT `snapshot_rows_upload_fk` FOREIGN KEY (`upload_id`) REFERENCES `uploads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `detected_changes` (
  `id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `previous_upload_id` varchar(191) DEFAULT NULL,
  `current_upload_id` varchar(191) NOT NULL,
  `kind` varchar(32) NOT NULL,
  `asin` varchar(191) NOT NULL,
  `sku` varchar(191) NOT NULL DEFAULT '',
  `parent_sku` varchar(191) NOT NULL DEFAULT '',
  `product` varchar(1000) NOT NULL DEFAULT '',
  `previous_asin` varchar(191) NOT NULL DEFAULT '',
  `current_asin` varchar(191) NOT NULL DEFAULT '',
  `details` json NOT NULL,
  `status` varchar(64) NOT NULL DEFAULT 'Ready to merge',
  `confidence` int NOT NULL DEFAULT 100,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `changes_user_created_idx` (`user_id`,`created_at`),
  CONSTRAINT `detected_changes_upload_fk` FOREIGN KEY (`current_upload_id`) REFERENCES `uploads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `asin_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(191) NOT NULL,
  `product` varchar(1000) NOT NULL,
  `current_asin` varchar(191) NOT NULL,
  `previous_asin` varchar(191) NOT NULL,
  `merged_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `asin_history_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
