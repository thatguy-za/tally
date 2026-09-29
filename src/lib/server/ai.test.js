import { describe, it, expect } from 'vitest';
import { extractAmounts, verifiedAgainstFacts } from './ai.js';

describe('extractAmounts', () => {
  it('reads currency amounts regardless of symbol position', () => {
    expect(extractAmounts('You spent €1,234.56 today.', 'EUR')).toEqual([1234.56]);
    expect(extractAmounts('You spent $1,234.56 today.', 'USD')).toEqual([1234.56]);
  });

  it('reads negative amounts and bare percentages', () => {
    expect(extractAmounts('down €50.00 and 97% elapsed', 'EUR')).toEqual([50, 97]);
  });

  it('returns nothing for prose with no figures', () => {
    expect(extractAmounts('Everything looks steady this month.', 'EUR')).toEqual([]);
  });
});

describe('verifiedAgainstFacts', () => {
  const facts =
    'Came in: €3,500.00\nSpent: €1,450.00\n\nBiggest categories this period:\n- Rent & housing: €1,100.00\n- Groceries: €250.00\n- Eating out: €100.00';

  it('passes a summary that only cites figures from the facts sheet', () => {
    const text = 'Rent took €1,100 of your €1,450 spend, with groceries at €250 and eating out at €100.';
    expect(verifiedAgainstFacts(text, facts, 'EUR')).toBe(true);
  });

  it('allows rounding for readability', () => {
    const roundedFacts = 'Groceries: €58.83 more than usual.';
    expect(verifiedAgainstFacts('Groceries ran €59 higher than usual.', roundedFacts, 'EUR')).toBe(true);
  });

  // real failure caught while evaluating Haiku: it computed earned - spent -
  // saved itself and mislabeled it as "after housing" — never given that figure
  it('catches a model-computed figure never present in the facts', () => {
    const text = "Rent took a big bite, leaving you €1,850 to work with after housing.";
    expect(verifiedAgainstFacts(text, facts, 'EUR')).toBe(false);
  });

  // real failure: it stated "you saved €2,030" (earned - spent, its own maths)
  // when the actual saved-category total for the period was never given (0)
  it('catches an invented "saved" figure that is really leftover cash the model computed', () => {
    const text = 'You saved €2,030 this month, which is great.';
    expect(verifiedAgainstFacts(text, facts, 'EUR')).toBe(false);
  });

  it('has nothing to check when the summary has no figures at all', () => {
    expect(verifiedAgainstFacts('Nothing much stood out this period.', facts, 'EUR')).toBe(true);
  });
});
