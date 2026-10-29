# Contrato das evidências — versão 1

Este formato prepara os dados para a análise da Sprint 2. A origem é o laboratório em execução; os roteiros não criam amostras nem completam lacunas.

## Protocolos e validação

A sequência de execução, exportação e conferência está no [manual principal](../README.md#demonstrar). Baseline e experimento são conjuntos independentes, com estabilização mínima de cinco minutos seguida por 30 ou 60 minutos de observação. O relógio monotônico controla a duração; UTC identifica as evidências. O custo de prontidão e dos comandos pode acrescentar segundos ao intervalo.

Cada sessão tem diretório exclusivo e um bloqueio contra execuções simultâneas no checkout. Código, configurações, imagens e perfil de carga devem permanecer estáveis. Falhas e interrupções ficam registradas no estado da sessão; um diretório sem manifesto não pode ser interpretado como evidência antiga válida.

A conferência offline verifica SHA-256, intervalos, cobertura, famílias, inventário, estabilidade do contexto e eventos esperados. `summary.json` só é escrito em sucesso. A expiração automática do controle do probe é de 1 a 600 segundos; a restauração do banco depende do roteiro ou de ação manual em encerramentos forçados. Os procedimentos estão em [recuperação](recuperacao.md).

Uma exportação avulsa tem `kind: export`: sua validação verifica estrutura e integridade, mas não comprova o protocolo de baseline ou experimento. Pode conter menos dados que a janela solicitada; `observations`, `temporal_completeness_percent` e bordas declaram essa limitação. O destino deve ser novo e vazio.

## Arquivos

| Arquivo | Conteúdo e uso |
|---|---|
| `manifest.json` | Versão, ID, tipo/status, intervalo, fases, parâmetros, frequência, caminhos das fontes, tamanho e SHA-256 dos arquivos de origem |
| `series.json` | Amostras originais de 20 famílias, com labels, timestamps, unidade, escopo, tipo e PromQL |
| `derived.json` | Sete curvas calculadas pelo Prometheus, passo de 15 s, fórmulas e referências às famílias originais |
| `metrics.json` | Consultas pontuais no fim do intervalo e históricos compatíveis com a leitura anterior |
| `events.jsonl` | Eventos da API no mesmo intervalo; apenas campos permitidos |
| `inventory.json` | Serviços/ativos, referências e IDs das imagens, digests disponíveis, limites, portas e contexto do host na exportação |
| `configuration/` | Cópias de Compose, regras, Prometheus, dashboard, definição/lock de dependências, Dockerfile e inicialização do banco |
| `inventory-start.json`, `start/configuration/` | Contexto anterior à estabilização, nas sessões automatizadas |
| `run.json`, `session.json` | Estado, fases e parâmetros; marcações reais do roteiro e ator da resposta |
| `summary.json` | Resultado derivado da verificação offline, contagens, completude e timeline do experimento |

O manifesto é escrito por último, quando a exportação termina. Seu status `completed` comprova a conclusão da exportação; o aceite depende também da verificação offline em `summary.json` com `result: passed`. Os arquivos fonte são verificados antes da análise. `summary.json` é gerado depois e pode ser reproduzido; não é uma fonte autenticada pelo manifesto. Nos conjuntos novos, também identifica o SHA-256 do analisador usado e do manifesto fonte; isso permite registrar uma correção posterior no verificador sem modificar os dados coletados. SHA-256 detecta alteração em relação ao manifesto, mas não é uma assinatura digital de autoria.

O inventário associa cada serviço ao `asset_id` `governanca-saude/<serviço>`. Contém commit Git, indicação de alterações locais e fingerprints dos arquivos em `apps/` e dos scripts. `working_tree_dirty: true` significa que apenas o commit não basta para recuperar aquela implementação: preserve também o código entregue. Imagens construídas localmente podem não ter digest de registro; seu `image_id` continua registrado. A configuração usa referências a variáveis; `.env` e o ambiente expandido não são exportados.

## Intervalos e lacunas

- O intervalo observado é inclusivo: `range_start <= timestamp <= range_end`. Datas do manifesto estão em ISO 8601 UTC.
- Valores das séries são pares `[timestamp_unix_segundos, "valor"]`, como devolvidos pelo Prometheus; mantenha labels para distinguir séries. Valores de eventos usam `time` em **milissegundos** Unix.
- Cada família original tem `data`, somente dentro do intervalo, e `context_data`, nos cinco minutos anteriores. Esse contexto sustenta as janelas móveis; não entra nas contagens do período observado.
- Ausência de amostras permanece ausência. Não converter falha de coleta em `probe_success=0` nem em sucesso. Uma consulta clínica malsucedida produz `probe_success=0` quando a coleta do probe funciona.
- `derived.json` usa avaliações a cada 15 s. O Prometheus pode reaproveitar uma última amostra por lookback; pontos derivados não comprovam completude. Use as amostras originais e `up`.
- O recorte remove qualquer avaliação arredondada pelo Prometheus para fora dos limites solicitados. Não altera o timestamp nem o valor da amostra.

### Frequência do cAdvisor e qualidade do histórico

A frequência de scrape não equivale necessariamente à frequência das observações de um exporter. O [Prometheus respeita por padrão os timestamps fornecidos pelo alvo](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#scrape_config). O [cAdvisor permite housekeeping dinâmico](https://github.com/google/cadvisor/blob/master/docs/runtime_options.md#housekeeping), e seu [agendamento inclui jitter](https://pkg.go.dev/github.com/google/cadvisor/manager#JitterFactor). No baseline real deste refinamento, os sete serviços produziram entre 78 e 82 amostras de recursos em 30 minutos, com maior intervalo de aproximadamente 30 s, enquanto o Prometheus realizou 120 scrapes bem-sucedidos do cAdvisor.

O verificador mantém a avaliação de scrapes em 15 s e exige pelo menos 90% de scrapes bem-sucedidos por alvo. Para CPU/memória/rede de contêineres, registra quantidade de amostras, extensão temporal entre a primeira e a última, maior lacuna e idade das bordas. Exige extensão de pelo menos 90% da janela e lacunas/bordas de no máximo 150 s. Esse limite é uma escolha de qualidade do projeto: considera housekeeping dinâmico de até 60 s, jitter de até mais um intervalo e margem de dois scrapes. Não significa que existiu uma medição durante cada lacuna. Mudanças nos parâmetros do coletor exigem revisar esse critério.

O campo `container_sampling` mantém os valores observados para a análise questionar sua resolução. Um alvo `up=1` com uma lacuna maior que o limite em suas métricas continua sendo rejeitado. Para as métricas de CPU/memória do host e para o probe, permanece o critério de contagem de amostras a cada 15 s.

## Dicionário das famílias originais

As fórmulas e seletores implementados estão em [`scripts/evidence_catalog.py`](../scripts/evidence_catalog.py). O filtro dos contêineres exige projeto `governanca-saude` e serviço Compose identificado.

| Chave em `series.json.queries` | Tipo / unidade | Escopo e interpretação |
|---|---|---|
| `probe_history` | Gauge / 0 ou 1 | Sucesso do fluxo login + consulta como monitor |
| `probe_duration` | Gauge / segundos | Duração desse fluxo, incluindo login |
| `targets` | Gauge / 0 ou 1 | `up` original por alvo de coleta |
| `collection_history` | Gauge / 0 ou 1 | Regra `lab:target_up`, por alvo esperado; pode acrescentar um ciclo de avaliação |
| `coverage` | Gauge / % | Cobertura dos sete alvos esperados |
| `alert_history` | Gauge / estado do alerta | `ALERTS`, separado por nome, estado, criticidade e labels; pode estar vazio |
| `load_history` | Gauge / tentativas/s | Taxa configurada do gerador; não equivale a respostas concluídas |
| `load_attempts` | Counter / tentativas | Resultado `success`, `http_error`, `transport_or_login_error` ou `concurrency_limit` |
| `requests` | Counter / respostas | API, separado por rota, tráfego e status |
| `auth_failures` | Counter / eventos | Falhas de autenticação, por motivo |
| `duration_bucket` | Counter / observações | Buckets cumulativos do histograma de consultas clínicas HTTP 200 |
| `duration_count` | Counter / observações | Total de consultas incluídas no histograma |
| `duration_sum` | Counter / segundos | Soma das durações incluídas no histograma |
| `host_cpu` | Counter / segundos | CPU do host, por CPU e modo; inclui outras cargas do host |
| `host_memory_available` | Gauge / bytes | Memória disponível do host |
| `host_memory_total` | Gauge / bytes | Memória total do host |
| `container_cpu` | Counter / segundos | CPU dos contêineres, por labels da origem |
| `container_memory` | Gauge / bytes | Working set de memória dos contêineres |
| `container_network_receive` | Counter / bytes | Recepção por contêiner/interface |
| `container_network_transmit` | Counter / bytes | Transmissão por contêiner/interface |

## Curvas derivadas

| Chave em `derived.json.queries` | Unidade | Método |
|---|---|---|
| `host_cpu_percent` | % | 100 × (1 − média da taxa de CPU idle em 5 min) |
| `host_memory_percent` | % | 100 × (1 − memória disponível / total) |
| `container_cpu_cores` | Núcleos | Taxa em 5 min de segundos de CPU, somada por serviço |
| `container_network_bytes_per_second` | Bytes/s | Taxas em 5 min de recepção + transmissão, somadas por serviço |
| `clinical_volume` | Respostas/s | Taxa em 5 min das respostas de consulta clínica |
| `clinical_errors_percent` | % | Taxa de respostas 5xx / taxa de todas as respostas clínicas × 100; denominador zero: sem dados |
| `clinical_p95` | Segundos | Quantil 0,95 dos buckets clínicos em 5 min, somente com observações; estimativa de consultas HTTP 200 |

A curva é exportada junto com o PromQL exato e os caminhos das fontes. Médias, picos, comparação com baseline e justificativas de gargalos são análises da Sprint 2. Host e contêiner têm escopos e denominadores distintos; não somar percentuais sem definir a capacidade de referência.

### Contadores, resets e histogramas

O resumo calcula **incrementos observados** entre amostras consecutivas da mesma série. Quando o contador diminui, considera reset e soma o novo valor. A primeira amostra é referência, não tráfego do período. Resets ocorridos inteiramente dentro de uma lacuna podem ser invisíveis; uma sequência observada não recupera eventos ausentes.

Esse cálculo não replica o `increase`/`rate` do Prometheus, que extrapola bordas. Para contar exatamente os dez logins inválidos, utilize as respostas nos logs. Preserve os buckets e seus labels `le`, incluindo `+Inf`; não trate o p95 exportado como quantil exato de durações individuais.

## Eventos e correlação

Campos permitidos: `time`, `level`, `event`, `correlation_id`, `traffic`, `status`, `duration_ms`, `service`, `instance_id`. O último é um UUID novo a cada inicialização da API.

A chave da requisição é `(service, instance_id, correlation_id)`. Eventos `authentication` e `record_access` são respostas concluídas. `request_error` é diagnóstico da mesma requisição e não aumenta a contagem de respostas. Duplicatas idênticas são consolidadas; respostas conflitantes para a mesma chave invalidam a análise.

Os logs continuam locais, com rotação de 3 × 10 MB por serviço. O exportador não recupera trechos rotacionados. A sessão exige eventos perto das duas bordas, mas isso não prova a integridade de cada evento intermediário; compare fontes e registre limitações da análise. Não há logs centralizados ou garantia de retenção de auditoria nesta etapa.

## Tempo do incidente simulado

No experimento, `summary.json.incident_timeline` identifica o ativo, o ator `session_runner`, os horários e os caminhos das fontes:

| Marco / duração | Fonte e definição |
|---|---|
| Início confirmado | `session.json:postgres_outage_confirmed`, após o comando de parada retornar |
| Detecção | Primeira amostra `ALERTS` do alerta clínico em estado `firing` após a confirmação |
| Resposta iniciada | `session.json:postgres_restart_requested`, imediatamente antes do comando de restauração |
| Recuperação funcional | Primeiro `probe_success=1` após a resposta |
| Tempo até detectar | Detecção − início confirmado |
| Recuperação após detecção | Recuperação funcional − detecção |
| Duração do impacto observado | Recuperação funcional − início confirmado |

A parada pode começar antes da confirmação do comando, e a recuperação pode preceder o próximo scrape. Esses tempos têm resolução da coleta/avaliação de 15 s e atrasos dos comandos. A resposta é automatizada pelo roteiro, não mede a reação humana. O evento posterior `clinical_recovery_verified` registra outra consulta de conferência; não substitui a primeira recuperação observada.

Para futuros MTTD/MTTR, declarar essas convenções e a população de incidentes antes de agregar. Um experimento fornece tempos de um incidente, não uma média histórica ou SLA. A falha isolada de `/probe` é um episódio de observabilidade e deve ser analisada separadamente.

## Capturas vinculadas à coleta

Os comandos estão no [manual de capturas](../README.md#capturar-o-dashboard-e-alertas). Ao vincular uma captura à sessão, o script usa o intervalo absoluto do manifesto e salva em `captures/dashboard-<timestamp>/`, com `session_id` e hash do manifesto em `validation.json`. O Grafana trabalha com milissegundos; submilissegundos do manifesto são truncados na seleção visual. As fontes exportadas preservam seus limites originais.

`observation.json` distingue o horário selecionado do alerta do horário da captura. Novas imagens operacionais dependem da retenção do Prometheus; séries e eventos já exportados continuam disponíveis offline. Capturas não substituem o conjunto completo de arquivos referenciados pelo manifesto.

## Análise histórica da Sprint 2

O cálculo offline usa o baseline de 21/10/2026 e o experimento de 26/10/2026. Sua rejeição pelo verificador de cenário permanece no diretório original; reconstruir a análise não muda esse resultado nem preenche ausência de amostras como sucesso. O comando de [reprodução da análise](../README.md#desenvolver-e-manter-o-código) escreve somente os dados consolidados e o dashboard.

O catálogo `sources` de `analysis/sprint2/analysis.json` mantém ID, descrição, origem e SHA-256. O campo `path` resolve o arquivo a partir da raiz do repositório. As fontes são:

| IDs | Natureza e preservação |
|---|---|
| B01–B03 e E01–E05 | Manifestos, séries, curvas, eventos e timeline dos conjuntos originais em `evidence/` |
| C01 e C04 | Compose e regras preservados na exportação do experimento |
| C02, C03 e C06 | Revisão estática posterior: cópias do código em `analysis/sprint2/sources/`, com extensão `.ts`, sem depender dos arquivos atuais da aplicação |
| C05 | Documentação de logs consultada na análise, preservada como `C05-README.md`; apoio declarativo, não comprovação de execução |
| C07 | `analysis/sprint2/registers.json`: inventário e avaliação qualitativa, preservados sem alteração |

As quatro cópias de revisão foram preservadas byte a byte a partir do checkpoint `536e7c22f3e809db9a7137a3e9bea4e481d0fb5e`; `review_checkpoint` identifica essa proveniência, sem atribuir uma nova data de coleta. Trechos e números de linha continuam apontando para essas versões. Código e configuração sustentam revisão estática; C07 não comprova de forma independente as próprias conclusões.

O registro qualitativo mantém vulnerabilidades, riscos, justificativas, evidências e recomendações. Prazos são relativos à aprovação e responsáveis são papéis propostos; plano definido não significa controle implementado. O catálogo `figures` preserva origem, data de captura e SHA-256 das seis imagens históricas.

O relatório permanece como documento estático com as dez seções, 18 indicadores, 11 consultas e referências por trecho ou evento. A entrega em PDF deve incorporar as evidências legíveis; a aplicação não gera nem hospeda relatórios ou fontes. Na timeline, `response_seconds` mede início confirmado até solicitação de restauração automatizada, separado de MTTD e MTTR e sem representar reação humana.

## Ler o dataset com Python

Na raiz do projeto, sem dependências adicionais:

```python
import json
import pathlib
import sys
sys.path.insert(0, "scripts")
from evidence_analysis import summarize

folder = pathlib.Path("evidence/runs/baseline-<UUID>")
summary = summarize(folder)  # verifica todas as fontes antes de retornar
raw = json.loads((folder / "series.json").read_text())["queries"]
print(summary["observed_availability_percent"])
print(summary["temporal_completeness_percent"])
for series in raw["container_memory"]["data"]["result"]:
    print(series["metric"], len(series["values"]))
```

Ao guardar uma seleção revisada em `evidence/validated/`, copie o conjunto completo de fontes referenciadas pelo manifesto. Copiar apenas prints, o resumo ou métricas pontuais perde a possibilidade de recalcular. Preserve os originais das sessões antigas; o leitor legado continua disponível para conferi-los.
