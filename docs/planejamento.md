# Planejamento do projeto integrador

## Objetivo da entrega

Demonstrar o fluxo **dado → evidência → indicador → risco/incidente → decisão → plano de ação**, usando um laboratório de saúde com dados fictícios. Cada conclusão deverá ser rastreável à fonte técnica e ao período observado.

| Etapa | Resultado | Situação no repositório |
|---|---|---|
| Sprint 1 — coletar e monitorar | Laboratório operacional e dashboard v0.1 | MVP entregue; evidências históricas preservadas em `evidence/validated/sprint1/` |
| Refinamento da Sprint 1 | Dados exportáveis, comparação com baseline e incidentes reproduzíveis | Implementação de coleta descrita em [Evidências](evidencias.md); execução e resultados devem ser conferidos nos manifestos e resumos |
| Sprint 2 — analisar | Dashboard v0.2, análise técnica, incidentes, vulnerabilidades e riscos sustentados por evidências | Implementados no [relatório da Sprint 2](relatorio-sprint2.md) e no dashboard; revisão da entrega pelo usuário |
| Sprint 3 — integrar e comunicar | Dashboard v1.0 e defesa técnico-executiva | Etapa posterior, com governança, conformidade e rastreabilidade até a fonte |

## Refinamento antes da Sprint 2

Decisões adotadas:

- Baseline separado: pelo menos cinco minutos de estabilização, seguidos de 30 minutos de carga normal de uma consulta/s.
- Experimento separado: estabilização e 60 minutos de carga, tentativas inválidas de login, indisponibilidade do banco e falha isolada da coleta do probe.
- A falha isolada preserva o gerador, `/metrics` e a API. O experimento anterior que parava o contêiner `lab` continua documentado como histórico.
- Datas UTC explícitas e um mesmo intervalo para métricas e eventos; lacunas são preservadas.
- Séries originais, consultas derivadas, eventos filtrados, inventário, fases, versões e manifesto com SHA-256.
- Análise com Python e Grafana. A verificação offline e os cálculos usam somente a biblioteca padrão do Python.
- Evidências antigas mantêm seus arquivos e períodos. Novas execuções recebem diretórios exclusivos.

O refinamento fornece medições de desempenho e marcações de incidente. O registro formal de riscos, a análise de vulnerabilidades e a avaliação de conformidade pertencem às etapas abaixo.

## Sprint 2 — ANALISAR | Incidentes, Vulnerabilidades e Riscos

**Objetivo:** usar os dados gerados pelo laboratório para produzir análise, detectar desvios e transformar evidências técnicas em riscos, incidentes e prioridades de tratamento.

**Resultado esperado:** evoluir da visão operacional para a visão analítica e de risco, correlacionando disponibilidade, desempenho, eventos, vulnerabilidades e impactos ao negócio.

### Entregas obrigatórias

1. Baseline do ambiente: comportamento normal de CPU, memória, tráfego, latência e disponibilidade.
2. Análise de disponibilidade e desempenho: tendências, picos, gargalos e causas prováveis.
3. Inventário de vulnerabilidades: ativo, achado, severidade, evidência, exposição e recomendação.
4. Registro de riscos: ativo/processo, ameaça, vulnerabilidade, causa, evento, impacto, probabilidade, risco inerente e responsável.
5. Matriz de probabilidade × impacto.
6. Plano preliminar de tratamento: evitar, reduzir, transferir ou aceitar, com prazo e responsável.
7. Cenário de incidente simulado, com geração controlada de eventos e registro de evidências.
8. Classificação de incidentes: categoria, severidade, impacto, status e tempo de resposta.
9. Cálculo de KPIs e KRIs alimentados pelas evidências coletadas.
10. Dashboard v0.2 com risco, vulnerabilidade, incidente e tendências.

### Indicadores mínimos

- Disponibilidade dos serviços críticos.
- Utilização média e pico de CPU/memória.
- Quantidade de alertas por criticidade.
- Vulnerabilidades por severidade e ativos com maior exposição.
- Incidentes abertos/fechados; MTTD e MTTR simulados.
- Riscos críticos/altos e percentual de riscos com tratamento definido.

### Evidências e aceite

Preservar consultas e gráficos da análise, prints ou exportações do monitoramento, relatório de vulnerabilidades, registro de riscos, timeline do incidente, evidências de alertas, justificativa dos limiares e relatório da Sprint 2.

**Cada risco, incidente ou recomendação deve apontar a evidência técnica que sustenta a conclusão.** Indicadores manuais sem rastreabilidade não atendem ao aceite. A contagem de amostras de `ALERTS` não equivale à quantidade de incidentes: será necessário identificar episódios e registrar a regra de agregação.

### Uso dos insumos na Sprint 2

