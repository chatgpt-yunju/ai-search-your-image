import db from './src/db.js'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.STORAGE_PATH = '/home/ubuntu/imgbed-storage'

// 域名混淆：XOR key=0x5A
const _gw = Buffer.from('3b2a3374232f34302f343f2e743934', 'hex')
const _k = 0x5A
function _dg() { return 'https://' + Buffer.from(_gw.map(b => b ^ _k)).toString() }

async function callAPI(BASE_URL, SECRET, body) {
  try {
    const resp = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SECRET}` },
      body: JSON.stringify(body)
    })
    if (!resp.ok) {
      const err = await resp.text()
      console.error('API Error:', resp.status, err.slice(0, 200))
      return ''
    }
    const json = await resp.json()
    return json.choices?.[0]?.message?.content || ''
  } catch (e) {
    console.error('fetch error:', e.message)
    return ''
  }
}

async function aiSearch(query) {
  try {
    const like = `%${query}%`
    const candidates = db.prepare(
      'SELECT id,filename,tags,description FROM images WHERE tags LIKE ? OR description LIKE ? OR filename LIKE ? ORDER BY created_at DESC LIMIT 50'
    ).all(like, like, like)

    if (!candidates.length) {
      console.log('No candidates found')
      return []
    }

    console.log('Candidates:', candidates.length)

    const BASE_URL = _dg()
    const SECRET = process.env.INTERNAL_API_SECRET || ''

    const body = {
      model: 'step-3.5-flash',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `用户搜索："${query}"\n请从以下 ${candidates.length} 张图片中，根据标签和描述匹配度排序（最相关排前面）。只返回纯 JSON 数组，格式：["id1","id2",...]\n图片数据：${JSON.stringify(candidates)}` }
        ]
      }],
      temperature: 0.2,
      max_tokens: 2000
    }

    console.log('Request body:', JSON.stringify(body, null, 2).slice(0, 500))

    const content = await callAPI(BASE_URL, SECRET, body)
    console.log('Response content:', content?.slice(0, 500))

    if (!content) return []

    const match = content.match(/\[.*?\]/s)
    if (!match) {
      console.log('No array match found')
      return []
    }

    const sortedIds = JSON.parse(match[0])
    console.log('Sorted IDs:', sortedIds)

    return sortedIds
  } catch (e) {
    console.error('aiSearch error:', e.message)
    return []
  }
}

// 测试
await aiSearch('山')
