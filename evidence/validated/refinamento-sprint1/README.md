# Evidências revisadas do refinamento da Sprint 1

Estes conjuntos complementam a [entrega histórica](../sprint1/README.md), que permanece preservada. O [relatório do refinamento](../../../docs/validacao-refinamento.md) distingue implementação, testes sintéticos e coletas reais. O [contrato das evidências](../../../docs/evidencias.md) define as unidades, consultas, correlação e critérios de qualidade.

## Baseline

- ID: `9354d609-9654-4632-9529-00bae1ec5f24`.
- Intervalo UTC: 21/10/2026 23:54:23,920216 a 22/10/2026 00:24:25,084915.
- Duração: 30 minutos e 1,165 segundo, após estabilização.
- 120 verificações, todas com sucesso; 99,94% de completude temporal; 2.044 respostas registradas.
- Sete alvos e sete serviços com histórico. As amostras originais do cAdvisor têm cadência própria; o resumo expõe lacunas e bordas.

Fontes: [manifesto](baseline/manifest.json), [séries originais](baseline/series.json), [curvas derivadas](baseline/derived.json), [eventos](baseline/events.jsonl), [inventário](baseline/inventory.json), [timeline](baseline/session.json) e [resumo reproduzível](baseline/summary.json).

Capturas no mesmo intervalo: [síntese](baseline/captures/dashboard-1792629021889/sintese.png), [infraestrutura](baseline/captures/dashboard-1792629021889/infraestrutura.png) e [validação do Grafana](baseline/captures/dashboard-1792629021889/validation.json).

A cópia mantém os bytes das fontes e o manifesto da execução local. O verificador foi corrigido depois da coleta para distinguir scrapes de observações originais do cAdvisor. O resumo registra o hash do analisador usado, sem reescrever os dados.

## Experimento

A coleta foi interrompida aos 26 minutos e 46,634 segundos para permitir o desligamento da máquina. A [exportação parcial](../../partial/refinamento-sprint1/README.md) está preservada com status de interrupção e não integra os conjuntos aprovados. A execução completa de 60 minutos e sua validação continuam pendentes; veja a [retomada](../../../docs/validacao-refinamento.md#retomada-pendente).

## Conferência sem serviços ativos

```bash
npm run session:summary -- evidence/validated/refinamento-sprint1/baseline
```

O SHA-256 no manifesto confere os arquivos fonte. Capturas realizadas após o manifesto e o resumo derivado têm seus próprios vínculos de origem; não modificam o conjunto coletado. A seleção foi revisada para não conter valores das credenciais locais. Os dados, cenário e impacto são fictícios.
