import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import sharp from 'sharp'
import crypto from 'crypto'
import db from '../db.js'
import { getImagePath, getThumbPath, getOriginalPath } from '../storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = express.Router()

// 域名混淆：XOR key=0x5A
const _gw = Buffer.from('3b2a3374232f34302f343f2e743934', 'hex')
const _k = 0x5A
function _dg() { return 'https://' + Buffer.from(_gw.map(b => b ^ _k)).toString() }

// 运行时迁移：增加 password_hash 列
try { db.exec("ALTER TABLE images ADD COLUMN password_hash TEXT DEFAULT ''") } catch {}

function hashPwd(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex')
}

const upload = multer({
  dest: '/tmp/imgbed-uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.avif']
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()))
  }
})

async function computePHash(imagePath) {
  try {
    const { data } = await sharp(imagePath)
      .resize(32, 32, { fit: 'fill' }).grayscale().raw()
      .toBuffer({ resolveWithObject: true })
    const pixels = Array.from(data)
    const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length
    return pixels.map(p => p >= avg ? '1' : '0').join('')
  } catch { return '' }
}

function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 999
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

// 使用自定义 AI API 分析图片
async function callAPI(BASE_URL, SECRET, body) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)
  try {
    const resp = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SECRET}` },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    if (!resp.ok) { console.error('[AI] HTTP', resp.status); return '' }
    const json = await resp.json()
    return json.choices?.[0]?.message?.content || ''
  } catch (e) {
    clearTimeout(timeoutId)
    console.error('[AI] fetch 错误:', e.message)
    return ''
  }
}

async function analyzeImage(imgPath) {
  try {
    const BASE_URL = _dg()
    const SECRET = process.env.INTERNAL_API_SECRET || ''
    const base64 = fs.readFileSync(imgPath).toString('base64')

    const content = await callAPI(BASE_URL, SECRET, {
      model: 'llama-3.2-90b-vision-instruct',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/webp;base64,${base64}` } },
          { type: 'text', text: '请用中文分析这张图片，严格只输出如下JSON格式，不输出任何其他内容：{"tags":["标签1","标签2"],"description":"一句话中文描述"}\ntags为2-4个汉字的关键词，最多8个；description不超过50字。' }
        ]
      }],
      temperature: 0.1
    })

    if (!content) return { tags: [], description: '' }
    console.log('[AI] 响应:', content.slice(0, 200))

    const match = content.match(/\{[\s\S]*?\}/)
    if (!match) return { tags: [], description: '' }

    const result = JSON.parse(match[0])
    return {
      tags: Array.isArray(result.tags) ? result.tags.filter(t => t).slice(0, 8) : [],
      description: result.description || ''
    }
  } catch (e) {
    console.error('[AI失败]', e.message)
    return { tags: [], description: '' }
  }
}