| Insumo | Análise/entrega da Sprint 2 | Implementação |
|---|---|---|
| Baseline e curvas por serviço | Médias, picos, tendências e comparação das fases | Cálculos em `scripts/analyze_sprint2.py`; método e limiares nas seções 2–4 do relatório |
| Inventário, código e configuração | Associação do achado ao ativo e à exposição | Cinco achados de controle/arquitetura na seção 5; não são CVEs de scanner |
| Eventos correlacionados e timeline | Classificação e medição de incidentes simulados | Dois episódios; critérios e tempos nas seções 7–8 |
| Manifesto, consultas, hashes e fonte dos indicadores | Evidência por risco/recomendação | Cinco riscos, matriz e plano com papéis responsáveis nas seções 6 e 10 |
| Curvas do Prometheus e dados exportados | Dashboard v0.2 | Visões analíticas com recorte fixo e painéis operacionais preservados |

O relatório usa o experimento completo preservado, com a limitação do aceite antigo declarada. A conferência de integridade não altera a rejeição original nem exige nova coleta para esta análise.

Um contador de falhas de login é um indicador técnico; sua transformação em KRI depende de exposição, ameaça, contexto, limiar e justificativa. O inventário de imagens também não constitui, sozinho, um relatório de vulnerabilidades.

## Sprint 3 — INTEGRAR E COMUNICAR | Governança e Painel Executivo

**Objetivo:** consolidar métricas, eventos, riscos, incidentes, controles e conformidade em um painel que apoie decisões técnicas e executivas.

**Resultado esperado:** demonstrar o fluxo completo dado → evidência → indicador → risco/incidente → decisão → plano de ação.

### Entregas obrigatórias

1. Centralização de logs/eventos: arquitetura e fontes monitoradas.
2. Caso de uso de detecção: cenário, regra, origem do evento, condição, criticidade e resposta esperada.
3. Regra/alerta funcional, com evidência de disparo no ambiente simulado.
4. Indicadores de resposta a incidentes: abertos/fechados, MTTD, MTTR, severidade e tendência.
5. Riscos no painel: heatmap, risco inerente, residual, tratamento e responsáveis.
6. Indicadores de conformidade: controles aplicáveis, implementados, pendentes e gaps críticos.
7. Política ou diretriz relacionada: monitoramento, logs, retenção, incidentes ou controle de acesso.
8. Plano de ação: prioridade, ação, responsável, prazo, status e evidência de conclusão.
9. Dashboard final v1.0: visão executiva e visões técnicas.
10. Catálogo final de KPIs/KRIs.
11. Documentação técnica: arquitetura, implantação, operação e recuperação do laboratório.
12. Relatório técnico-executivo final.
13. Apresentação e defesa em banca.

### Visões mínimas do dashboard final

| Visão | Conteúdo |
|---|---|
| Executiva | Saúde geral, disponibilidade, riscos críticos, incidentes e ações prioritárias |
| Infraestrutura | CPU, memória, armazenamento, uptime, latência e serviços indisponíveis |
| Segurança | Alertas, eventos suspeitos, incidentes e fontes de eventos |
| Riscos e vulnerabilidades | Heatmap, severidade, exposição e plano de tratamento |
| Governança e conformidade | Controles, gaps, responsáveis, prazos e evolução |

**Aceite:** a banca deve conseguir selecionar um indicador e seguir sua rastreabilidade até a fonte técnica original. Um risco crítico precisa de evidência, responsável e tratamento associado.

## Encadeamento das entregas

Preservar o identificador da sessão, o ativo, o intervalo UTC, a consulta e o caminho da fonte nas análises e registros futuros. Os valores originais e seus hashes permanecem disponíveis mesmo depois de expirar a retenção do Prometheus. Capturas ajudam a comunicar a análise; os arquivos exportados sustentam sua reprodução.

## Backlog — simplificar documentação e separar a entrega do produto

Registrado em 27/10/2026 por orientação do usuário. Executar em uma revisão posterior; o checkpoint atual preserva o relatório e suas evidências como ponto de partida.

- Consolidar as instruções de instalação, execução, simulação e testes em uma referência central; revisar READMEs redundantes ou obsoletos e manter apenas os que tenham finalidade distinta.
- Remover a geração e a consulta de relatórios como funcionalidades da aplicação, incluindo as rotas de relatório/fontes, a apresentação HTML e as cópias TXT duplicadas. Avaliar dependências antes da remoção, preservando o dashboard e os cálculos necessários às análises.
- Preservar coleta, cenários simulados, validações, séries originais, logs, timelines, capturas e respectivos manifestos. Não reescrever evidências históricas para acompanhar a limpeza.
- Tratar o relatório acadêmico como entrega estática e autossuficiente em PDF, preparada a partir das evidências. Não desenvolver uma ferramenta de relatório para atender essa entrega; um guia e os anexos selecionados podem ser encaminhados ao ChatGPT Cowork para a montagem.
- Incorporar no PDF gráficos, alertas, eventos e trechos relevantes com origem, período, legenda e interpretação. Links para arquivos ou para a aplicação não substituem a evidência apresentada no documento. Código/configuração sustentam revisão estática; registros de riscos e recomendações são análises, não comprovação independente das próprias conclusões.

O foco imediato é a preparação do relatório estático. A limpeza acima permanece pendente; não faz parte deste checkpoint.
