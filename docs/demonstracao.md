# Roteiro da sessão de evidência

Antes de começar, confirmar API funcional, sete alvos coletados e gráficos dos contêineres presentes. Selecionar no Grafana um intervalo absoluto correspondente à sessão para evitar incluir lacunas fora dela.

| Minuto aproximado | Ação automática em `lab.sh session` | Evidência esperada |
|---:|---|---|
| 0 | Consulta normal a 1/s | Fluxo disponível, cobertura 100% |
| 10–20 | Carga a 5/s por 10 min | Mudança de volume, latência e recursos |
| 25 | Dez logins inválidos | Dez eventos HTTP 401; aumento do contador |
| 30–32 | Parar PostgreSQL por 120 s | API viva, prontidão/consulta falham; alerta após persistência |
| 35 | Confirmar recuperação | Consulta funciona, alerta resolvido |
| 40–41,5 | Parar gerador/verificador | Falha de coleta nos jobs `lab` e `probe`; estado assistencial sem dados |
| 60 | Encerrar sessão e exportar | Histórico real, logs filtrados e linha temporal |

O limite de concorrência do gerador é cinco. Em falhas ou lentidão, tentativas podem ser limitadas; `lab_load_attempts_total` informa isso. O perfil volta a 1/s ao expirar. O experimento não realiza testes contra destinos externos.

Após concluir, executar `python3 scripts/summarize-session.py evidence/runs/session-<horario>` para conferir duração, carga, indisponibilidade real, disparo dos alertas, recuperação, dez logins inválidos e lacuna de coleta. O comando só produz `summary.json` quando as verificações passam.

## Capturas para a apresentação

1. Visão gerencial saudável com intervalo e completude visíveis.
2. Período de maior carga e suas métricas.
3. Indisponibilidade observada, alerta e cobertura de coleta preservada.
4. Recuperação após restaurar o banco.
5. Falha do coletor e ausência de conclusão sobre disponibilidade.

Capturar somente o dashboard; nunca `.env`, console com tokens ou configurações expandidas do Docker. Exportar com `lab.sh evidence`, revisar antes de compartilhar e colocar apenas artefatos autorizados sob versionamento.

Com Chromium de teste instalado, é possível executar em outro terminal `PLAYWRIGHT_BROWSERS_PATH=/tmp/integrador4s-browser node scripts/capture-alerts.mjs` antes da sessão. Esse observador salva capturas do histórico real quando cada alerta dispara, sem provocar falhas. Para recuperar capturas de uma sessão já iniciada, passar seu início ISO como argumento adicional. As imagens usam um intervalo absoluto; `observation.json` distingue o horário do alerta do horário da captura. O observador renova a autenticação se o Grafana exigir rotação do token. A captura do estado normal e a validação das consultas são feitas por `scripts/verify-dashboard.mjs`.

## Defesa da decisão

Partir da falha real do PostgreSQL, mostrar a consulta malsucedida e o indicador, explicar o atraso assistencial fictício e defender a prioridade de restauração. Comprovar o resultado pela consulta recuperada e pela linha temporal. Separar o estado do serviço da qualidade da observação e reconhecer as limitações da janela curta.
