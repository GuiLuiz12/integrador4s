# CyPark — Governança em Cibersegurança na Saúde

Projeto da **Sprint 3 — Integrar e comunicar**, com consulta autenticada, logs centralizados e dois dashboards Grafana v1.0: governança executiva e operação/SecOps. Os dados assistenciais são fictícios. O [relatório da Sprint 2](docs/relatorio-sprint2.md) reúne baseline, anomalias, vulnerabilidades, riscos, incidentes e recomendações nas dez seções do modelo de entrega.

Sprint 1 concluída e validada em 17/09/2026. Consulte o [relatório com a DoD](docs/relatorio-sprint1.md) e as [evidências revisadas](evidence/validated/sprint1/README.md). A entrega combina a sessão de falhas de 10/09 com a validação de retomada de 17/09, sem misturar os dois períodos.

O refinamento prepara a análise com baseline separado, falha isolada do probe e exportações rastreáveis. Consulte o [planejamento das três sprints](docs/planejamento.md) e o [contrato das evidências](docs/evidencias.md).

As duas visões combinam operação ao vivo, eventos da API no Loki, análise histórica da Sprint 2 e registros de controles, riscos e ações da Sprint 3. O período operacional, o checkpoint de governança e os ensaios preservados aparecem identificados; os registros históricos não mudam com o seletor de tempo. `npm run analysis:sprint2` preserva a reprodução da análise histórica; `npm run analysis:sprint3` consolida as novas evidências. Ambos atualizam as duas definições de dashboard. O relatório permanece como documento estático: a aplicação não gera nem serve relatórios. A limitação do verificador anterior está documentada no relatório; o resultado original foi mantido.

