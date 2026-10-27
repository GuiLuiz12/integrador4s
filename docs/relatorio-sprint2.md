# Modelo 03 — Relatório da Sprint 2 | Analisar

## 1. Resumo da sprint

A análise identificou capacidade disponível sob carga de até cinco consultas/s e duas interrupções distintas: indisponibilidade assistencial causada pela parada do banco e perda de observabilidade causada pela falha do probe. Ambos os incidentes foram encerrados. A disponibilidade observada foi 96,58%, com 8 verificações malsucedidas em 234. O principal fator de continuidade é a dependência do banco, não a saturação de CPU ou memória. [E02](../analysis/sprint2/sources/E02.txt) [E03](../analysis/sprint2/sources/E03.txt) [E04](../analysis/sprint2/sources/E04.txt) [E05](../analysis/sprint2/sources/E05.txt)

Foram registrados cinco achados de configuração/arquitetura e cinco riscos inerentes: 1 crítico e 3 altos. Todos têm tratamento, responsável e prazo propostos; isso não significa que os controles já estejam implementados. As prioridades são recuperação do banco, autorização por prontuário e limitação de tentativas de login. [C01](../analysis/sprint2/sources/C01.txt) [C02](../analysis/sprint2/sources/C02.txt) [C03](../analysis/sprint2/sources/C03.txt)

## 2. Período e qualidade dos dados

| Conjunto | Início — São Paulo (UTC−03) | Fim — São Paulo (UTC−03) | Uso |
| --- | --- | --- | --- |
| Baseline | 21/10/2026 20:54:23 | 21/10/2026 21:24:25 | 30 minutos em carga normal; [B01](../analysis/sprint2/sources/B01.txt) [B02](../analysis/sprint2/sources/B02.txt) [B03](../analysis/sprint2/sources/B03.txt) |
| Experimento | 26/10/2026 19:57:04 | 26/10/2026 20:57:05 | 60 minutos após estabilização; [E01](../analysis/sprint2/sources/E01.txt) [E02](../analysis/sprint2/sources/E02.txt) [E03](../analysis/sprint2/sources/E03.txt) [E04](../analysis/sprint2/sources/E04.txt) [E05](../analysis/sprint2/sources/E05.txt) |

Fontes: Prometheus (coleta/avaliação a cada 15 s), cAdvisor, Node Exporter, logs estruturados da API e timeline do roteiro. O experimento contém 234 verificações, 226 bem-sucedidas e completude temporal de 97,47%. A lacuna planejada do probe foi de aproximadamente 90 s. A maior lacuna de recursos dos contêineres foi 129,7 s. Ausência de dados não foi preenchida. [E01](../analysis/sprint2/sources/E01.txt) [E03](../analysis/sprint2/sources/E03.txt) [E05](../analysis/sprint2/sources/E05.txt)

Limitações: cenário simulado, janela curta, host compartilhado, imagens locais reconstruídas e sessões em dias diferentes. CPU/memória do host incluem outras aplicações. Médias e picos são calculados sobre amostras disponíveis; CPU, tráfego, erros e p95 usam curvas de cinco minutos. A média dos p95 não é o p95 global. Os limiares são referências propostas para o cenário, não SLA contratual. O baseline não demonstra uma tendência histórica de longo prazo.

O verificador anterior rejeitou a sessão por exigir 60 respostas 503 exclusivamente na consulta: foram 23 na consulta e 106 na autenticação, pois a renovação do token ocorreu durante a parada. A integridade das fontes foi conferida; a coleta completa, os alertas e a recuperação sustentam esta análise. A rejeição original foi preservada e não é ocultada nem convertida em aprovação. [E01](../analysis/sprint2/sources/E01.txt) [E03](../analysis/sprint2/sources/E03.txt) [E04](../analysis/sprint2/sources/E04.txt) [C06](../analysis/sprint2/sources/C06.txt)

## 3. Baseline operacional