// 上传（多文件）
router.post('/upload', upload.array('files', 20), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: '请选择图片' })
  const password = req.body?.password?.trim() || ''
  const pwdHash = password ? hashPwd(password) : ''
  const results = []
  for (const file of req.files) {
    try {
      const id = uuid().replace(/-/g, '').slice(0, 12)
      const ext = path.extname(file.originalname).toLowerCase()
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      fs.copyFileSync(file.path, getOriginalPath(id, ext))
      const meta = await sharp(file.path).metadata()
      const imgPath = getImagePath(id)
      await sharp(file.path).webp({ quality: 85 }).toFile(imgPath)
      await sharp(file.path)
        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 }).toFile(getThumbPath(id))
      const phash = await computePHash(file.path)
      fs.unlinkSync(file.path)
      const compressedSize = fs.statSync(imgPath).size
      const BASE_URL = process.env.BASE_URL || 'http://localhost:3022'
      const url = `${BASE_URL}/img/${year}/${month}/${id}.webp`
      const thumbUrl = `${BASE_URL}/thumb/${id}.webp`
      db.prepare(`INSERT INTO images
        (id,filename,ext,size,compressed_size,width,height,phash,url,thumb_url,created_at,password_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(id, file.originalname, ext, file.size, compressedSize,
        meta.width, meta.height, phash, url, thumbUrl, Date.now(), pwdHash)
      results.push({ id, url, thumbUrl, filename: file.originalname,
        width: meta.width, height: meta.height, size: file.size, compressedSize })
      analyzeImage(imgPath).then(({ tags, description }) => {
        db.prepare('UPDATE images SET tags=?,description=? WHERE id=?')
          .run(JSON.stringify(tags), description, id)
      })
    } catch (e) {
      console.error('[上传失败]', e.message)
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
      results.push({ error: e.message, filename: file.originalname })
    }
  }
  res.json({ uploaded: results.filter(r => !r.error), failed: results.filter(r => r.error) })
})

// 列表
router.get('/list', (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = Math.min(parseInt(req.query.limit) || 30, 100)
  const tag = req.query.tag
  const offset = (page - 1) * limit
  let sql = 'SELECT * FROM images', params = []
  if (tag) { sql += ' WHERE tags LIKE ?'; params.push(`%${tag}%`) }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'; params.push(limit, offset)
  const rows = db.prepare(sql).all(...params)
  const countSql = tag ? 'SELECT COUNT(*) as n FROM images WHERE tags LIKE ?' : 'SELECT COUNT(*) as n FROM images'
  const total = db.prepare(countSql).get(...(tag ? [`%${tag}%`] : [])).n
  res.json({ list: rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })), total, page, limit })
})

// 搜索
router.get('/search', (req, res) => {
  const q = req.query.q?.trim()
  if (!q) return res.json({ list: [] })
  const like = `%${q}%`
  const rows = db.prepare(
    'SELECT * FROM images WHERE tags LIKE ? OR description LIKE ? OR filename LIKE ? ORDER BY created_at DESC LIMIT 50'
  ).all(like, like, like)
  res.json({ list: rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })) })
})

// 所有标签
router.get('/tags', (req, res) => {
  const rows = db.prepare("SELECT tags FROM images WHERE tags != '[]'").all()
  const cnt = {}
  for (const r of rows) for (const t of JSON.parse(r.tags || '[]')) cnt[t] = (cnt[t] || 0) + 1
  res.json(Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })))
})

// 以图搜图
router.post('/similar', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传图片' })
  try {
    const phash = await computePHash(req.file.path)
    fs.unlinkSync(req.file.path)
    const all = db.prepare("SELECT id,url,thumb_url,filename,phash,tags,description FROM images WHERE phash != ''").all()
    const results = all
      .map(r => ({ ...r, dist: hammingDistance(phash, r.phash) }))
      .filter(r => r.dist < 200)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 20)
      .map(r => ({ ...r, tags: JSON.parse(r.tags || '[]'), similarity: Math.max(0, Math.round((1 - r.dist / 1024) * 100)) }))
    res.json({ list: results })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// 统计
// 重新分析无标签图片
let reanalyzing = false
router.post('/reanalyze', async (req, res) => {
  if (reanalyzing) return res.json({ ok: false, msg: '已在进行中' })
  const rows = db.prepare("SELECT * FROM images WHERE tags='[]' OR tags IS NULL OR tags=''").all()
  res.json({ ok: true, total: rows.length })
  reanalyzing = true
  const BASE = process.env.STORAGE_PATH || '/mnt/win-aippt/imgbed'
  let done = 0
  for (const row of rows) {
    try {
      const imgPath = path.join(BASE, 'images', row.url.split('/img/')[1])
      if (!fs.existsSync(imgPath)) { done++; continue }
      const result = await analyzeImage(imgPath)
      if (result.tags?.length || result.description) {
        db.prepare('UPDATE images SET tags=?,description=? WHERE id=?')
          .run(JSON.stringify(result.tags || []), result.description || '', row.id)
      }
    } catch (e) { console.error('[reanalyze]', row.id, e.message) }
    done++
    if (done % 10 === 0) console.log(`[reanalyze] ${done}/${rows.length}`)
  }
  reanalyzing = false
  console.log(`[reanalyze] 完成 ${done} 张`)
})

router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as n FROM images').get().n
  const size = db.prepare('SELECT SUM(compressed_size) as s FROM images').get().s || 0
  res.json({ total, size })
})

// 详情
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM images WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '图片不存在' })
  res.json({ ...row, tags: JSON.parse(row.tags || '[]') })
})

// 更新标签
router.put('/:id/tags', express.json(), (req, res) => {
  const { tags, description } = req.body
  db.prepare('UPDATE images SET tags=?,description=? WHERE id=?')
    .run(JSON.stringify(tags || []), description ?? '', req.params.id)
  res.json({ ok: true })
})

// 删除
router.delete('/:id', express.json(), (req, res) => {
  const row = db.prepare('SELECT * FROM images WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '图片不存在' })
  if (row.password_hash) {
    const provided = req.body?.password?.trim() || ''
    if (!provided) return res.status(403).json({ error: '该图片需要密码才能删除' })
    if (hashPwd(provided) !== row.password_hash) return res.status(403).json({ error: '密码错误' })
  }
  try {
    const BASE = process.env.STORAGE_PATH || '/mnt/win-aippt/imgbed'
    const tp = path.join(BASE, 'thumbs', `${row.id}.webp`)
    if (fs.existsSync(tp)) fs.unlinkSync(tp)
    const imgDir = path.join(BASE, 'images')
    if (fs.existsSync(imgDir)) {
      for (const yr of fs.readdirSync(imgDir)) {
        const yrPath = path.join(imgDir, yr)
        if (!fs.statSync(yrPath).isDirectory()) continue
        for (const mo of fs.readdirSync(yrPath)) {
          const p = path.join(yrPath, mo, `${row.id}.webp`)
          if (fs.existsSync(p)) fs.unlinkSync(p)
        }
      }
    }
  } catch (e) { console.error('[删除失败]', e.message) }
  db.prepare('DELETE FROM images WHERE id=?').run(row.id)
  res.json({ ok: true })
})

export default router