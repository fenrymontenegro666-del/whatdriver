const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const FormData = require('form-data');

const app = express();
app.use(express.json());

// =======================================================
// 🟢 TUS CREDENCIALES (YA ESTÁN LISTAS)
// =======================================================

// 1. SUPABASE
const SUPABASE_URL = 'https://lrnckuzrqhvrfwnvhjwu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxybmNrdXpycWh2cmZ3bnZoand1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE5ODAwOSwiZXhwIjoyMDc5Nzc0MDA5fQ.Lr_e_uJ9_rCjbKtod6MXofP-IPSahau3QCMn4aF-lrI';

// 2. WHATSAPP TOKEN (Meta)
const WA_TOKEN = 'EAAVAI8ZB5QCcBQOIsRbfTdWaEe0DmpPbCd1KIppgWjBmwSEEV9zcP0UeGa0V18TnXodYeFB6hzBXgVyyupt7778ZA8sF0Wgtso7my65J4ZAwZAsGmkbo7qRZBrZB8ZBzW49oRO1aornuQ5oy9DgUkzh2TgtZCZBfw0b8TnAbUoCU5D4ze5d9b5lG85EdlU9SOmllrOQZDZD';

// 3. WHATSAPP PHONE ID
const WA_PHONE_ID = '922315284298371'; 

// 4. CONFIGURACIÓN
const VERIFY_TOKEN = 'MI_TOKEN_SECRETO'; 
const PRECIO_POR_KM = 10; // Precio por kilómetro en pesos

