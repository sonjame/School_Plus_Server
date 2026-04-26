import { Router, Request, Response } from 'express'
import db from '../db/mysql'

const router = Router()

/* GET /academic-events?eduCode=&schoolCode=&year=&month= */
router.get('/', async (req: Request, res: Response) => {
  const { eduCode, schoolCode, year, month } = req.query as Record<string, string>
  if (!eduCode || !schoolCode || !year || !month) {
    return res.status(400).json({ message: 'missing params' })
  }

  const m = month.padStart(2, '0')
  const from = `${year}-${m}-01`
  const lastDay = new Date(Number(year), Number(month), 0).getDate()
  const to = `${year}-${m}-${String(lastDay).padStart(2, '0')}`

  const [rows]: any = await db.query(
    `SELECT DATE_FORMAT(event_date,'%Y-%m-%d') AS date, title
     FROM academic_events
     WHERE edu_code=? AND school_code=? AND event_date BETWEEN ? AND ?`,
    [eduCode, schoolCode, from, to],
  )
  if (rows.length > 0) return res.json(rows)

  // NEIS 호출
  const neisFrom = from.replaceAll('-', '')
  const neisTo = to.replaceAll('-', '')
  const url = `https://open.neis.go.kr/hub/SchoolSchedule?KEY=${process.env.NEIS_API_KEY}&Type=json&ATPT_OFCDC_SC_CODE=${eduCode}&SD_SCHUL_CODE=${schoolCode}&AA_FROM_YMD=${neisFrom}&AA_TO_YMD=${neisTo}`

  const neisRes = await fetch(url)
  const json: any = await neisRes.json()
  const neisRows = json?.SchoolSchedule?.[1]?.row ?? []
  if (!neisRows.length) return res.json([])

  const values = neisRows.map((r: any) => [
    eduCode, schoolCode,
    `${r.AA_YMD.slice(0, 4)}-${r.AA_YMD.slice(4, 6)}-${r.AA_YMD.slice(6, 8)}`,
    r.EVENT_NM,
  ])

  await db.query(
    `INSERT IGNORE INTO academic_events (edu_code, school_code, event_date, title) VALUES ?`,
    [values],
  )

  return res.json(values.map((v: any[]) => ({ date: v[2], title: v[3] })))
})

export default router
