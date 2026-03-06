import express from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const router = express.Router();

const client = jwksClient({
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
});

function getKey(header, cb) {
  client.getSigningKey(header.kid, function (err, key) {
    cb(null, key.getPublicKey());
  });
}

router.post('/login', (req, res) => {
  const { accessToken } = req.body;

  jwt.verify(
    accessToken,
    getKey,
    {
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256'],
    },
    (err, decoded) => {
      if (err) return res.status(401).json({ error: 'Token inválido' });

      res.cookie('session', accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
      });

      res.json({ ok: true, user: decoded });
    }
  );
});

export default router;
