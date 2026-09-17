# Medir disponibilidade pela consulta autenticada

O indicador principal usa login e consulta validada de um prontuário fictício conhecido. Um simples HTTP 200 ou uma conexão com o banco poderiam permanecer saudáveis enquanto o fluxo necessário ao atendimento falhasse. A escolha custa uma consulta e uma autenticação por ciclo, mas permite defender o impacto assistencial com evidência funcional.

O verificador tem identidade e métricas separadas do tráfego clínico. A falta de coleta é preservada como desconhecimento, sem convertê-la em sucesso ou falha assistencial.
