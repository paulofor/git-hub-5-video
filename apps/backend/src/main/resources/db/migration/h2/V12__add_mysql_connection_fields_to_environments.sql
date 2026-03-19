ALTER TABLE environments
    ADD COLUMN db_host VARCHAR(255);

ALTER TABLE environments
    ADD COLUMN db_port INTEGER;

ALTER TABLE environments
    ADD COLUMN db_name VARCHAR(128);

ALTER TABLE environments
    ADD COLUMN db_user VARCHAR(128);

ALTER TABLE environments
    ADD COLUMN db_password VARCHAR(255);
