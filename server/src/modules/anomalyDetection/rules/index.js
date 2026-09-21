import { revenueAnomaly } from "./revenueAnomaly.js";
import { lossSpike } from "./lossSpike.js";
import { cancellationSpike } from "./cancellationSpike.js";
import { fulfillmentOutlier } from "./fulfillmentOutlier.js";
import { refundSpike } from "./refundSpike.js";
import { discountSpike } from "./discountSpike.js";
import { shiftVarianceSpike } from "./shiftVarianceSpike.js";
import { restockSpendSpike } from "./restockSpendSpike.js";
import { stockoutSpike } from "./stockoutSpike.js";
import { supplierPriceJump } from "./supplierPriceJump.js";
import { epaymentShift } from "./epaymentShift.js";
import { deadHours } from "./deadHours.js";

export const RULE_REGISTRY = [
  revenueAnomaly,
  lossSpike,
  cancellationSpike,
  fulfillmentOutlier,
  refundSpike,
  discountSpike,
  shiftVarianceSpike,
  restockSpendSpike,
  stockoutSpike,
  supplierPriceJump,
  epaymentShift,
  deadHours,
];
