<template>
  <div class="app">
    <header class="header">
      <div class="header-inner">
        <h1 class="logo">🖼 AI 图床</h1>
        <div class="header-right">
          <div class="stats" v-if="stats.total">{{ stats.total }} 张 · {{ formatSize(stats.size) }}</div>
          <button class="btn-upload-top" @click="showUpload = true">+ 上传</button>
        </div>
      </div>
    </header>

    <!-- 搜索栏 -->
    <div class="search-bar">
      <div class="search-inner">
        <button @click="aiMode = !aiMode" :class="['btn-ai-toggle', { active: aiMode }]" title="切换 AI 智能搜索">
          {{ aiMode ? '🤖 AI' : '🔍 普通' }}
        </button>
        <input v-model="searchQ" @keyup.enter="doSearch" :placeholder="aiMode ? '用自然语言描述你想找的图片...' : '搜索标签、描述、文件名...'" class="search-input" />
        <button @click="doSearch" class="btn-search">{{ aiMode ? '✨ AI 搜索' : '搜索' }}</button>
        <label class="btn-similar" title="以图搜图">
          <input type="file" accept="image/*" @change="doSimilar" style="display:none" />
          以图搜图
        </label>
        <button v-if="searchMode || aiMode" @click="clearSearch" class="btn-clear">✕ 清除</button>
      </div>
    </div>

    <div class="main">
      <!-- 标签侧栏 -->
      <aside class="sidebar">
        <div class="sidebar-title">标签</div>
        <div class="tag-list">
          <span class="tag-item" :class="{ active: activeTag === '' }" @click="filterTag('')">全部</span>
          <span v-for="t in tags" :key="t.tag" class="tag-item" :class="{ active: activeTag === t.tag }" @click="filterTag(t.tag)">
            {{ t.tag }} <em>{{ t.count }}</em>
          </span>
        </div>
      </aside>

      <!-- 图片网格 -->
      <main class="content">
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="!images.length" class="empty">
          暂无图片，
          <a href="#" @click.prevent="showUpload = true">点击上传</a>
        </div>
        <div v-else class="grid">
          <div v-for="img in images" :key="img.id" class="grid-item" @click="openDetail(img)">
            <img :src="img.thumb_url" :alt="img.filename" loading="lazy" />
            <div class="grid-overlay">
              <div class="grid-tags">
                <span v-for="t in img.tags.slice(0,3)" :key="t" class="tag">{{ t }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="hasMore && !loading" class="load-more">
          <button @click="loadMore" class="btn-more">加载更多</button>
        </div>
      </main>
    </div>

    <!-- 上传弹窗 -->
    <div v-if="showUpload" class="modal-mask" @click.self="showUpload = false">
      <div class="modal upload-modal">
        <div class="modal-title">上传图片 <button class="modal-close" @click="showUpload = false">✕</button></div>
        <div class="drop-zone"
          :class="{ dragging }"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
          @paste="onPaste"
          @click="$refs.fileInput.click()">
          <div class="drop-hint">
            <div class="drop-icon">📁</div>
            <div>拖拽图片到此处，或点击选择</div>
            <div class="drop-sub">支持 JPG / PNG / GIF / WebP，最大 50MB</div>
          </div>
          <input ref="fileInput" type="file" accept="image/*" multiple @change="onFileSelect" style="display:none" />
        </div>
        <div class="upload-password-row">
          <label class="upload-pwd-label">删除密码（可选）</label>
          <input v-model="uploadPassword" type="password" class="upload-pwd-input" placeholder="设置后删除时需要验证" />
        </div>
        <div v-if="uploadQueue.length" class="upload-queue">
          <div v-for="item in uploadQueue" :key="item.name" class="upload-item">
            <span class="upload-name">{{ item.name }}</span>
            <span class="upload-status" :class="item.status">{{ statusText(item.status) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="detail" class="modal-mask" @click.self="detail = null">
      <div class="modal detail-modal">
        <button class="modal-close" @click="detail = null">✕</button>
        <div class="detail-img-wrap">
          <img :src="detail.url" :alt="detail.filename" />
        </div>
        <div class="detail-info">
          <div class="detail-filename">{{ detail.filename }}</div>
          <div class="detail-meta">
            {{ detail.width }}×{{ detail.height }} · {{ formatSize(detail.compressed_size) }} (原 {{ formatSize(detail.size) }})
            <span v-if="detail.score !== undefined" class="ai-score">🎯 AI匹配度: {{ Math.round(detail.score * 100) }}%</span>
            <span v-if="detail.reason" class="ai-reason">（{{ detail.reason }}）</span>
          </div>
          <div class="detail-desc" v-if="detail.description">{{ detail.description }}</div>
          <div class="detail-tags">
            <span v-for="t in detail.tags" :key="t" class="tag">{{ t }}</span>
            <span v-if="!detail.tags.length" class="tag-empty">AI分析中...</span>
          </div>
          <div class="detail-url">
            <input :value="detail.url" readonly class="url-input" @click="$event.target.select()" />
            <button @click="copyUrl(detail.url)" class="btn-copy">{{ copied ? '✓ 已复制' : '复制' }}</button>
          </div>
          <div class="detail-actions">
            <button @click="deleteImage(detail)" class="btn-delete">删除图片</button>
            <span v-if="detail.password_hash" class="pwd-protected">🔒 需要密码</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

const images = ref([])
const tags = ref([])
const stats = ref({ total: 0, size: 0 })
const loading = ref(false)
const page = ref(1)
const hasMore = ref(false)
const showUpload = ref(false)
const dragging = ref(false)
const uploadQueue = ref([])
const detail = ref(null)
const copied = ref(false)
const searchQ = ref('')
const searchMode = ref(false)
const aiMode = ref(false)
const activeTag = ref('')
const uploadPassword = ref('')

async function loadImages(reset = false) {
  if (reset) { page.value = 1; images.value = [] }
  loading.value = true
  try {
    let url = `/api/img/list?page=${page.value}&limit=30`
    if (activeTag.value) url += `&tag=${encodeURIComponent(activeTag.value)}`
    const r = await fetch(url).then(r => r.json())
    if (reset) images.value = r.list
    else images.value.push(...r.list)
    hasMore.value = images.value.length < r.total
  } finally { loading.value = false }
}

async function loadTags() {
  tags.value = await fetch('/api/img/tags').then(r => r.json())
}

async function loadStats() {
  stats.value = await fetch('/api/img/stats').then(r => r.json())
}

function loadMore() {
  page.value++
  loadImages()
}

function filterTag(tag) {
  activeTag.value = tag
  searchMode.value = false
  searchQ.value = ''
  loadImages(true)
}

async function doSearch() {
  if (!searchQ.value.trim()) return clearSearch()
  searchMode.value = true
  aiMode.value = aiMode.value // keep current mode
  loading.value = true
  try {
    if (aiMode.value) {
      const r = await fetch(`/api/img/ai-search?q=${encodeURIComponent(searchQ.value)}`).then(r => r.json())
      images.value = r.list || []
    } else {
      const r = await fetch(`/api/img/search?q=${encodeURIComponent(searchQ.value)}`).then(r => r.json())
      images.value = r.list
    }
    hasMore.value = false
  } finally { loading.value = false }
}

function clearSearch() {
  searchQ.value = ''
  searchMode.value = false
  aiMode.value = false
  activeTag.value = ''
  loadImages(true)
}

async function doSimilar(e) {
  const file = e.target.files?.[0]
  if (!file) return
  loading.value = true
  searchMode.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch('/api/img/similar', { method: 'POST', body: fd }).then(r => r.json())
    images.value = r.list
    hasMore.value = false
  } finally { loading.value = false; e.target.value = '' }
}

function onDrop(e) {
  dragging.value = false
  uploadFiles(Array.from(e.dataTransfer.files))
}

function onPaste(e) {
  const files = Array.from(e.clipboardData.items)
    .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
    .map(i => i.getAsFile())
  if (files.length) uploadFiles(files)
}

function onFileSelect(e) {
  uploadFiles(Array.from(e.target.files))
  e.target.value = ''
}

async function uploadFiles(files) {
  const items = files.map(f => ({ name: f.name, status: 'pending', file: f }))
  uploadQueue.value.push(...items)
  for (const item of items) {
    item.status = 'uploading'
    try {
      const fd = new FormData()
      fd.append('files', item.file)
      if (uploadPassword.value) fd.append('password', uploadPassword.value)
      const r = await fetch('/api/img/upload', { method: 'POST', body: fd }).then(r => r.json())
      item.status = r.uploaded?.length ? 'done' : 'error'
      if (r.uploaded?.length) {
        await loadImages(true)
        await loadStats()
        await loadTags()
      }
    } catch { item.status = 'error' }
  }
  setTimeout(() => {
    uploadQueue.value = uploadQueue.value.filter(i => i.status !== 'done')
  }, 3000)
}

function statusText(s) {
  return { pending: '等待', uploading: '上传中...', done: '✓ 完成', error: '✕ 失败' }[s] || s
}

function openDetail(img) {
  detail.value = img
  copied.value = false
  // 刷新详情（获取最新AI标签）
  fetch(`/api/img/${img.id}`).then(r => r.json()).then(d => {
    detail.value = d
    // 同步更新列表中的标签
    const idx = images.value.findIndex(i => i.id === d.id)
    if (idx >= 0) images.value[idx] = d
  })
}

async function deleteImage(img) {
  if (!confirm(`确定删除 ${img.filename}？`)) return
  let password = ''
  if (img.password_hash) {
    password = window.prompt('该图片设置了删除密码，请输入：') || ''
    if (!password) return
  }
  const res = await fetch(`/api/img/${img.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  }).then(r => r.json())
  if (res.error) { alert(res.error); return }
  detail.value = null
  await loadImages(true)
  await loadStats()
  await loadTags()
}

function copyUrl(url) {
  navigator.clipboard.writeText(url).then(() => {
    copied.value = true
    setTimeout(() => copied.value = false, 2000)
  })
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

onMounted(() => {
  loadImages()
  loadTags()
  loadStats()
})
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f7; color: #1d1d1f; }

.app { min-height: 100vh; display: flex; flex-direction: column; }

.header { background: #fff; border-bottom: 1px solid #e5e5e5; padding: 0 24px; }
.header-inner { max-width: 1400px; margin: 0 auto; height: 56px; display: flex; align-items: center; justify-content: space-between; }
.logo { font-size: 20px; font-weight: 600; }
.header-right { display: flex; align-items: center; gap: 16px; }
.stats { color: #666; font-size: 14px; }
.btn-upload-top { background: #0071e3; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; }
.btn-upload-top:hover { background: #0077ed; }

.search-bar { background: #fff; border-bottom: 1px solid #e5e5e5; padding: 12px 24px; }
.search-inner { max-width: 1400px; margin: 0 auto; display: flex; gap: 8px; align-items: center; }
.search-input { flex: 1; padding: 8px 14px; border: 1px solid #d2d2d7; border-radius: 8px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #0071e3; }
.btn-ai-toggle { padding: 8px 14px; border: 1px solid #d2d2d7; border-radius: 8px; cursor: pointer; font-size: 14px; background: #fff; white-space: nowrap; color: #666; }
.btn-ai-toggle.active { background: #0071e3; color: #fff; border-color: #0071e3; }
.btn-search, .btn-similar, .btn-clear { padding: 8px 14px; border: 1px solid #d2d2d7; border-radius: 8px; cursor: pointer; font-size: 14px; background: #fff; white-space: nowrap; }
.btn-search:hover, .btn-similar:hover { border-color: #0071e3; color: #0071e3; }
.btn-clear { color: #ff3b30; border-color: #ff3b30; }

.main { max-width: 1400px; margin: 0 auto; padding: 20px 24px; display: flex; gap: 24px; width: 100%; }

.sidebar { width: 160px; flex-shrink: 0; }
.sidebar-title { font-weight: 600; font-size: 13px; color: #666; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.tag-list { display: flex; flex-direction: column; gap: 4px; }
.tag-item { padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 14px; display: flex; justify-content: space-between; align-items: center; transition: background 0.15s; }
.tag-item:hover { background: #f0f0f5; }
.tag-item.active { background: #0071e3; color: #fff; }
.tag-item em { font-style: normal; font-size: 12px; opacity: 0.7; }

.content { flex: 1; min-width: 0; }
.loading, .empty { text-align: center; padding: 60px; color: #666; }
.empty a { color: #0071e3; }

.grid { columns: 4; column-gap: 12px; }
@media (max-width: 1200px) { .grid { columns: 3; } }
@media (max-width: 800px) { .grid { columns: 2; } .sidebar { display: none; } }
@media (max-width: 500px) { .grid { columns: 2; } }

.grid-item { break-inside: avoid; margin-bottom: 12px; border-radius: 10px; overflow: hidden; cursor: pointer; position: relative; background: #e5e5e5; }
.grid-item img { width: 100%; display: block; transition: transform 0.2s; }
.grid-item:hover img { transform: scale(1.03); }
.grid-overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.6)); padding: 20px 8px 8px; opacity: 0; transition: opacity 0.2s; }
.grid-item:hover .grid-overlay { opacity: 1; }
.grid-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag { background: rgba(255,255,255,0.2); color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 4px; }

.load-more { text-align: center; padding: 20px; }
.btn-more { padding: 10px 24px; border: 1px solid #d2d2d7; border-radius: 8px; cursor: pointer; background: #fff; font-size: 14px; }

.modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
.modal { background: #fff; border-radius: 16px; padding: 24px; position: relative; max-height: 90vh; overflow-y: auto; }
.modal-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; }
.modal-close { position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 18px; cursor: pointer; color: #666; padding: 4px 8px; }

.upload-modal { width: 500px; max-width: 100%; }
.drop-zone { border: 2px dashed #d2d2d7; border-radius: 12px; padding: 48px 24px; text-align: center; cursor: pointer; transition: all 0.2s; }
.drop-zone.dragging { border-color: #0071e3; background: #f0f7ff; }
.drop-icon { font-size: 48px; margin-bottom: 12px; }
.drop-sub { font-size: 13px; color: #999; margin-top: 8px; }
.upload-password-row { margin-top: 16px; display: flex; align-items: center; gap: 10px; }
.upload-pwd-label { font-size: 13px; color: #666; white-space: nowrap; }
.upload-pwd-input { flex: 1; padding: 7px 10px; border: 1px solid #d2d2d7; border-radius: 8px; font-size: 13px; outline: none; }
.upload-pwd-input:focus { border-color: #0071e3; }
.pwd-protected { font-size: 12px; color: #ff9500; margin-left: 8px; }
.upload-queue { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.upload-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f5f5f7; border-radius: 8px; font-size: 14px; }
.upload-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.upload-status { margin-left: 12px; flex-shrink: 0; font-size: 13px; }
.upload-status.done { color: #34c759; }
.upload-status.error { color: #ff3b30; }
.upload-status.uploading { color: #0071e3; }

.detail-modal { width: 800px; max-width: 100%; display: flex; gap: 24px; align-items: flex-start; }
.detail-img-wrap { flex: 1; min-width: 0; }
.detail-img-wrap img { width: 100%; border-radius: 10px; }
.detail-info { width: 220px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; }
.detail-filename { font-weight: 600; font-size: 15px; word-break: break-all; }
.detail-meta { font-size: 13px; color: #666; }
.detail-desc { font-size: 14px; color: #333; line-height: 1.5; }
.detail-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.detail-tags .tag { background: #f0f0f5; color: #333; font-size: 12px; padding: 3px 8px; border-radius: 6px; }
.tag-empty { font-size: 13px; color: #999; }
.detail-url { display: flex; gap: 8px; }
.url-input { flex: 1; font-size: 12px; padding: 6px 8px; border: 1px solid #d2d2d7; border-radius: 6px; outline: none; min-width: 0; }
.btn-copy { padding: 6px 10px; background: #0071e3; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; white-space: nowrap; }
.btn-delete { width: 100%; padding: 8px; background: none; border: 1px solid #ff3b30; color: #ff3b30; border-radius: 8px; cursor: pointer; font-size: 14px; }
.btn-delete:hover { background: #ff3b30; color: #fff; }

.ai-score { margin-left: 12px; color: #34c759; font-weight: 600; font-size: 13px; }
.ai-reason { margin-left: 6px; color: #666; font-size: 12px; font-style: italic; }

@media (max-width: 600px) {
  .detail-modal { flex-direction: column; }
  .detail-info { width: 100%; }
}
</style>
