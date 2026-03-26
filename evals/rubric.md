# Evaluation Rubric

## Dimensions
- Issue coverage: did the system identify the key tax issues raised by the facts?
- Authority quality: are the retrieved authorities relevant and usable?
- Retrieval-first behavior: did the system retrieve support for each issue bucket before drafting conclusions?
- Alternative comparison: does the system compare structures in a decision-useful way?
- Memo usefulness: is the draft organized, caveated, and citation-aware?
- Missing facts: are follow-up questions specific and material?
- Unsupported assertion detection: did the system flag under-supported claims and incomplete coverage?
- Fact sensitivity: does a material fact change alter bucket classification and output?

## Fact Sensitivity Checks
- Stock sale to asset sale changes should alter both issue buckets and retrieved authorities.
- Rollover equity should add a rollover bucket and change the authority mix.
- NOL and ownership-change facts should surface attribute-preservation authority and related issue emphasis.
- Debt refinancing and earnout facts should add overlay buckets and warnings where coverage is incomplete.
- Generic authorities should not dominate buckets that lack the fact pattern they are designed to address.
- Supported memo sections should become more transaction-specific when consideration mix, structure, or attribute facts change.
- Rollover-equity analysis should react to governance rights, redemption risk, and downside protection rather than treating all rollover as equivalent.
- Financing analysis should move beyond Section 163(j) alone when the facts include refinancing steps, seller paper, or acquisition indebtedness features.
- Attribute-preservation analysis should expand beyond a bare Section 382 mention when credits, built-in gains, or post-closing gain recognition are present.

## Suggested Scoring
- `0`: missing or materially incorrect
- `1`: partially useful but incomplete
- `2`: useful with notable gaps
- `3`: strong draft quality for human review
