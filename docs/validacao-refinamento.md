# Validação do refinamento da Sprint 1

## Escopo

Preparar dados rastreáveis para a Sprint 2, preservando a entrega histórica. O planejamento funcional está em [Planejamento](planejamento.md); o formato implementado está em [Evidências](evidencias.md).

## Ambiente utilizado

Docker Engine local em Linux Mint 22.3, arquitetura x86_64, 12 CPUs lógicas e aproximadamente 23,2 GiB de RAM reconhecida pelo Docker. Versão do daemon observada: 29.9.2. O acesso ao daemon funcionou com aprovação fora do sandbox. Esta execução não constitui novo teste de instalação do zero no Ubuntu 26.

## Verificações anteriores

| Verificação | Resultado observado |
|---|---|
| `npm run build` | Compilação concluída |
| `npm test` | 34 testes aprovados; inclui isolamento do probe, correlação entre instâncias e restauração por SIGTERM com Docker simulado |
| `npm run test:evidence` | 17 testes aprovados; inclui recorte temporal, integridade, leitura histórica e aceite/rejeição de sessões sintéticas |
| `npm run test:rules` | Regras aprovadas nos cenários do promtool |
| `npm run test:integration` | 100 prontuários fictícios, três identidades, sete alvos e métricas dos sete serviços; portas e limites conferidos |
| `npm start` | Sete serviços prontos, consulta autenticada e cobertura de coleta de 100% |
| Exportação avulsa do ambiente real | Segunda execução conferida offline; 13 observações do probe e 223 respostas no trecho efetivamente disponível |
| `npm run browser:setup` | Chromium instalado e iniciado |
| Grafana com o intervalo do baseline | 29 painéis, sem erros nas expressões ou JavaScript; capturas de síntese e infraestrutura conferidas visualmente |

A primeira exportação avulsa revelou arredondamento submilissegundo dos timestamps de avaliação do Prometheus. O exportador passou a recortar o resultado derivado nos limites solicitados, preservando os timestamps, e recebeu teste de regressão. A pasta original foi mantida como execução de diagnóstico; não foi promovida como conjunto validado.

Os testes sintéticos usam arquivos temporários, sem Docker e sem simular passagem real de 30/60 minutos. Seus dados não são evidência do ambiente. O teste de correlação TypeScript exercita os eventos emitidos pela API; o teste de sinal usa um substituto de comando Docker e não interrompe a coleta em andamento.

## Coletas realizadas

### Baseline — aprovado

- ID: `9354d609-9654-4632-9529-00bae1ec5f24`.
- Intervalo: `2026-10-21T23:54:23.920216+00:00` a `2026-10-22T00:24:25.084915+00:00`.
- Duração observada: 1.801,165 s, após aproximadamente 316 s de estabilização e verificações.
- 120 verificações assistenciais, todas bem-sucedidas; disponibilidade observada de 100% e completude temporal de 99,94%.
- 2.044 respostas nos eventos; nenhuma falha de login ou resposta clínica 503.
- Históricos dos sete serviços presentes; entre 78 e 82 amostras de recursos por série de contêiner, maior lacuna de 29,981 s.

