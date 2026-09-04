import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { getSupabase } from '../lib/supabase'
import ModelSelector from '../components/ModelSelector'
import GenerationMode from '../components/GenerationMode'

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [selectedModel, setSelectedModel] = useState('cogvideox')
  const [generationMode, setGenerationMode] = useState('text-to-video')
  const [loading, setLoading] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const router = useRouter()
  const supabase = getSupabase()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
      }
    }
    checkAuth()
  }, [])

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      setImageFile(file)
    }
  }

  const sendMessage = async () => {
    if ((!input.trim() && !imageFile) || loading) return

    const userMessage = {
      role: 'user',
      content: input,
      mode: generationMode,
      image: imageFile ? URL.createObjectURL(imageFile) : null
    }

    setMessages(prev => [...prev, userMessage])
    setLoading(true)
    setInput('')

    try {
      const formData = new FormData()
      formData.append('prompt', input)
      formData.append('mode', generationMode)
      formData.append('model', selectedModel)
      if (imageFile) {
        formData.append('image', imageFile)
      }

      const response = await fetch(`${process.env.API_BASE_URL}/api/generate`, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      const aiMessage = {
        role: 'assistant',
        content: data.message || 'Video generado exitosamente',
        videoUrl: data.video_url,
        status: data.status
      }

      setMessages(prev => [...prev, aiMessage])
    } catch (error) {
      const errorMessage = {
        role: 'assistant',
        content: `Error: ${error.message}`,
        status: 'error'
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
      setImageFile(null)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-void-950 flex flex-col">
      {/* Header */}
      <header className="bg-void-900 border-b border-gray-800 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">voidmx1.5</h1>
          <div className="flex items-center gap-4">
            <ModelSelector selected={selectedModel} onChange={setSelectedModel} />
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      {/* Generation Mode Selector */}
      <div className="bg-void-900/50 border-b border-gray-800 p-4">
        <div className="max-w-6xl mx-auto">
          <GenerationMode selected={generationMode} onChange={setGenerationMode} />
        </div>
      </div>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-20">
              <p className="text-xl mb-2">Bienvenido a voidmx1.5</p>
              <p>Selecciona un modo de generación y comienza a crear videos con IA</p>
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-100'
                }`}
              >
                {msg.content && <p className="mb-2">{msg.content}</p>}
                
                {msg.image && (
                  <img src={msg.image} alt="Uploaded" className="rounded-lg max-h-48 mb-2" />
                )}

                {msg.videoUrl && (
                  <div className="mt-2">
                    <video controls className="w-full rounded-lg max-h-64">
                      <source src={msg.videoUrl} type="video/mp4" />
                      Tu navegador no soporta videos.
                    </video>
                  </div>
                )}

                {msg.status && (
                  <p className={`text-xs mt-2 ${
                    msg.status === 'completed' ? 'text-green-400' : 
                    msg.status === 'processing' ? 'text-yellow-400' : 
                    'text-red-400'
                  }`}>
                    {msg.status === 'processing' && '⏳ Generando video...'}
                    {msg.status === 'completed' && '✅ Video listo'}
                    {msg.status === 'error' && '❌ Error en la generación'}
                  </p>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <footer className="bg-void-900 border-t border-gray-800 p-4">
        <div className="max-w-4xl mx-auto flex gap-2">
          {(generationMode === 'image-to-video' || generationMode === 'video-to-video') && (
            <label className="cursor-pointer px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
              <span className="text-gray-300">📁</span>
              <input
                type="file"
                accept={generationMode === 'video-to-video' ? 'video/*' : 'image/*'}
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          )}
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={
              generationMode === 'text-to-video' ? 'Describe el video que quieres generar...' :
              generationMode === 'image-to-video' ? 'Describe cómo animar la imagen...' :
              generationMode === 'video-to-video' ? 'Describe las modificaciones al video...' :
              'Describe el video con audio...'
            }
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
          />
          
          <button
            onClick={sendMessage}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-semibold transition-colors"
          >
            Enviar
          </button>
        </div>
      </footer>
    </div>
  )
}
