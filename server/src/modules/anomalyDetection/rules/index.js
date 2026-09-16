import { revenueAnomaly } from "./revenueAnomaly.js";
import { lossSpike } from "./lossSpike.js";
import { cancellationSpike } from "./cancellationSpike.js";
import { fulfillmentOutlier } from "./fulfillmentOutlier.js";

export const RULE_REGISTRY = [
  revenueAnomaly,
  lossSpike,
  cancellationSpike,
  fulfillmentOutlier,
];
