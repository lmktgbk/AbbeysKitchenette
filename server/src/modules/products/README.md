# Product mutation boundaries

## Sellability and catalog status

Catalog cards, availability filters, pagination counts and summary KPIs share a
live SQL eligibility policy: product and subcategory enabled, at least one enabled
non-manually-deactivated variant with a recipe, no archived recipe ingredients,
and enough non-expired remaining stock for one unit. POS/public menu and detail
checks use the matching recipe/stock helper. Archived products remain excluded.

Statuses are Available, Some variants unavailable, Out of stock, Deactivated and
Setup needed. A mixed product belongs to Available when at least one variant can
be ordered. Fully unsellable products belong to Unavailable, regardless of whether
the cause is a manual setting, stock, or incomplete recipes. Product-level flags
are not overwritten by these read-time calculations. The legacy API filter value
`active` now means sellable; the UI labels it Available. Filtered empty states offer
Clear filters, not Add your first product. No migration/reseed is required.

The service coordinates validation, locked mutations, and audit intent. The
repository supplies product/recipe writes and batch history/stock queries.
`mutateProduct` locks the parent before variants in stable order; callbacks must
use its transaction. Avoid issuing external provider calls while these locks are held.

Variant replacement validates identity against the locked product snapshot.
History-bearing variants are deactivated rather than deleted, and their sizes
cannot be renamed. Replacement does not rewrite paid orders' saved consumption.
Variant lookup uses one in-memory map; history and stock enrichment remain batched.

Activation uses recipe stock eligibility and queues revision-based availability
repair with audit intent. Manual deactivation remains a separate policy that
background repair must respect. An empty recipe behaves differently in whole-product
and single-variant activation; this cleanup retains the existing policies.

Image replacement compares the previous URL in the guarded database write.
Audit failure rolls back the replacement. After a successful commit, old-image
cleanup is scheduled through the existing storage lifecycle; failed or interrupted
provider deletion must not remove the new image or a referenced asset.

Delete/deactivate, create/update, and single/bulk variant paths have different
history and availability rules. Keep those differences explicit instead of
introducing generic CRUD services.
