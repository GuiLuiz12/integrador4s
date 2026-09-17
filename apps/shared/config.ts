export function required(name: string): string {
  const value = process.env[name];
  if (!value || value === 'GENERATED') throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}
