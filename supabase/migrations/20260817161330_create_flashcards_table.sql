/*
# Create flashcards table (single-tenant, no auth)

1. New Tables
- `flashcards`
  - `id` (uuid, primary key)
  - `norwegian_word` (text, not null) - the Norwegian word being saved
  - `english_meaning` (text, not null) - the English translation
  - `forms` (jsonb) - grammatical forms (infinitive, present, past, perfect, plural)
  - `sentences` (jsonb) - array of {norwegian, english} example sentences
  - `nuances` (text) - cultural or usage notes
  - `created_at` (timestamptz, default now)
2. Security
- Enable RLS on `flashcards`.
- Allow anon + authenticated CRUD because the data is intentionally shared/public (no sign-in screen).
*/

CREATE TABLE IF NOT EXISTS flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  norwegian_word text NOT NULL,
  english_meaning text NOT NULL,
  forms jsonb NOT NULL DEFAULT '{}'::jsonb,
  sentences jsonb NOT NULL DEFAULT '[]'::jsonb,
  nuances text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_flashcards" ON flashcards;
CREATE POLICY "anon_select_flashcards"
ON flashcards FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_flashcards" ON flashcards;
CREATE POLICY "anon_insert_flashcards"
ON flashcards FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_flashcards" ON flashcards;
CREATE POLICY "anon_update_flashcards"
ON flashcards FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_flashcards" ON flashcards;
CREATE POLICY "anon_delete_flashcards"
ON flashcards FOR DELETE
TO anon, authenticated USING (true);