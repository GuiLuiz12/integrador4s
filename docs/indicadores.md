# Catálogo dos indicadores — v1.0

## Operação

Todos os indicadores têm como responsável **Operação do laboratório**. Coleta e avaliação a cada 15 s; atualização do painel a cada 15 s. A verificação leva até 3 s: o reflexo visual ocorre em aproximadamente 30 s mais sua execução. Regras intermediárias podem acrescentar um ciclo; validar até 45 s. Os alertas de continuidade exigem um minuto de persistência; o alerta de falhas de login exige 15 segundos.

| Indicador | Fonte e cálculo | Janela / meta | Limites de interpretação |
|---|---|---|---|
| Disponibilidade assistencial | `100 * avg_over_time(probe_success{job="probe"}[janela])` | Período selecionado; ≥99% | Só verificações observadas; não representa SLA mensal |
| Estado assistencial atual | `lab:clinical_available` | Última avaliação | Sem coleta válida: sem dados |
| Latência p95 | `histogram_quantile(0.95, sum by(le)(rate(clinical_request_duration_seconds_bucket{route="/prontuarios/:id",traffic="clinical"}[5m])))`, exibido somente quando a taxa do contador de observações for maior que zero | 5 min; ≤0,5 s | Estimativa por buckets; somente consultas HTTP 200; exclui probes e login; sem tráfego: sem dados |
| Erros clínicos | 100 × taxa de respostas 5xx / taxa de todas as respostas clínicas | 5 min; <1% | Denominador zero: sem dados; falha antes de chegar à API aparece no verificador/gerador |
| Volume clínico | Soma da taxa de `clinical_requests_total` da rota de consulta e tráfego clínico | 5 min; sem meta | Respostas concluídas, não requisições perdidas na rede |
| Falhas de autenticação | `increase(clinical_auth_failures_total[janela])`, por login/token | Período selecionado; sem meta | `increase` extrapola bordas e pode produzir frações; contagem exata está nos logs; não é KRI |
| Cobertura da coleta | `lab:collection_coverage_percent` | Atual; alvo 100% | Alvos esperados respondendo, não saúde assistencial |
| Completude temporal | 100 × amostras do probe / (segundos do período ÷ 15), limitado a 100 | Período selecionado | Aproximação para revelar lacunas; bordas têm erro de até um ciclo |
| CPU/memória dos contêineres | CPU consumida / limite de CPU; memória em uso / limite de memória, em % | Tendência de 5 min para CPU; limiar preventivo de 80% | APP-01 e DB-01 usam seus limites configurados; métricas filtradas por projeto |
| CPU/memória do host | CPU não ociosa / capacidade; memória utilizada / total, em % | Tendência; limiar preventivo de 80% | Inclui processos externos; não equivale à soma dos limites dos contêineres |
| Rede da API | Taxas de bytes recebidos + enviados, convertidas em KiB/s | 5 min; sem meta | Tráfego do contêiner, não quantidade de consultas |

As metas são didáticas, escolhidas para a demonstração. Uma indisponibilidade intencional de dois minutos em uma hora pode levar a disponibilidade abaixo de 99%; isso é esperado e deve ser explicado.

## Alertas

- `ConsultaAssistencialIndisponivel`: fluxo observado falha continuamente por um minuto; criticidade crítica; impacto na consulta simulada.
- `FalhaDeColeta`: alvo esperado sem coleta válida por um minuto; criticidade de atenção; recuperar a observação.
- `FalhasDeLoginRepetidas`: `sum(increase(clinical_auth_failures_total{stage="login"}[1m])) >= 5`, persistindo por 15 segundos; criticidade de atenção (`warning`); investigar eventos de autenticação e seguir a diretriz de resposta. Falhas de token não entram nessa expressão.

As regras rodam no Prometheus. O dashboard mostra `ALERTS` em estado pendente/disparado e a evolução temporal; não há notificação externa nem Alertmanager separado. O fim da série do alerta, junto à coleta válida e à consulta bem-sucedida, comprova recuperação. Se Prometheus parar, a fonte de dados do Grafana falha: não há autodetecção externa nessa arquitetura.

O banco e a API podem sofrer mais de uma falha ao mesmo tempo. O painel orienta investigação; não atribui causa raiz automaticamente. As médias de MTTD/MTTR do v0.2 usam apenas os dois incidentes classificados no recorte analítico abaixo.

## Exportação para análise da Sprint 2

O refinamento exportou o histórico descrito no [contrato das evidências](evidencias.md). O baseline de 30 minutos e o experimento de 60 minutos são conjuntos separados, cada um precedido por estabilização. Os arquivos usam o mesmo intervalo UTC para métricas e eventos.

