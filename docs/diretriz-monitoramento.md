# Diretriz interna de monitoramento, logs e resposta — v1.0

**Finalidade:** apoiar a operação e a entrega acadêmica do laboratório por evidências verificáveis. **Responsáveis:** Operação de TI pela coleta, disponibilidade, retenção e exportação; Segurança de TI pela investigação; Desenvolvimento pelos controles da API. São papéis do projeto, sem atribuir nomes ou aprovação institucional. Esta diretriz não declara certificação ou conformidade legal.

## Escopo e acesso

Monitorar o fluxo autenticado de consulta, os nove alvos de métricas e os eventos estruturados da API: `authentication`, `record_access` e `request_error`. Manter os acessos operacionais e os comandos no [README](../README.md). Os serviços de coleta e armazenamento permanecem nas redes internas; somente API e Grafana publicam portas em loopback. A consulta centralizada é feita pelo Grafana autenticado ou pelo operador local autorizado a acessar Docker.

Alloy lê exclusivamente o serviço `api` do projeto e envia um JSON reconstruído com `time`, `level`, `event`, `correlation_id`, `traffic`, `status`, `duration_ms`, `service` e `instance_id`, conforme a presença de cada campo. Não coletar senha, token, conteúdo clínico, identificador do prontuário ou ambiente expandido. Projeto, serviço e evento são labels estáveis; correlação e instância permanecem no corpo consultável. Duplicatas da mesma resposta não viram incidentes adicionais.

O acesso aos sockets Docker/containerd confere confiança elevada a cAdvisor/Alloy. Montagem `:ro` não restringe os métodos das APIs dos daemons. Não expor esses componentes nem copiar `.env`, credenciais, configuração expandida ou respostas clínicas para o pacote acadêmico.

## Retenção e preservação

- Docker mantém rotação local de até três arquivos de 10 MB por serviço; esse limite não garante duração temporal.
- Loki mantém retenção configurada de sete dias com volume persistente e Compactor. A exclusão é assíncrona; capacidade de disco e operação do componente continuam necessárias.
- Prometheus mantém até sete dias, também limitado a 2 GB. Expiração por capacidade pode ocorrer antes do prazo temporal.
- Exportar a janela da demonstração antes de expirar a retenção e preservar fontes, consultas, configurações, versões, timestamps e hashes. Arquivos históricos selecionados para a entrega não são apagados automaticamente.
- Verificar configuração, ingestão, consulta e persistência após reinício. Não declarar que sete dias completos foram empiricamente observados quando o teste foi curto.
- Interrupção, rotação antes da leitura, perda do volume ou do host podem produzir lacunas. Registrar o ocorrido; não completar lacunas com valores inventados nem interpretar ausência de alerta como normalidade.

## Detecção e resposta

`FalhasDeLoginRepetidas` usa `sum(increase(clinical_auth_failures_total{stage="login"}[1m])) >= 5`, com persistência de 15 segundos e criticidade `warning`. O limiar é uma decisão didática local: permite demonstrar repetição e investigação em poucos minutos; não identifica atacante nem prova comprometimento. `increase` extrapola bordas; contar respostas `401` nos eventos para obter o volume exato.

Segurança de TI deve registrar o início, conferir os eventos da API e sua correlação, observar o alerta, registrar a decisão e a ação e confirmar o encerramento. Na demonstração, o roteiro automático interrompe o gerador somente após detectar o disparo. A API continua sem limitação de tentativas. A confirmação exige consulta autenticada bem-sucedida, resolução do alerta e ao menos 60 segundos sem novas falhas. O [procedimento de recuperação](recuperacao.md) orienta o diagnóstico operacional.

Distinguir MTTD (primeiro `401` → disparo), tempo até ação (disparo → interrupção do gerador) e MTTR simulado (disparo → encerramento confirmado). Manter categoria, período e tamanho da amostra; não misturar esse tempo de encerramento com recuperação de indisponibilidade clínica. Eventos e alertas têm atrasos e resolução de coleta, e a ação é automatizada, não reação humana.

## Critérios de controle

| ID | Requisito interno | Evidência necessária para implementação |
|---|---|---|
| CT-01 | Exigir autenticação para consulta | Teste de rejeição sem token e consulta válida autenticada |
| CT-02 | Restringir a conta da aplicação à leitura | Privilégios efetivos do banco e teste de escrita negada |
| CT-03 | Autorizar acesso por vínculo ao prontuário | Regra de vínculo e teste negativo entre perfis/registros |
| CT-04 | Limitar tentativas de autenticação | Configuração efetiva e teste que demonstre o bloqueio |
| CT-05 | Detectar falhas repetidas de login | Regra, eventos e disparo/resolução reais |
| CT-06 | Emitir eventos estruturados e minimizados | Eventos e testes demonstrando campos permitidos e ausência de conteúdo sensível |
| CT-07 | Centralizar eventos e configurar retenção | Configuração, ingestão, consulta e persistência após reinício; retenção temporal declarada como configurada |
| CT-08 | Exportar evidências íntegras e rastreáveis | Fontes, consultas, intervalo, manifesto/hash e verificação offline |
| CT-09 | Ensaiar restauração de backup | Backup identificado, restauração em ambiente de teste e confirmação dos dados |
| CT-10 | Observar a perda total do host de forma independente | Verificador fora do host e evidência de detecção da perda do ambiente |

Os dez controles são aplicáveis ao escopo definido. Classificar como **Implementado** somente com evidência correspondente; **Parcial** quando parte do requisito foi comprovada; **Pendente** quando não foi executado. Configuração comprova configuração e não substitui teste de comportamento. A presente diretriz, um plano ou uma avaliação qualitativa não prova a própria implementação.

## Avaliação, decisão e revisão

Calcular conformidade como controles implementados / controles aplicáveis. Mostrar separadamente parciais, pendentes e gaps críticos: controles incompletos ligados a riscos altos ou críticos. Manter os valores de risco inerente e a avaliação residual com P/I, justificativa e evidências. Detecção melhor não implica automaticamente menor probabilidade ou impacto.

Cada ação deve registrar risco/controle relacionado, prioridade, esforço, responsável por papel, prazo relativo, status e evidência de conclusão. Ações de alerta e limitação de tentativas são independentes, assim como centralização, retenção e exportação. Não encerrar um tratamento composto porque uma única ação foi concluída.

Reavaliar o registro após cada alteração comprovada e conservar checkpoints inicial/final. Os prazos D+ são relativos à aprovação do plano; sem data de aprovação informada não se pode inferir vencimento. Os passos operacionais permanecem no README; as decisões e seus resultados ficam nos registros de análise.
