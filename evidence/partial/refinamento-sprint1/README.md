# Experimento parcial — refinamento da Sprint 1

Esta coleta foi interrompida a pedido do operador para desligamento da máquina. **Não satisfaz o aceite do experimento de 60 minutos** e não deve ser apresentada como experimento completo.

- ID: `11ea5378-3869-4e07-8567-d0246ed968e6`.
- Intervalo UTC: `2026-10-22T00:32:24.319580+00:00` a `2026-10-22T00:59:10.953588+00:00`.
- Duração: 26 minutos e 46,634 segundos.
- Executados: período normal, carga de 5/s por dez minutos e dez logins inválidos.
- Não executados: indisponibilidade do banco, falha isolada do probe e observação das respectivas recuperações.
- Encerramento: SIGTERM; carga restaurada para 1/s. O observador de alertas também foi encerrado.

Fontes: [manifesto](experiment-11ea5378-3869-4e07-8567-d0246ed968e6/manifest.json), [timeline](experiment-11ea5378-3869-4e07-8567-d0246ed968e6/session.json), [execução](experiment-11ea5378-3869-4e07-8567-d0246ed968e6/run.json), [séries](experiment-11ea5378-3869-4e07-8567-d0246ed968e6/series.json) e [eventos](experiment-11ea5378-3869-4e07-8567-d0246ed968e6/events.jsonl).

A exportação foi realizada antes do desligamento. Os 28 arquivos foram copiados sem alteração; os 27 hashes do manifesto foram conferidos, e os valores das credenciais locais não foram encontrados. O manifesto e a execução preservam `status: interrupted_or_failed`; a última fase permanece aberta na timeline original. Não foi produzido resumo de aceite. Uma nova execução deve usar outra pasta, preservando este registro.

O [baseline aprovado](../../validated/refinamento-sprint1/README.md) permanece disponível. Consulte a [retomada pendente](../../../docs/validacao-refinamento.md#retomada-pendente).
