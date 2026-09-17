# Catálogo dos indicadores — v0.1

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

O banco e a API podem sofrer mais de uma falha ao mesmo tempo. O painel orienta investigação; não atribui causa raiz automaticamente. Não são calculados MTTD/MTTR médios nesta sprint: registrar apenas os horários observados de cada experimento.
