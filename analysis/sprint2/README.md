# Análise da Sprint 2

`npm run analysis:sprint2` confere a integridade dos conjuntos preservados e gera `analysis.json`, `report.html`, as cópias consultáveis em `sources/`, `docs/relatorio-sprint2.md` e `dashboards/saude.json`. Requer Python 3.11+ e Node 22+; não depende de Docker nem de uma nova coleta.

Os cálculos usam o baseline de 21/10/2026 e o experimento de 26/10/2026, identificados no relatório. A rejeição do verificador de cenário permanece no diretório original; a análise não altera esse resultado. Ausência de amostras não é preenchida como sucesso.

`registers.json` mantém avaliações qualitativas de vulnerabilidades e riscos, respectivas evidências e recomendações. Prazos são relativos à aprovação do plano de tratamento; responsáveis são papéis propostos. Plano definido não significa controle implementado.

Os artefatos são montados como somente leitura na API. O relatório fica em `/analysis/sprint2`, os dados em `/analysis/sprint2/data` e as fontes em `/analysis/sprint2/source/{ID}`. Somente identificadores B/E/C com dois dígitos são aceitos. O catálogo registra o caminho e SHA-256 de cada fonte.
