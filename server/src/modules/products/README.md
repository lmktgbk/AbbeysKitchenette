# Product mutation boundaries

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
