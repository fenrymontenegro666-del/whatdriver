const axios = require('axios')
const WebSocket = require('ws')
const fs = require('fs')
const path = require('path')

/**
 * Cliente para interactuar con ComfyUI via API REST y WebSocket
 * Funciona con instancias locales o remotas de ComfyUI
 */
class ComfyUIClient {
  constructor(baseUrl = 'http://localhost:8188') {
    this.baseUrl = baseUrl
    this.clientId = this.generateClientId()
    this.ws = null
  }

  generateClientId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * Conectar al WebSocket de ComfyUI para recibir actualizaciones
   */
  async connectWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws
    }

    const wsUrl = this.baseUrl.replace('http', 'ws') + `/ws?clientId=${this.clientId}`
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl)
      
      this.ws.on('open', () => {
        console.log('✅ WebSocket conectado a ComfyUI')
        resolve(this.ws)
      })
      
      this.ws.on('error', (error) => {
        console.error('❌ Error WebSocket:', error.message)
        reject(error)
      })
      
      this.ws.on('close', () => {
        console.log('🔌 WebSocket cerrado')
        this.ws = null
      })
      
      this.ws.on('message', (data) => {
        const message = JSON.parse(data)
        this.handleWebSocketMessage(message)
      })
    })
  }

  handleWebSocketMessage(message) {
    // Implementar handler para mensajes de progreso
    if (message.type === 'progress') {
      console.log(`📊 Progreso: ${message.data.value}/${message.data.max}`)
    }
    if (message.type === 'executing') {
      if (!message.data.node) {
        console.log('✅ Generación completada')
      }
    }
  }

  /**
   * Obtener workflows preconfigurados para diferentes modos
   */
  
  async getTextToVideoWorkflow(model, prompt) {
    // Workflow para CogVideoX o AnimateDiff
    // Este es un ejemplo - debes cargar tu workflow JSON real desde ComfyUI
    
    if (model === 'cogvideox') {
      return {
        "3": {
          "class_type": "CogVideoXLoader",
          "inputs": {
            "model": "THUDM/CogVideoX-5b",
            "precision": "fp16"
          }
        },
        "4": {
          "class_type": "CLIPTextEncode",
          "inputs": {
            "text": prompt,
            "clip": ["3", 1]
          }
        },
        "5": {
          "class_type": "CogVideoXSampler",
          "inputs": {
            "prompt": ["4", 0],
            "model": ["3", 0],
            "frames": 49,
            "steps": 50,
            "cfg": 7.0,
            "seed": Math.floor(Math.random() * 1000000)
          }
        },
        "6": {
          "class_type": "VideoSave",
          "inputs": {
            "filename_prefix": "voidmx_generated",
            "format": "video/h264-mp4",
            "images": ["5", 0]
          }
        }
      }
    }

    // AnimateDiff workflow
    return {
      "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
          "ckpt_name": "sd_v1.5.ckpt"
        }
      },
      "2": {
        "class_type": "AnimateDiffLoader",
        "inputs": {
          "model": ["1", 0],
          "motion_model": "mm_sd_v15_v2.ckpt"
        }
      },
      "3": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "text": prompt,
          "clip": ["2", 1]
        }
      },
      "4": {
        "class_type": "KSampler",
        "inputs": {
          "positive": ["3", 0],
          "negative": ["5", 0],
          "noise_seed": Math.floor(Math.random() * 1000000),
          "steps": 20,
          "cfg": 7.5,
          "sampler_name": "euler_a",
          "scheduler": "normal",
          "latent_image": ["6", 0],
          "model": ["2", 0]
        }
      },
      "5": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "text": "bad quality, worst quality",
          "clip": ["1", 1]
        }
      },
      "6": {
        "class_type": "EmptyLatentImage",
        "inputs": {
          "width": 512,
          "height": 512,
          "batch_size": 16
        }
      },
      "7": {
        "class_type": "VAEDecode",
        "inputs": {
          "samples": ["4", 0],
          "vae": ["1", 2]
        }
      },
      "8": {
        "class_type": "VideoCombine",
        "inputs": {
          "frame_rate": 8,
          "loop_count": 0,
          "filename_prefix": "voidmx_animatediff",
          "format": "video/h264-mp4",
          "images": ["7", 0]
        }
      }
    }
  }

  async getImageToVideoWorkflow(model, prompt, imagePath) {
    // Workflow para Stable Video Diffusion
    return {
      "1": {
        "class_type": "SVDLoader",
        "inputs": {
          "svd_checkpoint": "stabilityai/stable-video-diffusion-img2vid-xt",
          "precision": "fp16"
        }
      },
      "2": {
        "class_type": "LoadImage",
        "inputs": {
          "image": path.basename(imagePath),
          "upload": "image"
        }
      },
      "3": {
        "class_type": "SVDEncode",
        "inputs": {
          "image": ["2", 0],
          "svd": ["1", 0]
        }
      },
      "4": {
        "class_type": "SVDSampler",
        "inputs": {
          "cond": ["3", 0],
          "uncond": ["3", 1],
          "svd": ["1", 0],
          "frames": 25,
          "steps": 20,
          "min_cfg": 1.0,
          "max_cfg": 3.0,
          "seed": Math.floor(Math.random() * 1000000)
        }
      },
      "5": {
        "class_type": "SVDDecode",
        "inputs": {
          "samples": ["4", 0],
          "svd": ["1", 0]
        }
      },
      "6": {
        "class_type": "VideoSave",
        "inputs": {
          "filename_prefix": "voidmx_img2vid",
          "format": "video/h264-mp4",
          "images": ["5", 0]
        }
      }
    }
  }

  async getVideoToVideoWorkflow(model, prompt, videoPath) {
    // Workflow para Video-to-Video con ControlNet o AnimateDiff
    return {
      "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
          "ckpt_name": "sd_v1.5.ckpt"
        }
      },
      "2": {
        "class_type": "LoadVideo",
        "inputs": {
          "video": path.basename(videoPath),
          "frame_load_cap": 16
        }
      },
      "3": {
        "class_type": "ControlNetLoader",
        "inputs": {
          "control_net_name": "control_v1p_sd15_qrcode_monster.safetensors"
        }
      },
      "4": {
        "class_type": "ControlNetApplyAdvanced",
        "inputs": {
          "positive": ["7", 0],
          "negative": ["8", 0],
          "control_net": ["3", 0],
          "image": ["2", 0],
          "strength": 0.8,
          "start_percent": 0.0,
          "end_percent": 1.0
        }
      },
      "5": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "text": prompt,
          "clip": ["1", 1]
        }
      },
      "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "text": "bad quality, distorted",
          "clip": ["1", 1]
        }
      },
      "7": {
        "class_type": "KSampler",
        "inputs": {
          "positive": ["5", 0],
          "negative": ["6", 0],
          "noise_seed": Math.floor(Math.random() * 1000000),
          "steps": 20,
          "cfg": 7.5,
          "sampler_name": "euler_a",
          "scheduler": "normal",
          "latent_image": ["9", 0],
          "model": ["1", 0]
        }
      },
      "8": {
        "class_type": "VAEDecode",
        "inputs": {
          "samples": ["7", 0],
          "vae": ["1", 2]
        }
      },
      "9": {
        "class_type": "VideoCombine",
        "inputs": {
          "frame_rate": 8,
          "loop_count": 0,
          "filename_prefix": "voidmx_vid2vid",
          "format": "video/h264-mp4",
          "images": ["8", 0]
        }
      }
    }
  }

  async getAudioToVideoWorkflow(model, prompt, audioPath) {
    // Workflow para Audio-reactive video generation
    return {
      "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
          "ckpt_name": "sd_v1.5.ckpt"
        }
      },
      "2": {
        "class_type": "LoadAudio",
        "inputs": {
          "audio": audioPath ? path.basename(audioPath) : null
        }
      },
      "3": {
        "class_type": "AudioReactiveNoise",
        "inputs": {
          "audio": ["2", 0],
          "sensitivity": 1.5
        }
      },
      "4": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "text": prompt,
          "clip": ["1", 1]
        }
      },
      "5": {
        "class_type": "KSampler",
        "inputs": {
          "positive": ["4", 0],
          "negative": ["6", 0],
          "noise_seed": Math.floor(Math.random() * 1000000),
          "steps": 20,
          "cfg": 7.5,
          "sampler_name": "euler_a",
          "scheduler": "normal",
          "latent_image": ["3", 0],
          "model": ["1", 0]
        }
      },
      "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "text": "bad quality",
          "clip": ["1", 1]
        }
      },
      "7": {
        "class_type": "VAEDecode",
        "inputs": {
          "samples": ["5", 0],
          "vae": ["1", 2]
        }
      },
      "8": {
        "class_type": "VideoCombine",
        "inputs": {
          "frame_rate": 30,
          "loop_count": 0,
          "filename_prefix": "voidmx_audio_reactive",
          "format": "video/h264-mp4",
          "images": ["7", 0],
          "audio": ["2", 0]
        }
      }
    }
  }

  /**
   * Enviar prompt a la cola de ComfyUI
   */
  async queuePrompt(workflow) {
    try {
      const response = await axios.post(`${this.baseUrl}/prompt`, {
        prompt: workflow,
        client_id: this.clientId
      })
      
      console.log('✅ Prompt encolado:', response.data.prompt_id)
      return response.data
    } catch (error) {
      console.error('❌ Error encolando prompt:', error.response?.data || error.message)
      throw new Error(`ComfyUI API Error: ${error.message}`)
    }
  }

  /**
   * Obtener estado de un prompt
   */
  async getPromptStatus(promptId) {
    try {
      const response = await axios.get(`${this.baseUrl}/history/${promptId}`)
      const history = response.data[promptId]
      
      if (!history) {
        return { status: 'pending', progress: 0 }
      }

      if (history.status && history.status.completed) {
        return { 
          status: 'completed', 
          progress: 100,
          output: history.outputs
        }
      }

      return { status: 'processing', progress: 50 }
    } catch (error) {
      return { status: 'unknown', error: error.message }
    }
  }

  /**
   * Obtener modelos disponibles en ComfyUI
   */
  async getAvailableModels() {
    try {
      const response = await axios.get(`${this.baseUrl}/object_info`)
      const objectInfo = response.data
      
      // Extraer información de checkpoints y modelos
      const checkpoints = objectInfo.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || []
      
      return {
        checkpoints,
        total_models: checkpoints.length
      }
    } catch (error) {
      return { error: error.message, checkpoints: [] }
    }
  }

  /**
   * Subir archivo a ComfyUI
   */
  async uploadFile(filePath, type = 'image') {
    const formData = new FormData()
    formData.append('image', fs.createReadStream(filePath))

    try {
      const response = await axios.post(`${this.baseUrl}/upload/${type}`, formData, {
        headers: formData.getHeaders()
      })
      return response.data
    } catch (error) {
      throw new Error(`Error subiendo archivo: ${error.message}`)
    }
  }

  /**
   * Descargar resultado generado
   */
  async downloadOutput(filename, savePath) {
    try {
      const response = await axios.get(`${this.baseUrl}/view?filename=${filename}`, {
        responseType: 'stream'
      })
      
      const writer = fs.createWriteStream(savePath)
      response.data.pipe(writer)
      
      return new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
      })
    } catch (error) {
      throw new Error(`Error descargando: ${error.message}`)
    }
  }

  /**
   * Cerrar conexión WebSocket
   */
  close() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

module.exports = ComfyUIClient
