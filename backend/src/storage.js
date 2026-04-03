import path from 'path'
import fs from 'fs'

const BASE = process.env.STORAGE_PATH || '/mnt/win-aippt/imgbed'

function datePath() {
  const now = new Date()
  return { year: now.getFullYear(), month: String(now.getMonth() + 1).padStart(2, '0') }
}

export function getImagePath(id) {
  const { year, month } = datePath()
  const dir = path.join(BASE, 'images', String(year), month)
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${id}.webp`)
}

export function getThumbPath(id) {
  const dir = path.join(BASE, 'thumbs')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${id}.webp`)
}

export function getOriginalPath(id, ext) {
  const { year, month } = datePath()
  const dir = path.join(BASE, 'originals', String(year), month)
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${id}${ext}`)
}
