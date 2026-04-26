import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import db from '../db/mysql'
import { requireAuth } from '../middlewares/auth'
import { deleteS3Url } from '../utils/s3'

const router = Router()

/* POST /user/change-password */
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const { username, currentPw, newPw } = req.body
    if (!username || !currentPw || !newPw) {
      return res.status(400).json({ message: '요청 값이 올바르지 않습니다.' })
    }

    const [rows]: any = await db.query('SELECT password FROM users WHERE username=?', [username])
    if (!rows.length) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })

    const isMatch = await bcrypt.compare(currentPw, rows[0].password)
    if (!isMatch) return res.status(401).json({ message: '현재 비밀번호가 일치하지 않습니다.' })

    const hashedPw = await bcrypt.hash(newPw, 10)
    await db.query('UPDATE users SET password=? WHERE username=?', [hashedPw, username])
    return res.json({ message: '비밀번호 변경 완료' })
  } catch (e) {
    return res.status(500).json({ message: '서버 오류' })
  }
})

/* POST /user/change-school */
router.post('/change-school', async (req: Request, res: Response) => {
  try {
    const { username, school, eduCode, schoolCode } = req.body
    if (!username || !school || !eduCode || !schoolCode) {
      return res.status(400).json({ message: '요청 값이 올바르지 않습니다.' })
    }

    let level = 'middle'
    if (school.includes('고등학교')) level = '고등학교'
    else if (school.includes('중학교')) level = '중학교'
    else if (school.includes('초등학교')) level = '초등학교'

    await db.query(
      `UPDATE users SET school=?, edu_code=?, school_code=?, level=? WHERE username=?`,
      [school, eduCode, schoolCode, level, username],
    )
    return res.json({ message: '학교 변경 완료', school, eduCode, schoolCode, level })
  } catch (e) {
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
})

/* POST /user/change-class */
router.post('/change-class', async (req: Request, res: Response) => {
  try {
    const { username, grade, classNum } = req.body
    if (!username || !grade || !classNum) {
      return res.status(400).json({ message: '요청 값이 올바르지 않습니다.' })
    }
    await db.query('UPDATE users SET grade=?, class_num=? WHERE username=?', [grade, classNum, username])
    return res.json({ message: '학반 변경 완료' })
  } catch (e) {
    return res.status(500).json({ message: '서버 오류' })
  }
})

/* POST /user/change-profile-image */
router.post('/change-profile-image', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const { imageUrl } = req.body
    if (!imageUrl) return res.status(400).json({ message: 'imageUrl required' })

    await db.query('UPDATE users SET profile_image_url=? WHERE id=?', [imageUrl, userId])
    // 히스토리 기록
    await db.query(
      'INSERT INTO profile_image_history (user_id, image_url) VALUES (?,?) ON DUPLICATE KEY UPDATE image_url=VALUES(image_url)',
      [userId, imageUrl],
    )
    return res.json({ success: true, imageUrl })
  } catch (e) {
    return res.status(500).json({ message: '서버 오류' })
  }
})

/* DELETE /user/delete-profile-image */
router.delete('/delete-profile-image', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const [rows]: any = await db.query('SELECT profile_image_url FROM users WHERE id=?', [userId])
    const url = rows[0]?.profile_image_url
    if (url) await deleteS3Url(url)

    await db.query('UPDATE users SET profile_image_url=NULL WHERE id=?', [userId])
    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ message: '서버 오류' })
  }
})

/* GET /user/profile-history */
router.get('/profile-history', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const [rows]: any = await db.query(
      'SELECT image_url, created_at FROM profile_image_history WHERE user_id=? ORDER BY created_at DESC LIMIT 20',
      [userId],
    )
    return res.json(rows)
  } catch (e) {
    return res.json([])
  }
})

/* POST /user/delete */
router.post('/delete', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body
    if (!username || !password) return res.status(400).json({ message: '요청 값이 올바르지 않습니다.' })

    const [rows]: any = await db.query(
      `SELECT password, is_banned, provider, social_id, email FROM users WHERE username=?`,
      [username],
    )
    if (!rows.length) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })

    const user = rows[0]
    if (user.is_banned) return res.status(403).json({ message: '이미 탈퇴했거나 정지된 계정입니다.' })

    if (user.provider === 'email') {
      const isMatch = await bcrypt.compare(password, user.password)
      if (!isMatch) return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' })
    }

    await db.query(
      `INSERT INTO deleted_users (username, email, provider, social_id, deleted_at, rejoin_available_at, admin_override, ban_type)
       VALUES (?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 0, 'temporary')`,
      [username, user.provider === 'email' ? user.email : null, user.provider, user.social_id],
    )

    await db.query(
      `UPDATE users SET is_banned=1, banned_at=NOW(), password=NULL WHERE username=?`,
      [username],
    )

    return res.json({ message: '회원탈퇴가 완료되었습니다.' })
  } catch (err: any) {
    console.error('회원탈퇴 오류:', err)
    return res.status(500).json({ message: '서버 오류', error: err?.message })
  }
})

export default router
