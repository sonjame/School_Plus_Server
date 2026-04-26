import { prisma } from "../db/prisma";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { env } from "../config/env";

function getS3KeyFromUrl(url: string): string | null {
    try {
        const parsed = new URL(url);
        return decodeURIComponent(parsed.pathname.slice(1));
    } catch {
        return null;
    }
}

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

export const getRooms = async (userId: number) => {
    const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      r.id,
      r.name,
      r.is_group AS isGroup,
      r.is_self AS isSelf, 
      (
        SELECT m.content
        FROM chat_messages m
        WHERE m.room_id = r.id
        ORDER BY m.id DESC
        LIMIT 1
      ) AS lastMessage,
      (
        SELECT COUNT(*)
        FROM chat_messages m
        WHERE m.room_id = r.id
          AND m.sender_id != ?
          AND m.id > COALESCE(rm.last_read_message_id, 0)
          AND m.sender_id NOT IN (
            SELECT blocked_id
            FROM blocks
            WHERE user_id = ?
          )
      ) AS unreadCount
    FROM chat_rooms r
    JOIN chat_room_members rm ON rm.room_id = r.id
    WHERE rm.user_id = ?
    ORDER BY r.is_self DESC, r.id DESC
  `, userId, userId, userId);
    return rows.map((r) => ({ ...r, unreadCount: Number(r.unreadCount) || 0 }));
};

export const createRoom = async (creatorId: number, isGroup: boolean, name: string, userIds: number[]) => {
    const memberIds = Array.from(new Set<number>([creatorId, ...(userIds || [])].filter(id => id && !isNaN(id))));
    const isSelfChat = !isGroup && memberIds.length === 1 && memberIds[0] === creatorId;

    if (isSelfChat) {
        const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT id FROM chat_rooms WHERE is_self = 1 AND created_by = ? LIMIT 1
    `, creatorId);
        if (rows.length > 0) return { roomId: Number(rows[0].id) };
    }

    if (!isGroup && memberIds.length === 2) {
        const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT r.id FROM chat_rooms r
      JOIN chat_room_members m ON r.id = m.room_id
      WHERE r.is_group = 0 AND m.user_id IN (?, ?)
      GROUP BY r.id HAVING COUNT(DISTINCT m.user_id) = 2 LIMIT 1
    `, memberIds[0], memberIds[1]);
        // 이미 존재하는 방은 오류 대신 해당 방 ID를 반환
        if (rows.length > 0) return { roomId: Number(rows[0].id) };

        // 양방향 차단 체크
        const otherUserId = memberIds[0] === creatorId ? memberIds[1] : memberIds[0];
        try {
            const blocked: any[] = await prisma.$queryRawUnsafe(`
                SELECT 1 FROM blocks
                WHERE (user_id = ? AND blocked_id = ?)
                   OR (user_id = ? AND blocked_id = ?)
                LIMIT 1
            `, creatorId, otherUserId, otherUserId, creatorId);
            if (blocked.length > 0) return { error: 'BLOCKED', status: 403 };
        } catch {
            // blocks 테이블 없으면 차단 체크 스킵
        }
    }

    const roomName = isSelfChat ? '나와의 채팅' : name;
    const isSelfValue = isSelfChat ? 1 : 0;

    await prisma.$executeRawUnsafe(`
    INSERT INTO chat_rooms (is_group, is_self, name, created_by)
    VALUES (?, ?, ?, ?)
  `, isGroup ? 1 : 0, isSelfValue, roomName, creatorId);

    const roomRes: any[] = await prisma.$queryRawUnsafe(`SELECT LAST_INSERT_ID() as id`);
    const roomId = Number(roomRes[0].id);

    for (const uid of memberIds) {
        try {
            await prisma.$executeRawUnsafe(`
          INSERT INTO chat_room_members (room_id, user_id) VALUES (?, ?)
        `, roomId, uid);
        } catch (e: any) {
            // 이미 존재하는 멤버(중복 PK) 는 무시, 그 외 에러는 로그만
            if (e?.code !== 'P2010' && !String(e?.message).includes('Duplicate')) {
                console.error(`[MEMBER INSERT ERROR] roomId=${roomId} uid=${uid}`, e?.message);
            }
        }
    }
    return { roomId };
};

export const renameRoom = async (userId: number, roomId: number, name: string) => {
    await prisma.$executeRawUnsafe(`
    UPDATE chat_rooms SET name = ? WHERE id = ?
  `, name, roomId);
    return { success: true };
};

export const deleteRoom = async (userId: number, roomId: number) => {
    const room: any[] = await prisma.$queryRawUnsafe(`SELECT created_by FROM chat_rooms WHERE id = ?`, roomId);
    if (!room.length) return { error: 'NOT_FOUND', status: 404 };

    const countRow: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS memberCount FROM chat_room_members WHERE room_id = ?`, roomId);
    const memberCount = Number(countRow[0]?.memberCount || 0);

    const isOwner = Number(room[0].created_by) === Number(userId);
    const isLastMember = memberCount <= 1;

    if (!isOwner && !isLastMember) return { error: 'FORBIDDEN', status: 403 };

    await prisma.$executeRawUnsafe(`DELETE FROM chat_rooms WHERE id = ?`, roomId);
    return { success: true };
};