| Métrica | Média baseline | Pico baseline | Limiar | Interpretação |
| --- | --- | --- | --- | --- |
| CPU APP-01 (% do limite de 1 CPU) | 2,57 | 2,75 | ≤ 80,00 | Folga de processamento; não há evidência de saturação. |
| Memória APP-01 (% de 768 MiB) | 14,05 | 14,25 | ≤ 80,00 | Crescimento entre sessões, ainda distante do limite; não comprova vazamento. |
| CPU DB-01 (% do limite de 1 CPU) | 1,40 | 1,46 | ≤ 80,00 | Baixo consumo; a indisponibilidade decorre da parada programada. |
| Memória DB-01 (% de 1.536 MiB) | 1,93 | 2,18 | ≤ 80,00 | Uso baixo em relação à capacidade configurada. |
| CPU HOST-01 (%) | 6,58 | 11,96 | ≤ 80,00 | Inclui processos externos ao projeto. |
| Memória HOST-01 (%) | 21,52 | 23,78 | ≤ 80,00 | Diferença entre sessões pode incluir outras aplicações do host. |
| Tráfego APP-01 (KiB/s) | 2,81 | 2,90 | Referência comparativa | Comparar com o baseline; não há capacidade de rede contratada definida. |
| Consultas concluídas (respostas/s) | 1,00 | 1,00 | Referência comparativa | Baseline próximo de 1/s; carga ampliada próxima de 5/s. |
| Latência p95 (ms) | 9,51 | 9,53 | ≤ 500,00 | P95 estimado por histogramas em janelas de cinco minutos. |
| Erros de consulta (%) | 0,00 | 0,00 | < 1,00 | Conta somente respostas da rota clínica; falhas de login ficam fora. |
| Disponibilidade assistencial (%) | 100,00 | 100,00 | ≥ 99,00 | Considera apenas verificações observadas; lacunas não são sucesso. |

Fontes das linhas: [B02](../analysis/sprint2/sources/B02.txt) [B03](../analysis/sprint2/sources/B03.txt). APP-01 = API (1 CPU, 768 MiB); DB-01 = PostgreSQL (1 CPU, 1.536 MiB); HOST-01 = máquina anfitriã. MON-01 reúne Prometheus/probe; LOG-01 representa a retenção local de logs. CPU e memória dos serviços usam os limites do contêiner como denominador. O limiar de 80% preserva margem operacional; p95 ≤500 ms, erros <1% e disponibilidade ≥99% seguem as referências do projeto. Tráfego e volume usam o baseline como comparação, sem limiar de saturação inventado. [C01](../analysis/sprint2/sources/C01.txt) [C04](../analysis/sprint2/sources/C04.txt)

## 4. Anomalias e causas prováveis

| Horário em 26/10 | Evidência | Impacto / hipótese | Ação recomendada |
| --- | --- | --- | --- |
| 20:07–20:17 | Carga de 5/s; pico CPU APP-01 3,58%; p95 máximo 9,53 ms. [E02](../analysis/sprint2/sources/E02.txt) [E05](../analysis/sprint2/sources/E05.txt) | Aumento de demanda sem saturação observada. | Manter capacidade e acompanhar crescimento; não ampliar recursos só por este ensaio. |
| 20:22 | Dez logins recusados com HTTP 401. [E04](../analysis/sprint2/sources/E04.txt) [E05](../analysis/sprint2/sources/E05.txt) | Tentativas controladas; nenhum acesso indevido comprovado. | Aplicar limitação e alerta por repetição (R-03). |
| 20:27–20:29 | Banco parado; 23 consultas e 106 autenticações com HTTP 503. [E03](../analysis/sprint2/sources/E03.txt) [E04](../analysis/sprint2/sources/E04.txt) [E05](../analysis/sprint2/sources/E05.txt) | Dependência do banco interrompe o fluxo; renovação de token muda a etapa da falha. | Priorizar recuperação e backup (R-01). |
| 20:37–20:38 | Probe sem coleta; API e gerador continuam. [E03](../analysis/sprint2/sources/E03.txt) [E05](../analysis/sprint2/sources/E05.txt) | Perda de visibilidade, sem indisponibilidade clínica demonstrada nesse intervalo. | Adicionar observação externa (R-04). |
| Comparação entre sessões | Memória média APP-01: 14,05% → 22,67%. [B03](../analysis/sprint2/sources/B03.txt) [E03](../analysis/sprint2/sources/E03.txt) | Maior working set com outra sessão/imagem/carga; dados não provam vazamento. | Acompanhar séries mais longas antes de atribuir causa ou alterar limites. |

## 5. Vulnerabilidades

