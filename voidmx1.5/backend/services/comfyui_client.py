#!/usr/bin/env python3
"""
Cliente Python para ComfyUI - Generación de Video sin APIs de pago
===============================================================

Este script permite conectar tu aplicación web voidmx1.5 con una instancia
de ComfyUI (local o remota) para generar videos usando modelos open-source:

- Texto a Video: CogVideoX, AnimateDiff
- Imagen a Video: Stable Video Diffusion (SVD)
- Video a Video: ControlNet + AnimateDiff
- Audio a Video: Modelos audio-reactivos

INSTALACIÓN:
------------
pip install websocket-client requests

USO:
----
python comfyui_client.py --url http://tu-comfyui-remoto:8188 --mode text-to-video --prompt "un gato bailando"

CONFIGURACIÓN DE COMFYUI REMOTO:
---------------------------------
1. En tu servidor con ComfyUI, ejecuta:
   python main.py --listen 0.0.0.0 --port 8188

2. Asegúrate de tener los modelos instalados:
   - CogVideoX: https://huggingface.co/THUDM/CogVideoX-5b
   - SVD: https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt
   - AnimateDiff: https://huggingface.co/guoyww/animatediff

3. Instala los custom nodes necesarios en ComfyUI:
   - ComfyUI-VideoHelperSuite
   - AnimateDiff-Evolved
   - ComfyUI-CogVideoXWrapper
"""

import argparse
import json
import uuid
import time
import requests
from websocket import create_connection
from urllib.parse import urljoin
import os

class ComfyUIClient:
    """Cliente para interactuar con la API de ComfyUI"""
    
    def __init__(self, base_url='http://localhost:8188'):
        self.base_url = base_url.rstrip('/')
        self.client_id = str(uuid.uuid4())
        self.ws = None
        
    def connect_ws(self):
        """Conectar al WebSocket de ComfyUI"""
        ws_url = self.base_url.replace('http', 'ws').replace('https', 'wss')
        ws_url = f"{ws_url}/ws?clientId={self.client_id}"
        
        try:
            self.ws = create_connection(ws_url)
            print(f"✅ WebSocket conectado: {ws_url}")
            return True
        except Exception as e:
            print(f"❌ Error conectando WebSocket: {e}")
            return False
    
    def disconnect_ws(self):
        """Cerrar conexión WebSocket"""
        if self.ws:
            self.ws.close()
            self.ws = None
            print("🔌 WebSocket cerrado")
    
    def queue_prompt(self, workflow):
        """Enviar workflow a la cola de ComfyUI"""
        url = f"{self.base_url}/prompt"
        payload = {
            "prompt": workflow,
            "client_id": self.client_id
        }
        
        try:
            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()
            result = response.json()
            print(f"✅ Prompt encolado: {result.get('prompt_id')}")
            return result
        except Exception as e:
            print(f"❌ Error encolando prompt: {e}")
            return None
    
    def get_history(self, prompt_id):
        """Obtener historial de un prompt"""
        url = f"{self.base_url}/history/{prompt_id}"
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.json().get(prompt_id, {})
        except Exception as e:
            print(f"Error obteniendo historial: {e}")
            return {}
    
    def get_image(self, filename, subfolder, folder_type):
        """Descargar imagen/video generado"""
        params = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        url = f"{self.base_url}/view"
        
        try:
            response = requests.get(url, params=params, timeout=60)
            response.raise_for_status()
            
            # Guardar archivo
            output_path = f"./output_{filename}"
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            print(f"✅ Archivo guardado: {output_path}")
            return output_path
        except Exception as e:
            print(f"❌ Error descargando archivo: {e}")
            return None
    
    def wait_for_completion(self, prompt_id, timeout=300):
        """Esperar a que la generación se complete"""
        start_time = time.time()
        print("⏳ Esperando completación...")
        
        while time.time() - start_time < timeout:
            history = self.get_history(prompt_id)
            
            if history and history.get('status', {}).get('completed', False):
                print("✅ ¡Generación completada!")
                return True
            
            # Escuchar mensajes del WebSocket
            if self.ws:
                try:
                    self.ws.settimeout(5)
                    message = self.ws.recv()
                    data = json.loads(message)
                    
                    if data.get('type') == 'progress':
                        value = data['data'].get('value', 0)
                        max_val = data['data'].get('max', 100)
                        print(f"📊 Progreso: {value}/{max_val}")
                    
                    elif data.get('type') == 'executing':
                        node = data['data'].get('node')
                        if node is None:
                            print("✅ Nodo final ejecutado")
                            
                except Exception:
                    pass  # Timeout del WebSocket, continuar
            
            time.sleep(1)
        
        print("⚠️ Timeout alcanzado")
        return False


