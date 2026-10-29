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

## Experimento autorizado

Os cenários e seus comandos estão na seção “Demonstrar” do README principal. A falha de banco dura 120 s e o roteiro tenta restaurá-lo ao finalizar ou receber SIGINT/SIGTERM. SIGKILL, queda do host ou encerramento do daemon podem exigir `npm run db:restore` manual.

A falha isolada do probe dura 90 s, preserva o gerador e suas métricas e possui expiração automática. O cenário anterior de interrupção do contêiner `lab` inteiro continua disponível, com restauração do contêiner ao finalizar ou receber sinal. Escolher a recuperação conforme o componente efetivamente interrompido.

## Decisão gerencial esperada

Priorizar a restauração da consulta clínica, confirmar a recuperação por evidência e registrar o resultado. O impacto é atraso simulado de atendimento. A Sprint 2 mantém avaliação qualitativa de riscos e tratamentos planejados; a restauração automática do experimento não comprova execução desses tratamentos nem aprovação executiva.
