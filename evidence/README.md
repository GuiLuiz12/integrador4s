# Evidências técnicas

`runs/` guarda execuções locais ignoradas pelo Git. O [contrato da versão 1](../docs/evidencias.md) descreve os arquivos e seus critérios de validação.

A [seleção revisada do refinamento](validated/refinamento-sprint1/README.md) preserva as fontes completas, seus resumos e as capturas vinculadas aos períodos observados.

Conjuntos cuja exportação terminou, mas cujo aceite foi rejeitado, ficam em `rejected/`, com o motivo e as fontes preservados. A [execução de 26/10/2026](rejected/refinamento-sprint1/README.md) não integra as evidências aprovadas.

A [entrega analítica da Sprint 2](sprint2/README.md) usa esse experimento com a limitação declarada e preserva o resultado original do verificador. As capturas e verificações do v0.2 ficam separadas das fontes da coleta.

## Novas coletas

- `baseline-<UUID>/`: estabilização e 30 minutos de carga normal.
- `experiment-<UUID>/`: estabilização e 60 minutos de cenários controlados.
- `export-<UUID>/` ou pasta vazia escolhida: exportação avulsa de um intervalo.

Cada conjunto concluído inclui manifesto, séries originais, curvas derivadas, métricas pontuais, eventos permitidos, inventário e cópias das configurações. Sessões incluem também estado, fases, inventário inicial e timeline. O manifesto registra o intervalo UTC, consultas, fontes, tamanhos e SHA-256; é escrito no fim da exportação.

`npm run session:summary -- PASTA` verifica as fontes offline e gera `summary.json`. Um resumo reprodutível não substitui os arquivos que o sustentam. Preserve as fontes completas, inclusive os snapshots, ao selecionar um conjunto para versionamento.

O relatório deve resumir somente resultados observados. Não alterar timestamps, completar lacunas nem copiar fixtures de testes como evidência. Não versionar `.env` ou saída integral de `docker inspect`/`docker compose config`.

## Entrega histórica

[`validated/sprint1/`](validated/sprint1/README.md) reúne a seleção revisada da Sprint 1. A sessão de 10/09/2026 e a retomada de 17/09/2026 possuem pastas e períodos separados. Esses arquivos mantêm o conteúdo original; seus resultados continuam utilizáveis após expirar a retenção do Prometheus.

O cenário histórico interrompia o gerador/verificador inteiro. As novas sessões interrompem somente a coleta do probe. O leitor mantém compatibilidade com os arquivos antigos sem convertê-los ou preencher campos ausentes retroativamente.
