# Painel de Governança em Cibersegurança — Saúde

Projeto da **Sprint 2 — Analisar**, com consulta autenticada, prontuários fictícios e Dashboard v0.2. O [relatório da Sprint 2](docs/relatorio-sprint2.md) reúne baseline, anomalias, vulnerabilidades, riscos, incidentes e recomendações nas dez seções do modelo de entrega.

Sprint 1 concluída e validada em 17/09/2026. Consulte o [relatório com a DoD](docs/relatorio-sprint1.md) e as [evidências revisadas](evidence/validated/sprint1/README.md). A entrega combina a sessão de falhas de 10/09 com a validação de retomada de 17/09, sem misturar os dois períodos.

O refinamento prepara a análise com baseline separado, falha isolada do probe e exportações rastreáveis. Consulte o [planejamento das três sprints](docs/planejamento.md) e o [contrato das evidências](docs/evidencias.md).

O v0.2 combina análise do recorte de 26/10/2026 com os painéis operacionais. `npm run analysis:sprint2` recalcula os dados e o dashboard a partir das fontes preservadas, sem repetir o experimento. O relatório permanece como documento estático: a aplicação não gera nem serve relatórios. A limitação do verificador anterior está documentada no relatório; o resultado original foi mantido.

Este README concentra as instruções de execução. Os documentos técnicos e históricos estão no [índice de documentação](#documentação).

- [Instalar e iniciar](#começar)
- [Operar e acessar](#usar-depois-do-setup)
- [Simular e coletar evidências](#demonstrar)
- [Exportar e conferir dados](#exportar-e-conferir-evidências)
- [Validar o ambiente](#validar-o-ambiente)
- [Desenvolver e recalcular a análise](#desenvolver-e-manter-o-código)
- [Capturar o dashboard e alertas](#capturar-o-dashboard-e-alertas)
- [Encerrar e recuperar](#encerrar-e-recuperar)

## Começar

Use **Ubuntu 24.04 ou Ubuntu 26 ou superior**, em uma máquina x86_64 ou ARM64 com 6 CPUs lógicas, 8 GiB de RAM e 15 GiB livres para imagens e dados. O teste de memória aceita ao menos 7,5 GiB reconhecidos pelo kernel. É necessário acesso à internet e permissão de `sudo` quando faltarem pacotes. Versões futuras do Ubuntu dependem da disponibilidade do repositório oficial Docker para seu codinome.

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
3. **`npm start`** constrói e sobe os sete serviços. Só informa que está pronto após confirmar a consulta autenticada, o Grafana, a cobertura de monitoramento de 100% e as métricas dos sete serviços. Mostra o painel e onde consultar sua senha.

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
| Acompanhar análise e operação | [Grafana v0.2](http://localhost:3001/d/saude-v01) | Recorte analítico identificado e coleta operacional automática |
| Ler a entrega da Sprint 2 | [Relatório estático](docs/relatorio-sprint2.md) | Documento histórico com dez seções e referências às fontes preservadas |
| Descobrir todas as ações | `npm run help` | Catálogo com pré-requisitos, argumentos, duração e efeitos |
| Consultar endereços e logins | `npm run access` | URLs, usuários e variáveis de senha; nenhum segredo impresso |
| Ver os serviços | `npm run status` | Estado dos sete contêineres |
| Acompanhar logs da API | `npm run logs -- api` | Últimas 100 linhas e novos eventos; Ctrl+C encerra a leitura |
| Acompanhar todos os logs | `npm run logs` | Logs locais de todos os serviços |
| Confirmar login e consulta clínica | `npm run check` | Teste do fluxo, sem expor token ou prontuário |
| Consultar vitalidade e prontidão | `npm run health` | Estado dos dois endpoints da API |
| Entrar no PostgreSQL | `npm run db` | Terminal `psql` dentro do contêiner |
| Encerrar por enquanto | `npm stop` | Para o laboratório e preserva os dados |
| Voltar a usar | `npm start` | Reativa e verifica os serviços já configurados |

Use os comandos dentro da pasta do repositório. Argumentos adicionais vêm depois de `--`, como em `npm run logs -- postgres`. Os scripts resolvem os caminhos do Compose e do `.env` automaticamente. `npm start`, `npm stop` e `npm test` dispensam a palavra `run`.

O gerador já produz uma consulta fictícia por segundo. Não é necessário disparar um experimento para começar a ver dados. Gráficos que usam janela de cinco minutos precisam desse tempo para amadurecer. Os experimentos opcionais estão em [Demonstrar](#demonstrar).

## Acessos locais

`npm run setup` cria `.env` com segredos aleatórios e permissão 0600, sem exibi-los. Não sobrescreve um arquivo existente válido. Abra esse arquivo **localmente** para obter `GRAFANA_PASSWORD`; não o inclua em screenshots ou relatórios. Login do painel: `admin`.

- **Painel:** http://localhost:3001/d/saude-v01
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

Também é possível consultar diretamente: `npm run db -- -c 'SELECT count(*) FROM prontuarios;'`. Prometheus, Node Exporter, cAdvisor e gerador permanecem acessíveis somente nas redes internas do projeto.

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

Para produzir os conjuntos separados, confirmar consulta funcional, cobertura de 100% dos sete alvos e gráficos de recursos dos contêineres:

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

## Exportar e conferir evidências

Para conferir novamente sem Docker, rede ou Grafana, use `npm run session:summary -- PASTA_DA_SESSAO`. O comando valida hashes, intervalos, cobertura, famílias de métricas, inventário, estabilidade da configuração e eventos; grava `summary.json` somente em sucesso. As marcações são horários observados, com a resolução e os atrasos da coleta. A resposta dos cenários é automatizada, não tempo de reação humana.

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

A integração verifica registros, permissões, inicialização idempotente, endpoints, coleta, portas e limites. Os testes de regras não provocam falhas nos serviços ativos.

Os testes ficam restritos aos serviços do projeto Compose `governanca-saude`. Cobrem login válido/inválido, usuário desconhecido, token expirado, consulta sem autenticação, ausência de rotas de edição, acesso somente SELECT para `clinical_reader` e inicialização por `lab_owner`. O probe rejeita HTTP 200 com prontuário incorreto e respeita timeout total; os logs são verificados para não expor credenciais, tokens ou conteúdo clínico. As simulações observam indisponibilidade, alerta e recuperação, distinguindo falta de coleta de falha funcional. Não há testes ofensivos externos ou scanner de CVEs; os dados são fictícios e o controle de acesso simplificado não representa um sistema clínico de produção.

### Testar instalação do zero no Ubuntu 26.04

```bash
npm run test:ubuntu26
```

Este teste opcional usa QEMU/KVM no host, com Python 3.11+, Git e cliente SSH. Requer acesso a `/dev/kvm`, seis CPUs, 10 GiB de RAM **livre**, 25 GiB livres em `/tmp` e internet. Usa uma VM com seis vCPUs, 8 GiB de RAM e disco de 40 GiB. Não é requisito para operar o laboratório.

O roteiro baixa a [imagem oficial Ubuntu 26.04](https://cloud-images.ubuntu.com/releases/26.04/release/), confere SHA-256 e envia uma cópia do código atual, incluindo alterações locais, sem `.env`, dependências ou credenciais Git. Instala Node/npm e Docker dentro da VM, sobe o laboratório e verifica integração, regras e preservação após parada/retomada. O usuário de teste não pertence ao grupo Docker, exercitando o acesso por sudo.

Não compartilha o socket Docker ou os volumes do host. SSH e os metadados de inicialização usam somente portas locais temporárias. Logs e resultado ficam em `evidence/runs/ubuntu26-install-<horário>/`; o teste informa o diretório para acompanhar `installation.log`. Em sucesso, encerra a VM e remove seu disco e sua chave SSH; a imagem base fica em `/tmp/integrador4s-ubuntu26-test/` para reutilização. Em falha, encerra a VM e informa o diretório privado de diagnóstico que foi preservado. A duração depende da rede, normalmente de 15–30 minutos.

## Desenvolver e manter o código

Esta seção é opcional para quem vai alterar o projeto. Node/npm já são preparados pelo bootstrap. Execute `npm ci` antes de compilar, testar, gerar o dashboard ou usar as ferramentas visuais.

| Script npm | Para que serve | Quando usar |
|---|---|---|
| `npm run build` | Compila TypeScript para `dist/` | Validar alterações na aplicação |
| `npm test` | Executa testes de código e dos scripts com isolamento | Verificar alterações; não é a sessão real de uma hora |
| `npm run test:evidence` | Testa exportação e análise offline com Python | Verificar integridade, recortes e critérios de aceite; usa fixtures sintéticas somente nos testes |
| `npm run dashboard` | Gera `dashboards/saude.json` | Depois de editar `scripts/dashboard.mjs` |
| `npm run analysis:sprint2` | Recalcula `analysis/sprint2/analysis.json` e o dashboard v0.2 | Reproduzir a análise a partir das fontes históricas, com Python 3.11+ e Node 22+, sem Docker ou nova coleta |
| `npm run start:api` | Inicia apenas a API compilada fora do Compose | Desenvolvimento manual, com banco e variáveis preparados |
| `npm run start:lab` | Inicia apenas gerador/verificador compilados fora do Compose | Desenvolvimento manual, com API e variáveis preparados |

O dashboard é provisionado automaticamente, com UID `saude-v01`, e é somente leitura pela interface. Ao alterar sua definição, versione a origem e o JSON gerado juntos; `npm start` mantém o laboratório configurado. `analysis:sprint2` não escreve relatórios, imagens ou cópias de fontes. A metodologia e a proveniência estão no [contrato das evidências](docs/evidencias.md#análise-histórica-da-sprint-2); a interpretação das visões está no [catálogo de indicadores](docs/indicadores.md#análise-da-sprint-2). `start:api` e `start:lab` são comandos avançados para componentes isolados; para usar o laboratório completo, execute `npm start`.

## Capturar o dashboard e alertas

Para a validação visual opcional de desenvolvimento:

```bash
npm run browser:setup
npm run dashboard:verify
```

`browser:setup` instala Chromium e bibliotecas do sistema; pode solicitar sudo. As capturas ficam em `evidence/runs/dashboard-<timestamp>/`, sem tela de login. `dashboard:verify` aceita `-- --from ISO --to ISO --output-dir PASTA`; as duas datas devem ser informadas juntas. Sem intervalo explícito, usa a última hora. As consultas e imagens usam o mesmo período. Para vincular a captura à coleta, use `npm run dashboard:verify -- --session-dir PASTA_DA_SESSAO`: o manifesto fornece o intervalo, e `validation.json` registra seu hash e o ID da sessão. As ferramentas compartilham o cache padrão do Playwright, podendo usar `PLAYWRIGHT_BROWSERS_PATH` quando definido.

`npm run alerts:capture` observa os dois alertas por até 70 minutos e salva em `evidence/runs/alerts-<timestamp>/`, sem provocar falhas. Execute em outro terminal no início do experimento. Pode receber o início ISO e a pasta de destino com `npm run alerts:capture -- ISO_INÍCIO --output-dir PASTA` (por exemplo, `PASTA_DA_SESSAO/captures/alerts`).

`dashboard:verify` confere as expressões PromQL e os CSVs analíticos, além de capturar as visões. `observation.json` separa o horário do alerta do horário da captura. Para novas capturas operacionais, o período precisa estar dentro da retenção do Prometheus; os dados já exportados continuam utilizáveis offline.

Na seleção para apresentação, inclua baseline saudável, carga ampliada, indisponibilidade com alerta, recuperação e falha isolada do probe. Preserve intervalo, completude e limitações visíveis. Capture somente o dashboard, sem credenciais, console com tokens ou configuração expandida. A entrega acadêmica é um PDF estático montado externamente, com figuras, trechos e interpretações incorporados; links não substituem evidências visíveis no documento.

## Encerrar e recuperar

`npm stop` encerra apenas este projeto e preserva volumes. `npm start` recupera banco e histórico. Não há comando de limpeza de volumes neste fluxo. Para recuperar somente um componente, use `npm run db:restore`, `npm run probe:restore` ou `npm run collector:restore`, conforme a falha, e confirme com `npm run check` e o painel. O [procedimento de recuperação](docs/recuperacao.md) também está disponível na API em `/runbook`.

Não regenere `.env` mantendo volumes existentes: senhas do banco, usuários iniciais e administrador Grafana são inicializadas na primeira criação. Rotações exigem alteração coordenada no serviço e no segredo, não somente edição do arquivo.

Somente as portas 3000 e 3001 são publicadas, vinculadas a loopback. A rede do banco e a de monitoramento são internas; uma terceira rede de acesso conecta apenas API e Grafana para permitir a publicação local. Montagens especiais do host ficam restritas aos coletores. Os sockets Docker e containerd montados como somente leitura ainda permitem chamadas às APIs dos daemons; trate cAdvisor como componente de confiança e não o exponha. O socket containerd é necessário para observar contêineres no armazenamento padrão de instalações novas do Docker 29.

## Documentação

- [Planejamento das três sprints](docs/planejamento.md)
- [Contrato das evidências e reprodução offline](docs/evidencias.md)
- [Validação do refinamento da Sprint 1](docs/validacao-refinamento.md)
- [Evidências revisadas do refinamento](evidence/validated/refinamento-sprint1/README.md)
- [Arquitetura e implantação futura](docs/arquitetura.md)
- [Inventário e cobertura](docs/inventario.md)
- [Catálogo dos indicadores](docs/indicadores.md)
- [Procedimento de recuperação](docs/recuperacao.md)
- [Glossário](CONTEXT.md)
- [Logs e evidências](logging/README.md)
- [Relatório estático da Sprint 2](docs/relatorio-sprint2.md)
- [Relatório e checklist de conclusão da Sprint 1](docs/relatorio-sprint1.md)
- [Evidências revisadas da Sprint 1](evidence/validated/sprint1/README.md)

A Sprint 2 inclui KRIs, inventário de vulnerabilidades, registro de riscos e plano preliminar de tratamento. Centralização de logs, conformidade, execução e acompanhamento dos controles e implantação efetiva na nuvem permanecem fora desta entrega.
