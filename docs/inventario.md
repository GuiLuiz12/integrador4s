# Inventário técnico

Serviço assistencial crítico: **consulta autenticada de prontuário fictício**. Responsável pelos componentes: **Operação do laboratório**.

| Serviço | Função | Limite CPU | Memória | Coleta |
|---|---|---:|---:|---|
| api | Autenticação e leitura clínica | 1 | 768 MiB | job `api`; fluxo pelo job `probe` |
| postgres | Persistência dos dados fictícios | 1 | 1536 MiB | Impacto pelo fluxo e prontidão; recursos por cAdvisor |
| lab | Gerador de carga e verificador | 0,5 | 512 MiB | jobs `lab` e `probe` |
| prometheus | Coleta, retenção e regras | 1 | 1536 MiB | job `prometheus` |
| grafana | Dashboard e orientação de gestão | 1 | 1536 MiB | job `grafana` |
| node-exporter | Recursos e uptime do host | 0,25 | 256 MiB | job `node` |
| cadvisor | Recursos dos contêineres | 1 | 1024 MiB | job `cadvisor` |

## Denominador da cobertura

Há **sete alvos de coleta esperados**, não sete serviços assistenciais. A lista canônica é o grupo `inventory` em `monitoring/rules.yml`, correspondente aos jobs de `monitoring/prometheus.yml`. Alterações exigem atualizar ambos e este inventário.

O banco não expõe um exporter próprio nesta sprint; sua ausência não cria um oitavo alvo. Uma coleta bem-sucedida do verificador com `probe_success=0` mantém a cobertura em 100%, mas indica consulta indisponível. Essa distinção é parte da demonstração.

Alvos desaparecidos da configuração continuam no denominador até a alteração explícita do inventário. A ausência do alvo é convertida em coleta inválida, sem inventar disponibilidade assistencial.
