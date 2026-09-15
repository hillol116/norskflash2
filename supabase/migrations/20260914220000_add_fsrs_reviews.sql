-- Apply ONLY this migration to the existing profile-based deployment.
-- Do not replay 20260817165440: it deletes rows with NULL user_id.
BEGIN;

-- The repository has no profiles DDL. Require the deployed profile design;
-- do not invent an auth.users -> profiles mapping or weaken existing RLS.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL OR to_regclass('public.flashcards') IS NULL THEN
    RAISE EXCEPTION 'Profile schema missing. Run docs/supabase-preflight.sql and reconcile the live schema before applying FSRS.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id' AND udt_name = 'uuid')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flashcards' AND column_name = 'profile_id' AND udt_name = 'uuid') THEN
    RAISE EXCEPTION 'Expected profiles(id uuid, username) and flashcards.profile_id uuid. No ownership changes made.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flashcards' AND column_name = 'user_id' AND is_nullable = 'NO') THEN
    RAISE EXCEPTION 'Auth-only user_id NOT NULL conflicts with username profiles. Inspect preflight output; ownership and policies must be reconciled explicitly. No data changed.';
  END IF;
END $$;

-- Additive defaults initialize existing cards as New, due now. Content, IDs,
-- timestamps, profile_id, user_id and existing policies are left untouched.
ALTER TABLE public.flashcards
  ADD COLUMN due timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN stability double precision NOT NULL DEFAULT 0 CHECK (stability >= 0 AND stability < 'Infinity'::float8),
  ADD COLUMN difficulty double precision NOT NULL DEFAULT 0 CHECK (difficulty >= 0 AND difficulty <= 10),
  ADD COLUMN elapsed_days integer NOT NULL DEFAULT 0 CHECK (elapsed_days >= 0),
  ADD COLUMN scheduled_days integer NOT NULL DEFAULT 0 CHECK (scheduled_days >= 0),
  ADD COLUMN learning_steps integer NOT NULL DEFAULT 0 CHECK (learning_steps >= 0),
  ADD COLUMN reps integer NOT NULL DEFAULT 0 CHECK (reps >= 0),
  ADD COLUMN lapses integer NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  ADD COLUMN state smallint NOT NULL DEFAULT 0 CHECK (state BETWEEN 0 AND 3),
  ADD COLUMN last_review timestamptz,
  ADD COLUMN review_version integer NOT NULL DEFAULT 0 CHECK (review_version >= 0);

CREATE INDEX flashcards_profile_due_idx ON public.flashcards(profile_id, due, id);

CREATE TABLE public.flashcard_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  review_version integer NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 4),
  reviewed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  before_card jsonb NOT NULL,
  after_card jsonb NOT NULL,
  review_log jsonb NOT NULL,
  scheduler_version text NOT NULL,
  scheduler_parameters jsonb NOT NULL,
  UNIQUE (card_id, review_version)
);
CREATE INDEX flashcard_reviews_profile_time_idx ON public.flashcard_reviews(profile_id, reviewed_at);
ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;
-- These subqueries respect the existing flashcards RLS, including auth ownership.
-- A username/profile ID alone is not authentication. Do not add public card policies.
CREATE POLICY read_visible_card_reviews ON public.flashcard_reviews FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.flashcards f WHERE f.id = card_id AND f.profile_id = flashcard_reviews.profile_id));
CREATE POLICY insert_visible_card_reviews ON public.flashcard_reviews FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.flashcards f WHERE f.id = card_id AND f.profile_id = flashcard_reviews.profile_id));
GRANT SELECT, INSERT ON public.flashcard_reviews TO anon, authenticated;

-- Invoker rights: a caller must already be permitted to read AND update the card.
-- Schedule update and history insert commit together or both roll back.
CREATE FUNCTION public.review_flashcard(
  p_card_id uuid, p_profile_id uuid, p_expected_version integer,
  p_schedule jsonb, p_log jsonb, p_scheduler_version text, p_parameters jsonb
) RETURNS public.flashcards
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  old_card public.flashcards;
  updated_card public.flashcards;
  new_card public.flashcards;
  review_time timestamptz;
  grade integer;
BEGIN
  SELECT * INTO old_card FROM public.flashcards
    WHERE id = p_card_id AND profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card unavailable or access denied'; END IF;
  IF p_expected_version IS NULL OR old_card.review_version <> p_expected_version THEN
    RAISE EXCEPTION 'Card changed since loading. Refresh due cards before retrying.';
  END IF;
  IF old_card.due > now() THEN RAISE EXCEPTION 'Card is not due yet'; END IF;
  IF p_schedule IS NULL OR p_log IS NULL OR p_parameters IS NULL OR p_scheduler_version IS NULL
    OR NOT (p_schedule ?& ARRAY['due','stability','difficulty','elapsed_days','scheduled_days','learning_steps','reps','lapses','state','last_review'])
    OR NOT (p_log ?& ARRAY['rating','review','state','due']) THEN
    RAISE EXCEPTION 'Incomplete review payload';
  END IF;
  new_card := jsonb_populate_record(NULL::public.flashcards, p_schedule);
  review_time := (p_log->>'review')::timestamptz;
  grade := (p_log->>'rating')::integer;
  IF grade IS NULL OR grade NOT BETWEEN 1 AND 4 OR review_time IS NULL
    OR review_time > now() + interval '5 minutes'
    OR review_time < old_card.due
    OR (old_card.last_review IS NOT NULL AND review_time < old_card.last_review)
    OR new_card.last_review IS DISTINCT FROM review_time
    OR new_card.reps IS DISTINCT FROM old_card.reps + 1
    OR new_card.lapses IS NULL OR new_card.lapses < old_card.lapses OR new_card.lapses > old_card.lapses + 1
    OR new_card.due IS NULL OR new_card.due <= review_time
    OR new_card.state IS NULL OR new_card.state NOT BETWEEN 1 AND 3
    OR (p_log->>'state')::integer IS DISTINCT FROM old_card.state THEN
    RAISE EXCEPTION 'Invalid review transition';
  END IF;
  UPDATE public.flashcards SET
    due = new_card.due, stability = new_card.stability, difficulty = new_card.difficulty,
    elapsed_days = new_card.elapsed_days, scheduled_days = new_card.scheduled_days,
    learning_steps = new_card.learning_steps, reps = new_card.reps, lapses = new_card.lapses,
    state = new_card.state, last_review = new_card.last_review,
    review_version = review_version + 1
    WHERE id = p_card_id AND profile_id = p_profile_id AND review_version = p_expected_version
    RETURNING * INTO updated_card;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review update denied or card changed'; END IF;
  INSERT INTO public.flashcard_reviews (
    card_id, profile_id, review_version, rating, reviewed_at,
    before_card, after_card, review_log, scheduler_version, scheduler_parameters
  ) VALUES (
    p_card_id, p_profile_id, updated_card.review_version, grade, review_time,
    to_jsonb(old_card), to_jsonb(updated_card), p_log, p_scheduler_version, p_parameters
  );
  RETURN updated_card;
END $$;
REVOKE ALL ON FUNCTION public.review_flashcard(uuid, uuid, integer, jsonb, jsonb, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_flashcard(uuid, uuid, integer, jsonb, jsonb, text, jsonb) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
