const express = require('express')
const axios = require('axios')
const path = require('path')
const fs = require('fs')
const ComfyUIClient = require('../services/comfyuiClient')

const router = express.Router()
const comfyui = new ComfyUIClient(process.env.COMFYUI_URL || 'http://localhost:8188')

/**
 * POST /api/generate
 * Endpoint principal para generación de video
 * 
 * Body params:
 * - prompt: string (requerido)
 * - mode: 'text-to-video' | 'image-to-video' | 'video-to-video' | 'audio-to-video'
 * - model: 'cogvideox' | 'animatediff' | 'svd' | 'custom'
 * 
 * Files:
 * - image: archivo opcional para image-to-video o video-to-video
 * - video: archivo opcional para video-to-video
 * - audio: archivo opcional para audio-to-video
 */
router.post('/', async (req, res) => {
  const { prompt, mode = 'text-to-video', model = 'cogvideox' } = req.body
  const files = req.files || {}
  const userId = req.user?.id || 'anonymous'

  try {
    console.log(`📥 Solicitud recibida: ${mode} con ${model}`)
    console.log(`👤 Usuario: ${userId}`)
    console.log(`📝 Prompt: ${prompt?.substring(0, 50)}...`)

    // Validar prompt
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ 
        error: 'El prompt es requerido',
        message: 'Debes proporcionar una descripción para generar el video'
      })
    }

    // Preparar paths de archivos si existen
    const imagePath = files.image?.[0]?.path || null
    const videoPath = files.video?.[0]?.path || null
    const audioPath = files.audio?.[0]?.path || null

    // Seleccionar workflow según el modo y modelo
    let workflow
    switch (mode) {
      case 'text-to-video':
        workflow = await comfyui.getTextToVideoWorkflow(model, prompt)
        break
      
      case 'image-to-video':
        if (!imagePath) {
          return res.status(400).json({ 
            error: 'Imagen requerida',
            message: 'El modo image-to-video requiere una imagen de entrada'
          })
        }
        workflow = await comfyui.getImageToVideoWorkflow(model, prompt, imagePath)
        break
      
      case 'video-to-video':
        if (!videoPath) {
          return res.status(400).json({ 
            error: 'Video requerido',
            message: 'El modo video-to-video requiere un video de entrada'
          })
        }
        workflow = await comfyui.getVideoToVideoWorkflow(model, prompt, videoPath)
        break
      
      case 'audio-to-video':
        workflow = await comfyui.getAudioToVideoWorkflow(model, prompt, audioPath)
        break
      
      default:
        return res.status(400).json({ 
          error: 'Modo inválido',
          message: 'Modos disponibles: text-to-video, image-to-video, video-to-video, audio-to-video'
        })
    }

    // Enviar a ComfyUI
    console.log('🚀 Enviando a ComfyUI...')
    const result = await comfyui.queuePrompt(workflow)

    // Responder inmediatamente con el ID del proceso
    res.json({
      success: true,
      message: 'Video en proceso de generación',
      prompt_id: result.prompt_id,
      status: 'processing',
      estimated_time: '30-120 segundos',
      mode,
      model
    })

    // NOTA: En producción, aquí implementarías webhooks o polling
    // para notificar cuando el video esté listo

  } catch (error) {
    console.error('❌ Error en generación:', error.message)
    
    res.status(500).json({
      error: 'Error en la generación',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

/**
 * GET /api/generate/status/:prompt_id
 * Verificar el estado de una generación
 */
router.get('/status/:prompt_id', async (req, res) => {
  const { prompt_id } = req.params

  try {
    const status = await comfyui.getPromptStatus(prompt_id)
    
    res.json({
      prompt_id,
      status: status.status,
      progress: status.progress,
      output: status.output
    })
  } catch (error) {
    res.status(500).json({
      error: 'Error obteniendo estado',
      message: error.message
    })
  }
})

/**
 * GET /api/generate/models
 * Obtener modelos disponibles
 */
router.get('/models', async (req, res) => {
  try {
    const models = await comfyui.getAvailableModels()
    
    res.json({
      models,
      modes: {
        'text-to-video': ['CogVideoX', 'AnimateDiff', 'ModelScope'],
        'image-to-video': ['Stable Video Diffusion', 'Image Reward'],
        'video-to-video': ['AnimateDiff V2', 'ControlNet Video'],
        'audio-to-video': ['Audio Reactive', 'Music Visualization']
      }
    })
  } catch (error) {
    res.status(500).json({
      error: 'Error obteniendo modelos',
      message: error.message
    })
  }
})

module.exports = router
