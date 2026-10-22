# Validação do refinamento da Sprint 1

## Escopo

Preparar dados rastreáveis para a Sprint 2, preservando a entrega histórica. O planejamento funcional está em [Planejamento](planejamento.md); o formato implementado está em [Evidências](evidencias.md).

## Ambiente utilizado

Docker Engine local em Linux Mint 22.3, arquitetura x86_64, 12 CPUs lógicas e aproximadamente 23,2 GiB de RAM reconhecida pelo Docker. Versão do daemon observada: 29.9.2. O acesso ao daemon funcionou com aprovação fora do sandbox. Esta execução não constitui novo teste de instalação do zero no Ubuntu 26.

## Verificações executadas

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

### Experimento — interrompido; validação completa pendente

O experimento `11ea5378-3869-4e07-8567-d0246ed968e6` foi interrompido por SIGTERM a pedido do operador, que precisava desligar a máquina. A janela medida foi de `2026-10-22T00:32:24.319580+00:00` a `2026-10-22T00:59:10.953588+00:00`: 26 minutos e 46,634 segundos. A carga ampliada e os dez logins inválidos foram executados; as falhas programadas do banco e do probe ainda não haviam começado. O encerramento restaurou a carga para 1/s.

As fontes foram exportadas antes do desligamento, preservando `status: interrupted_or_failed` e a timeline original. A [cópia parcial](../evidence/partial/refinamento-sprint1/README.md) contém 28 arquivos; os hashes dos 27 arquivos referenciados no manifesto foram conferidos, assim como a ausência dos valores das credenciais locais. Essa conferência de integridade não aprova a sessão incompleta. Não há resumo de aceite, incidentes de indisponibilidade nem tempos de detecção/recuperação validados para esta execução.

### Retomada pendente

1. Iniciar o laboratório com `npm start` e executar um **novo** experimento com `npm run session:run`. Reservar pelo menos 65 minutos, incluindo estabilização; a sessão parcial não pode ser continuada para compor uma janela contínua de 60 minutos.
2. Acompanhar os alertas conforme o [roteiro](demonstracao.md), concluir a exportação e conferir o aceite offline. Conferir também as lacunas originais do cAdvisor durante a parada programada do PostgreSQL; o limiar atual de 150 s ainda não foi avaliado nessa condição real.
3. Capturar o Grafana com `npm run dashboard:verify -- --session-dir PASTA_DA_NOVA_SESSAO`, revisar os resultados e promover apenas o conjunto completo aprovado.

O baseline aprovado está preservado e não precisa ser repetido para salvar este checkpoint. Uma nova comparação deve registrar eventuais diferenças de ambiente ou configuração entre as coletas. O refinamento ainda depende da validação real completa do experimento.

## Limitações para a análise

- Dados e impacto são didáticos, produzidos por um laboratório local de saúde fictícia.
- O host ficou em uso interativo durante as duas coletas. O observador Playwright acompanha alertas durante o experimento e consome recursos fora dos contêineres. CPU e memória de contêineres têm escopos distintos do host; a análise deve considerar esse contexto.
- Logs locais podem ser rotacionados; exportação não recupera eventos perdidos.
- Tempos de detecção e recuperação são observações de um incidente com resposta automática, não médias históricas nem tempo de resposta humana.
- Inventário e versões apoiam futura investigação de vulnerabilidades; não constituem análise de vulnerabilidades ou registro de riscos.
- Os três avisos de severidade moderada exibidos durante a instalação de dependências na imagem são uma indicação para investigação na Sprint 2. Sem relatório detalhado e contexto de exposição, não foram convertidos em riscos ou declarados tratados.
