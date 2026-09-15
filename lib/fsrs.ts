import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs'

// Pin both the package and parameters so stored history remains interpretable.
export const schedulerParameters = generatorParameters({
  request_retention: 0.9,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
})
export const schedulerVersion = 'ts-fsrs@5.4.2'
const scheduler = fsrs(schedulerParameters)

export type SchedulingFields = Omit<Card, 'due' | 'last_review'> & {
  due: string
  last_review: string | null
}

export function serializeCard(card: Card): SchedulingFields {
  return { ...card, due: card.due.toISOString(), last_review: card.last_review?.toISOString() ?? null }
}

export function deserializeCard(card: SchedulingFields): Card {
  return {
    due: new Date(card.due), stability: card.stability, difficulty: card.difficulty,
    elapsed_days: card.elapsed_days, scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps, reps: card.reps, lapses: card.lapses,
    state: card.state, last_review: card.last_review ? new Date(card.last_review) : undefined,
  }
}

export function newSchedulingFields(now = new Date()): SchedulingFields {
  return serializeCard(createEmptyCard(now))
}

export function scheduleReview(card: SchedulingFields, grade: Grade, now = new Date()) {
  const result = scheduler.next(deserializeCard(card), now, grade)
  return {
    card: serializeCard(result.card),
    log: { ...result.log, due: result.log.due.toISOString(), review: result.log.review.toISOString() },
  }
}