Inventário obtido por revisão de código, configuração e evidências do cenário. São fragilidades de controle e arquitetura; não se trata de uma lista de CVEs confirmadas por scanner. A exposição atual é local, com API e Grafana vinculados a loopback. As severidades representam impacto potencial no cenário de saúde.

| ID | Ativo | Achado | Severidade | Exposição | Tratamento / evidência |
| --- | --- | --- | --- | --- | --- |
| VUL-01 | APP-01 | Leitura sem vínculo entre profissional e prontuário | Alta | Usuário autenticado pode consultar qualquer ID válido; acesso restrito ao ambiente local. | Aplicar autorização por vínculo profissional–paciente e testar acesso cruzado. [C02](../analysis/sprint2/sources/C02.txt) [C03](../analysis/sprint2/sources/C03.txt) |
| VUL-02 | APP-01 | Autenticação sem limitação de tentativas | Média | Endpoint local de login; dez tentativas consecutivas foram processadas e recusadas, sem bloqueio progressivo. | Limitar tentativas por origem/identidade e criar alerta por janela curta. [C02](../analysis/sprint2/sources/C02.txt) [E04](../analysis/sprint2/sources/E04.txt) [E05](../analysis/sprint2/sources/E05.txt) |
| VUL-03 | DB-01 | Persistência em instância única | Alta | A indisponibilidade do PostgreSQL interrompe autenticação e consultas. | Definir recuperação, cópias de segurança e ensaio de restauração; avaliar réplica conforme criticidade. [C01](../analysis/sprint2/sources/C01.txt) [E03](../analysis/sprint2/sources/E03.txt) [E04](../analysis/sprint2/sources/E04.txt) [E05](../analysis/sprint2/sources/E05.txt) |
| VUL-04 | MON-01 | Monitoramento concentrado no mesmo host | Média | Perda do host também elimina a observação local; a falha do probe demonstrou perda parcial de visibilidade. | Adicionar verificação externa e notificação de ausência de coleta. [C01](../analysis/sprint2/sources/C01.txt) [C04](../analysis/sprint2/sources/C04.txt) [E03](../analysis/sprint2/sources/E03.txt) [E05](../analysis/sprint2/sources/E05.txt) |
| VUL-05 | LOG-01 | Logs locais sujeitos a rotação sem arquivo central | Média | Histórico pode ser perdido por rotação ou falha do host, reduzindo a capacidade de investigação. | Definir retenção e exportação periódica; centralizar logs na Sprint 3. [C01](../analysis/sprint2/sources/C01.txt) [C05](../analysis/sprint2/sources/C05.txt) |

## 6. Registro e matriz de riscos

Avaliação qualitativa do cenário: probabilidade e impacto de 1 a 5; risco inerente = P × I. Baixo 1–4, moderado 5–9, alto 10–16, crítico 17–25. Prioridades e prazos são propostas de tratamento, não controles já implementados. A probabilidade é uma avaliação qualitativa do cenário, não a frequência das falhas induzidas. Impacto considera continuidade, confidencialidade e capacidade de investigação. Responsáveis são papéis organizacionais propostos.

| ID | Ativo/processo | Ameaça | Vulnerabilidade | Prob. | Impacto | Risco | Responsável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | DB-01 / atendimento | Falha da dependência de dados | VUL-03 | 4 | 5 | 20 · Crítico | Operação de TI |
| R-02 | APP-01 / acesso clínico | Uso indevido de credencial válida | VUL-01 | 3 | 5 | 15 · Alto | Desenvolvimento |
| R-03 | APP-01 / autenticação | Tentativas repetidas de adivinhação de senha | VUL-02 | 3 | 4 | 12 · Alto | Segurança de TI |
| R-04 | MON-01 / detecção | Perda do coletor ou do host monitorado | VUL-04 | 3 | 4 | 12 · Alto | Operação de TI |
| R-05 | LOG-01 / investigação | Perda de registros operacionais | VUL-05 | 2 | 4 | 8 · Moderado | Operação de TI |

| Probabilidade ↓ / Impacto → | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| 5 · Quase certo | — | — | — | — | — |
| 4 · Provável | — | — | — | — | R-01 |
| 3 · Possível | — | — | — | R-03; R-04 | R-02 |
| 2 · Pouco provável | — | — | — | R-05 | — |
| 1 · Raro | — | — | — | — | — |

