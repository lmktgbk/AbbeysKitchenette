import prisma from "../src/config/prisma.js";
import { env } from "../src/config/env.js";
import { sheetsRepository } from "../src/infrastructure/integrations/sheets/sheets.repository.js";
import { createSheetsTransport } from "../src/infrastructure/integrations/sheets/sheets.transport.js";

let lease;
try {
  lease = await sheetsRepository.maintenanceLease();
  // Refuse a populated workbook. This command never clears spreadsheet cells.
  const nextRow = await createSheetsTransport().initialize(env.SHEETS_ORDERS_ID, undefined, { requireEmpty: true });
  if (nextRow !== 2) throw new Error("SHEETS_RESET_REQUIRES_EMPTY_DATA");
  await sheetsRepository.resetEmptyDestination(env.SHEETS_ORDERS_ID, lease);
  console.log("Headers ready at row 1. Next new event starts at row 2; synced events will not replay.");
} catch (error) {
  console.error(error.code || error.message);
  process.exitCode = 1;
} finally {
  if (lease) await sheetsRepository.release(lease);
  await prisma.$disconnect();
}
