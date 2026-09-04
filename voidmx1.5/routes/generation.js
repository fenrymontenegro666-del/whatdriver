const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Configuración de ComfyUI
const COMFYUI_URL = process.env.COMFYUI_URL || 'http://localhost:8188';

/**
 * Endpoint para generar video desde texto (Text-to-Video)
 * Usa CogVideoX o AnimateDiff según configuración
 */
router.post('/text-to-video', async (req, res) => {
  try {
    const { prompt, negative_prompt = '', model = 'cogvideox', steps = 25, cfg_scale = 7.5 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'El prompt es requerido' });
    }

    // Workflow para Text-to-Video (CogVideoX/AnimateDiff)
    const workflow = {
      "3": {
        "inputs": {
          "seed": Math.floor(Math.random() * 1000000),
          "steps": parseInt(steps),
          "cfg": parseFloat(cfg_scale),
          "sampler_name": "euler",
          "scheduler": "normal",
          "denoise": 1,
          "model": model,
          "positive": prompt,
          "negative": negative_prompt
        },
        "class_type": "CogVideoXScheduler"
      },
      "4": {
        "inputs": {
          "text": prompt,
          "clip": "clip_l",
          "t5": "t5xxl"
        },
        "class_type": "CLIPTextEncode"
      },
      "8": {
        "inputs": {
          "samples": ["3", 0],
          "vae": ["5", 0]
        },
        "class_type": "VAEDecode"
      },
      "9": {
        "inputs": {
          "filename_prefix": "voidmx_video",
          "images": ["8", 0]
        },
        "class_type": "SaveAnimatedWEBP"
      }
    };

    const result = await sendToComfyUI(workflow);
    res.json({ success: true, video_url: result.video_url, message: 'Video generado exitosamente' });

  } catch (error) {
    console.error('Error en text-to-video:', error.message);
    res.status(500).json({ error: 'Error al generar video desde texto', details: error.message });
  }
});

/**
 * Endpoint para generar video desde imagen (Image-to-Video)
 * Usa Stable Video Diffusion
 */
router.post('/image-to-video', async (req, res) => {
  try {
    const { image_url, prompt = '', motion_bucket_id = 127, fps = 6 } = req.body;

    if (!image_url) {
      return res.status(400).json({ error: 'La URL de la imagen es requerida' });
    }

    // Descargar imagen temporalmente
    const tempImagePath = path.join(__dirname, '../uploads', `temp_${Date.now()}.jpg`);
    const response = await axios.get(image_url, { responseType: 'arraybuffer' });
    fs.writeFileSync(tempImagePath, response.data);

    // Workflow para Image-to-Video (Stable Video Diffusion)
    const workflow = {
      "3": {
        "inputs": {
          "seed": Math.floor(Math.random() * 1000000),
          "steps": 20,
          "cfg": 2.5,
          "sampler_name": "euler",
          "scheduler": "karras",
          "motion_bucket_id": parseInt(motion_bucket_id),
          "fps": parseInt(fps),
          "augmentation_level": 0.3
        },
        "class_type": "SVD_img2vid_Conditioning"
      },
      "4": {
        "inputs": {
          "image": tempImagePath
        },
        "class_type": "LoadImage"
      },
      "7": {
        "inputs": {
          "samples": ["3", 0],
          "vae": ["5", 0]
        },
        "class_type": "VAEDecode"
      },
      "9": {
        "inputs": {
          "filename_prefix": "voidmx_img2vid",
          "images": ["7", 0]
        },
        "class_type": "SaveAnimatedWEBP"
      }
    };

    const result = await sendToComfyUI(workflow);
    
    // Limpiar archivo temporal
    fs.unlinkSync(tempImagePath);
    
    res.json({ success: true, video_url: result.video_url, message: 'Video generado desde imagen exitosamente' });

  } catch (error) {
    console.error('Error en image-to-video:', error.message);
    if (fs.existsSync(path.join(__dirname, '../uploads', `temp_${Date.now()}.jpg`))) {
      try { fs.unlinkSync(path.join(__dirname, '../uploads', `temp_${Date.now()}.jpg`)); } catch(e) {}
    }
    res.status(500).json({ error: 'Error al generar video desde imagen', details: error.message });
  }
});

/**
 * Endpoint para generar video desde video (Video-to-Video)
 * Usa ControlNet + AnimateDiff
 */
