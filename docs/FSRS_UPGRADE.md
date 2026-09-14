# FSRS upgrade

Branch: `feature/fsrs-spaced-repetition`. Inspected base: `7e5b68e`.

## Repository architecture

- Next.js 14 App Router, React 18, TypeScript and Tailwind; no separate backend server.
- `app/page.tsx` owns dictionary input, streamed partial JSON, saving and card browsing.
- `app/api/lookup/route.ts` streams dictionary JSON from Gemini. It uses a browser-provided key when present, otherwise the server `GEMINI_API_KEY`. Its model and generation behavior are unchanged.
- `components/ProfileProvider.tsx` selects/creates `profiles` by username, then reads/writes Supabase directly using the anonymous client in `lib/supabase.ts`. There is no sign-in UI or auth-user/profile mapping in this repository.
- `lib/profiles.ts` is an older localStorage implementation. Its stored cards are preserved. The active provider now reads its Gemini key as a fallback, but does not automatically upload or reassign local cards.
- `lib/supabaseClient.ts` was an unused duplicate client with a conflicting Auth-only card type. It now re-exports the shared client/type.
- Header provides profile selection and API-key settings. The settings component existed but was unreachable and referred to missing context members.
- Static assets and manifest provide icons/PWA metadata. Both Vercel-oriented Next.js configuration and `netlify.toml` exist. There are no repository CI workflows, authentication routes, or profiles migrations.

## Ownership discrepancy: what is and is not known

Current executable code uses `profiles.id` and `flashcards.profile_id`; the old migrations use `auth.users.id` and `flashcards.user_id`. Those identifiers are not interchangeable. The checked-in SQL cannot explain the currently deployed profile schema. Live Supabase metadata was not available during the initial implementation. Subsequent read-only REST checks confirmed that `profiles.id`, `profiles.username`, and `flashcards.profile_id` exist, while `flashcards.user_id` does not exist in the deployed table. After the user ran the new migration successfully, all scheduling columns and the review-history table were confirmed accessible through REST. No existing card contents were read or changed by these checks. Full constraint/RLS introspection and a live review transaction have not been verified.

The app now consistently types, queries, inserts, deletes and reviews by **profile_id**. Existing `user_id` values and constraints remain unchanged. The new migration requires the deployed profile columns and refuses the incompatible `user_id NOT NULL` configuration. It never maps users to profiles, assigns orphan cards, drops existing ownership policies, or deletes old rows.

The REST checks confirm that the live database uses the profile columns expected by the app; the Auth-only `user_id` migration is historical and does not describe the deployed flashcards table. If the guard fails or current RLS rejects anonymous profile writes, the live schema/policy output is needed before a safe ownership repair can be finalized. Do not remove the guard, make all cards public, or drop the user constraint just to make deployment pass.

Username selection is not authentication. Profile filters separate the UI's decks, while existing Supabase RLS determines actual access. This upgrade preserves that access model; it does not make username profiles private accounts.

## Supabase deployment

Current status: the user has successfully applied the new migration, and REST checks confirm the new columns and history table. Do not run it again. Continue at step 6 after uploading the feature branch. Steps 1–5 below remain as a record of the migration process.

1. Export/back up the existing database before a production schema update. Prefer applying and trying this branch against a separate Supabase test project copied from the live schema first.
2. Run `docs/supabase-preflight.sql` in the Supabase SQL Editor. It is read-only and returns columns, foreign keys, RLS policies, grants, and card counts without card text or API keys. Confirm that `profiles(id uuid, username)` and `flashcards.profile_id uuid` exist, and inspect existing ownership policies.
3. If it matches the current profile app, run **only** `supabase/migrations/20260914220000_add_fsrs_reviews.sql` in the SQL Editor, once, as a complete script. The transaction rolls back on any error. Do not replay all repository migrations: `20260817165440_flashcards_add_user_id.sql` contains `DELETE FROM flashcards WHERE user_id IS NULL` and is incompatible with the current profile workflow.
4. The new migration adds `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `learning_steps`, `reps`, `lapses`, `state`, `last_review`, and `review_version`. Existing cards receive New/default scheduling and become due immediately. Their content, IDs, creation timestamps and ownership are preserved. Cards with no profile remain unassigned and preserved.
5. It adds `flashcard_reviews`, a profile/due index, and the `review_flashcard` RPC. History records the old/new card, grade, review log, package version and scheduling parameters. The RPC uses invoker permissions and a row lock/version check. Saving history and updating scheduling are atomic.
6. Deploy the branch to a Vercel preview with the intended Supabase environment. Keep `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and optional server `GEMINI_API_KEY`. Use Node 22 or newer (the existing Supabase dependency requires it). No new secrets are needed.
7. Select an existing profile; check card count and content in All Cards; look up and save one word; show its answer in Review; grade it; verify it leaves the due queue and one history row appears. Reload and switch profiles to check persistence. Test deleting an expendable card. Then merge/deploy when satisfied.

