import "dotenv/config";
import { app } from "./app";
import { PrismaClient } from "@prisma/client";

import http from "http";
import { Server } from "socket.io";

const prisma = new PrismaClient();

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

io.on("connection", (socket) => {
  console.log("socket connected");

  // 채팅방 입장
  socket.on("joinRoom", (roomId) => {
    socket.join(`room:${roomId}`);
  });

  // 채팅방 퇴장
  socket.on("leaveRoom", (roomId) => {
    socket.leave(`room:${roomId}`);
  });

  // 메시지 전송
  socket.on("sendMessage", async (data) => {
    console.log("message:", data);

    // 🔥 DB 저장
    const savedMessage = await prisma.chat_messages.create({
      data: {
        room_id: data.roomId,
        content: data.content,
        type: data.type,
        sender_id: 1, // 나중에 JWT 로그인 유저로 변경
        senderName: "테스트",
      },
    });

    // 🔥 같은 방 사용자들에게 전송
    io.to(`room:${data.roomId}`).emit("receiveMessage", savedMessage);
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
