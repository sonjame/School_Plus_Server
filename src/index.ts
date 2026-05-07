import "dotenv/config";
import { app } from "./app";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import http from "http";
import { Server } from "socket.io";

const prisma = new PrismaClient();

type SocketUser = {
  id: number;
  name: string;
};

/* =========================
   기본 API
========================= */

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

/* =========================
   Socket.io
========================= */

// 🔥 기존 app 대신 http server 생성
const server = http.createServer(app);

// 🔥 socket 서버 생성
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", async (socket) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      socket.disconnect();
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: number;
    };

    const user = await prisma.users.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
      },
    });

    if (!user) {
      socket.disconnect();
      return;
    }

    socket.data.user = user;

    console.log("socket connected:", user.name);
  } catch (error) {
    socket.disconnect();
    return;
  }

  socket.on("joinRoom", (roomId) => {
    socket.join(`room:${roomId}`);
  });

  socket.on("leaveRoom", (roomId) => {
    socket.leave(`room:${roomId}`);
  });

  socket.on("sendMessage", async (data) => {
    const user = socket.data.user as SocketUser;

    const savedMessage = await prisma.chat_messages.create({
      data: {
        room_id: data.roomId,
        content: data.content,
        type: data.type,
        sender_id: user.id,
      },
    });

    io.to(`room:${data.roomId}`).emit("receiveMessage", {
      id: String(savedMessage.id),
      roomId: Number(savedMessage.room_id),
      senderId: Number(savedMessage.sender_id),
      senderName: user.name,
      content: savedMessage.content ?? "",
      createdAt:
        savedMessage.created_at?.toISOString() ?? new Date().toISOString(),
      type: savedMessage.type,
    });
  });

  socket.on("refreshRoom", (roomId) => {
    io.to(`room:${roomId}`).emit("receiveMessage", {
      roomId: Number(roomId),
      type: "refresh",
    });
  });

  socket.on("readRoom", (roomId) => {
    const user = socket.data.user as SocketUser;

    io.to(`room:${roomId}`).emit("roomRead", {
      roomId: Number(roomId),
      userId: user.id,
    });
  });
});

/* =========================
   서버 실행
========================= */

const port = Number(process.env.PORT || 4000);

// ❌ 기존 app.listen 제거
// app.listen(...)

// ✅ server.listen 사용
server.listen(port, "0.0.0.0", () => {
  console.log(`API running on port ${port}`);
});