The migration is additive and compatible with the old profile app, so reverting the application branch does not require dropping scheduling columns or history. Do not run a destructive down migration. The script intentionally errors if already applied rather than silently accepting a partially different schema.

## Review behavior

- `ts-fsrs` is pinned to stable **5.4.2**, not the 6.x beta. Target retention is 90%; fuzz is disabled; learning steps are 1 and 10 minutes and relearning is 10 minutes. Full parameters accompany each history entry.
- Saved cards use `createEmptyCard`, due immediately. Dates cross the database boundary as ISO timestamps and are hydrated for FSRS calculation.
- Review queries only `due <= now`, for the active profile, ordered by due time and ID. Batches contain up to 100 cards and refill after grading. The queue refreshes every 30 seconds while visible and on window focus, so learning cards return when due.
- Meaning, forms, examples and nuances are hidden until Show answer. Again / Hard / Good / Easy call FSRS's `next`; browser navigation does not grade cards.
- All Cards retains previous/next, flip and deletion. Cards are fetched in pages to retain access to decks above Supabase's default row limit.
- A stale review version, early review, denied write, or history failure does not advance a card. The UI reports errors rather than reporting an unsaved action as successful. After an ambiguous network failure, refresh: committed reviews disappear from the due queue, and duplicate submissions are rejected.
- Explicitly deleting a card also deletes its dependent review history (`ON DELETE CASCADE`); no history is deleted by migration or grading.
- Browser API keys remain browser-local, scoped to profile ID. The previous username-based key is a fallback. Removing the new key suppresses the fallback without changing the old local profile/card storage.
- No AI-generated exercises or new Gemini requests were added.

## Checks

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Tests exercise the real FSRS adapter and the actual SQL in PGlite/PostgreSQL: all grades, New/Learning/Review/Relearning, timestamp round-trip, preserving legacy cards, transactional rollback, version conflicts, future-card rejection, RLS, and incompatible-schema rollback. These are isolated fixtures, not a live Supabase verification.

Build TypeScript checking is enabled again. The repository's existing ESLint build skip is unchanged. Browser smoke verification was attempted but could not run: Chromium was absent and its download timed out. Live UI and service integration still need the preview check above. TypeScript, the production build and all five automated regression tests passed locally.

## Changed files

| File | Change |
| --- | --- |
| `.gitignore` | Ignore TS build cache and environment secrets |
| `app/page.tsx` | Dictionary/Review/All Cards, awaited saves, browser load/error states |
| `components/Header.tsx` | Reachable API-key settings and profile error feedback |
| `components/ProfileProvider.tsx` | Shared typed profile persistence, due queries and atomic review calls |
| `components/Review.tsx` | Answer reveal and four-grade review queue |
| `components/SettingsModal.tsx` | Consistent Gemini key context and storage error feedback |
| `lib/fsrs.ts` | FSRS parameters, initialization, serialization and scheduling |
| `lib/supabaseClient.ts` | Shared client/type compatibility export |
| `lib/types.ts` | Unified profile/FSRS card and dictionary types |
| `next.config.js` | Stop ignoring TypeScript errors |
| `package.json`, `package-lock.json` | Pinned stable FSRS, test dependency and check scripts |
| `supabase/migrations/20260914220000_add_fsrs_reviews.sql` | Guarded additive migration, history and transactional RPC |
| `docs/supabase-preflight.sql` | Read-only live schema inspection |
| `tests/fsrs.test.cjs` | Scheduler and PostgreSQL regression tests |
| `docs/FSRS_UPGRADE.md` | Architecture, ownership findings and migration instructions |
