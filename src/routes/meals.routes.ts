import { Router, Request, Response } from 'express'
import db from '../db/mysql'

const router = Router()

async function fetchMealFromNEIS(date: string, eduCode: string, schoolCode: string) {
  const key = process.env.NEIS_API_KEY
  const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=${key}&Type=json&ATPT_OFCDC_SC_CODE=${eduCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_YMD=${date}`
  const res = await fetch(url)
  const data: any = await res.json()
  const rows = data.mealServiceDietInfo?.[1]?.row
  if (!rows) return null
  const lunch = rows.find((r: any) => r.MMEAL_SC_NM === '중식')
  if (!lunch) return null
  return lunch.DDISH_NM.split('<br/>')
    .map((v: string) => v.replace(/[\u2460-\u2473]/g, '').replace(/\(\s?[0-9.]+\s?\)/g, '').trim())
    .filter(Boolean)
}

/* GET /meals?date=YYYYMMDD&eduCode=J10&schoolCode=xxx */
router.get('/', async (req: Request, res: Response) => {
  const { date, eduCode, schoolCode } = req.query as Record<string, string>
  if (!date || !eduCode || !schoolCode) return res.status(400).json({ meal: null })

  const mysqlDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`

  const [rows]: any = await db.query(
    `SELECT menu FROM meals WHERE school_code=? AND meal_date=? AND meal_type='중식'`,
    [schoolCode, mysqlDate],
  )
  if (rows.length > 0) return res.json({ meal: JSON.parse(rows[0].menu) })

  const meal = await fetchMealFromNEIS(date, eduCode, schoolCode)
  if (!meal) return res.json({ meal: null })

  await db.query(
    `INSERT INTO meals (school_code, edu_code, meal_date, menu) VALUES (?,?,?,?)`,
    [schoolCode, eduCode, mysqlDate, JSON.stringify(meal)],
  )

  return res.json({ meal })
})

export default router
