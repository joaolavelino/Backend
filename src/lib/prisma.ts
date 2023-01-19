import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient({
  //isso é para aparecer um log de todas as chamadas no terminal
  // log: ["query"],
});