// =======================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 1. ENVIAR MENSAJES A WHATSAPP ---
async function sendWhatsApp(to, text, imageUrl = null) {
    try {
        const body = { messaging_product: "whatsapp", recipient_type: "individual", to: to };
        if (imageUrl) { 
            body.type = "image"; 
            body.image = { link: imageUrl, caption: text }; 
        } else { 
            body.type = "text"; 
            body.text = { body: text }; 
        }
        await axios.post(`https://graph.facebook.com/v17.0/${WA_PHONE_ID}/messages`, body, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
    } catch (e) { 
        console.error("Error enviando WA:", e.response ? e.response.data : e.message); 
    }
}

// --- 2. SUBIR FOTOS (De WhatsApp a Supabase) ---
async function handleImageUpload(mediaId) {
    try {
        // Obtener URL de descarga
        const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
        const mediaUrl = urlRes.data.url;
        
        // Descargar imagen
        const imageRes = await axios.get(mediaUrl, { headers: { Authorization: `Bearer ${WA_TOKEN}` }, responseType: 'arraybuffer' });
        
        // Subir a Supabase
        const fileName = `foto_${Date.now()}.jpg`;
        await supabase.storage.from('photos').upload(fileName, imageRes.data, { contentType: 'image/jpeg' });
        
        // Obtener URL pública
        const { data } = supabase.storage.from('photos').getPublicUrl(fileName);
        return data.publicUrl;
    } catch (e) { 
        console.error("Error subiendo foto:", e);
        return null; 
    }
}

// --- 3. GEOLOCALIZACIÓN (Buscar direcciones) ---
async function getCoordinates(query) {
    try {
        // Busca específicamente en Hermosillo, México
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Hermosillo, Mexico')}`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'GoDriverBot/1.0' } });
        if (res.data && res.data.length > 0) {
            return { lat: res.data[0].lat, lon: res.data[0].lon, name: res.data[0].display_name };
        }
        return null;
    } catch (e) { return null; }
}

// --- 4. CALCULAR PRECIO (Distancia real manejando) ---
async function getRoutePrice(origin, dest) {
    try {
        const url = `http://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?overview=false`;
        const res = await axios.get(url);
        if (res.data.routes && res.data.routes.length > 0) {
            const km = (res.data.routes[0].distance / 1000).toFixed(1);
            let price = Math.ceil(km * PRECIO_POR_KM);
            if (price < 35) price = 35; // Tarifa mínima de 35 pesos
            return { km, price };
        }
        return null;
    } catch (e) { return null; }
}

// --- SERVIDOR WEBHOOK (Lo que conecta con Facebook) ---

// Verificación inicial
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

// Recibir mensajes
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        // Validar que sea un mensaje de WhatsApp
        if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages) {
            const msg = body.entry[0].changes[0].value.messages[0];
            const from = msg.from; // Número del usuario
            const type = msg.type; // Tipo de mensaje (texto, imagen, ubicación)
            const name = body.entry[0].changes[0].value.contacts[0].profile.name;
            
            // Verificar si el usuario ya existe en la Base de Datos
            let { data: driver } = await supabase.from('drivers').select('*').eq('phone', from).single();

            // ====================================================
            // A. LÓGICA DE REGISTRO DE CONDUCTOR (Paso a Paso)
            // ====================================================
            if (driver && driver.registration_step > 0 && driver.registration_step < 4) {
                // Paso 1: Pidió nombre, recibimos nombre
                if (driver.registration_step === 1 && type === 'text') {
                    await supabase.from('drivers').update({ name: msg.text.body, registration_step: 2 }).eq('phone', from);
                    await sendWhatsApp(from, "🚘 Excelente. ¿Qué modelo de auto conduces? (Ej: Nissan Versa 2022)");
                } 
                // Paso 2: Pidió auto, recibimos auto
                else if (driver.registration_step === 2 && type === 'text') {
                    await supabase.from('drivers').update({ car_model: msg.text.body, registration_step: 3 }).eq('phone', from);
                    await sendWhatsApp(from, "📸 ¡Último paso! Envía una FOTO TUYA (Selfie) para tu perfil.");
                } 
                // Paso 3: Pidió foto, recibimos imagen
                else if (driver.registration_step === 3 && type === 'image') {
                    await sendWhatsApp(from, "⏳ Subiendo foto al sistema, un momento...");
                    const url = await handleImageUpload(msg.image.id);
                    if (url) {
                        await supabase.from('drivers').update({ photo_url: url, registration_step: 4, active: true }).eq('phone', from);
                        await sendWhatsApp(from, "✅ ¡REGISTRO EXITOSO!\n\nYa apareces activo en el Panel de Administración. Te avisaremos cuando caiga un viaje.", url);
                    } else {
                        await sendWhatsApp(from, "❌ Error al subir la foto. Intenta enviarla de nuevo.");
                    }
                }
                return res.sendStatus(200);
            }

            // ====================================================
            // B. MENSAJES DE TEXTO (Comandos)
            // ====================================================
            if (type === 'text') {
                const txt = msg.text.body.toLowerCase();
                
                // Opción 1: Iniciar Registro Conductor
                if (txt.includes('conductor') || txt.includes('trabajar')) {
                    if (!driver) {
                        await supabase.from('drivers').insert({ phone: from, registration_step: 1 });
                        await sendWhatsApp(from, "👋 ¡Hola! Bienvenido al sistema de conductores.\n\nPara registrarte, dime: ¿Cuál es tu nombre completo?");
                    } else {
                        await sendWhatsApp(from, "✅ Ya tienes una cuenta de conductor activa.");
                    }
                } 
                // Opción 2: Pedir Viaje (Usuario)
                else if (txt.includes('ir a') || txt.includes('llevame a')) {
                    const destinoRaw = txt.split(/ir a|llevame a/)[1];
                    if (destinoRaw) {
                        const destino = destinoRaw.trim();
                        await sendWhatsApp(from, `🔍 Buscando ubicación: "${destino}"...`);
                        
                        // Buscar coordenadas
                        const coords = await getCoordinates(destino);
                        
                        if (coords) {
                            // Guardar borrador de solicitud
                            await supabase.from('requests').insert({
                                user_phone: from, user_name: name, destination: coords.name, 
                                lat: coords.lat, lng: coords.lon, status: 'draft'
                            });
                            await sendWhatsApp(from, `📍 Destino encontrado: ${coords.name}.\n\n📎 Para darte precio exacto, por favor **envía tu Ubicación Actual** (📎 Clip -> Ubicación).`);
                        } else {
                            await sendWhatsApp(from, "❌ No pude encontrar ese lugar. Intenta con un nombre más conocido, tienda o colonia.");
                        }
                    }
                } else {
                    // Menú por defecto
                    await sendWhatsApp(from, "🤖 **GoDriver Bot**\n\n🚕 Si quieres trabajar, escribe: *'Quiero ser conductor'*\n📍 Si quieres viajar, escribe: *'Quiero ir a [Destino]'*");
                }
            } 
            
            // ====================================================
            // C. RECIBIR UBICACIÓN (Para cotizar el viaje)
            // ====================================================
            else if (type === 'location') {
                // Buscar si hay una solicitud pendiente (draft)
                const { data: draft } = await supabase.from('requests').select('*').eq('user_phone', from).eq('status', 'draft').limit(1).single();
                
                if (draft) {
                    const origin = { lat: msg.location.latitude, lon: msg.location.longitude };
                    const dest = { lat: draft.lat, lon: draft.lng };
                    
                    // Calcular precio
                    const ruta = await getRoutePrice(origin, dest);
                    if (ruta) {
                        // Guardamos solicitud real visible en el panel
                        await supabase.from('requests').update({ 
                            origin: 'Ubicación WhatsApp', distance_km: ruta.km, price: ruta.price, status: 'pending' 
                        }).eq('id', draft.id);
                        
                        // Notificamos al usuario
                        await sendWhatsApp(from, `✅ **¡Solicitud Recibida!**\n\n📍 Destino: ${draft.destination}\n📏 Distancia: ${ruta.km} km\n💰 **PRECIO: $${ruta.price} MXN**\n\n⏳ Hemos enviado tu solicitud a los conductores cercanos...`);
                    }
                } else {
                    await sendWhatsApp(from, "Primero dime a dónde vas (Escribe: 'Quiero ir a...')");
                }
            }
        }
    } catch (e) {
        console.error("Error en el servidor:", e);
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));