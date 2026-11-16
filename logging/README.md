# Eventos estruturados e centralização

A API emite JSON para stdout. Eventos: `authentication`, `record_access` e `request_error`. Campos permitidos: `time`, `level`, `event`, `correlation_id`, `traffic`, `status`, `duration_ms`, `service` e `instance_id`. O ID do prontuário, conteúdo clínico, senha e token não entram nos eventos centralizados ou exportados.

`time` usa milissegundos Unix. `service` identifica a API e `instance_id` é um UUID novo em cada inicialização. A chave `(service, instance_id, correlation_id)` identifica a requisição mesmo depois de reiniciar um processo cujo contador de IDs voltou ao início.

`authentication` e `record_access` representam respostas concluídas. `request_error` é um diagnóstico ligado à mesma requisição; somá-lo à resposta duplicaria o incidente técnico. O leitor offline consolida respostas idênticas e rejeita respostas conflitantes com a mesma chave.

Na Sprint 3, Alloy descobre somente o contêiner `api` do projeto `governanca-saude`, seleciona os três eventos e reconstrói seu corpo JSON com os campos permitidos. Labels identificam projeto, serviço e evento; instância e correlação permanecem no corpo. Loki armazena os eventos e Grafana permite consultas autenticadas por LogQL. Os comandos de operação, consulta e simulação estão no [manual principal](../README.md#segurança-e-logs-centralizados).

Docker mantém a rotação local de 10 MB por arquivo, com três arquivos por serviço. Alloy persiste as posições de leitura; Loki mantém dados e estado de retenção em volume. A retenção configurada é de sete dias, executada pelo Compactor. O teste curto verifica configuração e persistência; não demonstra sete dias de retenção observada. Perda do host ou do disco continua afetando coleta e armazenamento.

As novas exportações usam o Loki, registram consulta e intervalo e paginam os resultados sem truncamento silencioso. O contrato de campos de `events.jsonl` permanece. Os conjuntos históricos da Sprint 1/2 foram exportados dos logs locais do Docker e preservam essa origem: não são reatribuídos ao Loki nem reprocessados como uma nova coleta.

Fontes rotacionadas antes da leitura não podem ser reconstruídas. A conferência de eventos nas bordas e a comparação entre fontes revelam algumas lacunas, mas não provam preservação de cada evento intermediário. Os [arquivos de evidência](../docs/evidencias.md) preservam o que foi efetivamente coletado e declaram esse limite.

A [diretriz interna](../docs/diretriz-monitoramento.md) define acesso, retenção, resposta, controles e responsabilidades. Alloy e cAdvisor possuem acesso privilegiado aos sockets dos daemons; a montagem somente leitura não restringe os métodos dessas APIs. Os componentes não publicam portas no host.