Além das amostras de disponibilidade, coleta, alertas e carga, `series.json` preserva CPU/memória do host, CPU/memória/rede dos sete serviços, tentativas do gerador, contadores da API e buckets do histograma clínico. `derived.json` contém as curvas de CPU%, memória%, CPU por serviço em núcleos, bytes/s de rede, respostas/s clínicas, erros% e p95, com o PromQL e as referências das fontes. Médias e picos podem ser calculados na Sprint 2 sobre o período/fase declarado; os dados do host incluem cargas externas ao projeto.

O resumo offline usa amostras originais para a disponibilidade e a completude. Seus incrementos observados de contadores tratam resets visíveis, mas não extrapolam bordas como o Prometheus. A contagem de logins inválidos vem das respostas nos logs, consolidadas pela chave serviço + instância + correlação. Um `request_error` não é uma segunda resposta.

No experimento, a timeline registra início confirmado da interrupção do banco, primeira amostra do alerta em `firing`, solicitação de restauração e primeiro probe bem-sucedido após ela. As respostas foram automatizadas pelo roteiro. As convenções e os limites estão em [Tempo do incidente simulado](evidencias.md#tempo-do-incidente-simulado).

A quantidade de pontos em `ALERTS` mede observações do estado, não quantidade de alertas distintos ou incidentes. A análise agrupa amostras `firing` com o mesmo conjunto de labels e intervalo máximo de 30 s em um episódio.

## Análise da Sprint 2

Fonte canônica: `analysis/sprint2/analysis.json`, reproduzida conforme o [manual principal](../README.md#desenvolver-e-manter-o-código). O [relatório estático](relatorio-sprint2.md) documenta valores, limiares, decisões e fontes identificadas. O baseline é de 21/10/2026; o experimento é de 26/10/2026, 19:57–20:57, UTC−03. Esses painéis usam um recorte fixo, independente do seletor de tempo do Grafana.

O dashboard histórico v0.2 usava UID `saude-v01`. Suas visões de baseline × experimento, CPU por fase, matriz e registro de riscos, severidade/exposição dos achados, incidentes, episódios de alerta e KPIs/KRIs permanecem nas seções expansíveis da visão técnica CyPark. Seus painéis analíticos renderizam CSVs explícitos pela [fonte nativa TestData do Grafana](https://grafana.com/docs/grafana/latest/datasources/testdata/), no cenário `csv_content`, sem geração aleatória. A seção operacional usa Prometheus e respeita o intervalo selecionado. Assim, alterar o seletor de tempo atualiza a operação, mas não recalcula o recorte analítico histórico.

A tabela analítica consolida 18 indicadores, com fonte por linha e altura ajustada ao número de registros. Os IDs B/E/C remetem ao [catálogo de fontes preservadas](evidencias.md#análise-histórica-da-sprint-2), sem depender de rotas HTTP de relatório. Geração, provisionamento e conferência visual estão centralizados no manual. Conformidade e acompanhamento de controles aparecem nas visões próprias da Sprint 3 abaixo, sem modificar o registro histórico.

| Indicador | Definição / população | Interpretação |
|---|---|---|
| CPU/memória média e pico | Média aritmética e máximo das amostras; serviços em % do limite do contêiner | Referência proposta de 80%; host inclui processos externos |
| Disponibilidade funcional | Verificações de login e consulta bem-sucedidas / observadas | API + dependência do PostgreSQL, sem disponibilidade funcional independente por serviço; `up` mede apenas coleta |
| Alertas por criticidade | Episódios `firing` agrupados por labels e continuidade | Um crítico e um de atenção; não contar cada amostra |
| Incidentes abertos/fechados | Dois cenários com início, detecção e recuperação observados | 0 abertos / 2 fechados ao final |
| MTTD | Média de detecção − início confirmado, n=2 | 90,76 s; meta proposta ≤120 s |
| MTTR após detecção | Média de recuperação observada − detecção, n=2 | 26,04 s; meta proposta ≤60 s; inclui perda de observabilidade |
| Tempo até ação automatizada | Solicitação de restauração − início confirmado, por incidente | 120,00 s no banco; 90,00 s no probe. Ação programada, não reação humana nem MTTR |
| Vulnerabilidades por severidade/ativo | Cinco achados de código/configuração em `registers.json` | Duas altas; contagem de achados não mede exposição por si só; exposição detalhada no relatório |
| Riscos altos/críticos | Cinco riscos avaliados por P × I; alto 10–16, crítico 17–25 | Quatro riscos; probabilidades qualitativas do cenário |
| Tratamento definido | Riscos com estratégia, ação, responsável e prazo / total | 100%; todos planejados, sem afirmar mitigação |
| Falhas de login | Dez HTTP 401 nos eventos do cenário de repetição | Limiar proposto de investigação ≥5/min; não comprova invasão |

As médias de resposta descrevem esta sessão e sua automação, não uma série histórica de operação. A integridade das fontes foi conferida; a rejeição do verificador antigo por contagem de respostas 503 permanece registrada como limitação da coleta utilizada.

## Segurança e governança da Sprint 3

Fontes canônicas: `analysis/sprint3/analysis.json` e seu registro de controles, riscos e ações. O catálogo de fontes identifica o arquivo original, origem, intervalo, consulta/seletor e hash. Os eventos ao vivo vêm do Loki; o volume exato das simulações é contado em `events.jsonl`, preservando a chave serviço/instância/correlação. Os dados fixos das duas execuções não mudam ao alterar o intervalo operacional do Grafana. Os 12 indicadores consolidados usam IDs S3-K01–S3-K12; os demais itens abaixo são leituras operacionais e comparações de apoio.

| Indicador | Fonte e fórmula | Responsável / atualização | Limiar e decisão |
|---|---|---|---|
| Sinal de falhas de login | Prometheus: expressão de `FalhasDeLoginRepetidas`; eventos Loki para investigação | Segurança de TI / avaliação a cada 15 s | Estimativa ≥5/min por 15 s: investigar; limiar didático, não prova de invasão |
| S3-K11 · Falhas de login observadas | Respostas `authentication`, `status=401`, distintas por requisição no intervalo | Segurança de TI / por execução | Contagem exata da evidência; confirmar correspondência com o alerta |
| Fontes de eventos e coleta | Eventos da API consultáveis no Loki; `up` dos jobs `loki` e `alloy` | Operação de TI / ao vivo | Coleta ativa não comprova entrega de cada evento; conferir evento recente e janela consultada |
| S3-K07 · Incidentes abertos/fechados | Contagem dos registros por status, categoria e recorte | Segurança de TI / por mudança e consolidação | Encerrar somente com as condições do cenário confirmadas; sem evidência, manter aberto/incompleto |
| S3-K08 · MTTD de segurança | Média de primeiro `firing` − primeiro `401`; exibir n e valores individuais | Segurança de TI / duas execuções separadas | Limite de 120 s para observação do disparo no roteiro; sem disparo não produzir zero |
| S3-K10 · Tempo até ação automatizada | Interrupção do gerador − detecção, por incidente | Segurança de TI / por execução | Ação deve ocorrer após detecção; não mede reação humana |
| S3-K09 · MTTR simulado de segurança | Média de encerramento confirmado − detecção | Segurança de TI / por execução e consolidação | Encerramento exige consulta válida, alerta resolvido e 60 s sem novas falhas; não representa restauração clínica |
| S3-K04 · Riscos altos/críticos inerentes e residuais | Quantidade por faixa P × I; escalas e cinco IDs históricos preservados | Operação/Segurança de TI / por revisão de evidência | Alto 10–16; crítico 17–25. Priorizar tratamento e manter justificativa da avaliação residual |
| S3-K05 · Tratamento definido | Riscos com estratégia, ações, responsável e prazo / riscos aplicáveis | Operação de TI / por revisão | 100% de cobertura desejada; não significa mitigação concluída |
| S3-K01 · Conformidade interna | 100 × controles implementados / dez controles aplicáveis | Operação/Segurança de TI / checkpoint inicial e final | Buscar atendimento integral; exibir parciais e pendentes sem pontuação fracionária arbitrária |
| S3-K02 · Controles parciais/pendentes | Contagem de controles em cada status, sem misturar com implementados | Operação/Segurança de TI / por checkpoint | Manter a pendência visível até comprovar o critério completo |
| S3-K03 · Gaps críticos | Controles parciais/pendentes ligados a pelo menos um risco alto ou crítico, sem duplicar controle | Segurança de TI / por checkpoint | Meta zero; priorizar os gaps com maior risco associado |
| S3-K06 · Ações concluídas | Ações com status concluído e evidência válida / ações registradas | Responsável da ação / por execução ou revisão | Não concluir uma ação com base apenas no plano; manter prazos D+ e status separados |
| S3-K12 · Alertas de segurança por criticidade | Episódios do caso observado, separados das amostras `ALERTS` e dos alertas históricos | Segurança de TI / por execução e consolidação | Correlacionar disparo e encerramento com a timeline; não contar cada scrape como alerta novo |
| Evolução de controles e ações | Comparação dos checkpoints inicial/final, com fontes e datas próprias | Operação de TI / por checkpoint | Demonstrar mudança comprovada, sem retrospectivamente atribuir resultados ao histórico |

As duas execuções são amostras de uma demonstração controlada. A comparação mostra variação observada, não tendência estatística nem melhoria automática. Os incidentes de continuidade da Sprint 2 permanecem separados; suas médias não são agregadas aos tempos de segurança.

As notas de risco residual conservam P/I quando a evidência demonstra melhoria de detecção ou investigação sem sustentar redução da probabilidade ou impacto. Os cinco achados originais continuam identificados como históricos; situação atual e tratamentos têm referências novas. Controles e ações são avaliações administrativas sustentadas por fontes técnicas, não fontes independentes das próprias conclusões.

## Leitura dos dashboards CyPark

A entrada executiva conserva o UID `saude-v01`; o UID `cypark-secops` abre a investigação técnica. A navegação entre blocos conserva o intervalo e o contexto, inclusive em kiosk. Instalação, operação e capturas estão no [manual principal](../README.md#dashboards-cypark).

| Visão | Blocos principais | Recorte |
|---|---|---|
| Executiva | Disponibilidade; resposta dos ensaios; falhas de login; distribuição de riscos; continuidade clínica; achados por ativo; matriz inerente; tratamentos prioritários | Métricas ao vivo no período selecionado; registros com data do checkpoint; ensaios com categoria, data e n |
| Operação & SecOps | p95/erros; vazão/rede; capacidade APP-01, DB-01 e HOST-01; coleta; alertas/incidentes; vulnerabilidades; autenticação/logs | Séries e logs no período selecionado; classificação e situação dos incidentes conforme os registros preservados |
| Detalhes expansíveis | Controles, evolução, ações completas, riscos residuais, infraestrutura dos nove serviços e histórico das sprints | Cada tabela histórica mantém seu período; a infraestrutura operacional respeita os filtros indicados |

Os oito e nove blocos são grupos de leitura, podendo usar subpainéis alinhados para unidades diferentes. O filtro de serviço atua na infraestrutura; os filtros de evento/correlação atuam nos logs da API. O campo Correlação aceita o ID literal ou `.*` para todos, não uma regex arbitrária. A correlação deve ser interpretada junto de `service` e `instance_id`, pois um diagnóstico `request_error` não é uma nova resposta da requisição.

Na síntese de incidentes, indisponibilidade clínica (`INC-01`, n=1), perda de coleta (`INC-02`, n=1) e autenticação (`INC-03`/`INC-04`, n=2) são apresentados separadamente. Os valores históricos consolidados da Sprint 2 continuam preservados em sua seção, sem serem usados como média de uma única categoria nem agregados aos novos ensaios. MTTD mede início até detecção; MTTR mede detecção até a recuperação/encerramento definido em cada cenário. O tempo até a ação tem bases distintas: início→solicitação na Sprint 2, detecção→interrupção do gerador na Sprint 3.

A continuidade clínica separa consultas 2xx, consultas 5xx e respostas 503 de `/auth/login`. Login que falha antes da autenticação permanece com `traffic="unauthenticated"`; aplicar o filtro clínico a essa série esconderia falhas. A p95 inclui somente consultas bem-sucedidas e aparece junto dos erros 5xx. Disponibilidade funcional vem do fluxo autenticado, incluindo o banco; `up` continua medindo coleta.

Exposição por ativo combina quantidade/severidade dos achados, acesso e dependência operacional; a barra conta achados e não cria score. A matriz usa P × I qualitativo; risco inerente e residual mantêm seus significados. O plano mostra a cobertura de tratamentos definidos separada das ações concluídas. Conformidade refere-se à diretriz interna, não a uma avaliação de LGPD.

A rotação Docker de 10 MB × 3 arquivos e a retenção Loki de sete dias são configurações. Não há indicador de volume dos logs locais nem comprovação de sete dias contínuos nessas leituras. Ausência de dados aparece em cinza, sem ser convertida em zero incidentes ou disponibilidade de 100%; lacunas não são interpoladas. Verde, amarelo e vermelho codificam estados com rótulos; ciano/lavanda são acentos e séries sem classificação de risco.

As figuras de entrega devem preservar títulos, período, fonte e legenda, conforme o [guia estático](entrega-sprint3.md). Capturas novas recebem diretório próprio; as figuras e os pacotes históricos permanecem preservados.
