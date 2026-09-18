# Logs locais estruturados

A API emite JSON para stdout. Eventos: `authentication`, `record_access` e `request_error`. Campos exportáveis: horário, nível, evento, correlação, categoria de tráfego, status e duração. O ID do prontuário, conteúdo clínico, senha e token não entram nos logs.

O Docker aplica rotação de 10 MB por arquivo, com três arquivos por serviço. `npm run logs -- api` acompanha os logs locais. `npm run evidence:export` exporta somente os campos permitidos dos eventos da API, além das consultas de métricas escolhidas. Logs operacionais de inicialização e configuração expandida não fazem parte desse export.

Os logs não são centralizados nesta sprint. Não há Loki, SIEM ou mecanismo de retenção de auditoria de produção.