export const leaveRoom = async (userId: number, roomId: number) => {
    await prisma.$executeRawUnsafe(`DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?`, roomId, userId);
    return { success: true };
};

export const getRoomUsers = async (userId: number, roomId: number) => {
    const rows = await prisma.$queryRawUnsafe(`
    SELECT
      u.id, u.name, u.username,
      u.profile_image_url AS profileImageUrl,
      CASE
        WHEN u.grade IS NOT NULL AND u.class_num IS NOT NULL
        THEN CONCAT(u.grade, u.class_num, '반')
        ELSE NULL
      END AS gradeLabel,
      CASE WHEN u.id = cr.created_by THEN 1 ELSE 0 END AS isOwner
    FROM chat_room_members crm
    JOIN users u ON u.id = crm.user_id
    JOIN chat_rooms cr ON cr.id = crm.room_id
    WHERE crm.room_id = ?
    ORDER BY isOwner DESC, u.name ASC
  `, roomId);
    return rows;
};

export const getMessages = async (userId: number, roomId: number) => {
    const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      m.id, m.room_id AS roomId, m.sender_id AS senderId, u.name AS senderName,
      m.type, m.content, m.file_url AS fileUrl, m.file_name AS fileName,
      m.poll_data AS pollData, m.created_at AS createdAt,
      (
        SELECT JSON_ARRAYAGG(JSON_OBJECT('optionId', v.option_id, 'count', v.cnt, 'voters', v.voters))
        FROM (
          SELECT pv.option_id, COUNT(*) AS cnt, JSON_ARRAYAGG(JSON_OBJECT('id', u.id, 'name', u.name)) AS voters
          FROM chat_polls_votes pv JOIN users u ON u.id = pv.user_id
          WHERE pv.message_id = m.id GROUP BY pv.option_id
        ) v
      ) AS pollResults,
      (
        SELECT option_id FROM chat_polls_votes WHERE message_id = m.id AND user_id = ? LIMIT 1
      ) AS myVote,
      (
        SELECT COUNT(*) FROM chat_room_members rm
        WHERE rm.room_id = m.room_id AND rm.user_id != m.sender_id
          AND (rm.last_read_message_id IS NULL OR rm.last_read_message_id < m.id)
      ) AS readCount
    FROM chat_messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN blocks b ON b.user_id = ? AND b.blocked_id = m.sender_id
    WHERE m.room_id = ? AND b.id IS NULL
    ORDER BY m.id ASC
  `, userId, userId, roomId);

    return rows.map((m) => ({
        ...m,
        readCount: Number(m.readCount) || 0,
        pollData: typeof m.pollData === 'string' ? JSON.parse(m.pollData) : (m.pollData ?? undefined),
        pollResult: typeof m.pollResults === 'string' ? JSON.parse(m.pollResults) : (m.pollResults ?? []),
    }));
};

export const sendMessage = async (userId: number, roomId: number, type: string, content: string, fileUrl?: string, fileName?: string, pollData?: any) => {
    // 학교 코드 검사
    const me: any[] = await prisma.$queryRawUnsafe(`SELECT school_code FROM users WHERE id = ?`, userId);
    if (!me.length) return { error: 'USER_NOT_FOUND', status: 404 };

    const other: any[] = await prisma.$queryRawUnsafe(`
        SELECT u.school_code FROM chat_room_members rm
        JOIN users u ON rm.user_id = u.id
        WHERE rm.room_id = ? AND rm.user_id != ? LIMIT 1
    `, roomId, userId);
    if (other.length > 0 && other[0].school_code !== me[0].school_code) {
        return { error: 'SCHOOL_MISMATCH', status: 403 };
    }

    // 정지 검사
    const ban: any[] = await prisma.$queryRawUnsafe(`SELECT is_banned, ban_until FROM users WHERE id = ?`, userId);
    if (ban.length) {
        if (ban[0].is_banned) return { error: 'CHAT_BANNED_PERMANENT', status: 403 };
        if (ban[0].ban_until && new Date(ban[0].ban_until) > new Date()) return { error: 'CHAT_BANNED', banUntil: ban[0].ban_until, status: 403 };
    }

    // 1:1 차단 검사
    const members: any[] = await prisma.$queryRawUnsafe(`SELECT user_id FROM chat_room_members WHERE room_id = ?`, roomId);
    if (members.length === 2) {
        const otherUserId = Number(members[0].user_id) === Number(userId) ? members[1].user_id : members[0].user_id;
        const blocked: any[] = await prisma.$queryRawUnsafe(`SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ? LIMIT 1`, otherUserId, userId);
        if (blocked.length > 0) return { error: 'BLOCKED', status: 403 };
    }

    await prisma.$executeRawUnsafe(`
    INSERT INTO chat_messages (room_id, sender_id, type, content, file_url, file_name, poll_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, roomId, userId, type, content ?? null, fileUrl || null, fileName || null, pollData ? JSON.stringify(pollData) : null);
    return { success: true };
};

