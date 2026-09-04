# voidmx1.5 - Plataforma de Generación de Video con IA

Aplicación web completa para generar videos usando modelos de IA open-source a través de ComfyUI, sin pagar APIs externas.

## 🚀 Características

- **Autenticación segura** con Supabase Auth (correo electrónico)
- **Interfaz estilo ChatGPT** con selector de modelos
- **4 modos de generación**:
  - 📝 Texto a Video (CogVideoX, AnimateDiff)
  - 🖼️ Imagen a Video (Stable Video Diffusion)
  - 🎬 Video a Video (ControlNet + AnimateDiff)
  - 🎵 Audio a Video (Modelos audio-reactivos)
- **Conexión a ComfyUI** local o remoto via API REST y WebSocket
- **Backend Node.js/Express** para gestión de peticiones
- **Frontend Next.js** con TailwindCSS

## 📁 Estructura del Proyecto

```
voidmx1.5/
├── frontend/                 # Aplicación Next.js
│   ├── pages/
│   │   ├── login.js         # Página de autenticación
│   │   ├── chat.js          # Interfaz principal tipo ChatGPT
│   │   └── api/
│   │       └── comfyui.js   # Proxy API a ComfyUI
│   ├── components/
│   │   ├── ModelSelector.js     # Selector de modelos
│   │   └── GenerationMode.js    # Selector de modos
│   ├── lib/
│   │   └── supabase.js      # Cliente Supabase
│   ├── styles/
│   │   └── globals.css      # Estilos Tailwind
│   └── package.json
│
├── backend/                  # Servidor Node.js
│   ├── server.js            # Servidor Express principal
│   ├── routes/
│   │   └── generation.js    # Endpoints de generación
│   ├── services/
│   │   ├── comfyuiClient.js     # Cliente JS para ComfyUI
│   │   └── comfyui_client.py    # Cliente Python para ComfyUI
│   └── package.json
│
├── .env.example             # Variables de entorno
└── README.md                # Este archivo
```

## 🔧 Instalación

### 1. Clonar y configurar variables de entorno

```bash
cd voidmx1.5
cp .env.example .env
```

Edita `.env` con tus credenciales:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=tu_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_anon_key
SUPABASE_SERVICE_KEY=tu_service_key

# ComfyUI (URL de tu instancia remota)
COMFYUI_URL=http://tu-servidor-comfyui:8188

# Backend
PORT=4000
API_BASE_URL=http://localhost:4000
```

### 2. Instalar dependencias

```bash
# Instalar todo
npm run install:all

# O por separado:
cd frontend && npm install
cd ../backend && npm install
```

### 3. Configurar Supabase

En tu proyecto de Supabase:

1. Crea un nuevo proyecto en https://supabase.com
2. Ve a Authentication > Providers > Email y habilita el proveedor Email
3. Copia las credenciales en tu `.env`

### 4. Configurar ComfyUI Remoto

En tu servidor con GPU donde está instalado ComfyUI:

```bash
# Iniciar ComfyUI escuchando en todas las interfaces
python main.py --listen 0.0.0.0 --port 8188

# Instalar modelos necesarios
# CogVideoX: https://huggingface.co/THUDM/CogVideoX-5b
# SVD: https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt
# AnimateDiff: https://huggingface.co/guoyww/animatediff
```

**Custom Nodes requeridos en ComfyUI:**

Usa [ComfyUI Manager](https://github.com/ltdrdata/ComfyUI-Manager) para instalar:

- `ComfyUI-VideoHelperSuite` - Para carga/guardado de video
- `AnimateDiff-Evolved` - Para animaciones fluidas
- `ComfyUI-CogVideoXWrapper` - Para CogVideoX

## 🚀 Uso

### Iniciar la aplicación

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

La aplicación estará disponible en:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

### Flujo de uso

1. **Registro/Login**: Ve a `/login` y crea una cuenta con tu correo
2. **Selecciona modelo**: En el header, elige el modelo de IA
3. **Elige modo**: Selecciona entre Texto/Imagen/Video/Audio a Video
4. **Escribe prompt**: Describe el video que quieres generar
5. **Sube archivos** (si aplica): Para modos image-to-video o video-to-video
6. **Generar**: Envía tu solicitud y espera el resultado

## 📡 Endpoints de la API

### POST /api/generate

Genera un video usando ComfyUI

```json
{
  "prompt": "un gato bailando en el espacio",
  "mode": "text-to-video",
  "model": "cogvideox"
}
```

Response:

```json
{
  "success": true,
  "message": "Video en proceso de generación",
  "prompt_id": "abc123-def456",
  "status": "processing",
  "estimated_time": "30-120 segundos"
}
```

### GET /api/generate/status/:prompt_id

Verifica el estado de una generación

### GET /api/generate/models

Obtiene los modelos disponibles en ComfyUI

### GET /api/comfyui/status

Verifica la conexión con ComfyUI

## 🐍 Script Python para ComfyUI

Incluye un cliente Python independiente para probar la conexión:

```bash
# Instalar dependencias Python
pip install websocket-client requests

# Ejecutar prueba
python backend/services/comfyui_client.py \
  --url http://tu-comfyui-remoto:8188 \
  --mode text-to-video \
  --prompt "un astronauta montando caballo en marte" \
  --model cogvideox
```

## 🔐 Seguridad

- Autenticación con JWT de Supabase
- Tokens de acceso con expiración
- CORS configurado para dominios específicos
- Límite de tamaño de archivos (100MB)

## 🛠️ Desarrollo

### Agregar nuevos modelos

1. Edita `backend/services/comfyuiClient.js`
2. Agrega el workflow en el método correspondiente
3. Actualiza el selector en `frontend/components/ModelSelector.js`

### Personalizar workflows

Los workflows de ComfyUI están definidos como objetos JSON. Puedes:

1. Crear tu workflow en la UI de ComfyUI
2. Exportarlo como JSON (botón "Save")
3. Copiarlo en los métodos `get*Workflow()` del cliente

## 📄 Licencia

MIT License - Ver LICENSE para más detalles

## 🤝 Contribución

Las contribuciones son bienvenidas. Por favor:

1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📞 Soporte

Para issues o preguntas, abre un issue en GitHub.

---

**Hecho con ❤️ para la comunidad de IA open-source**
