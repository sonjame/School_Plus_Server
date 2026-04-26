import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'
import db from '../db/mysql'
import { requireAuth } from '../middlewares/auth'
import { emailStore } from '../utils/emailStore'
import { env } from '../config/env'

const router = Router()

/* ─────────────────────────────────────────
   POST /auth/login
───────────────────────────────────────── */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string }

    if (!username || !password) {
      return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요.' })
    }

    const [rows]: any = await db.query('SELECT * FROM users WHERE username = ?', [username.trim()])
    if (!rows || rows.length === 0) {
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' })
    }

    const user = rows[0]

    if (!user.password) {
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' })
    }

    if (user.is_banned) {
      return res.status(403).json({ message: '계정이 정지되었습니다.', reason: user.banned_reason })
    }

    const accessToken = jwt.sign(
      { id: user.id, role: user.role, level: user.level, school_code: user.school_code },
      env.JWT_SECRET,
      { expiresIn: '1h' },
    )

    const refreshToken = jwt.sign({ id: user.id }, env.JWT_REFRESH_SECRET!, { expiresIn: '30d' })

    try {
      await db.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
        [user.id, refreshToken],
      )
    } catch { /* ignore */ }

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30 * 1000,
    })

    return res.json({
      ok: true,
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        school: user.school,
        grade: user.grade,
        level: user.level,
        eduCode: user.edu_code,
        schoolCode: user.school_code,
        classNum: user.class_num,
        profileImageUrl: user.profile_image_url,
      },
    })
  } catch (e) {
    console.error('login error:', e)
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
})

/* ─────────────────────────────────────────
   GET /auth/me
───────────────────────────────────────── */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const [rows]: any = await db.query(
      `SELECT id, username, name, email, school, school_code, edu_code, level, grade, class_num, profile_image_url
       FROM users WHERE id = ?`,
      [userId],
    )

    if (!rows || rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'user not found' })
    }

    const user = rows[0]

    if (user.is_banned) {
      return res.status(403).json({ message: '계정이 정지되었습니다.' })
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        school: user.school,
        grade: user.grade,
        level: user.level,
        eduCode: user.edu_code,
        schoolCode: user.school_code,
        classNum: user.class_num,
        profileImageUrl: user.profile_image_url,
      },
    })
  } catch (e) {
    return res.status(500).json({ ok: false, message: '서버 오류' })
  }
})

