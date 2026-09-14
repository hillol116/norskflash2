-- Read-only: run in the Supabase SQL Editor before the FSRS migration.
-- Contains schema, grants and counts only; no card text or API keys.
SELECT table_name, column_name, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('profiles', 'flashcards', 'flashcard_reviews')
ORDER BY table_name, ordinal_position;

SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('profiles', 'flashcards');

SELECT tablename, policyname, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('profiles', 'flashcards');

SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name IN ('profiles', 'flashcards')
AND grantee IN ('anon', 'authenticated');

SELECT c.relname, c.relrowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('profiles', 'flashcards');

SELECT count(*) AS total_cards,
  count(*) FILTER (WHERE to_jsonb(f)->>'profile_id' IS NOT NULL) AS profile_assigned,
  count(*) FILTER (WHERE to_jsonb(f)->>'user_id' IS NOT NULL) AS auth_assigned
FROM public.flashcards f;