export const sendBulkMessages = async (userId: number, roomId: number, images: { fileUrl: string, fileName: string }[]) => {
    // 멤버 확인
    const member: any[] = await prisma.$queryRawUnsafe(`SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ? LIMIT 1`, roomId, userId);
    if (!member.length) return { error: 'FORBIDDEN', status: 403 };

    // 학교 코드 검사
    const me: any[] = await prisma.$queryRawUnsafe(`SELECT school_code FROM users WHERE id = ?`, userId);
    if (!me.length) return { error: 'USER_NOT_FOUND', status: 404 };

    const other: any[] = await prisma.$queryRawUnsafe(`
        SELECT u.school_code FROM chat_room_members rm
        JOIN users u ON rm.user_id = u.id
        WHERE rm.room_id = ? AND rm.user_id != ? LIMIT 1
    `, roomId, userId);
    if (other.length > 0 && other[0].school_code !== me[0].school_code) {
        return { error: 'SCHOOL_MISMATCH', status: 403 };
    }

    // 정지 검사
    const ban: any[] = await prisma.$queryRawUnsafe(`SELECT is_banned, ban_until FROM users WHERE id = ?`, userId);
    if (ban.length) {
        if (ban[0].is_banned) return { error: 'CHAT_BANNED_PERMANENT', status: 403 };
        if (ban[0].ban_until && new Date(ban[0].ban_until) > new Date()) return { error: 'CHAT_BANNED', banUntil: ban[0].ban_until, status: 403 };
    }

    // 1:1 차단 검사
    const members: any[] = await prisma.$queryRawUnsafe(`SELECT user_id FROM chat_room_members WHERE room_id = ?`, roomId);
    if (members.length === 2) {
        const otherUserId = Number(members[0].user_id) === Number(userId) ? members[1].user_id : members[0].user_id;
        const blocked: any[] = await prisma.$queryRawUnsafe(`SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ? LIMIT 1`, otherUserId, userId);
        if (blocked.length > 0) return { error: 'BLOCKED', status: 403 };
    }

    for (const img of images) {
        await prisma.$executeRawUnsafe(`
      INSERT INTO chat_messages (room_id, sender_id, type, file_url, file_name)
      VALUES (?, ?, 'image', ?, ?)
    `, roomId, userId, img.fileUrl, img.fileName);
    }
    return { success: true };
};

export const markAsRead = async (userId: number, roomId: number) => {
    const lastMsg: any[] = await prisma.$queryRawUnsafe(`
    SELECT MAX(id) as maxId FROM chat_messages WHERE room_id = ?
  `, roomId);
    const maxId = lastMsg[0]?.maxId;
    if (maxId) {
        await prisma.$executeRawUnsafe(`
      UPDATE chat_room_members SET last_read_message_id = ?, last_read_at = NOW()
      WHERE room_id = ? AND user_id = ?
    `, Number(maxId), roomId, userId);
    }
};