/* ─────────────────────────────────────────
   POST /auth/signup
───────────────────────────────────────── */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const {
      username, password, name, email,
      school, schoolCode, eduCode, level, grade, class_num,
      social_id, provider,
    } = req.body

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{6,}$/
    if (!password || !passwordRegex.test(password)) {
      return res.status(400).json({ message: '비밀번호 조건을 만족하지 않습니다.' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    if (provider !== 'email' && provider !== 'kakao' && provider !== 'google') {
      return res.status(400).json({ message: 'provider 값이 올바르지 않습니다.' })
    }

    if (provider !== 'email' && !social_id) {
      return res.status(400).json({ message: 'social_id가 필요합니다.' })
    }

    const finalSocialId = provider === 'email' ? null : social_id

    // 영구정지 계정 재가입 차단
    let banCheckParams: any[]
    let banCheckQuery: string
    if (provider === 'email') {
      if (!email) return res.status(400).json({ message: '이메일 정보가 없습니다.' })
      banCheckQuery = `SELECT ban_type FROM deleted_users WHERE provider='email' AND email=? LIMIT 1`
      banCheckParams = [email]
    } else {
      banCheckQuery = `SELECT ban_type FROM deleted_users WHERE provider=? AND social_id=? LIMIT 1`
      banCheckParams = [provider, finalSocialId]
    }

    const [banRows]: any = await db.query(banCheckQuery, banCheckParams)
    if (banRows.length > 0 && banRows[0].ban_type === 'permanent') {
      return res.status(403).json({ message: '해당 계정은 영구 정지되어 회원가입이 불가능합니다.' })
    }

    // 30일 재가입 제한
    let deletedQuery: string
    let deletedParams: any[]
    if (provider === 'email') {
      deletedQuery = `SELECT rejoin_available_at, admin_override FROM deleted_users WHERE provider='email' AND email=? LIMIT 1`
      deletedParams = [email]
    } else {
      deletedQuery = `SELECT rejoin_available_at, admin_override FROM deleted_users WHERE provider=? AND social_id=? LIMIT 1`
      deletedParams = [provider, finalSocialId]
    }

    const [deletedRows]: any = await db.query(deletedQuery, deletedParams)
    if (deletedRows.length > 0) {
      const { rejoin_available_at, admin_override } = deletedRows[0]
      if (!admin_override) {
        if (new Date() < new Date(rejoin_available_at)) {
          return res.status(403).json({
            message: '탈퇴 후 30일 이내에는 재가입할 수 없습니다.',
            status: 'WAIT',
            rejoinAvailableAt: rejoin_available_at,
          })
        }

        // 관리자에게 알림
        const [admins]: any = await db.query(`SELECT id FROM users WHERE level = 'admin'`)
        for (const admin of admins) {
          await db.query(
            `INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, NOW())`,
            [admin.id, 'admin_rejoin_requested', '재가입 승인 요청', `${username} 님이 재가입 승인을 요청했습니다.`, '/admin/rejoin-requests'],
          )
        }

        return res.status(403).json({ message: '재가입을 위해 관리자 승인이 필요합니다.', status: 'NEED_ADMIN_APPROVAL' })
      }
    }

    await db.query(
      `INSERT INTO users (username, password, name, email, social_id, school, school_code, edu_code, level, grade, class_num, provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, hashedPassword, name, email, finalSocialId, school, schoolCode, eduCode, level, grade, class_num, provider],
    )

    // 재가입 성공 → 탈퇴 기록 삭제
    if (provider === 'email') {
      await db.query(`DELETE FROM deleted_users WHERE provider='email' AND email=?`, [email])
    } else {
      await db.query(`DELETE FROM deleted_users WHERE provider=? AND social_id=?`, [provider, finalSocialId])
    }

    return res.json({ ok: true })
  } catch (err: any) {
    console.error('signup error:', err)
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '이미 존재하는 계정 정보입니다.' })
    }
    return res.status(500).json({ message: '회원가입 중 오류가 발생했습니다.' })
  }
})

/* ─────────────────────────────────────────
   POST /auth/refresh
───────────────────────────────────────── */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken
    if (!refreshToken) {
      return res.status(401).json({ code: 'NO_REFRESH_TOKEN' })
    }

    const decoded: any = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET!)
    const userId = decoded.id

    const [rows]: any = await db.query(
      `SELECT * FROM refresh_tokens WHERE token=? AND revoked=false AND expires_at > NOW()`,
      [refreshToken],
    )
    if (rows.length === 0) {
      return res.status(401).json({ code: 'INVALID_REFRESH_TOKEN' })
    }

    await db.query(`UPDATE refresh_tokens SET revoked=true WHERE token=?`, [refreshToken])

    const newRefreshToken = jwt.sign({ id: userId }, env.JWT_REFRESH_SECRET!, { expiresIn: '30d' })
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
      [userId, newRefreshToken],
    )

    const [userRows]: any = await db.query(`SELECT school_code, level FROM users WHERE id=?`, [userId])
    const newAccessToken = jwt.sign(
      { id: userId, level: userRows[0].level, school_code: userRows[0].school_code },
      env.JWT_SECRET,
      { expiresIn: '1h' },
    )

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 60 * 60 * 24 * 30 * 1000,
    })

    return res.json({ accessToken: newAccessToken })
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ code: 'REFRESH_EXPIRED' })
    }
    return res.status(401).json({ code: 'REFRESH_FAILED' })
  }
})

/* ─────────────────────────────────────────
   GET /auth/check-id?username=xxx
───────────────────────────────────────── */
router.get('/check-id', async (req: Request, res: Response) => {
  const username = req.query.username as string
  if (!username) return res.json({ available: false })

  const [rows]: any = await db.query('SELECT id FROM users WHERE username = ?', [username])
  return res.json({ available: rows.length === 0 })
})

/* ─────────────────────────────────────────
   POST /auth/find-id
───────────────────────────────────────── */
router.post('/find-id', async (req: Request, res: Response) => {
  const { method, email } = req.body

  if (method === 'kakao') {
    return res.status(400).json({ message: '카카오 로그인 회원은 카카오 로그인을 이용해주세요.' })
  }

  const [rows]: any = await db.query('SELECT username FROM users WHERE email = ?', [email])
  if (rows.length === 0) {
    return res.status(404).json({ message: '해당 정보로 가입된 회원이 없습니다.' })
  }

  return res.json({ username: rows[0].username })
})

/* ─────────────────────────────────────────
   POST /auth/find-password
───────────────────────────────────────── */
router.post('/find-password', async (req: Request, res: Response) => {
  try {
    const { username, email } = req.body
    if (!username || !email) {
      return res.status(400).json({ message: '아이디와 이메일을 입력하세요.' })
    }

    const [rows]: any = await db.query(
      `SELECT id FROM users WHERE username=? AND email=? AND provider IN ('email','google')`,
      [username, email],
    )
    if (rows.length === 0) {
      return res.status(404).json({ message: '아이디 또는 이메일이 일치하지 않거나 비밀번호 재설정이 불가능한 계정입니다.' })
    }

    const tempPw = 'SC' + Math.floor(100000 + Math.random() * 900000)
    const hashed = await bcrypt.hash(tempPw, 10)
    await db.query(`UPDATE users SET password=? WHERE id=?`, [hashed, rows[0].id])

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER!, pass: process.env.EMAIL_PASS! },
    })
    await transporter.sendMail({
      from: `"SchoolPlus" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '[SchoolPlus] 임시 비밀번호 안내',
      html: `<div><h2>임시 비밀번호 발급</h2><p>임시 비밀번호: <b>${tempPw}</b></p><p>로그인 후 반드시 비밀번호를 변경해주세요.</p></div>`,
    })

    return res.json({ message: '임시 비밀번호를 이메일로 전송했습니다.' })
  } catch (err) {
    return res.status(500).json({ message: '서버 내부 오류가 발생했습니다.' })
  }
})

/* ─────────────────────────────────────────
   POST /auth/email/send
───────────────────────────────────────── */
router.post('/email/send', async (req: Request, res: Response) => {
  const { email } = req.body
  if (!email) return res.json({ success: false })

  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER!, pass: process.env.EMAIL_PASS! },
  })
  await transporter.sendMail({
    from: process.env.EMAIL_USER!,
    to: email,
    subject: '학교 커뮤니티 앱 이메일 인증코드',
    text: `인증코드: ${code}`,
  })

  emailStore.set(email, code)
  return res.json({ success: true })
})

/* ─────────────────────────────────────────
   POST /auth/email/verify
───────────────────────────────────────── */
router.post('/email/verify', async (req: Request, res: Response) => {
  const { email, code } = req.body
  const savedCode = emailStore.get(email)

  if (savedCode === code) {
    emailStore.delete(email)
    return res.json({ success: true, redirect: `/auth/signup?verified=1&email=${encodeURIComponent(email)}` })
  }

  return res.json({ success: false })
})

export default router
