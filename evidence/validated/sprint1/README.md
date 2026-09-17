# Evidências revisadas — Sprint 1

Seleção local revisada para a entrega do laboratório fictício. Nenhuma credencial, token ou conteúdo de prontuário é necessário para reproduzir a interpretação. As imagens foram inspecionadas e mostram somente o dashboard; os arquivos de eventos contêm apenas os campos permitidos pelo exportador.

## Sessão histórica — 10/09/2026

Origem: `evidence/runs/session-20260910T231740Z/` e `evidence/runs/alerts/`. As cópias em `historico-20260910/` mantêm o conteúdo dos arquivos originais. A sessão ocorreu de 20:17:41 a 21:17:41 em America/Sao_Paulo; os JSONs registram UTC. A exportação ao fim da sessão ocorreu em `2026-09-11T00:17:41.119662+00:00`.

| Artefato | O que comprova |
|---|---|
| [summary.json](historico-20260910/summary.json) | Consolidação aprovada: 234 verificações, 226 sucessos, 8 falhas; disponibilidade de 96,58% |
| [session.json](historico-20260910/session.json) | Marcações reais de carga, falhas, reinícios e conclusão |
| [metrics.json](historico-20260910/metrics.json) | Doze consultas PromQL e seus resultados, avaliados no mesmo instante |
| [events.jsonl](historico-20260910/events.jsonl) | Eventos estruturados filtrados; dez logins inválidos e 120 consultas clínicas HTTP 503 |
| [health-during-outage.json](historico-20260910/health-during-outage.json) | Vitalidade HTTP 200 e prontidão HTTP 503 durante a queda do banco |
| [Alerta clínico](historico-20260910/alerts/ConsultaAssistencialIndisponivel/dashboard.png) e [metadados](historico-20260910/alerts/ConsultaAssistencialIndisponivel/observation.json) | Indisponibilidade observada, alerta disparado e coleta preservada |
| [Alerta de coleta](historico-20260910/alerts/FalhaDeColeta/dashboard.png) e [metadados](historico-20260910/alerts/FalhaDeColeta/observation.json) | Estado assistencial “Sem dados” e cobertura de coleta reduzida |

Os horários de captura e de observação das imagens estão separados nos metadados. As imagens mostram intervalos parciais: seus percentuais não são o resultado consolidado da hora inteira. A captura de coleta mostra o alerta de `probe`; o histórico completo também comprova o alerta de `lab`.

O consolidado pode ser conferido sem Docker ou histórico vivo do Prometheus, a partir da raiz do projeto:

```bash
python3 scripts/summarize-session.py evidence/validated/sprint1/historico-20260910
```

O comando verifica os dados e regenera somente `summary.json`. A primeira sessão interrompida não faz parte desta seleção.

## Retomada — 17/09/2026

Origem das capturas e métricas: `evidence/runs/retomada-20260917T222400Z/`. Intervalo observado: **19:24–19:29 em America/Sao_Paulo**, equivalente a `22:24–22:29 UTC`. Captura concluída às `22:31:16.632 UTC`. O intervalo absoluto começa após a estabilização da coleta.

| Artefato | O que comprova |
|---|---|
| [checks.json](retomada-20260917/checks.json) | Registro dos comandos executados: compilação, dez testes, três cenários de regras e integração |
| [validation.json](retomada-20260917/validation.json) | Login e 29 painéis; consultas e JavaScript sem erros; período selecionado |
| [metrics.json](retomada-20260917/metrics.json) | Vinte verificações com sucesso, cobertura e disponibilidade de 100%, p95 de 9,50 ms e nenhum alerta disparado no horário final |
| [sintese.png](retomada-20260917/sintese.png) | Estado assistencial, disponibilidade, coleta e impacto apresentados ao gestor |
| [infraestrutura.png](retomada-20260917/infraestrutura.png) | Métricas do host e dos sete contêineres |
| [status.json](retomada-20260917/status.json) | Sete serviços em execução às 19:35 de 17/09/2026, com as publicações locais da API e do Grafana |

A consulta ao Prometheus usa o horário final do intervalo, não o horário posterior em que os arquivos foram salvos. `checks.json` é um registro dos comandos e resultados observados; os demais JSONs desta pasta foram gerados por consultas e pelo verificador visual. Uma captura preliminar que incluiu o preenchimento inicial dos alvos continua em `evidence/runs/retomada-20260917T222300Z/`; ela não é a captura de aceitação.

No estado dos serviços, portas como `5432/tcp` sem um endereço de host são internas ao contêiner. Somente os mapeamentos `127.0.0.1:3000` e `127.0.0.1:3001` estão publicados. O campo de saúde vazio identifica serviços sem healthcheck Docker; os alvos e indicadores correspondentes foram verificados pela integração e pelas consultas ao Prometheus.

O [relatório técnico-executivo](../../../docs/relatorio-sprint1.md) apresenta a interpretação, a decisão demonstrada e a checklist da DoD. Os dados históricos e os da retomada têm janelas diferentes e não devem ser somados nem extrapolados para SLA mensal.
