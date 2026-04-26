import { Router, Request, Response } from 'express'
import db from '../db/mysql'
import { requireAuth } from '../middlewares/auth'

const router = Router()

/* GET /friends */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const [rows]: any = await db.query(
      `SELECT u.id, u.name, u.username, u.profile_image_url AS profileImageUrl,
         CONCAT(u.grade, '학년 ', u.class_num, '반') AS gradeLabel
       FROM friends f JOIN users u ON u.id=f.friend_id
       LEFT JOIN blocks b ON b.user_id=f.user_id AND b.blocked_id=f.friend_id
       WHERE f.user_id=? AND b.id IS NULL ORDER BY u.name ASC`,
      [userId],
    )
    return res.json(rows)
  } catch (e) {
    console.error('[GET FRIENDS ERROR]', e)
    return res.status(500).json({ message: 'SERVER_ERROR' })
  }
})

/* POST /friends/add */
router.post('/add', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const { friendId } = req.body
    if (!friendId) return res.status(400).json({ message: 'friendId required' })

    // 이미 친구인지 확인
    const [exist]: any = await db.query(`SELECT id FROM friends WHERE user_id=? AND friend_id=?`, [userId, friendId])
    if (exist.length) return res.status(409).json({ message: '이미 친구입니다.' })

    await db.query(`INSERT INTO friends (user_id, friend_id) VALUES (?,?)`, [userId, friendId])
    await db.query(`INSERT INTO friends (user_id, friend_id) VALUES (?,?)`, [friendId, userId])
    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ message: 'SERVER_ERROR' })
  }
})

/* DELETE /friends/:friendId */
router.delete('/:friendId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const { friendId } = req.params
    await db.query(`DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)`,
      [userId, friendId, friendId, userId])
    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ message: 'SERVER_ERROR' })
  }
})

/* GET /friends/blocks */
router.get('/blocks', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const [rows]: any = await db.query(
      `SELECT u.id, u.name, u.username FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=?`,
      [userId],
    )
    return res.json(rows)
  } catch (e) {
    return res.status(500).json({ message: 'SERVER_ERROR' })
  }
})

/* POST /friends/blocks */
router.post('/blocks', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const { blockedId } = req.body
    const [exist]: any = await db.query(`SELECT id FROM blocks WHERE user_id=? AND blocked_id=?`, [userId, blockedId])
    if (exist.length) {
      await db.query(`DELETE FROM blocks WHERE user_id=? AND blocked_id=?`, [userId, blockedId])
      return res.json({ blocked: false })
    }
    await db.query(`INSERT INTO blocks (user_id, blocked_id) VALUES (?,?)`, [userId, blockedId])
    return res.json({ blocked: true })
  } catch (e) {
    return res.status(500).json({ message: 'SERVER_ERROR' })
  }
})

export default router
