require('dotenv').config()
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const generationRoutes = require('./routes/generation')

const app = express()
const PORT = process.env.PORT || 4000

// ===========================================
// CONFIGURACIÓN
// ===========================================

// Supabase client para autenticación
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://lrnckuzrqhvrfwnvhjwu.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'tu_service_key'
)

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// ===========================================
// SERVIR FRONTEND ESTÁTICO
// ===========================================

// Directorio de build de Next.js
const frontendBuildPath = path.join(__dirname, 'frontend', '.next')

// Servir archivos estáticos del frontend en la ruta raíz
app.use(express.static(frontendBuildPath))

// Ruta raíz que sirve la interfaz del chat
app.get('/', (req, res) => {
  const chatPage = path.join(frontendBuildPath, 'server', 'pages', 'chat.html')
  if (fs.existsSync(chatPage)) {
    res.sendFile(chatPage)
  } else {
    res.status(404).send('Frontend no construido. Ejecuta: npm run build:frontend')
  }
})

// Servir página de login
app.get('/login', (req, res) => {
  const loginPage = path.join(frontendBuildPath, 'server', 'pages', 'login.html')
  if (fs.existsSync(loginPage)) {
    res.sendFile(loginPage)
  } else {
    res.status(404).send('Frontend no construido. Ejecuta: npm run build:frontend')
  }
})

// Configurar almacenamiento temporal para archivos subidos
const uploadDir = process.env.UPLOAD_DIR || './uploads'
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
})

// Directorio público para videos generados
app.use('/videos', express.static(path.join(__dirname, '../videos')))

// ===========================================
// MIDDLEWARE DE AUTENTICACIÓN
// ===========================================

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' })
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      return res.status(403).json({ error: 'No autorizado' })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(403).json({ error: 'Error de autenticación' })
  }
}

// ===========================================
// RUTAS
// ===========================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Ruta de generación de video
app.use('/api/generate', authenticateToken, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), generationRoutes)

// Endpoint para verificar estado de ComfyUI
app.get('/api/comfyui/status', async (req, res) => {
  try {
    const axios = require('axios')
    const comfyuiUrl = process.env.COMFYUI_URL || 'http://localhost:8188'
    const response = await axios.get(`${comfyuiUrl}/system_stats`)
    res.json({ 
      connected: true, 
      comfyui_url: comfyuiUrl,
      stats: response.data 
    })
  } catch (error) {
    res.json({ 
      connected: false, 
      error: error.message,
      comfyui_url: process.env.COMFYUI_URL || 'http://localhost:8188'
    })
  }
})

// ===========================================
// SERVIDOR
// ===========================================

app.listen(PORT, () => {
  console.log(`🚀 voidmx1.5 backend corriendo en puerto ${PORT}`)
  console.log(`📡 ComfyUI URL: ${process.env.COMFYUI_URL || 'http://localhost:8188'}`)
  console.log(`🔐 Autenticación: Supabase`)
})

module.exports = app
