import prisma from "../../config/prisma.js";

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
