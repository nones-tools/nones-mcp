// Canonical aggregate: node --test scripts/release.test.mjs
import "./release/version.test.mjs";
import "./release/plan.test.mjs";
import "./release/git.test.mjs";
import "./release/publish.test.mjs";
import "./release/publish-idempotency.test.mjs";
import "./release/pack.test.mjs";
import "./release/ci/verify-artifact.test.mjs";
