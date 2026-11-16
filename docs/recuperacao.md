# Recuperação do serviço assistencial simulado

Responsável: **Operação do laboratório**. Todos os dados e impactos descritos são fictícios. Este procedimento permanece disponível em `/runbook`; instalação, simulações e testes estão no README principal do repositório.

## Consulta assistencial indisponível

1. Registrar o horário e consultar o painel de coleta. Confirmar que o verificador está sendo coletado.
2. Executar `npm run status` e `npm run check`.
3. Verificar vitalidade e prontidão: `npm run health`.
4. Se a vitalidade funcionar e a prontidão falhar, conferir o banco com `npm run db:check`. Isso é evidência de dependência indisponível; a falha do probe sozinha não identifica a causa.
5. Restaurar somente o serviço afetado: `npm run db:restore` no experimento desta sprint.
6. Confirmar novamente consulta, prontidão e painel. Aguardar coleta e avaliação das regras; a recuperação aparece em aproximadamente 30–45 s após o serviço ficar pronto.
7. Exportar evidências com `npm run evidence:export`, registrar início, recuperação, impacto fictício e decisão executada. Não chamar o intervalo de um único experimento de MTTR médio.

Não remover volumes para recuperar o serviço. Se o problema persistir, consultar `npm run logs -- api`, `npm run logs -- postgres` e `npm run config:check`; nunca copiar `.env`, tokens ou `docker inspect` integral para evidências.

## Falha de coleta

1. Um alvo sem coleta não comprova saúde nem indisponibilidade assistencial.
2. Conferir o alvo indicado, rede interna e estado do coletor. Se apenas `/probe` estiver interrompido e o gerador continuar ativo, executar `npm run probe:restore` ou confirmar a expiração automática. Se o contêiner `lab` inteiro estiver parado, executar `npm run collector:restore`; esse é o cenário usado nas evidências históricas da Sprint 1.
3. Confirmar cobertura de 100% e novas verificações antes de concluir sobre o serviço.
4. Se o Prometheus parar, Grafana apresentará erro/sem dados; esse Prometheus único não consegue detectar sua própria parada total. Não interpretar ausência de alerta como recuperação.

## Falhas repetidas de login

1. Registrar o horário de `FalhasDeLoginRepetidas` e consultar os eventos de autenticação no Loki pelo Grafana. Confirmar respostas `401`, intervalo e correlação; falhas de token não entram na regra de login.
2. Confirmar que a consulta autenticada continua funcionando. O alerta sinaliza repetição de recusas, não invasão confirmada ou indisponibilidade clínica.
3. Na simulação autorizada, registrar a detecção antes de interromper o gerador de tentativas. O roteiro faz essa ação automaticamente; não afirmar que houve bloqueio na API.
4. Confirmar alerta resolvido, consulta válida e pelo menos 60 segundos sem novas falhas. Guardar início, detecção, ação e encerramento, distinguindo MTTD, tempo até ação e MTTR simulado.
5. Se a execução for interrompida ou o disparo não acontecer, preservar seu estado incompleto. Conferir coleta, regra e eventos antes de iniciar outra execução em pasta nova.

## Falha da centralização de eventos

1. Conferir os jobs `alloy` e `loki`, estado dos serviços e eventos recentes no Grafana. `up=1` sozinho não comprova chegada de cada evento.
2. Consultar os logs locais dos componentes, espaço em disco e configuração; não incluir logs arbitrários ou segredos no pacote de evidências.
3. Retomar o ambiente pelo procedimento do README, preservando volumes. Verificar leitura de eventos já armazenados e ingestão de um evento novo.
4. Registrar duração e extensão conhecida da lacuna. Posições persistentes ajudam a retomada, mas não recuperam logs rotacionados antes da leitura ou volume perdido. A falha do mesmo host pode interromper coleta, armazenamento e dashboard ao mesmo tempo.

## Experimento autorizado

Os cenários e seus comandos estão na seção “Demonstrar” do README principal. A falha de banco dura 120 s e o roteiro tenta restaurá-lo ao finalizar ou receber SIGINT/SIGTERM. SIGKILL, queda do host ou encerramento do daemon podem exigir `npm run db:restore` manual.

A falha isolada do probe dura 90 s, preserva o gerador e suas métricas e possui expiração automática. O cenário anterior de interrupção do contêiner `lab` inteiro continua disponível, com restauração do contêiner ao finalizar ou receber sinal. Escolher a recuperação conforme o componente efetivamente interrompido.

## Decisão gerencial esperada

Priorizar a restauração da consulta clínica, confirmar a recuperação por evidência e registrar o resultado. O impacto é atraso simulado de atendimento. O registro histórico da Sprint 2 mantém avaliação qualitativa de riscos e tratamentos planejados. Na Sprint 3, atualizar apenas ações e controles sustentados por novas evidências; a restauração automática do experimento não comprova execução desses tratamentos nem aprovação executiva.
