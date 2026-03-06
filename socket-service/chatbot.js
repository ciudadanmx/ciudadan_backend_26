// chatbot.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { createBot, createProvider, createFlow, addKeyword } = require('@bot-whatsapp/bot');
const MetaProvider = require('@bot-whatsapp/provider/meta');
const MockAdapter = require('@bot-whatsapp/database/mock');
const axios = require('axios');

/**
 * attachChatbot(app, opts)
 * - app: instancia express ya creada (NO hace listen)
 * - opts: { webhookPath, appPort }
 *
 * Monta GET /webhook (verificación) y POST /webhook (eventos).
 * Inicializa createProvider/createBot sin levantar puerto extra.
 */
async function attachChatbot(app, opts = {}) {
  if (!app) throw new Error('attachChatbot necesita la instancia express "app" como primer argumento.');

  const WEBHOOK_PATH = opts.webhookPath || process.env.CHATBOT_WEBHOOK_PATH || '/webhook';
  const APP_PORT = Number(opts.appPort || process.env.PORT || 33032); // asegurar número
  const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || process.env.KEY || null; // token que tú eliges para verificar
  const ACCESS_TOKEN = process.env.VERIFY_TOKEN || process.env.ACCESS_TOKEN || null; // token de acceso (System User)
  const NUMBER_ID = process.env.NUMBER_ID || null;
  const PUBLIC_WEBHOOK_URL = process.env.PUBLIC_WEBHOOK_URL || null;

  if (!META_VERIFY_TOKEN) console.warn('⚠️ META_VERIFY_TOKEN no definido — verificación del webhook GET fallará si no coincide.');
  if (!ACCESS_TOKEN) console.warn('⚠️ ACCESS_TOKEN/VERIFY_TOKEN no definido — provider puede fallar.');
  if (!NUMBER_ID) console.warn('⚠️ NUMBER_ID no definido — provider puede fallar.');

  
  
  // función para enviar respuesta por WhatsApp Cloud API
async function sendWhatsAppReply(numberId, accessToken, toPhone, text) {
  const url = `https://graph.facebook.com/v17.0/${numberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: toPhone,
    type: "text",
    text: { body: text }
  };
  try {
    const r = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    console.log('[chatbot] Respuesta enviada via Graph API:', r.data);
    return r.data;
  } catch (err) {
    console.error('[chatbot] Error enviando respuesta via Graph API:', err.response && err.response.data ? err.response.data : err.message);
    throw err;
  }
}



  
  
  // Router para webhook
  const router = express.Router();
  // Aseguramos que el body raw quede disponible si alguna librería lo necesita
  router.use(bodyParser.json({ limit: '1mb' }));

  // GET /webhook (verificación por parte de Meta)
  router.get('/', (req, res) => {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      console.log('[chatbot] GET /webhook -> mode:', mode, ' tokenReceived:', token ? token.toString() : token);

      if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
        console.log('✅ Chatbot: webhook verificado con éxito (GET)');
        return res.status(200).send(challenge);
      } else {
        console.log('❌ Chatbot: verificación fallida (GET). token recibido:', token);
        return res.sendStatus(403);
      }
    } catch (err) {
      console.error('Error en GET webhook:', err);
      return res.sendStatus(500);
    }
  });

  // variable para el adapter provider (intentamos exponerla fuera para reenviar eventos)
  let adapterProviderInstance = null;

  // POST /webhook (eventos entrantes de Meta/WhatsApp)
  // Este handler hace Logging detallado y además intenta reenviar el payload
  // al adapterProvider si la librería lo soporta (defensivo).
  router.post('/', async (req, res) => {
    try {
      console.log('--- NUEVO EVENTO WEBHOOK (raw body) ---');
      console.log(JSON.stringify(req.body, null, 2));
      console.log('--- CABECERAS ---');
      // mostramos solo cabeceras relevantes para evitar sobrellenar logs
      const hdrs = {
        'user-agent': req.get('user-agent'),
        'x-forwarded-for': req.get('x-forwarded-for'),
        'content-type': req.get('content-type'),
      };
      console.log(JSON.stringify(hdrs, null, 2));

      // Responder rápido a Meta (200) para no reenviar reintentos
      res.status(200).send('ok');

      // Intento defensivo: si adapterProviderInstance expone alguna función para procesar
      // el webhook (varía según implementación del provider), lo llamamos.
      if (adapterProviderInstance) {
        try {
          // probamos varias firmas posibles (defensivo)
          if (typeof adapterProviderInstance.handleWebhook === 'function') {
            // firma hipotética: handleWebhook(req, res) o handleWebhook(body)
            await adapterProviderInstance.handleWebhook(req, res);
            console.log('[chatbot] adapterProvider.handleWebhook invoked');
          } else if (typeof adapterProviderInstance.receive === 'function') {
            await adapterProviderInstance.receive(req.body);
            console.log('[chatbot] adapterProvider.receive invoked');
          } else if (typeof adapterProviderInstance.process === 'function') {
            await adapterProviderInstance.process(req.body);
            console.log('[chatbot] adapterProvider.process invoked');
          } else {
            // no hay función conocida, hacemos fallback: nada (ya respondimos 200)
            // Si necesitas que reenviemos manualmente a createBot, lo implementamos explícito.
            // console.log('[chatbot] adapterProvider no expone handleWebhook/receive/process');
          }
        } catch (err) {
          console.warn('[chatbot] Error intentando reenviar evento al adapterProvider:', err && err.message ? err.message : err);
        }
      }

      // Fin del handler
    } catch (err) {
      console.error('Error en POST /webhook debug:', err);
      try { res.sendStatus(500); } catch (e) { /* ignore */ }
    }
  });

  // Montar router en app principal
  app.use(WEBHOOK_PATH, router);

  // ==== Definir flujos del bot ====
  const flowSecundario = addKeyword(['2', 'siguiente']).addAnswer(['📄 Aquí tenemos el flujo secundario']);
  const flowDocs = addKeyword(['doc', 'documentacion', 'documentación']).addAnswer(
    ['📄 Aquí encontras la documentación recuerda que puedes mejorarla', 'https://bot-whatsapp.netlify.app/', '\n*2* Para siguiente paso.'],
    null, null, [flowSecundario]
  );
  const flowTuto = addKeyword(['tutorial', 'tuto']).addAnswer(
    ['🙌 Aquí encuentras un ejemplo rápido', 'https://bot-whatsapp.netlify.app/docs/example/', '\n*2* Para siguiente paso.'],
    null, null, [flowSecundario]
  );
  const flowGracias = addKeyword(['gracias', 'grac']).addAnswer(
    ['🚀 Puedes aportar tu granito de arena a este proyecto', '[*opencollective*] https://opencollective.com/bot-whatsapp', '[*buymeacoffee*] https://www.buymeacoffee.com/leifermendez', '\n*2* Para siguiente paso.'],
    null, null, [flowSecundario]
  );
  const flowDiscord = addKeyword(['discord']).addAnswer(['🤪 Únete al discord', 'https://link.codigoencasa.com/DISCORD', '\n*2* Para siguiente paso.'], null, null, [flowSecundario]);
  const flowPrincipal = addKeyword(['hola', 'ole', 'alo'])
    .addAnswer('🙌 Hola bienvenido a este *Chatbot*')
    .addAnswer(['Te comparto los siguientes links de interés sobre el proyecto:', '👉 *doc* para ver la documentación', '👉 *gracias* para ver la lista de videos', '👉 *discord* para unirte al discord'], null, null, [flowDocs, flowGracias, flowTuto, flowDiscord]);

  // ===== Inicializar provider y bot sin arrancar otro servidor =====
  try {
    const adapterDB = new MockAdapter();
    const adapterFlow = createFlow([flowPrincipal]);

    // providerWebhook: prefer PUBLIC_WEBHOOK_URL (producción), sino localhost:APP_PORT
    let providerWebhook;
    if (PUBLIC_WEBHOOK_URL && PUBLIC_WEBHOOK_URL.startsWith('http')) {
      providerWebhook = PUBLIC_WEBHOOK_URL;
      console.log('[chatbot] Usando PUBLIC_WEBHOOK_URL para provider:', providerWebhook);
    } else {
      providerWebhook = `http://localhost:${APP_PORT}${WEBHOOK_PATH}`;
      console.warn('[chatbot] PUBLIC_WEBHOOK_URL no definida. Se usará', providerWebhook, '— asegúrate de exponerla con cloudflared/ngrok.');
    }

    // Creamos el provider (NO pasamos "port")
    const adapterProvider = createProvider(MetaProvider, {
      jwtToken: ACCESS_TOKEN,
      numberId: NUMBER_ID,
      verifyToken: META_VERIFY_TOKEN,
      version: 'v22.0',
      webhook: providerWebhook
    });

    // Guardamos referencia para intentar reenviar POSTs
    adapterProviderInstance = adapterProvider;

    // Inicializamos el bot
    await createBot({
      flow: adapterFlow,
      provider: adapterProvider,
      database: adapterDB,
    });

    console.log('🤖 Chatbot: createBot / createProvider inicializados (sin puerto propio). Webhook montado en', WEBHOOK_PATH);
  } catch (err) {
    console.error('❌ Chatbot: error inicializando createBot/createProvider:', err && err.message ? err.message : err);
  }

  // Devolvemos metadata útil
  return { webhookPath: WEBHOOK_PATH, publicWebhook: PUBLIC_WEBHOOK_URL || `http://localhost:${APP_PORT}${WEBHOOK_PATH}` };
}


