-- Uploaded files can live in object storage (Cloudflare R2 or S3): the row then keeps only the object's key.
-- Older rows keep their bytes in the database.
alter table dashboard.attachments add column storage_key text;
alter table dashboard.attachments alter column bytes drop not null;
alter table dashboard.attachments add constraint attachments_has_content check (bytes is not null or storage_key is not null);
