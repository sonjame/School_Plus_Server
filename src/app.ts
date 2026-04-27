import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import apiRouter from "./routes";
import notFound from "./middlewares/notFound";
import errorHandler from "./middlewares/errorHandler";
import { prisma } from "./db/prisma";

export const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (data: any) => {
    const safe = JSON.parse(
      JSON.stringify(data, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
    return originalJson(safe);
  };

  next();
});

app.use("/", apiRouter);

app.get("/api/users", async (_req, res) => {
  const users = await prisma.users.findMany({ take: 10 });
  res.json({ ok: true, users });
});

app.use(notFound);
app.use(errorHandler);
