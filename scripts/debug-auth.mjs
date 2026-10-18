import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

async function check() {
  const loginRes = await fetch('http://127.0.0.1:5173/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'custA@parity.test', password: 'Password123!' })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  const decoded = jwt.decode(token);
  console.log('Decoded token payload:', decoded);

  const secret = process.env.JWT_SECRET || 'energya_connect_dotnet9_super_secret_jwt_key_2026_x89f_long_enough';
  try {
    const verified = jwt.verify(token, secret, {
      issuer: 'Energya.DotNet9.JwtAuthority',
      audience: 'Energya.Connect.Api'
    });
    console.log('Verified OK! sub:', verified.sub, 'sid:', verified.sid);

    const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_nest?schema=public' } } });
    const session = await prisma.userSession.findUnique({ where: { id: verified.sid } });
    console.log('Session in DB:', session);
    await prisma.$disconnect();
  } catch (err) {
    console.error('Verify failed:', err.message);
  }
}
check();
