-- Ensure responses text columns accept emojis and other 4-byte unicode characters
ALTER TABLE responses CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
