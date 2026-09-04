import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'

export default async function handler(req, res) {
  const supabase = createServerSupabaseClient({ req, res })

  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  // Proxy para enviar peticiones al backend de ComfyUI
  if (req.method === 'POST') {
    try {
      const { prompt, mode, model, image } = req.body

      const response = await fetch(`${process.env.COMFYUI_URL || 'http://localhost:8188'}/prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          mode,
          model,
          user_id: session.user.id
        })
      })

      const data = await response.json()
      res.status(200).json(data)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  } else {
    res.status(405).json({ error: 'Método no permitido' })
  }
}
