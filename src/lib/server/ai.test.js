import { describe, it, expect } from 'vitest';
import { extractAmounts, verifiedAgainstFacts, groundedInToolResults, pctVsUsual } from './ai.js';

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

describe('extractAmounts, figures written without a symbol', () => {
  it('reads a currency name or code after the number', () => {
    expect(extractAmounts('Rent came to 1850 euros.', 'EUR')).toEqual([1850]);
    expect(extractAmounts('Rent came to 1850 EUR.', 'EUR')).toEqual([1850]);
  });

  it('reads a bare figure that is money-shaped', () => {
    expect(extractAmounts('Rent came to 1,850 this month.', 'EUR')).toEqual([1850]);
    expect(extractAmounts('Rent came to 1850.50 this month.', 'EUR')).toEqual([1850.5]);
    expect(extractAmounts('You spent 1850 on rent.', 'EUR')).toEqual([1850]);
  });

  it('leaves small integers alone — they are not figures being claimed', () => {
    expect(extractAmounts('Across the 3 months before this, spending held steady.', 'EUR')).toEqual([]);
    expect(extractAmounts('It landed on the 1st.', 'EUR')).toEqual([]);
  });

  // the lookbehind has to exclude the separators, or a grouped figure yields a
  // phantom fragment that makes unrelated numbers look traceable
  it('does not read a fragment out of the middle of a grouped figure', () => {
    expect(extractAmounts('Came in: €3,247.00', 'EUR')).toEqual([3247]);
    expect(extractAmounts('Spent: €1,095.50', 'EUR')).toEqual([1095.5]);
  });
});

describe('verifiedAgainstFacts, rounding', () => {
  const facts = 'Came in: €3,247.00\nSpent: €1,095.50';

  // the prompt invites "rounding for readability"; a flat tolerance forbade it
  it('accepts a figure rounded to the hundred', () => {
    expect(verifiedAgainstFacts('Income was around €3,200.', facts, 'EUR')).toBe(true);
  });

  it('still rejects a number that is merely round, not rounded', () => {
    expect(verifiedAgainstFacts('Income was around €2,000.', facts, 'EUR')).toBe(false);
  });
});

describe('verifiedAgainstFacts, attribution', () => {
  const facts =
    'Spent: €1,095.50\n\nBiggest changes vs usual:\n- Groceries: €250.00\n- Eating out: €100.00';

  it('rejects the right figure quoted against the wrong category', () => {
    expect(verifiedAgainstFacts('Eating out hit €250.00 this month.', facts, 'EUR')).toBe(false);
  });

  it('accepts a category quoting its own figure', () => {
    expect(verifiedAgainstFacts('Groceries came to €250.00.', facts, 'EUR')).toBe(true);
  });

  // a period total is about the whole period, so naming one category alongside
  // it is not a misattribution
  it('accepts a period total in a sentence that names one category', () => {
    expect(verifiedAgainstFacts('Groceries aside, you spent €1,095.50.', facts, 'EUR')).toBe(true);
  });
});

describe('summaries Haiku actually produced', () => {
const septFacts = `Period: September 2026 — still in progress, 97% of it elapsed. Figures are "so far this month", and every "usual" figure has been scaled to the same share of a month so the comparison is fair.
Came in: €3,200.00
Spent: €2,045.98 (usual €1,752.06 — €293.92 more)
Saved: €400.00
Money moved into savings is excluded from the "Spent" figure. Do not describe it as spending.
"Usual" means this person's own typical month across the 3 months before this period (the middle value across those months, not a plain average, so one unusually big or quiet month doesn't skew it — but say "usual", never "median", to the reader).

Biggest changes vs usual (actuals so far this month, not projected to a full month):
- Eating out: €16.76 (usual €95.70 — €78.94 less) [a one-off this period, no streak behind it]
- Groceries: €310.96 (usual €353.81 — €42.85 less) [a one-off this period, no streak behind it]
- Rent & housing: €1,150.00 (usual €1,111.67 — €38.33 more) [an established trend, 4 months running including this one]
- Transport: €54.31 (usual €65.93 — €11.62 less) [a one-off this period, no streak behind it]
- Utilities: €100.27 (usual €91.21 — €9.06 more) [a one-off this period, no streak behind it]`;

const periodFacts = `Period: June 2026 to September 2026 (4 months with data). The final month is still in progress, so its figures are partial.
Came in: €12,800.00 in total, €3,200.00 in a typical month
Spent: €7,489.59 in total, €1,812.48 in a typical month
Saved: €1,600.00 in total, €400.00 in a typical month

Biggest categories this period (period totals, no "usual" to compare against):
- Rent & housing: €4,600.00
- Groceries: €1,255.08
- Utilities: €398.84
- Eating out: €325.46
- Transport: €292.32

Their all-time total ever put into savings passed €1,000.00 during this period (now €1,600.00 in total) — a genuine milestone, worth a mention if it fits naturally (don't force it).`;

const augFacts = `Period: August 2026.
Came in: €3,200.00 (usual €3,200.00 — €0.00 more)
Spent: €1,763.01 (usual €1,840.30 — €77.29 less)
Saved: €400.00 (usual €400.00 — €0.00 more)

Biggest changes vs usual:
- Groceries: €177.16 (usual €383.48 — €206.32 less) [a one-off this period, no streak behind it]
- Transport: €68.20 (usual €84.91 — €16.71 less) [a one-off this period, no streak behind it]
- Utilities: €90.72 (usual €103.93 — €13.21 less) [a one-off this period, no streak behind it]
- Eating out: €98.70 (usual €105.00 — €6.30 less) [a one-off this period, no streak behind it]

Their all-time total ever put into savings passed €1,000.00 during this period (now €1,200.00 in total) — a genuine milestone, worth a mention if it fits naturally (don't force it).`;

const cases = [
  [
    'September',
    septFacts,
    "You're running about €294 over usual this month, but that's almost entirely rent and housing creeping up — it's now €38 higher than your typical month and has been for four months running. The bright spot is eating out came in at just €16.76, nearly €79 under usual, and groceries hit €310.96 instead of your typical €353.81, so those two alone nearly cancel out the housing bump. Everything else is basically noise."
  ],
  [
    'June–September',
    periodFacts,
    "Rent and housing ran €4,600 over the four months, which is your biggest spend by far. Groceries came to €1,255, and everything else stayed pretty modest—eating out was only €325, transport €292. You've moved €1,600 into savings now, which crossed that first €1,000 milestone during this stretch, so that's real progress."
  ],
  [
    'August',
    augFacts,
    'Groceries came in at €177.16 this month, a one-off dip well below your usual €383.48. Transport, utilities, and eating out all ran a bit lighter too, which added up to you spending €77.29 less overall while keeping savings steady at €400 and hitting €1,200 total saved.'
  ]
];

  for (const [name, facts, text] of cases) {
    it(`accepts the ${name} summary`, () => {
      expect(verifiedAgainstFacts(text, facts, 'EUR')).toBe(true);
    });
  }

  // the attribution rule only fires where a sentence names exactly one
  // category; this one names only rent, so a figure belonging to eating out
  // quoted against it is caught
  it('rejects a figure quoted against the wrong category', () => {
    const tampered = cases[0][2].replace('€38 higher than your typical month', '€79 higher than your typical month');
    expect(verifiedAgainstFacts(tampered, septFacts, 'EUR')).toBe(false);
  });

  // known limit, worth pinning so nobody assumes more cover than there is:
  // with several categories in one sentence there is no single owner to hold
  // the figures to, so a swap between them goes unnoticed
  it('does not catch a swap inside a sentence naming several categories', () => {
    const tampered = cases[0][2].replace('eating out came in at just €16.76', 'eating out came in at just €310.96');
    expect(verifiedAgainstFacts(tampered, septFacts, 'EUR')).toBe(true);
  });
});

