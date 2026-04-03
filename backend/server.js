import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import imageRoutes from './src/routes/image.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

try {
  const env = readFileSync(path.join(__dirname, '.env'), 'utf-8')
  for (const line of env.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0 && !process.env[t.slice(0, i).trim()])
      process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
} catch {}

const app = express()
const PORT = process.env.PORT || 3022
const STORAGE = process.env.STORAGE_PATH || '/mnt/win-aippt/imgbed'

app.use(cors())
app.use(express.json())

// 静态服务：图片、缩略图
app.use('/img', express.static(path.join(STORAGE, 'images')))
app.use('/thumb', express.static(path.join(STORAGE, 'thumbs')))

// API
app.use('/api/img', imageRoutes)

// 前端
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`[IMGBED] 运行在端口 ${PORT}，存储: ${STORAGE}`)
})
