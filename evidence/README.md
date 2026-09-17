# Evidências técnicas autorizadas

`runs/` guarda artefatos locais ignorados pelo Git. Cada export inclui consultas PromQL e resultados em `metrics.json`, além de eventos permitidos em `events.jsonl`. Sessões completas incluem `session.json` com marcações reais de início, carga, falhas e recuperação.

O relatório versionado deve resumir somente resultados realmente observados. Não alterar timestamps para simular tendência. Revisar o conteúdo antes de compartilhar; nunca versionar `.env` ou saída integral de `docker inspect`/`docker compose config`.

[`validated/sprint1/`](validated/sprint1/README.md) reúne a seleção revisada da Sprint 1. A sessão de 10/09/2026 e a validação de retomada de 17/09/2026 possuem pastas e períodos separados. As cópias históricas mantêm o conteúdo dos arquivos originais; os resultados exportados continuam utilizáveis após a expiração da retenção no Prometheus.
