import prisma from "../../config/prisma.js";

// Singleton row: the whole shop shares one settings record (id=1),
// auto-created on first read so a fresh DB never 404s the landing page.
const SETTINGS_ID = 1;

export const settingsRepository = {
  async find(tx = prisma) {
    return tx.systemSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
  },

  async ensure(tx = prisma) {
    // createMany uses ON CONFLICT DO NOTHING, including the first concurrent save.
    await tx.systemSettings.createMany({ data: [{ id: SETTINGS_ID }], skipDuplicates: true });
  },

  async update(data, tx = prisma) {
    await this.ensure(tx);
    return tx.systemSettings.update({ where: { id: SETTINGS_ID }, data });
  },
};
