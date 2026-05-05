import "dotenv/config";
import { app } from "./app";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

app.get("/api/users", async (_req, res) => {
  const users = await prisma.users.findMany({ take: 10 });
  res.json({ ok: true, users });
});

app.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    res.status(500).json({ ok: false, database: "error" });
  }
});

const port = Number(process.env.PORT || 4000);

app.listen(port, "0.0.0.0", () => {
  console.log(`API running on port ${port}`);
});
