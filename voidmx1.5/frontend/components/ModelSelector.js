export default function ModelSelector({ selected, onChange }) {
  const models = [
    { id: 'cogvideox', name: 'CogVideoX', description: 'Texto a Video' },
    { id: 'animatediff', name: 'AnimateDiff', description: 'Animación fluida' },
    { id: 'svd', name: 'Stable Video Diffusion', description: 'Imagen a Video' },
    { id: 'custom', name: 'Custom Workflow', description: 'ComfyUI personalizado' }
  ]

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-400">Modelo:</label>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 bg-void-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
    </div>
  )
}
