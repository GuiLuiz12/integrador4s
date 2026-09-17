export type Credentials = { username: string; password: string };
export async function login(base: string, credentials: Credentials, signal: AbortSignal): Promise<string> {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', signal,
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) });
  if (!response.ok) throw new Error('Authentication unavailable');
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error('Invalid authentication response');
  return body.access_token;
}
export async function probe(base: string, credentials: Credentials, timeoutMs = 3000): Promise<{ success: number; duration: number }> {
  const start = performance.now();
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const token = await login(base, credentials, signal);
    const response = await fetch(`${base}/prontuarios/1`, { signal, headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Record unavailable');
    const body = await response.json() as { id?: number; paciente?: string; resumo?: string };
    if (body.id !== 1 || body.paciente !== 'Paciente fictício 001' || !body.resumo?.includes('fictício')) {
      throw new Error('Unexpected record');
    }
    return { success: 1, duration: (performance.now() - start) / 1000 };
  } catch {
    return { success: 0, duration: (performance.now() - start) / 1000 };
  }
}
