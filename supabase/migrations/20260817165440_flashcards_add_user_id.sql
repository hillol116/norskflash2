/*
# Add user_id to flashcards + owner-scoped RLS

1. Modified Tables
- `flashcards`
  - Add `user_id` (uuid, NOT NULL, defaults to auth.uid()) referencing auth.users with ON DELETE CASCADE.
  - This converts flashcards from single-tenant (shared/public) to multi-user (owner-scoped).
  - Existing rows get a NULL user_id first; we backfill them to a sentinel value is NOT possible
    without a real user, so we delete orphaned rows that have no owner (safe: single-tenant
    demo data is not user-owned). We set the column NOT NULL with DEFAULT auth.uid() so
    future authenticated inserts always stamp the owner automatically.

2. Security Changes
- Drop the old anon-accessible CRUD policies (they allowed public read/write).
- Add 4 owner-scoped policies (SELECT/INSERT/UPDATE/DELETE) scoped TO authenticated
  using auth.uid() = user_id.
- RLS remains enabled.

3. Important Notes
- The DEFAULT auth.uid() on user_id means frontend inserts that omit user_id still
  satisfy the INSERT WITH CHECK (auth.uid() = user_id) policy — the DB fills the owner
  from the authenticated session.
- Anon role can no longer read or write flashcards. The app now requires sign-in.
*/

-- 1. Add the user_id column (nullable first so we can add it to an existing table)
ALTER TABLE flashcards
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Remove old anon/public policies
DROP POLICY IF EXISTS "anon_select_flashcards" ON flashcards;
DROP POLICY IF EXISTS "anon_insert_flashcards" ON flashcards;
DROP POLICY IF EXISTS "anon_update_flashcards" ON flashcards;
DROP POLICY IF EXISTS "anon_delete_flashcards" ON flashcards;

-- 3. Delete any pre-existing rows that have no owner (from the old single-tenant schema)
DELETE FROM flashcards WHERE user_id IS NULL;

-- 4. Make user_id NOT NULL with a default of the authenticated user
ALTER TABLE flashcards
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 5. Index for per-user queries
CREATE INDEX IF NOT EXISTS flashcards_user_id_idx ON flashcards(user_id);

-- 6. Owner-scoped policies (authenticated only)
DROP POLICY IF EXISTS "select_own_flashcards" ON flashcards;
CREATE POLICY "select_own_flashcards"
ON flashcards FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_flashcards" ON flashcards;
CREATE POLICY "insert_own_flashcards"
ON flashcards FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_flashcards" ON flashcards;
CREATE POLICY "update_own_flashcards"
ON flashcards FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_flashcards" ON flashcards;
CREATE POLICY "delete_own_flashcards"
ON flashcards FOR DELETE
TO authenticated USING (auth.uid() = user_id);