router.post('/', async (req, res) => {
  try {
    console.log('--- NUEVO EVENTO WEBHOOK (raw body) ---');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('--- CABECERAS (select) ---');
    const hdrs = {
      'user-agent': req.get('user-agent'),
      'x-forwarded-for': req.get('x-forwarded-for'),
      'content-type': req.get('content-type')
    };
    console.log(JSON.stringify(hdrs, null, 2));

    // Responder inmediatamente a Meta para evitar reintentos
    res.status(200).send('ok');

    // Intentar extraer mensaje real (estructura típica de WhatsApp Cloud)
    // entry[].changes[].value.messages[]
    const body = req.body || {};
    if (body.object === 'whatsapp_business_account' && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (!entry.changes) continue;
        for (const change of entry.changes) {
          const value = change.value || {};
          const messages = value.messages || [];
          const contacts = value.contacts || [];
          if (messages.length > 0) {
            for (const msg of messages) {
              // extraer número emisor y texto si existe
              const from = msg.from || (contacts[0] && contacts[0].wa_id) || null;
              const text = (msg.text && msg.text.body) ? msg.text.body : (msg.type === 'interactive' && msg.interactive && msg.interactive.type === 'button' ? msg.interactive.button?.title : null);

              console.log(`[chatbot] Mensaje detectado from=${from} text=${text}`);

              // Ejemplo de manejo: responder siempre "Hola, recibimos tu mensaje"
              // Solo si tenemos NUMBER_ID y ACCESS_TOKEN en env
              const numberId = process.env.NUMBER_ID;
              const accessToken = process.env.VERIFY_TOKEN || process.env.ACCESS_TOKEN;
              if (numberId && accessToken && from) {
                try {
                  // personaliza el texto de respuesta como quieras
                  const replyText = `Hola 👋, te respondimos: "${text || ''}"`;
                  await sendWhatsAppReply(numberId, accessToken, from, replyText);
                } catch (err) {
                  console.error('[chatbot] fallo enviando reply fallback:', err && err.message ? err.message : err);
                }
              } else {
                console.warn('[chatbot] No se envía reply automático: falta NUMBER_ID o ACCESS_TOKEN o from');
              }
            }
          } else {
            // no hay messages[] — puede ser status u otro cambio
            console.log('[chatbot] Cambio recibido (sin messages):', JSON.stringify(change, null, 2));
          }
        }
      }
    } else {
      console.log('[chatbot] Payload no parece ser whatsapp_business_account, lo ignoramos por ahora.');
    }

    // Fin del handler
  } catch (err) {
    console.error('Error en POST /webhook fallback:', err && err.message ? err.message : err);
    try { res.sendStatus(500); } catch (e) { /* ignore */ }
  }
});

module.exports = { attachChatbot };