| Risco | Causa → evento → impacto | Justificativa / fonte |
| --- | --- | --- |
| R-01 | Instância única de persistência → Autenticação e consulta indisponíveis → Interrupção do atendimento e atraso na consulta de registros | A dependência foi demonstrada no incidente; P=4 representa o cenário proposto, não uma frequência estatística. [E03](../analysis/sprint2/sources/E03.txt) [E04](../analysis/sprint2/sources/E04.txt) [E05](../analysis/sprint2/sources/E05.txt) [C01](../analysis/sprint2/sources/C01.txt) |
| R-02 | Ausência de autorização por prontuário → Leitura fora da necessidade de acesso → Exposição indevida de informações clínicas | O acesso exige autenticação, mas não há verificação do vínculo com o registro; impacto potencial elevado. [C02](../analysis/sprint2/sources/C02.txt) [C03](../analysis/sprint2/sources/C03.txt) |
| R-03 | Ausência de contenção progressiva de tentativas → Comprometimento de conta ou pressão sobre o login → Acesso indevido ou degradação do serviço | O cenário comprovou repetição de tentativas recusadas; não comprovou comprometimento. Exposição atual é local. [C02](../analysis/sprint2/sources/C02.txt) [E04](../analysis/sprint2/sources/E04.txt) [E05](../analysis/sprint2/sources/E05.txt) |
| R-04 | Dependência de observação local → Atraso na identificação de indisponibilidade → Maior duração do impacto por ausência de diagnóstico | A perda do probe foi observada; a perda total do host é uma hipótese de risco baseada na arquitetura. [C01](../analysis/sprint2/sources/C01.txt) [C04](../analysis/sprint2/sources/C04.txt) [E03](../analysis/sprint2/sources/E03.txt) [E05](../analysis/sprint2/sources/E05.txt) |
| R-05 | Retenção local limitada e ausência de arquivo externo → Evidências insuficientes para reconstruir um incidente → Atraso na investigação e tratamento inadequado | Não houve perda comprovada nesta sessão; o risco decorre da política de rotação e do armazenamento local. [C01](../analysis/sprint2/sources/C01.txt) [C05](../analysis/sprint2/sources/C05.txt) |

## 7. Incidente simulado

Cenário principal: parada controlada do PostgreSQL por 120 s, interrompendo autenticação e consulta. Severidade crítica pela indisponibilidade do fluxo assistencial. Contenção: manter o teste restrito ao ambiente local e observar a API/coleta. Recuperação: reiniciar a dependência e confirmar login e leitura. O segundo incidente interrompeu somente o probe por 90 s; a restauração ocorreu por expiração/controle local. As respostas foram automatizadas pelo roteiro, não medem tempo de reação humana. [E03](../analysis/sprint2/sources/E03.txt) [E04](../analysis/sprint2/sources/E04.txt) [E05](../analysis/sprint2/sources/E05.txt)

| Incidente / categoria | Severidade / status | Início confirmado | Detecção | Recuperação observada | Responsável |
| --- | --- | --- | --- | --- | --- |
| INC-01 · Indisponibilidade assistencial | Crítica / Fechado | 26/10/2026 20:27:04 | 26/10/2026 20:28:35 | 26/10/2026 20:29:16 | Operação de TI |
| INC-02 · Perda de observabilidade | Média / Fechado | 26/10/2026 20:37:05 | 26/10/2026 20:38:35 | 26/10/2026 20:38:46 | Operação de TI |

| Incidente | Tempo até detectar | Recuperação após detecção | Impacto observado | Evidência |
| --- | --- | --- | --- | --- |
| INC-01 | 90,78 s | 41,04 s | 131,83 s | [E03](../analysis/sprint2/sources/E03.txt) [E05](../analysis/sprint2/sources/E05.txt) |
| INC-02 | 90,73 s | 11,04 s | 101,77 s | [E03](../analysis/sprint2/sources/E03.txt) [E05](../analysis/sprint2/sources/E05.txt) |

Dois episódios de alerta foram identificados: um crítico e um warning. Amostras consecutivas da mesma regra e conjunto de labels, separadas por até 30 s, formam um episódio. Não se contam amostras de ALERTS como incidentes. A cronologia confirma o cenário, e a primeira amostra saudável após a solicitação de restauração define recuperação. A perda do probe é incidente de observabilidade separado do incidente assistencial.

