# Catálogo dos indicadores — v0.2

## Operação

Todos os indicadores têm como responsável **Operação do laboratório**. Coleta e avaliação a cada 15 s; atualização do painel a cada 15 s. A verificação leva até 3 s: o reflexo visual ocorre em aproximadamente 30 s mais sua execução. Regras intermediárias podem acrescentar um ciclo; validar até 45 s. Alertas exigem um minuto de persistência além da observação.

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
| Infraestrutura | `node_*` e `container_*` | Atual/tendência; sem meta nesta sprint | Host inclui processos externos; contêineres filtrados por projeto |

As metas são didáticas, escolhidas para a demonstração. Uma indisponibilidade intencional de dois minutos em uma hora pode levar a disponibilidade abaixo de 99%; isso é esperado e deve ser explicado.

## Alertas

- `ConsultaAssistencialIndisponivel`: fluxo observado falha continuamente por um minuto; criticidade crítica; impacto na consulta simulada.
- `FalhaDeColeta`: alvo esperado sem coleta válida por um minuto; criticidade de atenção; recuperar a observação.

As regras rodam no Prometheus. O dashboard mostra `ALERTS` em estado pendente/disparado e a evolução temporal; não há notificação externa nem Alertmanager separado. O fim da série do alerta, junto à coleta válida e à consulta bem-sucedida, comprova recuperação. Se Prometheus parar, a fonte de dados do Grafana falha: não há autodetecção externa nessa arquitetura.

O banco e a API podem sofrer mais de uma falha ao mesmo tempo. O painel orienta investigação; não atribui causa raiz automaticamente. As médias de MTTD/MTTR do v0.2 usam apenas os dois incidentes classificados no recorte analítico abaixo.

## Exportação para análise da Sprint 2

O refinamento exportou o histórico descrito no [contrato das evidências](evidencias.md). O baseline de 30 minutos e o experimento de 60 minutos são conjuntos separados, cada um precedido por estabilização. Os arquivos usam o mesmo intervalo UTC para métricas e eventos.

Além das amostras de disponibilidade, coleta, alertas e carga, `series.json` preserva CPU/memória do host, CPU/memória/rede dos sete serviços, tentativas do gerador, contadores da API e buckets do histograma clínico. `derived.json` contém as curvas de CPU%, memória%, CPU por serviço em núcleos, bytes/s de rede, respostas/s clínicas, erros% e p95, com o PromQL e as referências das fontes. Médias e picos podem ser calculados na Sprint 2 sobre o período/fase declarado; os dados do host incluem cargas externas ao projeto.

O resumo offline usa amostras originais para a disponibilidade e a completude. Seus incrementos observados de contadores tratam resets visíveis, mas não extrapolam bordas como o Prometheus. A contagem de logins inválidos vem das respostas nos logs, consolidadas pela chave serviço + instância + correlação. Um `request_error` não é uma segunda resposta.

No experimento, a timeline registra início confirmado da interrupção do banco, primeira amostra do alerta em `firing`, solicitação de restauração e primeiro probe bem-sucedido após ela. As respostas foram automatizadas pelo roteiro. As convenções e os limites estão em [Tempo do incidente simulado](evidencias.md#tempo-do-incidente-simulado).

A quantidade de pontos em `ALERTS` mede observações do estado, não quantidade de alertas distintos ou incidentes. A análise agrupa amostras `firing` com o mesmo conjunto de labels e intervalo máximo de 30 s em um episódio.

## Análise da Sprint 2

Fonte canônica: `analysis/sprint2/analysis.json`, gerada com `npm run analysis:sprint2`. O [relatório](relatorio-sprint2.md) documenta valores, limiares, decisões e fontes identificadas. O baseline é de 21/10/2026; o experimento é de 26/10/2026, 19:57–20:57, UTC−03. Esses painéis usam um recorte fixo, independente do seletor de tempo do Grafana.

| Indicador | Definição / população | Interpretação |
|---|---|---|
| CPU/memória média e pico | Média aritmética e máximo das amostras; serviços em % do limite do contêiner | Referência proposta de 80%; host inclui processos externos |
| Alertas por criticidade | Episódios `firing` agrupados por labels e continuidade | Um crítico e um de atenção; não contar cada amostra |
| Incidentes abertos/fechados | Dois cenários com início, detecção e recuperação observados | 0 abertos / 2 fechados ao final |
| MTTD | Média de detecção − início confirmado, n=2 | 90,76 s; meta proposta ≤120 s |
| MTTR após detecção | Média de recuperação observada − detecção, n=2 | 26,04 s; meta proposta ≤60 s; inclui perda de observabilidade |
| Vulnerabilidades por severidade/ativo | Cinco achados de código/configuração em `registers.json` | Duas altas; contagem de achados não mede exposição por si só; exposição detalhada no relatório |
| Riscos altos/críticos | Cinco riscos avaliados por P × I; alto 10–16, crítico 17–25 | Quatro riscos; probabilidades qualitativas do cenário |
| Tratamento definido | Riscos com ação, responsável e prazo / total | 100%; todos planejados, sem afirmar mitigação |
| Falhas de login | Dez HTTP 401 nos eventos do cenário de repetição | Limiar proposto de investigação ≥5/min; não comprova invasão |

As médias de resposta descrevem esta sessão e sua automação, não uma série histórica de operação. A integridade das fontes foi conferida; a rejeição do verificador antigo por contagem de respostas 503 permanece registrada como limitação da coleta utilizada.
