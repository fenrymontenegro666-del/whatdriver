const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const FormData = require('form-data');

const app = express();
app.use(express.json());

// =======================================================
// 🟢 TUS CREDENCIALES FINALES
// =======================================================

const SUPABASE_URL = 'https://lrnckuzrqhvrfwnvhjwu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxybmNrdXpycWh2cmZ3bnZoand1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE5ODAwOSwiZXhwIjoyMDc5Nzc0MDA5fQ.Lr_e_uJ9_rCjbKtod6MXofP-IPSahau3QCMn4aF-lrI';

// TU TOKEN DEFINITIVO
const WA_TOKEN = 'EAAVAI8ZB5QCcBQOIsRbfTdWaEe0DmpPbCd1KIppgWjBmwSEEV9zcP0UeGa0V18TnXodYeFB6hzBXgVyyupt7778ZA8sF0Wgtso7my65J4ZAwZAsGmkbo7qRZBrZB8ZBzW49oRO1aornuQ5oy9DgUkzh2TgtZCZBfw0b8TnAbUoCU5D4ze5d9b5lG85EdlU9SOmllrOQZDZD';

const WA_PHONE_ID = '922315284298371'; 
const VERIFY_TOKEN = 'MI_TOKEN_SECRETO'; 
const PRECIO_POR_KM = 10; 

// =======================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 1. ENVIAR MENSAJES ---
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

// --- 2. SUBIR FOTOS ---
async function handleImageUpload(mediaId) {
    try {
        const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
        const mediaUrl = urlRes.data.url;
        const imageRes = await axios.get(mediaUrl, { headers: { Authorization: `Bearer ${WA_TOKEN}` }, responseType: 'arraybuffer' });
        
        const fileName = `foto_${Date.now()}.jpg`;
        await supabase.storage.from('photos').upload(fileName, imageRes.data, { contentType: 'image/jpeg' });
        
        const { data } = supabase.storage.from('photos').getPublicUrl(fileName);
        return data.publicUrl;
    } catch (e) { return null; }
}

// --- 3. GEO Y RUTA ---
async function getCoordinates(query) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Hermosillo, Mexico')}`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'GoDriverBot/1.0' } });
        if (res.data && res.data.length > 0) return { lat: res.data[0].lat, lon: res.data[0].lon, name: res.data[0].display_name };
        return null;
    } catch (e) { return null; }
}

async function getRoutePrice(origin, dest) {
    try {
        const url = `http://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?overview=false`;
        const res = await axios.get(url);
        if (res.data.routes && res.data.routes.length > 0) {
            const km = (res.data.routes[0].distance / 1000).toFixed(1);
            let price = Math.ceil(km * PRECIO_POR_KM);
            if (price < 35) price = 35; 
            return { km, price };
        }
        return null;
    } catch (e) { return null; }
}

// --- SERVIDOR ---
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.send(req.query['hub.challenge']);
    else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages) {
            const msg = body.entry[0].changes[0].value.messages[0];
            
            // 🔥 PARCHE PARA MÉXICO 🔥
            // Corrige el error de "Recipient not in allowed list" causado por el 521
            let from = msg.from;
            if (from.startsWith('521')) {
                from = from.replace('521', '52');
            }

            const type = msg.type;
            const name = body.entry[0].changes[0].value.contacts[0].profile.name;
            
            let { data: driver } = await supabase.from('drivers').select('*').eq('phone', from).single();

            // A. REGISTRO
            if (driver && driver.registration_step > 0 && driver.registration_step < 4) {
                if (driver.registration_step === 1 && type === 'text') {
                    await supabase.from('drivers').update({ name: msg.text.body, registration_step: 2 }).eq('phone', from);
                    await sendWhatsApp(from, "🚘 ¿Modelo de auto? (Ej: Versa 2022)");
                } else if (driver.registration_step === 2 && type === 'text') {
                    await supabase.from('drivers').update({ car_model: msg.text.body, registration_step: 3 }).eq('phone', from);
                    await sendWhatsApp(from, "📸 ¡Casi listo! Manda una FOTO TUYA.");
                } else if (driver.registration_step === 3 && type === 'image') {
                    await sendWhatsApp(from, "⏳ Subiendo foto...");
                    const url = await handleImageUpload(msg.image.id);
                    if (url) {
                        await supabase.from('drivers').update({ photo_url: url, registration_step: 4, active: true }).eq('phone', from);
                        await sendWhatsApp(from, "✅ ¡Registro completado!", url);
                    }
                }
                return res.sendStatus(200);
            }

            // B. TEXTO
            if (type === 'text') {
                const txt = msg.text.body.toLowerCase();
                if (txt.includes('conductor') || txt.includes('trabajar')) {
                    if (!driver) {
                        await supabase.from('drivers').insert({ phone: from, registration_step: 1 });
                        await sendWhatsApp(from, "👋 Hola. ¿Cuál es tu nombre completo?");
                    } else {
                        await sendWhatsApp(from, "✅ Ya eres conductor.");
                    }
                } 
                else if (txt.includes('ir a')) {
                    const destinoRaw = txt.split(/ir a/)[1];
                    if (destinoRaw) {
                        const destino = destinoRaw.trim();
                        await sendWhatsApp(from, `🔍 Buscando "${destino}"...`);
                        const coords = await getCoordinates(destino);
                        if (coords) {
                            await supabase.from('requests').insert({
                                user_phone: from, user_name: name, destination: coords.name, 
                                lat: coords.lat, lng: coords.lon, status: 'draft'
                            });
                            await sendWhatsApp(from, `📍 Encontré: ${coords.name}.\n📎 Manda tu **Ubicación** (Clip) para cotizar.`);
                        } else {
                            await sendWhatsApp(from, "❌ No encontré el lugar.");
                        }
                    }
                } else {
                    await sendWhatsApp(from, "🤖 Bot Taxi:\n- Escribe 'Quiero ser conductor'\n- Escribe 'Quiero ir a [Lugar]'");
                }
            } 
            
            // C. UBICACIÓN
            else if (type === 'location') {
                const { data: draft } = await supabase.from('requests').select('*').eq('user_phone', from).eq('status', 'draft').limit(1).single();
                if (draft) {
                    const origin = { lat: msg.location.latitude, lon: msg.location.longitude };
                    const dest = { lat: draft.lat, lon: draft.lng };
                    const ruta = await getRoutePrice(origin, dest);
                    if (ruta) {
                        await supabase.from('requests').update({ origin: 'Ubicación WA', distance_km: ruta.km, price: ruta.price, status: 'pending' }).eq('id', draft.id);
                        await sendWhatsApp(from, `✅ **Precio: $${ruta.price}**\n📏 ${ruta.km} km\n⏳ Buscando conductor...`);
                    }
                } else {
                    await sendWhatsApp(from, "Dime a dónde vas primero.");
                }
            }
        }
    } catch (e) { console.error(e); }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