## 8. KPIs e KRIs

| Indicador | Resultado atual | Meta / limiar | Tendência / decisão |
| --- | --- | --- | --- |
| KPI · Disponibilidade assistencial | 96,58% | ≥99% | Baseline 100%; queda induzida explica o desvio. Priorizar R-01. [E03](../analysis/sprint2/sources/E03.txt) |
| KPI · Pico de latência p95 | 9,53 ms | ≤500 ms | Próximo ao baseline; manter capacidade. [E02](../analysis/sprint2/sources/E02.txt) |
| KPI · Cobertura ao final | 100% (7/7) | 100% | Recuperada após mínimo de 85,71%; tratar R-04. [E03](../analysis/sprint2/sources/E03.txt) |
| KPI · Incidentes abertos / fechados | 0 / 2 | 0 abertos ao final | Dois episódios encerrados; manter ações preventivas. [E03](../analysis/sprint2/sources/E03.txt) [E05](../analysis/sprint2/sources/E05.txt) |
| KPI · MTTD (n=2) | 90,76 s | ≤120 s | Dentro da referência proposta; ampliar observação externa. [E03](../analysis/sprint2/sources/E03.txt) [E05](../analysis/sprint2/sources/E05.txt) |
| KPI · MTTR após detecção (n=2) | 26,04 s | ≤60 s | Resposta automatizada; testar procedimento operacional futuramente. [E03](../analysis/sprint2/sources/E03.txt) [E05](../analysis/sprint2/sources/E05.txt) |
| KRI · Falhas de login no cenário | 10 em menos de 1 min | Investigar ≥5/min | Sinal de repetição; nenhum acesso indevido comprovado. Tratar R-03. [E04](../analysis/sprint2/sources/E04.txt) [E05](../analysis/sprint2/sources/E05.txt) |
| KRI · Vulnerabilidades altas | 2 | 0 sem tratamento | Primeiro inventário; priorizar autorização e persistência. [C01](../analysis/sprint2/sources/C01.txt) [C02](../analysis/sprint2/sources/C02.txt) [C03](../analysis/sprint2/sources/C03.txt) |
| KRI · Riscos altos/críticos | 4 de 5 | 0 sem responsável/plano | Primeira avaliação; executar tratamentos antes de reduzir classificação. |
| KPI · Riscos com tratamento definido | 100% | 100% | Todos planejados; acompanhar execução, prazo e evidência de conclusão. |

MTTD = média de detecção − início confirmado; MTTR = média de recuperação observada − detecção. População: os dois incidentes fechados desta sessão, incluindo o incidente de observabilidade; os tempos individuais estão na seção 7. São medidas do cenário simulado, com resolução da coleta, e não desempenho histórico da operação. Tendências comparam baseline e experimento; riscos/vulnerabilidades são o primeiro registro e não possuem série histórica anterior. Tratamento definido não equivale a risco mitigado.

## 9. Dashboard v0.2

A visão analítica apresenta riscos altos/críticos, vulnerabilidades altas, incidentes abertos/fechados, MTTD, MTTR e cobertura do plano de tratamento. As seções seguintes mostram baseline × experimento, CPU por fase, matriz P × I, registro de riscos, achados por severidade/ativo, episódios de alerta, incidentes e decisões associadas aos KPIs/KRIs. Os painéis operacionais existentes permanecem disponíveis com o intervalo selecionado no Grafana.

Os painéis analíticos usam o recorte fixo identificado no título e dados calculados a partir dos arquivos preservados; mudar o seletor de tempo afeta os painéis operacionais, não reclassifica o registro de riscos. Links de relatório e dados permitem consultar os resultados e as fontes.

## 10. Recomendações priorizadas

| Prioridade | Ação | Esforço | Risco tratado | Responsável | Prazo | Estratégia / status |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Formalizar recuperação e executar teste de restauração de backup. | Médio | R-01 | Operação de TI | D+7 | Reduzir / Planejado |
| P1 | Implementar autorização por vínculo e testes negativos de acesso cruzado. | Médio | R-02 | Desenvolvimento | D+14 | Reduzir / Planejado |
| P1 | Aplicar rate limiting e alerta para cinco ou mais falhas em um minuto. | Baixo | R-03 | Segurança de TI | D+7 | Reduzir / Planejado |
| P2 | Adicionar verificação externa e canal de notificação. | Médio | R-04 | Operação de TI | D+14 | Reduzir / Planejado |
| P2 | Automatizar exportação e definir retenção; integrar centralização na Sprint 3. | Médio | R-05 | Operação de TI | D+21 | Reduzir / Planejado |

