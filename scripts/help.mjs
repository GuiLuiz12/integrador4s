// Keep the usage guide available even before npm ci or setup.
const sections = [
  ['Preparação e operação (sem npm ci)', [
    ['setup', 'Verifica/instala requisitos e prepara .env; não sobe contêineres. Internet/sudo quando necessários.'],
    ['setup:check', 'Somente verifica requisitos do host; não instala nem inicia serviços.'],
    ['start', 'Constrói/sobe o laboratório e confirma prontidão (pode levar minutos). Requer setup.'],
    ['stop', 'Encerra somente este laboratório; preserva volumes e senhas.'],
    ['status', 'Mostra estado e portas dos sete serviços. Requer setup.'],
    ['logs [-- SERVIÇO]', 'Acompanha as últimas 100 linhas e novos logs; Ctrl+C encerra somente a leitura.'],
    ['access', 'Mostra URLs, usuários e onde consultar senhas; não imprime segredos.'],
    ['help', 'Mostra este catálogo. npm run também lista os scripts.'],
  ]],
  ['Consultas e verificações (laboratório ativo, salvo config:check)', [
    ['check', 'Testa login e consulta clínica sem exibir token ou prontuário.'],
    ['health', 'Consulta vitalidade e prontidão da API; informa erro se alguma falhar.'],
    ['config:check', 'Valida o Compose sem expandir segredos; requer setup, não serviços ativos.'],
    ['test:rules', 'Testa regras Prometheus em contêiner temporário; não provoca falhas.'],
    ['test:integration', 'Verifica dados, permissões, coleta, limites e portas; reexecuta inicialização idempotente.'],
    ['db [-- OPÇÕES_PSQL]', 'Abre psql no PostgreSQL, banco healthlab, usuário lab_owner. Sair: \\q.'],
    ['db:check', 'Verifica se PostgreSQL aceita conexões.'],
    ['metrics:query [-- "PROMQL"]', 'Consulta Prometheus interno e retorna JSON. Padrão: up.'],
  ]],
  ['Teste de instalação em VM isolada (opcional; não exige laboratório ativo)', [
    ['test:ubuntu26', 'Instala do zero em VM descartável (15–30 min). Requer QEMU/KVM, SSH, Python 3.11+, Git, internet, 10 GiB de RAM livre e 25 GiB em /tmp; preserva laboratório do host.'],
  ]],
  ['Simulações autorizadas e recuperação (laboratório ativo)', [
    ['simulate:load [-- RATE SECONDS]', 'Altera carga fictícia (0–5/s, 1–7200 s). Padrão: 1/s por 3600 s; retorna a 1/s ao expirar.'],
    ['simulate:auth-failures', 'Produz dez tentativas inválidas de login no laboratório.'],
    ['simulate:db-outage [-- SECONDS]', 'INTERROMPE PostgreSQL; restaura após 120 s por padrão (1–600 s) ou Ctrl+C.'],
    ['simulate:collector-outage [-- SECONDS]', 'INTERROMPE gerador/verificador; mesma duração e restauração da falha do banco.'],
    ['db:restore', 'Solicita início do PostgreSQL após interrupção; confirmar com db:check e check.'],
    ['collector:restore', 'Solicita início do gerador/verificador; aguardar coleta e conferir cobertura.'],
  ]],
  ['Evidências (laboratório ativo; summary usa arquivos de sessão concluída)', [
    ['evidence:export [-- PASTA]', 'Exporta métricas e eventos filtrados da última hora; padrão: evidence/runs/<horário>.'],
    ['session:run', 'DEMONSTRAÇÃO DE 60 MINUTOS: altera carga e interrompe banco/coletor. Salva evidence/runs/session-*.'],
    ['session:summary -- PASTA', 'Valida sessão completa e grava summary.json na pasta informada.'],
  ]],
  ['Desenvolvimento e ferramentas visuais (npm ci primeiro)', [
    ['build', 'Compila TypeScript em dist/.'],
    ['test', 'Testes de código e scripts; não executa a sessão real.'],
    ['dashboard', 'Gera dashboards/saude.json; versionar junto com scripts/dashboard.mjs.'],
    ['start:api', 'Inicia SOMENTE API compilada fora do Docker; requer banco e variáveis preparados.'],
    ['start:lab', 'Inicia SOMENTE gerador/verificador compilados; requer API e variáveis preparados.'],
    ['browser:setup', 'Instala Chromium e bibliotecas do sistema; internet e possivelmente sudo.'],
    ['dashboard:verify [-- --from ISO --to ISO --output-dir PASTA]', 'Requer browser:setup e Grafana ativo. Valida/captura painel; padrão última hora, evidence/runs/dashboard/.'],
    ['alerts:capture [-- ISO_INÍCIO]', 'Observa dois alertas por até 70 min; não provoca falhas. Requer browser:setup/Grafana. Salva evidence/runs/alerts/.'],
  ]],
];
console.log('Primeiro uso: ./bootstrap.sh → npm run setup → npm start\n');
for (const [title, commands] of sections) {
  console.log(title);
  for (const [command, description] of commands) {
    const prefix = ['start', 'stop', 'test'].includes(command) ? 'npm ' : 'npm run ';
    console.log(`  ${prefix}${command}\n    ${description}`);
  }
  console.log();
}
