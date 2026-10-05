import assert from "node:assert/strict";
import test from "node:test";
import { pooledR2, summarizeEvaluation } from "../client/src/features/forecasting/evaluation.js";

const week = (prediction, actual) => ({ w_pred: prediction, w_actual: actual,
  w_mae: Math.abs(prediction - actual), w_mse: (prediction - actual) ** 2 });

test("baseline retains correct zero-sales weeks and matches the Prophet sample", () => {
  const scores = [{ weeks: [week(0, 0), week(4, 2)], n_weeks: [week(0, 0), week(6, 2)], mae: 1 }];
  const result = summarizeEvaluation(scores, [], 2);
  assert.equal(result.mae, 1);
  assert.equal(result.naive.mae, 2);
  assert.equal(result.naive.observations, 2);
  assert.equal(result.unscored, 1);
});

test("partial legacy baseline compares only paired observations", () => {
  const result = summarizeEvaluation([
    { weeks: [week(4, 2)], n_weeks: [week(6, 2)] },
    { weeks: [week(100, 0)] },
  ], []);
  assert.equal(result.mae, 51);
  assert.equal(result.naive.productMae, 2);
  assert.equal(result.naive.observations, 1);
});

test("undefined pooled R2 stays unavailable instead of falling back to a daily score", () => {
  const result = summarizeEvaluation([{ weeks: [week(2, 0), week(2, 0)], r_squared: .8 }], []);
  assert.equal(result.r2, null);
});

test("pooled R2 is explicitly a cross-product statistic", () => {
  assert.ok(pooledR2([week(11, 10), week(11, 12), week(101, 100), week(101, 102)]) > .99);
  assert.equal(pooledR2([week(11, 10), week(11, 12)]), 0);
});

test("missing scores do not appear as a perfect forecast", () => {
  assert.deepEqual(summarizeEvaluation([], [{ mae: null }]), { unscored: 1 });
  assert.equal(summarizeEvaluation([], []), null);
});


test("direct variant weekly pairs use the same pooled calculation and matched baseline", () => {
  const variants = [{ variant_id: 1, weeks: [week(3, 2), week(4, 5)], n_weeks: [week(0, 2), week(2, 5)] },
    { variant_id: 2, weeks: [week(0, 0), week(1, 1)], n_weeks: [week(0, 0), week(0, 1)] }];
  const result = summarizeEvaluation(variants, []);
  assert.equal(result.count, 2);
  assert.equal(result.mae, .5);
  assert.equal(result.mse, .5);
  assert.equal(result.naive.observations, 4);
  assert.equal(result.naive.mae, 1.5);
});
