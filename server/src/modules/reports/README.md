# Daily reporting boundaries

`dailyReport.service.js` builds the previous Manila business day's report and
delivers it to active admins. It reuses analytics, shift, and order queries.
`fetchExportData` belongs to the analytics service and supplies both HTTP exports
and report PDFs; scheduled reporting must not import controllers.

Payload reads are parallel ordinary queries, not a shared transaction snapshot.
The same filters use the same arithmetic, but separate requests can see different
commits. Current export limits remain 50 variant/ingredient rows and 200 waste
rows; this cleanup does not silently expand or paginate exports.

PDF generation remains lazy. Attachment failures degrade to HTML mail, with the
attachment outcome included in audit. Rendering and SMTP remain outside database
transactions; only audit intent capture uses short transactions.

Scheduled callers check lease ownership before recipient delivery. Each attempt
is saved before SMTP, then its accepted/unconfirmed outcome is recorded. Provider
acceptance is not inbox delivery. Partial or uncertain sends require review;
replaying the entire report could email already accepted recipients twice.

The category service separately owns transactional category/product deactivation.
Settings writes lock their singleton before diffing and recording audit intent.
Reports read these features through their existing service/repository boundaries;
they do not become a generic orchestration layer for administrative mutations.