export const deleteMessage = async (userId: number, messageId: number) => {
    const msg: any[] = await prisma.$queryRawUnsafe(`
        SELECT id, sender_id, created_at, type, file_url FROM chat_messages WHERE id = ?
    `, messageId);

    if (!msg.length) return { error: 'NOT_FOUND', status: 404 };
    if (Number(msg[0].sender_id) !== Number(userId)) return { error: 'FORBIDDEN', status: 403 };

    const createdAt = new Date(msg[0].created_at).getTime();
    const diffHours = (Date.now() - createdAt) / (1000 * 60 * 60);

    if (diffHours <= 24) {
        // 24시간 이내: S3 파일 삭제 + DB 삭제
        if (msg[0].file_url && (msg[0].type === 'image' || msg[0].type === 'file')) {
            const key = getS3KeyFromUrl(msg[0].file_url);
            if (key) {
                try {
                    await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: key }));
                } catch (e) {
                    console.error('[S3 DELETE ERROR]', e);
                }
            }
        }
        await prisma.$executeRawUnsafe(`DELETE FROM chat_messages WHERE id = ?`, messageId);
        return { deleted: 'ALL' };
    }

    // 24시간 이후: 본인만 숨김
    await prisma.$executeRawUnsafe(`
        UPDATE chat_messages
        SET deleted_by = JSON_ARRAY_APPEND(COALESCE(deleted_by, JSON_ARRAY()), '$', ?)
        WHERE id = ?
    `, userId, messageId);
    return { deleted: 'ME' };
};

export const votePoll = async (userId: number, messageId: number, optionId: number) => {
    try {
        await prisma.$executeRawUnsafe(`
      INSERT INTO chat_polls_votes (message_id, user_id, option_id) VALUES (?, ?, ?)
    `, messageId, userId, optionId);
        return { success: true };
    } catch (e) {
        return { error: "Already voted", status: 400 };
    }
};

export const unvotePoll = async (userId: number, messageId: number) => {
    await prisma.$executeRawUnsafe(`
    DELETE FROM chat_polls_votes WHERE message_id = ? AND user_id = ?
  `, messageId, userId);
};

export const closePoll = async (userId: number, messageId: number) => {
    const msg: any[] = await prisma.$queryRawUnsafe(`SELECT poll_data FROM chat_messages WHERE id = ? AND sender_id = ?`, messageId, userId);
    if (msg.length > 0) {
        let pollData = typeof msg[0].poll_data === 'string' ? JSON.parse(msg[0].poll_data) : msg[0].poll_data;
        if (pollData) {
            pollData.closedAt = new Date().toISOString();
            await prisma.$executeRawUnsafe(`
        UPDATE chat_messages SET poll_data = ? WHERE id = ?
      `, JSON.stringify(pollData), messageId);
        }
    }
};

export const uploadChatFile = async (buffer: Buffer, mimetype: string, originalName: string) => {
    const ext = originalName.split('.').pop();
    const safeName = crypto.randomUUID();
    const key = `upload/chat/${Date.now()}-${safeName}.${ext}`;

    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: key,
            Body: buffer,
            ContentType: mimetype,
        })
    );

    return {
        url: `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`,
        name: originalName,
    };
};

// === NEW MISSING FEATURES === //

export const searchUsers = async (userId: number, schoolCode: string, keyword?: string, grade?: string, classNum?: string, onlyFriends?: boolean) => {
    let sql = `
        SELECT
            u.id,
            u.name,
            u.username,
            u.profile_image_url AS profileImageUrl,
            CONCAT(u.grade, ' ', u.class_num, '반') AS gradeLabel,
            CASE
                WHEN b.id IS NOT NULL THEN 1
                ELSE 0
            END AS isBlocked
        FROM users u
    `;
    const params = [];
    if (onlyFriends) {
        sql += `
            INNER JOIN friends f
            ON f.friend_id = u.id AND f.user_id = ?
        `;
        params.push(userId);
    }
    sql += `
        LEFT JOIN blocks b
        ON b.user_id = ? AND b.blocked_id = u.id
        WHERE u.school_code = ? AND u.level != 'admin' AND u.id != ?
    `;
    params.push(userId, schoolCode, userId);

    if (keyword) {
        sql += ` AND u.name LIKE ? `;
        params.push('%' + keyword + '%');
    }
    if (grade && classNum) {
        sql += ` AND u.grade = ? AND u.class_num = ? `;
        params.push(grade + '학년', classNum);
    }
    sql += ` ORDER BY u.name ASC `;

    return await prisma.$queryRawUnsafe(sql, ...params);
};

