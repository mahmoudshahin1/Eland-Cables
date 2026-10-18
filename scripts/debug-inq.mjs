import jwt from 'jsonwebtoken';

async function check() {
  const loginRes = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'custA@parity.test', password: 'Password123!' })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log('Login token prefix:', token.slice(0, 30));

  const inqRes = await fetch('http://127.0.0.1:3847/api/inquiries', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  console.log('Inquiries status on 3847:', inqRes.status);
  const text = await inqRes.text();
  console.log('Inquiries body on 3847:', text);
}
check();
