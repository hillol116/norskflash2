const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { Rating, State } = require('ts-fsrs')
const { PGlite } = require('@electric-sql/pglite')

// Exercise the actual TS adapter with the project's compiler; no duplicate scheduler.
const filename = path.resolve('lib/fsrs.ts')
const adapter = new Module(filename, module)
adapter.filename = filename
adapter.paths = module.paths
adapter._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename)
const { newSchedulingFields, serializeCard, deserializeCard, scheduleReview,
  schedulerParameters, schedulerVersion } = adapter.exports
const migration = fs.readFileSync('supabase/migrations/20260914220000_add_fsrs_reviews.sql', 'utf8')
const profile = '00000000-0000-0000-0000-000000000001'
const otherProfile = '00000000-0000-0000-0000-000000000002'

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text UNIQUE NOT NULL);
    CREATE TABLE flashcards (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid REFERENCES profiles(id), user_id uuid,
      norwegian_word text NOT NULL, english_meaning text NOT NULL,
      forms jsonb NOT NULL DEFAULT '{}', sentences jsonb NOT NULL DEFAULT '[]',
      nuances text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO profiles VALUES ('${profile}', 'learner'), ('${otherProfile}', 'other');
    INSERT INTO flashcards(profile_id, norwegian_word, english_meaning) VALUES ('${profile}', 'hus', 'house');
    INSERT INTO flashcards(norwegian_word, english_meaning) VALUES ('legacy', 'unassigned');
    ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_owner ON flashcards TO anon, authenticated USING (profile_id = '${profile}') WITH CHECK (profile_id = '${profile}');
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON flashcards TO anon, authenticated;
  `)
  return db
}
async function review(db, card, grade = Rating.Good) {
  const next = scheduleReview(card, grade)
  return db.query('SELECT * FROM public.review_flashcard($1,$2,$3,$4,$5,$6,$7)', [
    card.id, card.profile_id, card.review_version, next.card, next.log, schedulerVersion, schedulerParameters,
  ])
}

test('new cards are immediately due; all four grades schedule and serialize correctly', () => {
  const now = new Date('2026-09-14T12:00:00Z')
  const card = newSchedulingFields(now)
  assert.equal(card.state, State.New)
  assert.equal(card.reps, 0)
  assert.equal(card.last_review, null)
  assert.equal(card.due, now.toISOString())
  assert.deepEqual(serializeCard(deserializeCard(card)), card)
  for (const grade of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    const result = scheduleReview(card, grade, now)
    assert.equal(result.card.reps, 1)
    assert.equal(result.log.rating, grade)
    assert.equal(result.card.last_review, now.toISOString())
    assert.ok(new Date(result.card.due) > now)
  }
  assert.equal(scheduleReview(card, Rating.Again, now).card.state, State.Learning)
  assert.equal(scheduleReview(card, Rating.Easy, now).card.state, State.Review)
  assert.equal(card.reps, 0, 'preview/review must not mutate input')
})

test('review cards lapse into relearning after Again', () => {
  const first = scheduleReview(newSchedulingFields(new Date('2026-01-01')), Rating.Easy, new Date('2026-01-01')).card
  const later = scheduleReview(first, Rating.Again, new Date(first.due)).card
  assert.equal(later.state, State.Relearning)
  assert.equal(later.lapses, 1)
  assert.equal(later.reps, 2)
})

test('migration preserves content and unassigned cards; atomic review rejects duplicates, early and cross-profile grades', async () => {
  const db = await fixture()
  try {
    const before = (await db.query('SELECT id, profile_id, user_id, norwegian_word, english_meaning, created_at FROM flashcards ORDER BY id')).rows
    await db.exec(migration)
    assert.deepEqual((await db.query('SELECT id, profile_id, user_id, norwegian_word, english_meaning, created_at FROM flashcards ORDER BY id')).rows, before)
    await db.exec("UPDATE flashcards SET due = now() - interval '1 second'")
    const card = (await db.query('SELECT * FROM flashcards WHERE profile_id = $1', [profile])).rows[0]
    assert.equal(card.state, State.New)
    assert.equal(card.reps, 0)
    await db.exec('SET ROLE anon')
    await review(db, card)
    const updated = (await db.query('SELECT * FROM flashcards WHERE id = $1', [card.id])).rows[0]
    assert.equal(updated.review_version, 1)
    assert.equal(updated.reps, 1)
    const history = (await db.query('SELECT * FROM flashcard_reviews')).rows
    assert.equal(history.length, 1)
    assert.equal(history[0].before_card.reps, 0)
    assert.equal(history[0].after_card.reps, 1)
    assert.equal(history[0].scheduler_version, schedulerVersion)
    await assert.rejects(review(db, card), /changed since loading/)
    await assert.rejects(review(db, updated), /not due yet/)
    await assert.rejects(review(db, { ...updated, profile_id: otherProfile }), /unavailable|denied/)
    assert.equal((await db.query('SELECT * FROM flashcards WHERE due <= now()')).rows.length, 0)
    await db.query('DELETE FROM flashcards WHERE id = $1', [card.id])
    assert.equal((await db.query('SELECT * FROM flashcard_reviews')).rows.length, 0)
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT * FROM flashcards')).rows.length, 1, 'unassigned legacy card remains')
  } finally { await db.close() }
})

test('failed history insert rolls back schedule; RLS-hidden cards cannot be reviewed', async () => {
  const db = await fixture()
  try {
    await db.exec(migration)
    await db.exec(`UPDATE flashcards SET due = now() - interval '1 second';
      INSERT INTO flashcards(profile_id, norwegian_word, english_meaning) VALUES ('${otherProfile}', 'bok', 'book');`)
    const card = (await db.query('SELECT * FROM flashcards WHERE profile_id = $1', [profile])).rows[0]
    const hidden = (await db.query('SELECT * FROM flashcards WHERE profile_id = $1', [otherProfile])).rows[0]
    await db.exec('REVOKE INSERT ON flashcard_reviews FROM anon; SET ROLE anon;')
    await assert.rejects(review(db, card), /permission denied/)
    assert.equal((await db.query('SELECT reps FROM flashcards WHERE id = $1', [card.id])).rows[0].reps, 0)
    await assert.rejects(review(db, hidden), /unavailable|denied/)
  } finally { await db.close() }
})

test('incompatible Auth schema aborts without deleting or assigning data', async () => {
  const db = await fixture()
  try {
    await db.exec("UPDATE flashcards SET user_id = '00000000-0000-0000-0000-000000000003'; ALTER TABLE flashcards ALTER COLUMN user_id SET NOT NULL;")
    await assert.rejects(db.exec(migration), /Auth-only/)
    await db.exec('ROLLBACK')
    assert.equal((await db.query('SELECT * FROM flashcards')).rows.length, 2)
    assert.equal((await db.query("SELECT * FROM information_schema.columns WHERE table_name = 'flashcards' AND column_name = 'due'")).rows.length, 0)
  } finally { await db.close() }
})
