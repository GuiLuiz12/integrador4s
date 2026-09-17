# Relatório técnico-executivo — Sprint 1

**Status: concluída em 17/09/2026.** DoD verificada; os sete serviços foram deixados ativos para uso local, conforme o [estado final registrado](../evidence/validated/sprint1/retomada-20260917/status.json).

## Entrega

Laboratório clínico fictício em Docker Compose com sete serviços: API, PostgreSQL, gerador/verificador, Prometheus, Grafana, Node Exporter e cAdvisor. O Dashboard v0.1 apresenta indicadores de continuidade, desempenho, autenticação e cobertura, com impacto fictício, responsável e procedimento de recuperação.

Escopo planejado para duas semanas e 20–40 horas totais de esforço. Esse orçamento não pressupõe equipe de tamanho específico nem execução paralela.

O fechamento utiliza a sessão real de 10/09/2026 e uma validação de retomada em 17/09/2026, documentadas separadamente nas [evidências revisadas](../evidence/validated/sprint1/README.md).

## Retomada e verificações de 17/09/2026

Os sete contêineres estavam parados. A retomada preservou `.env` e os três volumes existentes, reconstruiu a imagem local com as versões fixadas e reativou o laboratório. O histórico de 10/09 foi validado pelos arquivos exportados, independentemente da retenção do Prometheus.

| Verificação | Resultado |
|---|---|
| Compilação TypeScript | Aprovada |
| Testes automatizados de API, verificador e restauração por sinal | 10 aprovados; nenhuma falha |
| Configuração Compose | Aprovada |
| Testes de regras com promtool | 3 cenários aprovados |
| API e login pelo ambiente Docker | Aprovados |
| Dados iniciais | 100 prontuários e 3 identidades fictícias |
| Credencial da API | SELECT permitido; INSERT, UPDATE e DELETE negados; tentativa de UPDATE recusada |
| Inicialização repetida | Sem duplicação de registros |
| Coleta | 7 de 7 alvos respondendo; métricas dos 7 contêineres disponíveis |
| Publicação | Somente 127.0.0.1:3000 e 127.0.0.1:3001 |
| Limites agregados | 5,75 CPUs e 7 GiB de memória |
| Reconstrução dos contêineres | Dados e configuração preservados em volumes |
| Grafana após a retomada | Login e 29 painéis validados; consultas sem erros; nenhum erro JavaScript; capturas revisadas |
| Segredos | Arquivos versionáveis e evidências revisados sem correspondências com os valores do `.env`; arquivo com modo 0600 |
| Sessão completa de uma hora | Concluída em 10/09; consolidador aprovado em 17/09 |

Os [resultados das verificações](../evidence/validated/sprint1/retomada-20260917/checks.json) registram comandos e critérios.

A validação visual aceitou o período de **17/09/2026, 19:24–19:29 (America/Sao_Paulo)**, após a estabilização inicial da coleta. Foram 20 verificações com sucesso em 20 observações, disponibilidade e cobertura de 100%, p95 estimado de 9,50 ms e nenhum alerta disparado no horário final. A carga configurada foi de uma consulta por segundo. Fontes: [métricas do intervalo](../evidence/validated/sprint1/retomada-20260917/metrics.json), [resultado do navegador](../evidence/validated/sprint1/retomada-20260917/validation.json), [síntese gerencial](../evidence/validated/sprint1/retomada-20260917/sintese.png) e [infraestrutura](../evidence/validated/sprint1/retomada-20260917/infraestrutura.png).

Uma captura preliminar incluiu os primeiros 30 s de inicialização, quando a cobertura ainda estava preenchendo os alvos. O recorte de aceitação começa após essa estabilização; a captura preliminar permanece nos artefatos locais. A validação de retomada não substitui nem se soma à sessão de falhas de 10/09.

## Resultado da sessão de uma hora

A sessão ocorreu em 10/09/2026, das 20:17:41 às 21:17:41, no fuso America/Sao_Paulo. O roteiro registrou 3.600,18 segundos a partir do início do processo; a primeira marcação de evento ocorreu 0,41 s depois. A exportação foi capturada em 11/09/2026 às 00:17:41 UTC. Os artefatos completos passaram no consolidador, sem repetir os experimentos ou fabricar histórico.

| Medição | Resultado observado |
|---|---|
| Verificações assistenciais | 234; 226 com sucesso e 8 com falha |
| Disponibilidade observada | 96,58% das verificações efetivamente coletadas |
| Carga ampliada | 5 consultas/s por aproximadamente 10 minutos |
| Logins inválidos | 10 eventos HTTP 401 |
| Interrupção do PostgreSQL | 120,32 s entre o início do experimento e a solicitação de reinício |
| Consultas clínicas afetadas | 120 eventos HTTP 503 |
| Primeiro alerta clínico disparado | 20:49:05,747; 84,81 s após o início do experimento |
| Primeira consulta bem-sucedida observada após o reinício | 20:49:45,241 |
| Maior intervalo entre verificações consecutivas | 105 s durante a interrupção do verificador |
| Alertas de falha de coleta | Disparados para os jobs `probe` e `lab` |
| Cobertura de coleta no encerramento | 100%; sete alvos respondendo |

