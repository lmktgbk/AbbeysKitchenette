# Market basket analysis

Express routes authorize admins and proxy queued analysis to the private ML
service. FP-Growth operates on completed, non-removed variant purchases by stable
variant ID; labels are presentation only. Repeated quantities count as basket
presence. Historical purchase records are not filtered by current stock status.

Defaults: support 0.005, confidence 0.08, lift strictly above 1.1, at least ten
training baskets and five recent baskets. Mine the oldest 80% of trading days;
verify on the newest 20%. Stability retains half the support/confidence thresholds
and the same lift threshold plus the five-basket requirement. These are starting
business rules, not guarantees of statistical significance. Unstable combinations
remain visible with a warning; only verified stable candidates can be top bundles.

Each new rule stores exact supporting counts and both denominators in optional
evidence metadata. Legacy counts are unknown; rerun rather than reconstruct them
from rounded support. Rank stable candidates, recent count, training count,
confidence and lift. This score does not predict promotion profit.

Default bundle price is the sum of current variant prices. There is no assumed
15% discount or nearest-five adjustment. Purchase costs retain precision until
presentation; incomplete costs are unavailable, not zero. Ingredient margin omits
operating costs. Manual price adjustments request a business justification in the
bundle form. Existing saved bundle prices remain unchanged.

The evidence migration must be deployed before new analyses publish. Creating a
bundle and recording its association remain separate API operations under the
existing contract; association tracking uses legacy product-name pairs. Mining
identity itself uses variant IDs. Complete cross-request idempotency/variant-level
association tracking is a separate improvement, not a guarantee of this change.
