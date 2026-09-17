# Recuperação do serviço assistencial simulado

Responsável: **Operação do laboratório**. Todos os dados e impactos descritos são fictícios.

## Consulta assistencial indisponível

1. Registrar o horário e consultar o painel de coleta. Confirmar que o verificador está sendo coletado.
2. Executar `./scripts/lab.sh status` e `./scripts/lab.sh check-api`.
3. Verificar vitalidade e prontidão: `curl -f http://localhost:3000/health/live` e `curl -f http://localhost:3000/health/ready`.
4. Se a vitalidade funcionar e a prontidão falhar, conferir o banco com `./scripts/lab.sh db-ready`. Isso é evidência de dependência indisponível; a falha do probe sozinha não identifica a causa.
5. Restaurar somente o serviço afetado: `./scripts/lab.sh restore-db` no experimento desta sprint.
6. Confirmar novamente consulta, prontidão e painel. Aguardar coleta e avaliação das regras; a recuperação aparece em aproximadamente 30–45 s após o serviço ficar pronto.
7. Exportar evidências, registrar início, recuperação, impacto fictício e decisão executada. Não chamar o intervalo de um único experimento de MTTR médio.

Não remover volumes para recuperar o serviço. Se o problema persistir, consultar logs locais e a configuração; nunca copiar `.env`, tokens ou `docker inspect` integral para evidências.

## Falha de coleta

1. Um alvo sem coleta não comprova saúde nem indisponibilidade assistencial.
2. Conferir o alvo indicado, rede interna e estado do coletor. No experimento do verificador, executar `./scripts/lab.sh restore-collector`.
3. Confirmar cobertura de 100% e novas verificações antes de concluir sobre o serviço.
4. Se o Prometheus parar, Grafana apresentará erro/sem dados; esse Prometheus único não consegue detectar sua própria parada total. Não interpretar ausência de alerta como recuperação.

## Experimento autorizado

`./scripts/lab.sh fail-db 120` interrompe somente o PostgreSQL deste projeto por 120 s e o restaura ao finalizar ou receber SIGINT/SIGTERM. SIGKILL, queda do host ou encerramento do daemon exigem `restore-db` manual. O verificador pode ser interrompido com `fail-collector 90`, com o mesmo mecanismo de restauração.

## Decisão gerencial esperada

Priorizar a restauração da consulta clínica, confirmar a recuperação por evidência e registrar o resultado. O impacto é atraso simulado de atendimento. Esta sprint não implementa registro formal de riscos, aprovação executiva ou automação de tratamento.