def get_text_to_video_workflow(prompt, model='cogvideox'):
    """Workflow para Texto a Video"""
    
    if model == 'cogvideox':
        workflow = {
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
                    "seed": int(time.time() * 1000) % 1000000
                }
            },
            "6": {
                "class_type": "VideoCombine",
                "inputs": {
                    "frame_rate": 8,
                    "loop_count": 0,
                    "filename_prefix": "voidmx_cogvideox",
                    "format": "video/h264-mp4",
                    "images": ["5", 0]
                }
            }
        }
    else:  # AnimateDiff
        workflow = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "sd_v1.5.ckpt"}
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
                    "noise_seed": int(time.time() * 1000) % 1000000,
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
    
    return workflow


def get_image_to_video_workflow(prompt, image_path, model='svd'):
    """Workflow para Imagen a Video (Stable Video Diffusion)"""
    
    workflow = {
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
                "image": os.path.basename(image_path),
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
                "seed": int(time.time() * 1000) % 1000000
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
            "class_type": "VideoCombine",
            "inputs": {
                "frame_rate": 8,
                "loop_count": 0,
                "filename_prefix": "voidmx_svd",
                "format": "video/h264-mp4",
                "images": ["5", 0]
            }
        }
    }
    
    return workflow


def main():
    parser = argparse.ArgumentParser(description='Cliente ComfyUI para voidmx1.5')
    parser.add_argument('--url', default='http://localhost:8188',
                       help='URL de ComfyUI (default: http://localhost:8188)')
    parser.add_argument('--mode', choices=['text-to-video', 'image-to-video', 'video-to-video'],
                       default='text-to-video', help='Modo de generación')
    parser.add_argument('--prompt', required=True, help='Prompt de texto')
    parser.add_argument('--image', help='Ruta a imagen (para image-to-video)')
    parser.add_argument('--model', default='cogvideox',
                       help='Modelo: cogvideox, animatediff, svd')
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("🎬 voidmx1.5 - Cliente ComfyUI")
    print("=" * 60)
    print(f"📡 ComfyUI URL: {args.url}")
    print(f"🎯 Modo: {args.mode}")
    print(f"🤖 Modelo: {args.model}")
    print(f"📝 Prompt: {args.prompt[:50]}...")
    print("=" * 60)
    
    # Crear cliente
    client = ComfyUIClient(args.url)
    
    # Seleccionar workflow según modo
    if args.mode == 'text-to-video':
        workflow = get_text_to_video_workflow(args.prompt, args.model)
    elif args.mode == 'image-to-video':
        if not args.image:
            print("❌ Error: Se requiere --image para image-to-video")
            return
        workflow = get_image_to_video_workflow(args.prompt, args.image, args.model)
    else:
        print("❌ Modo no implementado aún")
        return
    
    # Conectar WebSocket
    if not client.connect_ws():
        print("⚠️ Continuando sin WebSocket...")
    
    # Enviar workflow
    result = client.queue_prompt(workflow)
    
    if result and 'prompt_id' in result:
        prompt_id = result['prompt_id']
        
        # Esperar completación
        if client.wait_for_completion(prompt_id):
            # Obtener resultado
            history = client.get_history(prompt_id)
            
            if history and 'outputs' in history:
                for node_id, output in history['outputs'].items():
                    if 'videos' in output:
                        for video in output['videos']:
                            client.get_image(
                                video['filename'],
                                video.get('subfolder', ''),
                                video.get('type', 'output')
                            )
        
        client.disconnect_ws()
    else:
        print("❌ Error enviando prompt")


if __name__ == '__main__':
    main()