router.post('/video-to-video', async (req, res) => {
  try {
    const { video_url, prompt = '', strength = 0.7, model = 'animatediff' } = req.body;

    if (!video_url) {
      return res.status(400).json({ error: 'La URL del video es requerida' });
    }

    // Workflow para Video-to-Video
    const workflow = {
      "3": {
        "inputs": {
          "seed": Math.floor(Math.random() * 1000000),
          "steps": 20,
          "cfg": 7,
          "sampler_name": "euler",
          "scheduler": "normal",
          "denoise": parseFloat(strength),
          "model": model
        },
        "class_type": "AnimateDiffApply"
      },
      "4": {
        "inputs": {
          "video": video_url
        },
        "class_type": "VideoLoad"
      },
      "8": {
        "inputs": {
          "samples": ["3", 0],
          "vae": ["5", 0]
        },
        "class_type": "VAEDecode"
      },
      "9": {
        "inputs": {
          "filename_prefix": "voidmx_vid2vid",
          "images": ["8", 0]
        },
        "class_type": "SaveAnimatedWEBP"
      }
    };

    const result = await sendToComfyUI(workflow);
    res.json({ success: true, video_url: result.video_url, message: 'Video transformado exitosamente' });

  } catch (error) {
    console.error('Error en video-to-video:', error.message);
    res.status(500).json({ error: 'Error al transformar video', details: error.message });
  }
});

/**
 * Endpoint para generar video desde audio (Audio-to-Video)
 * Usa modelos audio-reactivos
 */
router.post('/audio-to-video', async (req, res) => {
  try {
    const { audio_url, prompt = '', style = 'abstract' } = req.body;

    if (!audio_url) {
      return res.status(400).json({ error: 'La URL del audio es requerida' });
    }

    // Workflow para Audio-to-Video
    const workflow = {
      "3": {
        "inputs": {
          "seed": Math.floor(Math.random() * 1000000),
          "steps": 25,
          "cfg": 7,
          "audio_file": audio_url,
          "style": style,
          "reactivity": 0.8
        },
        "class_type": "AudioReactiveAnimation"
      },
      "8": {
        "inputs": {
          "samples": ["3", 0],
          "vae": ["5", 0]
        },
        "class_type": "VAEDecode"
      },
      "9": {
        "inputs": {
          "filename_prefix": "voidmx_aud2vid",
          "images": ["8", 0]
        },
        "class_type": "SaveAnimatedWEBP"
      }
    };

    const result = await sendToComfyUI(workflow);
    res.json({ success: true, video_url: result.video_url, message: 'Video generado desde audio exitosamente' });

  } catch (error) {
    console.error('Error en audio-to-video:', error.message);
    res.status(500).json({ error: 'Error al generar video desde audio', details: error.message });
  }
});

/**
 * Función auxiliar para enviar workflow a ComfyUI
 */
async function sendToComfyUI(workflow) {
  try {
    // Enviar prompt a ComfyUI
    const promptResponse = await axios.post(`${COMFYUI_URL}/prompt`, {
      prompt: workflow
    });

    const promptId = promptResponse.data.prompt_id;

    // Esperar a que se complete la generación (polling)
    let status = 'pending';
    let resultUrl = null;
    const maxAttempts = 60; // 60 segundos máximo
    let attempts = 0;

    while (status === 'pending' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
      
      const historyResponse = await axios.get(`${COMFYUI_URL}/history/${promptId}`);
      const history = historyResponse.data;

      if (history && history[promptId]) {
        const outputs = history[promptId].outputs;
        for (const nodeId in outputs) {
          const output = outputs[nodeId];
          if (output.images) {
            const image = output.images[0];
            if (image.filename && image.subfolder) {
              resultUrl = `${COMFYUI_URL}/view?filename=${image.filename}&subfolder=${image.subfolder}`;
              status = 'completed';
              break;
            } else if (image.url) {
              resultUrl = image.url;
              status = 'completed';
              break;
            }
          }
        }
      }
      
      attempts++;
    }

    if (status !== 'completed' || !resultUrl) {
      throw new Error('Tiempo de espera agotado o error en la generación');
    }

    return { video_url: resultUrl };

  } catch (error) {
    console.error('Error al comunicar con ComfyUI:', error.message);
    throw new Error(`ComfyUI error: ${error.message}`);
  }
}

module.exports = router;