Dias corridos após aprovação do plano de tratamento. Primeiro, tratar continuidade e controle de acesso. Depois, ampliar a observação externa e a retenção de evidências. A implantação desses controles é trabalho futuro; esta sprint entrega a análise e o plano preliminar.

Rastreabilidade das fontes utilizadas:

| ID | Fonte | Origem no repositório | SHA-256 |
| --- | --- | --- | --- |
| [B01](../analysis/sprint2/sources/B01.txt) | Manifesto do baseline | evidence/validated/refinamento-sprint1/baseline/manifest.json | fdb76d508aa28ee7cdd9617d989519392b2b913cf846673202deae12ead16179 |
| [B02](../analysis/sprint2/sources/B02.txt) | Curvas do baseline | evidence/validated/refinamento-sprint1/baseline/derived.json | 5a28ee05b9a44f41de5cf0ed39a1b83596be1fbdb1df6b8f2740e93ec8a56e01 |
| [B03](../analysis/sprint2/sources/B03.txt) | Séries originais do baseline | evidence/validated/refinamento-sprint1/baseline/series.json | d3730d61806e14498cdd484af9c6803452ba3d7013f8ebe136f500219d6c4781 |
| [E01](../analysis/sprint2/sources/E01.txt) | Manifesto do experimento | evidence/rejected/refinamento-sprint1/experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/manifest.json | 29498f6ad493da9d8b41ab00e75f5c2483d6451e5726d7b4d9a807190cba2718 |
| [E02](../analysis/sprint2/sources/E02.txt) | Curvas do experimento | evidence/rejected/refinamento-sprint1/experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/derived.json | 229575892d639b3296af7d12abd23105877e185767176c62a0a664cac1ed777f |
| [E03](../analysis/sprint2/sources/E03.txt) | Séries originais do experimento | evidence/rejected/refinamento-sprint1/experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/series.json | 9e7b43e0f049e67f9cac76b9a5ce7cc35ecaae6db88ada839d4a4730f9dce448 |
| [E04](../analysis/sprint2/sources/E04.txt) | Eventos da API | evidence/rejected/refinamento-sprint1/experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/events.jsonl | aee42f206818a11db212d4abd63dbc06216e4f64978ca0079b5e2ae9f93eb8c7 |
| [E05](../analysis/sprint2/sources/E05.txt) | Timeline do experimento | evidence/rejected/refinamento-sprint1/experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/session.json | dedc093d81fad8af83ed395f471c30e7a809270b77d86e1e83da0c6b5df53d31 |
| [C01](../analysis/sprint2/sources/C01.txt) | Compose da coleta | evidence/rejected/refinamento-sprint1/experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/configuration/infra/compose.yaml | 2f1491db05e8c330d878eb6f26548016989f453cd2d375044dcacd33c3b37234 |
| [C02](../analysis/sprint2/sources/C02.txt) | Autenticação e autorização | apps/api/app.ts | 85f3623a78cd66970d4d96ca728752eb70a64ec84deb4fc23ff2272ce8fe6caf |
| [C03](../analysis/sprint2/sources/C03.txt) | Consulta ao banco | apps/api/repository.ts | a90d31480313c7cb7a653553b50065e02a14d2d81f2d0e6df9ba4fef80f3776f |
| [C04](../analysis/sprint2/sources/C04.txt) | Regras de alerta da coleta | evidence/rejected/refinamento-sprint1/experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/configuration/monitoring/rules.yml | 9233a20614b8f9de667cdc8d2238b2866a344c29acc45dff2b3737ba9b25f3a8 |
| [C05](../analysis/sprint2/sources/C05.txt) | Retenção e logs locais | logging/README.md | e4106a3f45e64d2358039c46e0dcfb1c49647f874dc46ab0b450e2196d01aa35 |
| [C06](../analysis/sprint2/sources/C06.txt) | Renovação do token do gerador | apps/lab/server.ts | 2327eff595e02d6799046b908a55fd0a9f465207e7218da25d7f480948c18b25 |
