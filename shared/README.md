# Shared browser/server contracts

This folder contains small, environment-independent code used by both applications.
It must not import database clients, credentials, Node-only APIs, or React state.

`canonicalJson.js` is used by browser order submission and backend idempotency.
It serializes object properties in stable sorted order, recursively, while keeping
array order. Equivalent object insertion order therefore cannot change a request
fingerprint. Browser and server each hash their own submission payload; sharing
serialization does not make frontend hashes trusted authorization evidence.

Example: `{a: 1, b: 2}` and `{b: 2, a: 1}` serialize identically. `[1, 2]` and
`[2, 1]` remain different. The function accepts JSON-compatible input and retains
normal JSON serialization behavior; it is not a general-purpose object serializer.

Deploy/build from the repository root or include this folder in the build context,
because both applications import it. Avoid copying it into each application:
independent copies could drift and break retry identity rules.