describe('groundedInToolResults', () => {
  // what category_totals / search_transactions actually hand back
  const results = [
    '{"categories":[{"id":3,"name":"Groceries","total":310.96},{"id":7,"name":"Eating out","total":16.76}]}',
    '{"month":"2026-09","spent":2045.98,"earned":3200}'
  ];

  it('accepts an answer whose figures all came from a tool', () => {
    expect(groundedInToolResults('Groceries came to €310.96 against €2,045.98 spent.', results, 'EUR')).toBe(true);
  });

  // the one thing tool-calling does not prevent
  it('rejects arithmetic the model did itself', () => {
    expect(groundedInToolResults('Groceries and eating out came to €327.72 together.', results, 'EUR')).toBe(false);
  });

  it('reads small whole figures out of raw JSON, which are not money-shaped', () => {
    expect(groundedInToolResults('That category holds 7 transactions worth €16.76.', ['{"count":7,"total":16.76}'], 'EUR')).toBe(true);
  });

  // a tool stores a shortfall as a signed negative (kept: -330, pctChange:
  // -45), but natural phrasing states the magnitude with a directional word
  // ("in the red by €330", "cut by 45%") rather than writing "-45%" literally
  it('accepts a magnitude stated with a directional word for a negative tool figure', () => {
    const toolResult = ['{"kept":-330,"biggestMovesVsUsual":[{"name":"Eating out","pctChange":-45}]}'];
    expect(groundedInToolResults("You're in the red by €330 this month, but eating out is down 45%.", toolResult, 'EUR')).toBe(true);
  });

  it('has nothing to check when the answer states no figures', () => {
    expect(groundedInToolResults('You have no budgets set up yet.', results, 'EUR')).toBe(true);
  });

  it('stays out of the way when no tool was called', () => {
    expect(groundedInToolResults('Rent was €1,150.', [], 'EUR')).toBe(true);
  });

  // period_summary now hands the chat tool a ready-made percentage (see
  // pctVsUsual below) precisely so a "how does this compare to usual"
  // question has a real number to quote instead of computing one itself
  it('accepts a percentage that came from period_summary\'s own vsUsualPct', () => {
    const toolResult = ['{"spent":2045.98,"usualBaseline":{"spent":1752.06},"vsUsualPct":{"spent":17}}'];
    expect(groundedInToolResults("You're spending about 17% more than usual this month.", toolResult, 'EUR')).toBe(true);
  });

  it('still rejects a percentage the model worked out itself', () => {
    const toolResult = ['{"spent":2045.98,"usualBaseline":{"spent":1752.06}}'];
    expect(groundedInToolResults("You're spending about 17% more than usual this month.", toolResult, 'EUR')).toBe(false);
  });
});

describe('pctVsUsual', () => {
  it('computes a signed whole-number percentage change', () => {
    expect(pctVsUsual(2045.98, 1752.06)).toBe(17);
    expect(pctVsUsual(1450, 1600)).toBe(-9);
  });

  it('returns null rather than divide by a usual too close to zero', () => {
    expect(pctVsUsual(50, 0)).toBeNull();
    expect(pctVsUsual(50, 0.2)).toBeNull();
  });

  it('returns null when there is no baseline at all', () => {
    expect(pctVsUsual(50, null)).toBeNull();
  });
});

