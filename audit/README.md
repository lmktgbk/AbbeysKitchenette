# SmartCafe audit evidence

Use [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md) for the consolidated
manual acceptance pass after remediation. Record all final results there;
automated regression checks should still run after each implementation batch.

Audit of branch `code-revision`, commit `530c4cf064f080ef304c8ba66814d9ecd1f7d8ec`.
No live database writes or external messages are authorized by these scripts.

Read [REPORT.md](REPORT.md) for the comprehensive findings, architecture map,
evidence limits, action plan and deployment checklist. [endpoint-matrix.md](endpoint-matrix.md)
contains the 135 module route registrations. [findings.json](findings.json) is
the structured finding list.

The added tests are characterization tests: a passing assertion can confirm
unsafe current behavior. They must be changed to assert the desired behavior
when the corresponding application fix is implemented.

The HTTP suite uses actual routing/middleware with fake controllers and services.
The Python suite uses fake database operations and performs no model fitting.
The fixture preview uses synthetic data and is stopped at audit completion.
Dependency lookups send only public package names and versions.

Full PostgreSQL integrations, production infrastructure, load and backup/recovery
checks are explicitly Not verified. No application fixes were made by this audit.

Subsequent changes are tracked in [AUTHENTICATION_FIXES.md](AUTHENTICATION_FIXES.md).
Order permission/state changes are tracked in [ORDER_STATE_FIXES.md](ORDER_STATE_FIXES.md).
Request replay/payment/shift changes are tracked in [FINANCIAL_TRANSACTION_FIXES.md](FINANCIAL_TRANSACTION_FIXES.md).
Original consumption, stock settlement and refund changes are tracked in [INVENTORY_TRANSACTION_FIXES.md](INVENTORY_TRANSACTION_FIXES.md).
Transactional price approval changes are tracked in [PRICE_APPROVAL_FIXES.md](PRICE_APPROVAL_FIXES.md).
The baseline auth defect tests have been converted into regressions; remaining
business defect characterizations are still explicitly unsafe-behavior tests.

ML service authentication and bounded requests are tracked in [ML_SERVICE_SECURITY_FIXES.md](ML_SERVICE_SECURITY_FIXES.md).
