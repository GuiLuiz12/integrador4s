# Experimento completo com aceite rejeitado — 26/10/2026

A sessão `ba3b1508-8edd-4604-a1a1-5a40c599925e` completou o período e a exportação, mas **não passou no verificador de aceite**. Não existe `summary.json` aprovado. O status `completed` do manifesto descreve a exportação, não a aprovação da evidência.

- Intervalo UTC: `2026-10-26T22:57:04.597788+00:00` a `2026-10-26T23:57:05.715257+00:00`.
- Duração: 3.601,117 s, após aproximadamente 318 s de estabilização.
- Executados: carga de 5/s por dez minutos, dez logins inválidos, parada do banco por 120 s, falha isolada do probe por 90 s e respectivas recuperações.
- Rejeição: esperadas pelo menos 60 respostas 503 de consulta clínica; observadas 23, além de 106 respostas 503 de autenticação. A renovação do token do gerador durante a parada faz as tentativas falharem antes da consulta. Os eventos não foram reclassificados.
- Estado final: sete serviços ativos, consulta disponível, cobertura de 100%, carga de 1/s e nenhum alerta disparado.

## Fontes e diagnóstico

Todos os caminhos abaixo pertencem a [esta sessão](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/):

- [Manifesto original](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/manifest.json), [séries](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/series.json), [eventos](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/events.jsonl) e [timeline](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/session.json).
- [Diagnóstico da rejeição](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/validation/acceptance-diagnostic.json), vinculado ao hash do manifesto e do analisador utilizado.
- [Resultados da suíte inicial](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/validation/preflight.json) e [comparação com o baseline](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/validation/baseline-comparison.json).
- [Console da sessão](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/validation/session-console.txt) e [reprodução offline](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/validation/summary-console.txt).
- [Captura da indisponibilidade](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/captures/alerts/ConsultaAssistencialIndisponivel/dashboard.png) e [captura da falha de coleta](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/captures/alerts/FalhaDeColeta/dashboard.png), com seus arquivos `observation.json`.
- Capturas do intervalo completo: [síntese](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/captures/dashboard-1793059068112/sintese.png), [infraestrutura](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/captures/dashboard-1793059068112/infraestrutura.png) e [validação visual](experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e/captures/dashboard-1793059068112/validation.json).

A cópia preserva os 44 arquivos da execução, com comparação byte a byte por SHA-256. Os 36 arquivos referenciados no manifesto foram conferidos, e nenhum valor das credenciais locais foi encontrado. Capturas do intervalo completo, diagnóstico e consoles adicionados após a exportação são artefatos complementares; não alteram o manifesto nem as fontes originais. As capturas em `validation/preflight-dashboard/` são anteriores ao experimento e têm intervalo próprio.

## Reprodução da rejeição

Na raiz do projeto:

```bash
npm run session:summary -- evidence/rejected/refinamento-sprint1/experiment-ba3b1508-8edd-4604-a1a1-5a40c599925e
```

Com o analisador registrado no diagnóstico, o resultado esperado é saída 1 e `Evidências rejeitadas: Eventos esperados não foram observados.`. Uma correção futura do analisador deverá registrar sua versão e preservar os dados e o manifesto. O [relatório do refinamento](../../../docs/validacao-refinamento.md) detalha o resultado e a pendência. O baseline aprovado e a coleta parcial anterior permanecem inalterados.