Este README concentra as instruções de execução. Os documentos técnicos e históricos estão no [índice de documentação](#documentação).

- [Instalar e iniciar](#começar)
- [Operar e acessar](#usar-depois-do-setup)
- [Navegar pelos dashboards CyPark](#dashboards-cypark)
- [Simular e coletar evidências](#demonstrar)
- [Investigar logs e demonstrar a Sprint 3](#segurança-e-logs-centralizados)
- [Exportar e conferir dados](#exportar-e-conferir-evidências)
- [Validar o ambiente](#validar-o-ambiente)
- [Desenvolver e recalcular a análise](#desenvolver-e-manter-o-código)
- [Capturar o dashboard e alertas](#capturar-o-dashboard-e-alertas)
- [Encerrar e recuperar](#encerrar-e-recuperar)

## Começar

Use **Ubuntu 24.04 ou Ubuntu 26 ou superior**, em uma máquina x86_64 ou ARM64 com 8 CPUs lógicas, 8 GiB de RAM e 15 GiB livres para imagens e dados. O teste de memória aceita ao menos 7,5 GiB reconhecidos pelo kernel. É necessário acesso à internet e permissão de `sudo` quando faltarem pacotes. Versões futuras do Ubuntu dependem da disponibilidade do repositório oficial Docker para seu codinome.

Com Git instalado e acesso a este repositório privado:

```bash
git clone https://github.com/GuiLuiz12/integrador4s.git
cd integrador4s
./bootstrap.sh
npm run setup
npm start
```

Cada comando tem uma função:

1. **`./bootstrap.sh`** prepara apenas Node/npm. Preserva uma instalação funcional de Node 22+; quando ausente, instala Node 22.23.2 com npm a partir do [arquivo oficial](https://nodejs.org/dist/v22.23.2/), verificando SHA-256. Instala também ferramentas de download ausentes, se necessário. Não instala Docker nem inicia serviços.
2. **`npm run setup`** verifica sistema e recursos, instala Docker/Compose/Buildx/Python e outros requisitos ausentes, inicia o daemon Docker se necessário e cria ou preserva `.env`. **Não sobe os contêineres do laboratório.**
3. **`npm start`** constrói e sobe os nove serviços. Só informa que está pronto após confirmar a consulta autenticada, o Grafana, a cobertura de monitoramento de 100% e as métricas dos nove serviços. Aplica o tema nativo Aubergine, preservado nas preferências do Grafana, e mostra os dois painéis e onde consultar sua senha.

**Não execute `npm ci` para operar o laboratório.** As dependências da aplicação são instaladas nas imagens Docker. `npm ci` é necessário somente para desenvolvimento e ferramentas visuais opcionais. Não é necessário pnpm ou Yarn.

O bootstrap instala em `/usr/local/lib/governanca-saude/`, com atalhos em `/usr/local/bin`. Não altera nvm nem sobrescreve instalações de outros gerenciadores. Se houver Node incompatível antes desses atalhos no PATH, informa o conflito: ative Node 22+ com npm no gerenciador existente ou ajuste o PATH antes de repetir. Instalações compatíveis, incluindo a desta máquina, são preservadas. A instalação Docker segue o [repositório APT oficial](https://docs.docker.com/engine/install/ubuntu/), sem remover pacotes conflitantes.

Para conferir o host sem instalar, gerar arquivos ou iniciar serviços:

```bash
npm run setup:check
```

Você pode repetir bootstrap e setup: instalações compatíveis, senhas, volumes e dados existentes serão preservados. Se o `.env` tiver sido perdido mas os volumes ainda existirem, o setup pedirá a restauração desse arquivo. Instalações Docker parciais com pacotes conflitantes também serão identificadas, sem desinstalação automática. Execute os comandos como usuário normal; os scripts solicitam sudo quando necessário.

Os coletores exigem Docker Engine local convencional, cgroups v2, dados em `/var/lib/docker` e o socket containerd padrão em `/run/containerd/containerd.sock`; Docker Desktop, rootless e daemon remoto ficam fora deste setup. Os scripts usam `sudo` para acessar Docker quando o usuário não tem permissão no socket; não alteram grupos ou permissões globais. Por isso a senha de sudo pode ser solicitada novamente em operações posteriores.

Consulte [validação dos comandos npm](docs/validacao-comandos.md) para distinguir testes reais, simulados e limitações de plataforma. Reconhecer uma versão futura do Ubuntu não garante que Docker ou Chromium já forneçam os pacotes necessários.

## Usar depois do setup

| O que você quer fazer | Comando ou local | Resultado |
|---|---|---|
| Acompanhar continuidade, riscos e prioridades | [CyPark · Executiva](http://localhost:3001/d/saude-v01) | Oito blocos de leitura executiva, com operação e avaliações identificadas |
| Investigar desempenho, alertas e eventos | [CyPark · Operação & SecOps](http://localhost:3001/d/cypark-secops) | Nove blocos técnicos e aprofundamento dos registros e da infraestrutura |
| Ler a entrega da Sprint 2 | [Relatório estático](docs/relatorio-sprint2.md) | Documento histórico com dez seções e referências às fontes preservadas |
| Descobrir todas as ações | `npm run help` | Catálogo com pré-requisitos, argumentos, duração e efeitos |
| Consultar endereços e logins | `npm run access` | URLs, usuários e variáveis de senha; nenhum segredo impresso |
| Ver os serviços | `npm run status` | Estado dos nove contêineres |
| Acompanhar logs da API | `npm run logs -- api` | Últimas 100 linhas e novos eventos; Ctrl+C encerra a leitura |
| Acompanhar todos os logs | `npm run logs` | Logs locais de todos os serviços |
| Investigar eventos centralizados | Grafana Explore → Loki; `npm run logs:query -- '{service="api"}' 300` | Eventos permitidos da API nos últimos 300 segundos |
| Confirmar login e consulta clínica | `npm run check` | Teste do fluxo, sem expor token ou prontuário |
| Consultar vitalidade e prontidão | `npm run health` | Estado dos dois endpoints da API |
| Entrar no PostgreSQL | `npm run db` | Terminal `psql` dentro do contêiner |
| Encerrar por enquanto | `npm stop` | Para o laboratório e preserva os dados |
| Voltar a usar | `npm start` | Reativa e verifica os serviços já configurados |

Use os comandos dentro da pasta do repositório. Argumentos adicionais vêm depois de `--`, como em `npm run logs -- postgres`. Os scripts resolvem os caminhos do Compose e do `.env` automaticamente. `npm start`, `npm stop` e `npm test` dispensam a palavra `run`.

O gerador já produz uma consulta fictícia por segundo. Não é necessário disparar um experimento para começar a ver dados. Gráficos que usam janela de cinco minutos precisam desse tempo para amadurecer. Os experimentos opcionais estão em [Demonstrar](#demonstrar).

## Dashboards CyPark

A **visão executiva** reúne oito blocos: disponibilidade do fluxo autenticado; detecção e recuperação dos ensaios; falhas estimadas de login; exposição dos riscos; continuidade clínica; achados por ativo; matriz inerente; e tratamentos prioritários. Os links levam ao detalhe correspondente na **visão técnica**, preservando período e contexto, inclusive em modo kiosk (`?kiosk`). O endereço executivo conserva o favorito anterior e continua sendo a página inicial do Grafana.

A **visão técnica** reúne nove blocos: p95 junto dos erros 5xx; vazão/rede; capacidade de APP-01, DB-01 e HOST-01; cobertura da coleta; alertas/incidentes; vulnerabilidades; e autenticação/logs. Seções expansíveis mantêm controles, evolução, ações completas, risco residual, infraestrutura dos nove serviços e histórico das sprints. O filtro de serviço atua na infraestrutura; evento e correlação filtram os logs da API. Em **Correlação**, informe o ID literal ou `.*` para todos; o campo não aceita uma expressão regular arbitrária. O detalhamento conserva `instance_id` para interpretar a correlação.

O tema **Aubergine** usa acentos ciano e lavanda. Verde, amarelo e vermelho continuam indicando estados; alto/crítico e demais níveis também possuem rótulos. Dados ausentes aparecem em cinza. A preferência é aplicada pela API nativa durante `npm start`, sem CSS personalizado nem desativação da sanitização HTML.

O seletor controla métricas e logs operacionais. Riscos, achados, tratamentos e tempos dos ensaios exibem suas próprias datas. MTTD/MTTR aparecem separados entre indisponibilidade clínica (`INC-01`, n=1), perda de coleta (`INC-02`, n=1) e autenticação (`INC-03`/`INC-04`, n=2). A p95 mede consultas bem-sucedidas e deve ser lida junto dos erros. A rotação Docker de 10 MB × 3 e a retenção Loki de sete dias são configurações, não medições de volume armazenado. Consulte as [definições e limites dos indicadores](docs/indicadores.md#leitura-dos-dashboards-cypark).

## Acessos locais

`npm run setup` cria `.env` com segredos aleatórios e permissão 0600, sem exibi-los. Não sobrescreve um arquivo existente válido. Abra esse arquivo **localmente** para obter `GRAFANA_PASSWORD`; não o inclua em screenshots ou relatórios. Login do painel: `admin`.

- **Governança executiva:** http://localhost:3001/d/saude-v01
- **Operação & SecOps:** http://localhost:3001/d/cypark-secops
- **OpenAPI:** http://localhost:3000/openapi.json
- **Recuperação:** http://localhost:3000/runbook
- **Vitalidade / prontidão:** http://localhost:3000/health/live e http://localhost:3000/health/ready

Aguardar aproximadamente 45 s para preencher alvos e regras; gráficos com janela de cinco minutos precisam de histórico. O gerador inicia automaticamente em uma consulta por segundo.

Na API, `POST /auth/login` recebe JSON com `username` e `password`; o token retornado autentica `GET /prontuarios/:id` com `Authorization: Bearer <token>`. As identidades e respectivas variáveis no `.env` são:

| Usuário | Variável da senha | Uso |
|---|---|---|
| `profissional1` | `PROF_1_PASSWORD` | Consulta clínica e gerador |
| `profissional2` | `PROF_2_PASSWORD` | Consulta clínica |
| `monitor` | `PROBE_PASSWORD` | Verificação automática |

Não há edição de prontuários, cadastro público ou acesso a dados reais. OpenAPI é a especificação JSON da API; não há interface web de prontuário nesta sprint.

Para acessar o PostgreSQL, executar **na raiz do projeto**, com os serviços ativos:

```bash
npm run db
```

No `psql`, `\dt` lista as tabelas, `SELECT count(*) FROM prontuarios;` verifica o total e `\q` sai. O administrador configurado é `lab_owner` (`POSTGRES_PASSWORD`); a aplicação usa `clinical_reader` (`APP_DB_PASSWORD`), com permissão somente de leitura. A conexão acima usa o socket local dentro do contêiner. O banco não possui porta publicada no host.

Também é possível consultar diretamente: `npm run db -- -c 'SELECT count(*) FROM prontuarios;'`. Prometheus, Loki, Alloy, Node Exporter, cAdvisor e gerador permanecem acessíveis somente nas redes internas do projeto.

## Demonstrar

```bash
npm run metrics:query -- 'lab:collection_coverage_percent'
npm run simulate:load -- 5 600
npm run simulate:auth-failures
npm run simulate:db-outage -- 120
npm run check
npm run evidence:export
```

As simulações alteram o laboratório: carga ampliada, dez falhas de autenticação e indisponibilidade do banco. `simulate:db-outage` restaura o banco ao terminar ou receber Ctrl+C. `npm run simulate:probe-outage -- 90` interrompe somente a coleta de `/probe`, mantendo o gerador e suas métricas; restaura por expiração ou sinal. Recuperação manual: `npm run db:restore` e `npm run probe:restore`. O comando anterior `simulate:collector-outage` continua disponível para interromper o contêiner `lab` inteiro.

Os roteiros longos abaixo permanecem disponíveis para novas coletas; **não são necessários para reproduzir as entregas históricas nem para o caso curto da Sprint 3**. Antes de iniciá-los, confirmar consulta funcional, cobertura de 100% dos alvos do perfil atual e gráficos de recursos dos contêineres:

```bash
npm run baseline:run
npm run session:run
```

O **baseline dura 30 minutos** a 1/s e exige sucesso assistencial, coleta contínua, ausência de alertas disparados e histórico suficiente de recursos. O **experimento dura 60 minutos**. Cada execução acrescenta pelo menos cinco minutos de estabilização antes do período observado. Execute sequencialmente, sem alterar código, configuração ou imagens durante a coleta. Registre outras atividades do host que possam afetar seus recursos; a janela curta e o host compartilhado limitam as conclusões.

O experimento segue a sequência abaixo, com minutos relativos a `session_started`, após a estabilização:

| Minuto aproximado | Ação automática | Evidência esperada |
|---:|---|---|
| 0 | Consulta normal a 1/s | Fluxo disponível e cobertura de 100% |
| 10–20 | Carga a 5/s por dez minutos | Volume, latência e recursos durante a carga |
| 25 | Dez logins inválidos | Dez HTTP 401 e aumento do contador |
| 30–32 | Parar PostgreSQL por pelo menos 120 s após confirmação | API viva, consulta falha e alerta após persistência |
| 35 | Conferir recuperação | Consulta funcional e recuperação no histórico do probe |
| 40–41,5 | Interromper somente `/probe` por 90 s | Falha de coleta; API, job `lab` e gerador continuam ativos |
| 60 | Encerrar e exportar | Séries originais, curvas derivadas, eventos e timeline |

O limite de concorrência do gerador é cinco; `lab_load_attempts_total` informa tentativas limitadas em falhas ou lentidão. A carga volta a 1/s ao expirar. A falha isolada usa controle por loopback dentro do contêiner `lab`: o HTTP 503 do endpoint de coleta derruba `up{job="probe"}`, sem fabricar uma amostra de indisponibilidade clínica. A expiração restaura a observação; o evento de restauração do roteiro pode aparecer instantes depois.

Os arquivos ficam em `evidence/runs/baseline-<UUID>` e `evidence/runs/experiment-<UUID>`, ignorados pelo Git. Cada execução cria um destino exclusivo e um bloqueio impede sessões simultâneas no mesmo checkout. Ao concluir, as fontes são exportadas e verificadas. Consulte o [formato das evidências e convenções dos tempos](docs/evidencias.md).

Ctrl+C/SIGTERM aciona tentativas de restauração; o probe também possui expiração automática. Uma execução interrompida registra `interrupted_or_failed` ou `restoration_failed` e não é aceita como sessão completa. Após uma interrupção, execute `npm run db:restore`, `npm run probe:restore`, `npm run check` e confira `npm run metrics:query -- 'lab:collection_coverage_percent'`. Se o contêiner `lab` inteiro foi parado, use também `npm run collector:restore`. Aguarde cobertura de 100% antes de iniciar outra sessão. SIGKILL, queda do host ou do daemon podem exigir restauração manual.

As [evidências da Sprint 1](evidence/validated/sprint1/README.md) usam o roteiro anterior, que interrompia o contêiner inteiro do gerador/verificador. Preserve esse histórico separado do novo cenário isolado; o leitor de resumo mantém compatibilidade com ele.

## Segurança e logs centralizados

Alloy envia ao Loki apenas os eventos `authentication`, `record_access` e `request_error` da API. Grafana Explore → Loki permite filtrar por serviço, evento e correlação; nenhuma nova porta é publicada no host. O Loki preserva os eventos em volume, com retenção configurada de sete dias. Isso não comprova sete dias de coleta contínua nem protege contra perda do host. As regras de acesso e retenção estão na [diretriz interna](docs/diretriz-monitoramento.md).

```bash
npm run logs:query -- '{service="api"} | json | event="authentication" | status=401' 300
npm run session:sprint3 -- evidence/runs/sprint3-login-01
npm run session:sprint3 -- evidence/runs/sprint3-login-02
npm run analysis:sprint3
```

Cada `session:sprint3` usa uma pasta nova, executa um único caso curto e exporta suas evidências. Para incorporar novas execuções à análise, atualizar as referências de `sessions` em `analysis/sprint3/registers.json` após conferir suas fontes; `analysis:sprint3` usa essas referências, sem selecionar automaticamente a pasta mais recente. Rode sequencialmente, sem outras simulações concorrentes. O roteiro confirma consulta e coleta, produz um login inválido a cada dois segundos e espera `FalhasDeLoginRepetidas` entrar em `firing`, por até 120 segundos. Depois da detecção, interrompe as tentativas e confirma consulta válida, resolução do alerta e pelo menos 60 segundos sem novas falhas. Interrupção ou ausência do disparo mantém a execução incompleta; não sobrescreva a pasta para tentar novamente.

O alerta estima pelo menos cinco falhas de login em um minuto, persistindo por 15 segundos. `increase` pode produzir frações: a contagem exata é a de respostas `401` nos eventos. A suspeita é agregada na API, sem identificação de atacante. A resposta automatizada para o gerador simulado; **não implementa bloqueio ou limitação de tentativas na API**. O comando antigo `simulate:auth-failures` continua gerando dez tentativas, mas sozinho não documenta o ciclo completo de detecção e resposta.

O dashboard mostra as duas execuções por categoria, período e amostra. MTTD, tempo até ação e MTTR simulado têm definições distintas no [catálogo](docs/indicadores.md#segurança-e-governança-da-sprint-3). Para encerrar o trabalho acadêmico, siga o [guia do pacote estático](docs/entrega-sprint3.md): PDF e slides são produzidos fora da aplicação.

## Exportar e conferir evidências

Para conferir novamente sem Docker, rede ou Grafana, use `npm run session:summary -- PASTA_DA_SESSAO`. O comando valida hashes, intervalos, cobertura, famílias de métricas, inventário, estabilidade da configuração e eventos dos protocolos longos e históricos; grava `summary.json` somente em sucesso. As marcações são horários observados, com a resolução e os atrasos da coleta. A resposta dos cenários é automatizada, não tempo de reação humana.

Uma exportação avulsa usa `npm run evidence:export -- PASTA_VAZIA --from ISO_INICIO --to ISO_FIM`. Substitua pelos valores de um intervalo realmente coletado e ainda retido no Prometheus; informe ambas as datas com fuso. Sem datas, usa a última hora; sem pasta, cria um destino exclusivo. Uma exportação avulsa não comprova o protocolo completo de baseline ou experimento. Confira lacunas e bordas e não sobrescreva conjuntos anteriores.

Antes de copiar uma seleção para `evidence/validated/`, revise as fontes e preserve todos os arquivos referenciados no manifesto. Prints ou resumos isolados não permitem reproduzir os cálculos. Não inclua `.env`, tokens, conteúdo clínico ou configuração Docker expandida.

## Validar o ambiente

Com os serviços ativos, estes comandos verificam o laboratório:

```bash
npm run config:check
npm run test:rules
npm run check
npm run test:integration
```

A integração verifica registros, permissões, inicialização idempotente, endpoints, coleta, portas e limites. Os testes de regras não provocam falhas nos serviços ativos. A validação da Sprint 3 inclui os nove alvos, a leitura dos eventos no Loki, persistência após reinício e o disparo/resolução do alerta de login. O teste de retenção verifica configuração e persistência; não acelera o relógio para alegar sete dias de observação.

Os testes ficam restritos aos serviços do projeto Compose `governanca-saude`. Cobrem login válido/inválido, usuário desconhecido, token expirado, consulta sem autenticação, ausência de rotas de edição, acesso somente SELECT para `clinical_reader` e inicialização por `lab_owner`. O probe rejeita HTTP 200 com prontuário incorreto e respeita timeout total; os logs são verificados para não expor credenciais, tokens ou conteúdo clínico. As simulações observam indisponibilidade, alerta e recuperação, distinguindo falta de coleta de falha funcional. Não há testes ofensivos externos ou scanner de CVEs; os dados são fictícios e o controle de acesso simplificado não representa um sistema clínico de produção.

### Testar instalação do zero no Ubuntu 26.04

```bash
npm run test:ubuntu26
```

Este teste opcional usa QEMU/KVM no host, com Python 3.11+, Git e cliente SSH. Requer acesso a `/dev/kvm`, oito CPUs, 10 GiB de RAM **livre**, 25 GiB livres em `/tmp` e internet. Usa uma VM com oito vCPUs, 8 GiB de RAM e disco de 40 GiB. Não é requisito para operar o laboratório.

O roteiro baixa a [imagem oficial Ubuntu 26.04](https://cloud-images.ubuntu.com/releases/26.04/release/), confere SHA-256 e envia uma cópia do código atual, incluindo alterações locais, sem `.env`, dependências ou credenciais Git. Instala Node/npm e Docker dentro da VM, sobe o laboratório e verifica integração, regras e preservação após parada/retomada. O usuário de teste não pertence ao grupo Docker, exercitando o acesso por sudo.

Não compartilha o socket Docker ou os volumes do host. SSH e os metadados de inicialização usam somente portas locais temporárias. Logs e resultado ficam em `evidence/runs/ubuntu26-install-<horário>/`; o teste informa o diretório para acompanhar `installation.log`. Em sucesso, encerra a VM e remove seu disco e sua chave SSH; a imagem base fica em `/tmp/integrador4s-ubuntu26-test/` para reutilização. Em falha, encerra a VM e informa o diretório privado de diagnóstico que foi preservado. A duração depende da rede, normalmente de 15–30 minutos.

## Desenvolver e manter o código

Esta seção é opcional para quem vai alterar o projeto. Node/npm já são preparados pelo bootstrap. Execute `npm ci` antes de compilar, testar, gerar o dashboard ou usar as ferramentas visuais.

| Script npm | Para que serve | Quando usar |
|---|---|---|
| `npm run build` | Compila TypeScript para `dist/` | Validar alterações na aplicação |
| `npm test` | Executa testes de código e dos scripts com isolamento | Verificar alterações; não é a sessão real de uma hora |
| `npm run test:evidence` | Testa exportação e análise offline com Python | Verificar integridade, recortes e critérios de aceite; usa fixtures sintéticas somente nos testes |
| `npm run dashboard` | Gera `dashboards/saude.json` e `dashboards/secops.json` | Depois de editar os geradores de dashboard |
| `npm run analysis:sprint2` | Recalcula `analysis/sprint2/analysis.json` e atualiza as duas visões | Reproduzir a análise a partir das fontes históricas, com Python 3.11+ e Node 22+, sem Docker ou nova coleta |
| `npm run analysis:sprint3` | Consolida os registros e as evidências da Sprint 3 e gera as duas visões v1.0 | Após novas evidências ou atualização justificada de controles e ações; não gera relatório |
| `npm run start:api` | Inicia apenas a API compilada fora do Compose | Desenvolvimento manual, com banco e variáveis preparados |
| `npm run start:lab` | Inicia apenas gerador/verificador compilados fora do Compose | Desenvolvimento manual, com API e variáveis preparados |

Os dashboards são provisionados automaticamente, com UIDs `saude-v01` (executiva) e `cypark-secops` (técnica), e são somente leitura pela interface. Ao alterar as definições, versione os geradores e os dois JSONs juntos; `npm start` mantém o laboratório e o tema configurados. Os comandos `analysis:sprint2` e `analysis:sprint3` não escrevem relatórios, imagens ou cópias TXT de fontes. A metodologia e a proveniência estão no [contrato das evidências](docs/evidencias.md#análise-histórica-da-sprint-2); a interpretação das visões está no [catálogo de indicadores](docs/indicadores.md#análise-da-sprint-2). `start:api` e `start:lab` são comandos avançados para componentes isolados; para usar o laboratório completo, execute `npm start`.

O diretório `dashboards/` é montado como somente leitura. Após `npm run dashboard` escrever os dois JSONs, o provider os relê em até 30 s (`updateIntervalSeconds: 30`); atualize a página para ver a nova definição, sem recriar o Grafana. A leitura periódica evita depender dos eventos de alteração de arquivos em bind mounts Docker.

Alterações no Compose, nas configurações montadas do Prometheus/Loki/Alloy ou no provider do Grafana exigem recarregar os serviços: execute `npm stop` e depois `npm start`. Os volumes e históricos são preservados. Uma nova chamada de `npm start` sobre contêineres já ativos pode reutilizá-los; a verificação exige os nove jobs esperados e disponíveis, pois 100% de uma configuração antiga com sete jobs não comprova a coleta da Sprint 3.

## Capturar o dashboard e alertas

Para a validação visual opcional de desenvolvimento:

```bash
npm run browser:setup
npm run dashboard:verify
```

`browser:setup` instala Chromium e bibliotecas do sistema; pode solicitar sudo. As capturas ficam em `evidence/runs/cypark-<timestamp>/`, sem tela de login e sem sobrescrever capturas históricas. `dashboard:verify` aceita `-- --from ISO --to ISO --output-dir PASTA`; as duas datas devem ser informadas juntas. Sem intervalo explícito, usa a última hora. As consultas e imagens usam o mesmo período. Para vincular a captura à coleta, use `npm run dashboard:verify -- --session-dir PASTA_DA_SESSAO`: o manifesto fornece o intervalo, e `validation.json` registra seu hash e o ID da sessão. Mesmo nessa opção, as novas capturas ficam em `evidence/runs/`; `--output-dir` permite escolher outra pasta nova. As ferramentas compartilham o cache padrão do Playwright, podendo usar `PLAYWRIGHT_BROWSERS_PATH` quando definido.

`npm run alerts:capture` observa, por padrão, os dois alertas históricos por até 70 minutos e salva em `evidence/runs/alerts-<timestamp>/`, sem provocar falhas. Execute em outro terminal no início do experimento. Pode receber o início ISO e a pasta de destino com `npm run alerts:capture -- ISO_INÍCIO --output-dir PASTA` (por exemplo, `PASTA_DA_SESSAO/captures/alerts`).

Para acompanhar somente o caso curto de segurança, iniciar em outro terminal junto à sessão, informando a data ISO real e uma pasta nova:

```bash
npm run alerts:capture -- ISO_INÍCIO --alert FalhasDeLoginRepetidas --timeout-seconds 300 --output-dir PASTA
```

Para capturar uma execução histórica específica, acrescente `--until ISO_FIM` com o fim do manifesto. Isso impede incluir o disparo de uma execução posterior.

A captura não produz as falhas; `session:sprint3` executa o cenário. Os 300 segundos do observador cobrem a janela inicial e o período de disparo; o roteiro continua limitando a fase de tentativas a 120 segundos. Iniciar a captura junto à sessão e preservar `observation.json` com os horários reais.

`dashboard:verify` confere os dois dashboards, consultas, CSVs analíticos, filtros, navegação e tema. Captura os modos normal e kiosk em 1366×1000 e 1920×1080, além dos detalhes para leitura das tabelas; valida períodos relativo/absoluto e ausência de dados. Os oito e nove blocos principais orientam o aceite, independentemente da quantidade de subpainéis nativos. `observation.json` separa o horário do alerta do horário da captura. Para novas capturas operacionais, o período precisa estar dentro da retenção do Prometheus; os dados já exportados continuam utilizáveis offline.

Na seleção histórica para apresentação, preserve baseline, indisponibilidade, recuperação e falha isolada do probe. Para a Sprint 3, inclua eventos e alerta de login, timeline das duas execuções, riscos inerentes/residuais, controles e ações. Preserve intervalo, completude e limitações visíveis. Capture somente o dashboard, sem credenciais, console com tokens ou configuração expandida. A entrega acadêmica é um PDF estático montado externamente, com figuras, trechos e interpretações incorporados; links não substituem evidências visíveis no documento.

## Encerrar e recuperar

`npm stop` encerra apenas este projeto e preserva volumes. `npm start` recupera banco e histórico. Não há comando de limpeza de volumes neste fluxo. Para recuperar somente um componente, use `npm run db:restore`, `npm run probe:restore` ou `npm run collector:restore`, conforme a falha, e confirme com `npm run check` e o painel. O [procedimento de recuperação](docs/recuperacao.md) também está disponível na API em `/runbook`.

Não regenere `.env` mantendo volumes existentes: senhas do banco, usuários iniciais e administrador Grafana são inicializadas na primeira criação. Rotações exigem alteração coordenada no serviço e no segredo, não somente edição do arquivo.

Somente as portas 3000 e 3001 são publicadas, vinculadas a loopback. A rede do banco e a de monitoramento são internas; uma terceira rede de acesso conecta apenas API e Grafana para permitir a publicação local. Montagens especiais do host ficam restritas aos coletores. Os sockets Docker e containerd montados como somente leitura ainda permitem chamadas às APIs dos daemons; trate cAdvisor e Alloy como componentes de confiança e não os exponha. O socket containerd é necessário para observar contêineres no armazenamento padrão de instalações novas do Docker 29.

## Documentação

- [Planejamento das três sprints](docs/planejamento.md)
- [Contrato das evidências e reprodução offline](docs/evidencias.md)
- [Validação do refinamento da Sprint 1](docs/validacao-refinamento.md)
- [Evidências revisadas do refinamento](evidence/validated/refinamento-sprint1/README.md)
- [Arquitetura e implantação futura](docs/arquitetura.md)
- [Inventário e cobertura](docs/inventario.md)
- [Catálogo dos indicadores](docs/indicadores.md)
- [Diretriz interna de monitoramento e resposta](docs/diretriz-monitoramento.md)
- [Guia de entrega da Sprint 3 para PDF e apresentação](docs/entrega-sprint3.md)
- [Procedimento de recuperação](docs/recuperacao.md)
- [Glossário](CONTEXT.md)
- [Logs e evidências](logging/README.md)
- [Relatório estático da Sprint 2](docs/relatorio-sprint2.md)
- [Relatório e checklist de conclusão da Sprint 1](docs/relatorio-sprint1.md)
- [Evidências revisadas da Sprint 1](evidence/validated/sprint1/README.md)

A Sprint 3 acrescenta centralização de eventos, detecção de falhas de login, avaliação de controles internos e acompanhamento de ações. Controles pendentes continuam visíveis: não há autorização por prontuário, limitação de tentativas, backup com restauração ensaiada ou observação externa do host. A entrega não afirma conformidade legal ou certificação, implantação em nuvem ou eliminação dos riscos. PDF e apresentação finais permanecem entregáveis estáticos externos.