A verificação inicial rejeitou o histórico de CPU dos contêineres porque pressupunha uma nova observação do cAdvisor a cada scrape de 15 s. Os próprios dados mostraram 120 scrapes bem-sucedidos e timestamps de recursos em intervalos variáveis. A correção distingue a completude dos scrapes da cadência original do exporter e verifica também as lacunas e as bordas, conforme [critério documentado](evidencias.md#frequência-do-cadvisor-e-qualidade-do-histórico). Dois testes de regressão cobrem a cadência variável válida e a rejeição de lacuna excessiva mesmo com scrapes saudáveis.

O baseline foi reanalisado offline, mantendo todos os arquivos fonte e o manifesto originais. `summary.json.analyzer` registra a versão do verificador por hash e o manifesto utilizado.

### Experimento de 22/10 — interrompido

O experimento `11ea5378-3869-4e07-8567-d0246ed968e6` foi interrompido por SIGTERM a pedido do operador, que precisava desligar a máquina. A janela medida foi de `2026-10-22T00:32:24.319580+00:00` a `2026-10-22T00:59:10.953588+00:00`: 26 minutos e 46,634 segundos. A carga ampliada e os dez logins inválidos foram executados; as falhas programadas do banco e do probe ainda não haviam começado. O encerramento restaurou a carga para 1/s.

As fontes foram exportadas antes do desligamento, preservando `status: interrupted_or_failed` e a timeline original. A [cópia parcial](../evidence/partial/refinamento-sprint1/README.md) contém 28 arquivos; os hashes dos 27 arquivos referenciados no manifesto foram conferidos, assim como a ausência dos valores das credenciais locais. Essa conferência de integridade não aprova a sessão incompleta. Não há resumo de aceite, incidentes de indisponibilidade nem tempos de detecção/recuperação validados para esta execução.

### Experimento de 26/10 — completo, aceite rejeitado

Após a aprovação dos ajustes de apresentação do dashboard, a suíte automatizada e uma nova sessão foram executadas. O [conjunto rejeitado e seu diagnóstico](../evidence/rejected/refinamento-sprint1/README.md) estão preservados separadamente das evidências aprovadas. O baseline e a sessão parcial anterior não foram alterados.

| Verificação em 26/10/2026 | Resultado |
|---|---|
| `npm run build` | Aprovado |
| `npm test` | 34 testes aprovados |
| `npm run test:evidence` | 17 testes aprovados |
| `npm run config:check` e `npm run test:rules` | Aprovados |
| `npm run check` e `npm run test:integration` | Login e consulta funcionais; 100 registros, três identidades, sete alvos e métricas dos sete serviços; portas locais 3000/3001; limites de 5,75 CPUs e 7 GiB |
| `npm run dashboard:verify`, antes e depois da sessão | 28 painéis, nenhuma falha nas expressões ou JavaScript; capturas de síntese e infraestrutura revisadas |
| `npm run alerts:capture` | Os dois alertas disparados foram capturados; processo encerrado com sucesso |
| `npm run session:run` | Coleta e exportação completas; saída 1 na análise offline |
| `npm run session:summary` | Reproduziu a rejeição: `Eventos esperados não foram observados.` |

As tentativas iniciais dentro do sandbox foram bloqueadas pelo acesso ao Docker e pelo socket local do runner TypeScript. As verificações passaram fora do sandbox. O teste opcional de instalação em VM não foi executado.

**Período observado:** `2026-10-26T22:57:04.597788+00:00` a `2026-10-26T23:57:05.715257+00:00` (19:57:04 a 20:57:05 em São Paulo), com 3.601,117 s de duração e estabilização anterior de aproximadamente 318 s. ID: `ba3b1508-8edd-4604-a1a1-5a40c599925e`.

O motivo da rejeição está no critério de eventos de `scripts/evidence_analysis.py`: exige dez logins inválidos e pelo menos 60 respostas 503 de **consulta clínica**. Foram observados os dez HTTP 401, mas apenas 23 respostas 503 de consulta, além de 106 respostas 503 de autenticação. Os contadores da API confirmam essas quantidades.

O gerador reutiliza o token por 840 s. Seu último login bem-sucedido antes da parada ocorreu às 23:13:27,957 UTC; a renovação tornou-se necessária por volta de 23:27:27,957, durante a interrupção do banco. A última consulta com HTTP 503 ocorreu às 23:27:27,231. A partir da renovação, as tentativas do gerador falharam no login, antes de consultar o prontuário. Seus contadores registraram 23 erros HTTP e 98 erros de transporte ou login. Os 106 eventos de autenticação 503 têm categoria `unauthenticated`: não permitem atribuir individualmente cada resposta ao gerador ou ao probe. Não foram reclassificados como consultas clínicas.

As fontes também mostram os seguintes resultados, registrados como **diagnóstico**, sem substituir um resumo de aceite:

- 234 verificações assistenciais, 226 com sucesso e oito falhas; disponibilidade observada de 96,58% e completude temporal de 97,47%.
- Alerta clínico detectado 90,782 s após a parada confirmada; primeira recuperação observada 41,043 s após a detecção, com impacto observado de 131,825 s. São tempos de um incidente com resposta automatizada, não médias históricas.
- Falha isolada do probe por 90,002 s, com coleta de API e gerador preservada, incremento observado de 74 tentativas bem-sucedidas do gerador e ausência de falso alerta clínico nesse intervalo.
- Maior lacuna original de CPU, memória e rede dos contêineres: 129,7 s, abaixo do limite existente de 150 s. Esse critério passou antes da rejeição por contagem de eventos.
- Ao término e na conferência posterior: sete serviços ativos, consulta disponível, cobertura de 100%, carga de 1/s e nenhum alerta disparado.

Foram conferidos os 36 arquivos referenciados pelo manifesto e os 44 arquivos da cópia preservada, incluindo capturas e diagnóstico posteriores à exportação. Não foram encontrados valores das credenciais locais. O manifesto mantém `status: completed`, que comprova a exportação; **não existe `summary.json` aprovado**, e o conjunto não foi promovido para `evidence/validated/`. O verificador encerrou no critério de eventos; as observações posteriores foram calculadas separadamente para diagnóstico.

Na comparação com o baseline, os hashes do código da aplicação, as dependências, o Compose e os limites de recursos são iguais. Mudaram o dashboard aprovado, os hashes do gerador de dashboard e dos analisadores em relação ao snapshot antigo, e os IDs das imagens locais de API/gerador. O inventário e `validation/baseline-comparison.json` registram essas diferenças. As mudanças locais do dashboard estão preservadas em `source-changes.patch`.

**Limitação preservada:** o aceite completo desse experimento pelo verificador antigo continua pendente. A eventual revisão do critério de respostas 503 fica como melhoria técnica; não bloqueia a entrega analítica aprovada para a Sprint 2. O [relatório da Sprint 2](relatorio-sprint2.md) usa as fontes completas com a limitação declarada, sem alterar o verificador ou converter a rejeição em aprovação.

## Limitações para a análise

- Dados e impacto são didáticos, produzidos por um laboratório local de saúde fictícia.
- O host ficou em uso interativo durante as duas coletas. O observador Playwright acompanha alertas durante o experimento e consome recursos fora dos contêineres. CPU e memória de contêineres têm escopos distintos do host; a análise deve considerar esse contexto.
- Logs locais podem ser rotacionados; exportação não recupera eventos perdidos.
- Tempos de detecção e recuperação são observações de um incidente com resposta automática, não médias históricas nem tempo de resposta humana.
- Inventário e versões apoiam futura investigação de vulnerabilidades; não constituem análise de vulnerabilidades ou registro de riscos.
- Os três avisos de severidade moderada exibidos durante a instalação de dependências na imagem são uma indicação para investigação na Sprint 2. Sem relatório detalhado e contexto de exposição, não foram convertidos em riscos ou declarados tratados.