export const inviteUsers = async (userId: number, roomId: number, userIds: number[]) => {
    const room = await prisma.$queryRawUnsafe(`SELECT id, is_group FROM chat_rooms WHERE id = ?`, roomId);
    if (!room.length) return { error: 'ROOM_NOT_FOUND', status: 404 };

    const member = await prisma.$queryRawUnsafe(`SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ? LIMIT 1`, roomId, userId);
    if (!member.length) return { error: 'FORBIDDEN', status: 403 };

    if (!userIds || !userIds.length) return { error: 'NO_USERS', status: 400 };

    for (const uid of userIds) {
        if (uid === Number(userId)) continue;
        await prisma.$queryRawUnsafe(`INSERT IGNORE INTO chat_room_members (room_id, user_id) VALUES (?, ?)`, roomId, uid);
    }
    if (!room[0].is_group) {
        await prisma.$queryRawUnsafe(`UPDATE chat_rooms SET is_group = 1 WHERE id = ?`, roomId);
    }
    return { ok: true };
};

export const getUnreadCount = async (userId: number) => {
    const rows = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) AS unreadCount
        FROM chat_room_members crm
        JOIN (
            SELECT room_id, MAX(id) AS lastMessageId
            FROM chat_messages
            GROUP BY room_id
        ) m ON crm.room_id = m.room_id
        JOIN chat_messages cm ON cm.id = m.lastMessageId
        WHERE crm.user_id = ? AND cm.sender_id != ?
        AND (crm.last_read_message_id IS NULL OR m.lastMessageId > crm.last_read_message_id)
    `, userId, userId);
    return Number(rows[0]?.unreadCount || 0);
};

export const getUnreadSummary = async (userId: number) => {
    const messages = await prisma.$queryRawUnsafe(`
        SELECT
            cm.id AS messageId, cm.room_id AS roomId, cm.sender_id AS senderId,
            u.name AS senderName, cm.content, cm.created_at AS createdAt
        FROM chat_room_members crm
        JOIN chat_messages cm ON cm.room_id = crm.room_id AND cm.id > IFNULL(crm.last_read_message_id, 0) AND cm.sender_id != crm.user_id
        JOIN users u ON u.id = cm.sender_id
        WHERE crm.user_id = ?
        ORDER BY cm.created_at DESC LIMIT 10
    `, userId);

    const countRows = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) AS unreadCount
        FROM chat_room_members crm
        JOIN chat_messages cm ON cm.room_id = crm.room_id AND cm.id > IFNULL(crm.last_read_message_id, 0) AND cm.sender_id != crm.user_id
        WHERE crm.user_id = ?
    `, userId);

    return { unreadCount: Number(countRows[0]?.unreadCount || 0), messages };
};

export const sendAdminMessage = async (userId: number, roomId: number, type: string, content: string, fileUrl?: string, fileName?: string) => {
    await prisma.$queryRawUnsafe(`
        INSERT INTO chat_messages (room_id, sender_id, type, content, file_url, file_name)
        VALUES (?, ?, ?, ?, ?, ?)
    `, roomId, userId, type, content, fileUrl || null, fileName || null);
    return { ok: true };
};

export const createPoll = async (userId: number, roomId: number, title: string, options: string[], anonymous: boolean, closedAt?: string) => {
    if (!roomId || !title || !options || options.length < 2) return { error: 'BAD_REQUEST', status: 400 };

    const member = await prisma.$queryRawUnsafe(`SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ?`, roomId, userId);
    if (!member.length) return { error: 'FORBIDDEN', status: 403 };

    const me = await prisma.$queryRawUnsafe(`SELECT school_code FROM users WHERE id = ?`, userId);
    if (!me.length) return { error: 'USER_NOT_FOUND', status: 404 };

    const other = await prisma.$queryRawUnsafe(`
        SELECT u.school_code FROM chat_room_members rm
        JOIN users u ON rm.user_id = u.id
        WHERE rm.room_id = ? AND rm.user_id != ? LIMIT 1
    `, roomId, userId);

    if (other.length > 0 && other[0].school_code !== me[0].school_code) {
        return { error: 'SCHOOL_MISMATCH', status: 403 };
    }

    const members = await prisma.$queryRawUnsafe(`SELECT user_id FROM chat_room_members WHERE room_id = ?`, roomId);
    if (members.length === 2) {
        const otherUserId = Number(members[0].user_id) === Number(userId) ? members[1].user_id : members[0].user_id;
        const blocked = await prisma.$queryRawUnsafe(`SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ? LIMIT 1`, otherUserId, userId);
        if (blocked.length > 0) return { error: 'BLOCKED', status: 403 };
    }

    const ban = await prisma.$queryRawUnsafe(`SELECT is_banned, ban_until FROM users WHERE id = ?`, userId);
    if (ban.length) {
        if (ban[0].is_banned) return { error: 'CHAT_BANNED_PERMANENT', status: 403 };
        if (ban[0].ban_until && new Date(ban[0].ban_until) > new Date()) return { error: 'CHAT_BANNED', banUntil: ban[0].ban_until, status: 403 };
    }

    const pollData = {
        title,
        options: options.map((t, i) => ({ id: i + 1, text: t })),
        anonymous: Boolean(anonymous),
        closedAt: closedAt ? new Date(closedAt).toISOString() : null,
    };

    await prisma.$queryRawUnsafe(`
        INSERT INTO chat_messages (room_id, sender_id, type, poll_data)
        VALUES (?, ?, 'poll', ?)
    `, roomId, userId, JSON.stringify(pollData));

    return { ok: true };
};

