-- Read-only companion to extract.sql: public channel titles and video titles, keyed by the same hashed ids.
--   PGOPTIONS='-c default_transaction_read_only=on -c timezone=UTC' psql "$SPOTSPORTS_DATABASE_URL" -f titles.sql
-- Channel titles are approved for publication. Video titles are used only to tag editorial format and are not published.
-- No descriptions or viewer data. Extracted 2026-10-28 for this case study.
\copy (select left(md5(v.id), 12) as video_key, left(md5(v.channel_id), 12) as channel_key, coalesce(c.title, v.channel_title) as channel_title, v.title as video_title from videos v left join channels c on c.id = v.channel_id where v.availability_status = 'available' and v.published_at >= '2025-07-01' and v.published_at < '2026-10-27') to 'titles.csv' csv header
