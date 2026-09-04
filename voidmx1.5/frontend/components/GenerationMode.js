export default function GenerationMode({ selected, onChange }) {
  const modes = [
    { id: 'text-to-video', label: '📝 Texto a Video', description: 'Genera video desde un prompt de texto' },
    { id: 'image-to-video', label: '🖼️ Imagen a Video', description: 'Anima una imagen estática' },
    { id: 'video-to-video', label: '🎬 Video a Video', description: 'Transforma un video existente' },
    { id: 'audio-to-video', label: '🎵 Audio a Video', description: 'Genera video sincronizado con audio' }
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {modes.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onChange(mode.id)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            selected === mode.id
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
          }`}
          title={mode.description}
        >
          {mode.label}
        </button>
      ))}
    </div>
  )
}
