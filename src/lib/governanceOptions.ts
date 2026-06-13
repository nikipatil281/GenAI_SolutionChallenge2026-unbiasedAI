export const REVIEWER_OPTIONS = [
  'Dedicated Domain Expert',
  'Frontline Worker (time constrained)',
  'Fully Automated (no human in loop)',
];

export const OVERRIDE_OPTIONS = [
  'Yes, easily with no penalty',
  'Yes, but requires heavy written justification',
  'No',
];

export const EVIDENCE_OPTIONS = [
  'Full contextual file + model score',
  'Only the model score and top 3 factors',
  'No insight into model reasoning',
];

export const SPEED_OPTIONS = [
  'Seconds (High risk of automation bias)',
  'Minutes',
  'Hours or Days',
];

export type GovernanceAnswers = {
  reviewerId: string;
  canOverride: string;
  evidenceShown: string;
  speedOfDecision: string;
};

export const EMPTY_GOVERNANCE_ANSWERS: GovernanceAnswers = {
  reviewerId: '',
  canOverride: '',
  evidenceShown: '',
  speedOfDecision: '',
};

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export function getRandomGovernanceAnswers(): GovernanceAnswers {
  return {
    reviewerId: pickRandom(REVIEWER_OPTIONS),
    canOverride: pickRandom(OVERRIDE_OPTIONS),
    evidenceShown: pickRandom(EVIDENCE_OPTIONS),
    speedOfDecision: pickRandom(SPEED_OPTIONS),
  };
}
