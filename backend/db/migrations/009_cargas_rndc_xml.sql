-- Evidence of every upload attempt: the exact XML that was sent (or blocked), gzip-compressed,
-- so an invoice can be recovered from the database if the file is lost.
alter table cargas_rndc add column if not exists xml_gz bytea;
