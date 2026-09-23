import prisma from "../../config/prisma.js";

// Singleton row: the whole shop shares one settings record (id=1),
// auto-created on first read so a fresh DB never 404s the landing page.
const SETTINGS_ID = 1;

export const settingsRepository = {
  async find() {
    return prisma.systemSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
  },

  async update(data) {
    return prisma.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...data },
    });
  },
};