Fontes: [resumo conferido](../evidence/validated/sprint1/historico-20260910/summary.json), [linha temporal](../evidence/validated/sprint1/historico-20260910/session.json), [métricas](../evidence/validated/sprint1/historico-20260910/metrics.json) e [eventos filtrados](../evidence/validated/sprint1/historico-20260910/events.jsonl).

A meta didática de disponibilidade de 99% não foi atingida porque a sessão incluiu indisponibilidade intencional. O indicador usa 226 sucessos divididos por 234 verificações; a ausência de coleta não entra como sucesso. Essa medição curta não representa SLA mensal. O atraso de 84,81 s é a observação deste único experimento, não um MTTD médio; a avaliação a cada 15 s e a persistência de um minuto contribuem para esse tempo.

Durante a queda do banco, a API respondeu HTTP 200 em vitalidade e HTTP 503 em prontidão, conforme a [captura de saúde](../evidence/validated/sprint1/historico-20260910/health-during-outage.json). O [painel de indisponibilidade](../evidence/validated/sprint1/historico-20260910/alerts/ConsultaAssistencialIndisponivel/dashboard.png) mostra consulta indisponível, alerta ativo e cobertura de coleta de 100%.

Na interrupção do verificador, a coleta da API permaneceu disponível e não surgiu falso alerta clínico. O [painel de falha de coleta](../evidence/validated/sprint1/historico-20260910/alerts/FalhaDeColeta/dashboard.png) mostra “Sem dados” e cobertura de 71,4%. A captura retrata o primeiro alerta, do job `probe`; os dados completos comprovam que `lab` também disparou. Os 105 s representam o espaçamento entre amostras, não a duração exata da parada nem indisponibilidade clínica comprovada.

As imagens dos alertas usam intervalos absolutos parciais da sessão. Por isso apresentam percentuais diferentes dos 96,58% do período completo. Os respectivos arquivos `observation.json` distinguem o instante observado do instante de captura.

Uma execução inicial foi interrompida durante a validação das redes e não é considerada sessão concluída. API e Grafana passaram a usar uma rede de acesso adicional, com publicação somente em loopback. As redes do banco e da coleta permanecem internas.

## Decisão gerencial

Responsável: **Operação do laboratório**. A falha de consulta representa atraso no atendimento clínico fictício. Com coleta válida e alerta persistente, priorizar a investigação da dependência e a restauração da consulta. No experimento, a intervenção foi restaurar o PostgreSQL; a consulta bem-sucedida e o fim do alerta confirmaram o resultado.

Quando a falha é de coleta, priorizar a recuperação da observação. A ausência de dados não comprova disponibilidade nem indisponibilidade do serviço. O [procedimento de recuperação](recuperacao.md) orienta a confirmação antes de atribuir causa ou encerrar a intervenção.

## Checklist de conclusão — DoD

- [x] Sete serviços reativados, com dados e credenciais preservados; autenticação e consulta funcionais — [verificações](../evidence/validated/sprint1/retomada-20260917/checks.json).
- [x] Coleta automática de aplicação, host e sete contêineres; cobertura de 100% — [verificações](../evidence/validated/sprint1/retomada-20260917/checks.json).
- [x] Dashboard validado no navegador após a retomada, com período absoluto e indicadores preenchidos — [validação visual](../evidence/validated/sprint1/retomada-20260917/validation.json).
- [x] Carga, logins inválidos, falhas, alertas e recuperação comprovados — [sessão consolidada](../evidence/validated/sprint1/historico-20260910/summary.json).
- [x] Somente portas locais 3000 e 3001, usuário da aplicação sem escrita e limites dentro de 6 CPUs/8 GiB — [verificações](../evidence/validated/sprint1/retomada-20260917/checks.json).
- [x] Documentação e evidências finais revisadas, com laboratório ativo para uso — [índice de evidências](../evidence/validated/sprint1/README.md), [instruções de acesso](../README.md#acessos-locais) e [estado dos serviços](../evidence/validated/sprint1/retomada-20260917/status.json).

## Limitações

- Dados e impacto assistencial inteiramente fictícios; metas de desempenho didáticas.
- Um único host e um único Prometheus; a perda total do laboratório não é detectada externamente.
- O p95 é uma estimativa por histograma de respostas bem-sucedidas; erros e disponibilidade são indicadores separados.
- A API usa um perfil simples de leitura de todos os prontuários fictícios, sem autorização por vínculo profissional–paciente.
- Retenção máxima de sete dias, também limitada a 2 GB; logs locais com rotação, sem centralização. A seleção revisada preserva a evidência da sessão após a expiração do histórico.
- Não há nesta sprint KRIs, registro formal de riscos, avaliação de conformidade, workflow de tratamento ou implantação real em nuvem.

Os artefatos brutos continuam em `evidence/runs/`, ignorados pelo Git; a seleção revisada está em `evidence/validated/sprint1/`.
