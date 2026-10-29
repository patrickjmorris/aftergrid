-- Read-only extract behind the analysis. Run with psql against the Spot Sports database:
--   PGOPTIONS='-c default_transaction_read_only=on -c timezone=UTC' psql "$SPOTSPORTS_DATABASE_URL" -f extract.sql
-- Ids are hashed. No titles, descriptions, or viewer data. Extracted 2026-10-27 for this case study.
\copy (select left(md5(v.id), 12) as video_key, left(md5(v.channel_id), 12) as channel_key, coalesce(s.name, 'Unassigned') as sport, v.is_yt_short, v.duration_seconds, v.published_at, v.created_at as ingested_at, v.last_stats_check, v.view_count, v.prev_view_count, v.prev_view_count_at from videos v left join sports s on s.id = v.sport_id where v.availability_status = 'available' and v.published_at >= '2025-07-01' and v.published_at < '2026-10-27') to 'videos.csv' csv header
