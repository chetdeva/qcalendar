-- Submissions may also be a PDF, and files can be up to 5 MB (was: png/jpeg/webp up to 1.5 MB).
alter table dashboard.attachments drop constraint attachments_content_type_check;
alter table dashboard.attachments drop constraint attachments_bytes_check;
alter table dashboard.attachments add constraint attachments_content_type_check check (content_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf'));
alter table dashboard.attachments add constraint attachments_bytes_check check (octet_length(bytes) <= 5242880);
