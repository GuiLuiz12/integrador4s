# Dashboard v0.2

`saude.json` é gerado por `npm run dashboard` e provisionado automaticamente. O UID `saude-v01` foi preservado para manter os links existentes. O dashboard é somente leitura pela interface; alterações são feitas na origem versionada.

As visões analíticas incluem baseline × experimento, CPU por fase, matriz e registro de riscos, vulnerabilidades por severidade/ativo, incidentes, episódios de alerta e KPIs/KRIs com decisão associada. O recorte fixo de 26/10/2026 está identificado no título e nas descrições. A seção operacional preserva disponibilidade, qualidade da coleta, alertas, desempenho, autenticação e infraestrutura com Prometheus e o intervalo selecionado.

`npm run analysis:sprint2` reproduz os cálculos, o relatório e o dashboard a partir das fontes preservadas e de `analysis/sprint2/registers.json`. Os painéis analíticos renderizam CSVs explícitos pela [fonte nativa TestData do Grafana](https://grafana.com/docs/grafana/latest/datasources/testdata/), no cenário `csv_content`; não usam geração aleatória. Alterar o seletor de tempo não muda esses registros. Tratamento definido significa plano proposto, não controle implementado.

O [relatório](http://localhost:3000/analysis/sprint2) e os [dados](http://localhost:3000/analysis/sprint2/data) estão ligados no topo do dashboard. As fontes consultáveis usam identificadores B01–B03, E01–E05 e C01–C07. A tabela consolida os mesmos 18 indicadores do relatório, com fonte por linha e altura ajustada à quantidade de registros. Ação e tempo de resposta dos incidentes representam restauração programada, separados de MTTD/MTTR. Ao usar túnel SSH, encaminhar as portas 3000 e 3001.

Validação: `npm run dashboard:verify` consulta todas as expressões e todos os CSVs e captura as visões analíticas e operacionais. A conformidade e o acompanhamento de controles do dashboard v1.0 permanecem na Sprint 3.
