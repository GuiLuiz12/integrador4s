import { required } from '../shared/config.js';
const [command, first, second] = process.argv.slice(2);
if (command === 'load') {
  const response = await fetch('http://127.0.0.1:9091/control/load', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rate: Number(first), seconds: Number(second) }) });
  if (!response.ok) throw new Error('Parâmetros de carga recusados');
  console.log(await response.text());
} else if (command === 'invalid-logins') {
  for (let i = 0; i < 10; i++) {
    const response = await fetch('http://api:3000/auth/login', { method: 'POST', signal: AbortSignal.timeout(3000),
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'profissional1', password: 'senha-deliberadamente-invalida' }) });
    if (response.status !== 401) throw new Error(`Esperado 401; recebido ${response.status}`);
    await response.arrayBuffer();
  }
  console.log('10 logins inválidos recusados com HTTP 401');
} else if (command === 'query') {
  // Queries run inside the Compose network; monitoring ports remain unpublished.
  const timestamp = second ? `&time=${encodeURIComponent(second)}` : '';
  const response = await fetch(`http://prometheus:9090/api/v1/query?query=${encodeURIComponent(first ?? 'up')}${timestamp}`);
  if (!response.ok) throw new Error('Consulta Prometheus falhou');
  console.log(await response.text());
} else if (command === 'check-api') {
  const response = await fetch('http://api:3000/auth/login', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'profissional1', password: required('PROF_1_PASSWORD') }) });
  if (response.status !== 200) throw new Error('Login falhou');
  const { access_token } = await response.json() as { access_token: string };
  const record = await fetch('http://api:3000/prontuarios/1', { headers: { authorization: `Bearer ${access_token}` } });
  if (record.status !== 200) throw new Error('Consulta falhou');
  console.log('Login e consulta funcionam; token e conteúdo omitidos');
} else { throw new Error('Comando inválido: load, invalid-logins, query ou check-api'); }
