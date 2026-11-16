# Logs locais estruturados

A API emite JSON para stdout. Eventos: `authentication`, `record_access` e `request_error`. Campos exportáveis: `time`, `level`, `event`, `correlation_id`, `traffic`, `status`, `duration_ms`, `service` e `instance_id`. O ID do prontuário, conteúdo clínico, senha e token não entram nos eventos exportados.

`time` usa milissegundos Unix. `service` identifica a API e `instance_id` é um UUID novo em cada inicialização. A chave `(service, instance_id, correlation_id)` identifica a requisição mesmo depois de reiniciar um processo cujo contador de IDs voltou ao início.

`authentication` e `record_access` representam respostas concluídas. `request_error` é um diagnóstico ligado à mesma requisição; somá-lo à resposta duplicaria o incidente técnico. O leitor offline consolida respostas idênticas e rejeita respostas conflitantes com a mesma chave.

O Docker aplica rotação de 10 MB por arquivo, com três arquivos por serviço. `npm run logs -- api` acompanha os logs locais. `npm run evidence:export` exporta somente os campos permitidos dos eventos da API, além das consultas de métricas escolhidas. Eventos e métricas são recortados pelo mesmo intervalo. Logs operacionais de inicialização, configuração expandida e `.env` não fazem parte desse export.

Fontes já rotacionadas não podem ser reconstruídas. A conferência de eventos próximos às bordas da sessão detecta truncamentos evidentes, mas não prova a preservação de cada evento intermediário. Os [arquivos de evidência](../docs/evidencias.md) preservam o que foi efetivamente coletado e declaram esse limite.

Os logs continuam locais nesta etapa. A centralização, a diretriz de retenção e sua relação com os casos de detecção fazem parte da [Sprint 3](../docs/planejamento.md#sprint-3--integrar-e-comunicar--governança-e-painel-executivo).