export const sendNotice = async (userId: number, roomId: number, content: string) => {
    if (!roomId || !content?.trim()) return { error: 'BAD_REQUEST', status: 400 };

    const member: any[] = await prisma.$queryRawUnsafe(`SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ? LIMIT 1`, roomId, userId);
    if (!member.length) return { error: 'FORBIDDEN', status: 403 };

    const me: any[] = await prisma.$queryRawUnsafe(`SELECT school_code FROM users WHERE id = ?`, userId);
    if (!me.length) return { error: 'USER_NOT_FOUND', status: 404 };

    const other: any[] = await prisma.$queryRawUnsafe(`
        SELECT u.school_code FROM chat_room_members rm
        JOIN users u ON rm.user_id = u.id
        WHERE rm.room_id = ? AND rm.user_id != ? LIMIT 1
    `, roomId, userId);
    if (other.length > 0 && other[0].school_code !== me[0].school_code) {
        return { error: 'SCHOOL_MISMATCH', status: 403 };
    }

    await prisma.$executeRawUnsafe(`
        INSERT INTO chat_messages (room_id, sender_id, type, content)
        VALUES (?, ?, 'notice', ?)
    `, roomId, userId, content.trim());

    return { ok: true };
};

export const reportMessage = async (userId: number, roomId: number, messageId: number, reportedUserId: number, reason: string) => {
    if (Number(userId) === Number(reportedUserId)) return { error: 'CANNOT_REPORT_SELF', status: 400 };

    const dup = await prisma.$queryRawUnsafe(`SELECT id FROM chat_reports WHERE message_id = ? AND reporter_id = ? LIMIT 1`, messageId, userId);
    if (dup.length > 0) return { error: 'ALREADY_REPORTED', status: 409 };

    const msgRows = await prisma.$queryRawUnsafe(`SELECT id, room_id FROM chat_messages WHERE id = ? LIMIT 1`, messageId);
    if (!msgRows.length) return { error: 'MESSAGE_NOT_FOUND', status: 404 };
    if (Number(msgRows[0].room_id) !== Number(roomId)) return { error: 'BAD_REQUEST', status: 400 };

    const reportResult = await prisma.$queryRawUnsafe(`
        INSERT INTO chat_reports (room_id, message_id, reporter_id, reported_user_id, reason)
        VALUES (?, ?, ?, ?, ?)
    `, roomId, messageId, userId, reportedUserId, reason);

    const reportId = Number(reportResult[2] || 0);

    const roomRows = await prisma.$queryRawUnsafe(`SELECT name FROM chat_rooms WHERE id = ? LIMIT 1`, roomId);
    const roomName = roomRows.length ? roomRows[0].name : '알 수 없는 채팅방';

    const admins = await prisma.$queryRawUnsafe(`SELECT id FROM users WHERE level = 'admin'`);
    for (const admin of admins) {
        await prisma.$queryRawUnsafe(`
            INSERT INTO notifications (user_id, type, title, message, link)
            VALUES (?, ?, ?, ?, ?)
        `, admin.id, 'chat_report', '채팅 신고 발생', `채팅방 "${roomName}"에서 신고가 접수되었습니다.`, `/admin/chat-report/${reportId}`);
    }

    return { ok: true };
};
