import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';


dotenv.config();

const app = express();

/* =====================
   MIDDLEWARE BÁSICO
===================== */

app.use(express.json());

app.use(
  cors({
    origin: 'http://localhost:3000',
    credentials: true,
  })
);

app.use((req, res, next) => {
  console.log('➡️', req.method, req.originalUrl);
  next();
});

/* =====================
   PROXY ÚNICO A STRAPI
===================== */

// 🔥 PROXY MEDIA DE STRAPI (ESTO ARREGLA IMÁGENES)
app.use(
  '/uploads',
  createProxyMiddleware({
    target: process.env.STRAPI_URL,
    changeOrigin: true,
  })
);

app.use('/api', async (req, res) => {
  const targetUrl =
    `${process.env.STRAPI_URL}${req.originalUrl.replace('/api', '/api')}`;

  console.log('🔥🔥🔥🔥url', targetUrl);

  const headers = {
    'Content-Type': 'application/json',
  };

  // 👉 SI EL FRONT MANDA TOKEN (Auth0) → SE RESPETA
  if (req.headers.authorization) {
    console.log('con headers' );
    headers.Authorization =  `Bearer ${process.env.STRAPI_API_TOKEN}`;
  }
  // 👉 SI NO MANDA TOKEN → USA API TOKEN DE STRAPI
  else {
    console.log('sin headers');
    headers.Authorization = `Bearer ${process.env.STRAPI_API_TOKEN}`;
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method)
        ? undefined
        : JSON.stringify(req.body),
    });

    const data = await response.text();

    res.status(response.status);
    res.send(data);
    console.log('data',data);
  } catch (err) {
    console.error('❌ Middleware error:', err);
    res.status(500).json({ error: 'Middleware error' });
  }
});

/* =====================
   HEALTHCHECK
===================== */

app.get('/_health', (req, res) => {
  res.json({ ok: true });
});

/* =====================
   START
===================== */

app.listen(30010, () => {
  console.log('🚀 Middleware corriendo en http://localhost:30010');
});
