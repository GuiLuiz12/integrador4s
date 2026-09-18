# Validação da interface npm

Esta melhoria altera preparação, comandos e documentação de operação. Não altera o escopo, a DoD ou as evidências históricas da Sprint 1.

## Cenários

- Bootstrap: preservar Node/npm compatíveis, instalar runtime oficial quando ausente, verificar checksum, identificar conflitos e repetir sem reinstalar.
- Setup: preparar requisitos e `.env` sem subir contêineres; diagnóstico sem mutações.
- Operação: iniciar e confirmar API/Grafana/coleta; consultar banco, métricas e logs; parar preservando dados; retomar.
- Scripts: argumentos com espaços preservados, códigos de erro propagados, falhas simuladas restauradas e `npm stop` sem remoção de volumes.

## Resultado em 17/09/2026

| Verificação | Ambiente | Resultado |
|---|---|---|
| Instalar Node/npm do zero e repetir bootstrap | Contêineres descartáveis Ubuntu 24.04 e 26.04, x86_64 | Aprovado: Node 22.23.2, npm 10.9.8; segunda execução preservou instalação |
| Preservar Node/npm existentes | Host Ubuntu 24.04 | Aprovado: manteve Node 22.13.1 e npm 11.13.0 |
| `npm run build` e `npm test` | Host Ubuntu 24.04 | Compilação aprovada; 29 testes passaram |
| `npm run setup:check` e setup repetido | Host com laboratório ativo | Mesmos contêineres e mesmo `.env`, sem reinicialização |
| Setup com laboratório parado | Host após `npm stop` | Preparou configuração sem criar ou iniciar contêineres |
| Parar e retomar por npm | Host Ubuntu 24.04 | Volumes preservados, conteúdo dos 100 registros idêntico e `.env` idêntico com permissão 0600 |
| Configuração, regras e integração | Laboratório ativo | 100 registros, três identidades, sete alvos e sete serviços com métricas; somente portas 3000/3001 em loopback |
| Banco, saúde e métricas | Comandos npm | `psql` interativo e consulta com `-c` funcionaram; vitalidade/prontidão saudáveis e cobertura 100% |
| Acompanhar logs e interromper leitura | `npm run logs -- api` | Eventos recebidos; Ctrl+C encerrou a leitura sem parar o serviço |
| Exportar evidências | `npm run evidence:export` | Métricas e eventos filtrados em `evidence/runs/npm-interface/` |
| Resumir sessão | Cópia temporária da sessão de 10/09 | Validação aprovada, incluindo pasta com espaço; original histórico preservado |
| Preparar Chromium | Host Ubuntu 24.04 | Download e abertura aprovados; bibliotecas existentes dispensaram sudo |
| Validar dashboard | `npm run dashboard:verify` | Login, consultas e capturas aprovados; artefatos em `evidence/runs/npm-interface-dashboard/` |

Os testes isolados cobrem falhas de download/checksum, Node/npm incompatíveis, conflitos de PATH, seleção de arquitetura, falha de prontidão, encaminhamento de argumentos, códigos de erro, restauração por sinal e preservação de volumes. A instalação de bibliotecas ausentes do Chromium e a falha de sudo foram simuladas, sem instalar pacotes no host.

O laboratório ficou ativo ao final. As evidências novas em `evidence/runs/` são locais e ignoradas pelo Git; não substituem a entrega histórica da Sprint 1. A demonstração de uma hora e o observador de alertas de até 70 minutos não foram repetidos nesta melhoria.

## Instalação completa em VM Ubuntu 26.04

**Aprovada em 17/09/2026, às 22:03 de Brasília (18/09 às 01:03 UTC).** [Resultado revisado](../evidence/validated/setup/ubuntu26-20260918.json).

O comando `npm run test:ubuntu26` criou uma VM QEMU/KVM com imagem oficial Ubuntu 26.04 LTS, kernel 7.0.0-30-generic, seis vCPUs, 8 GiB de RAM e disco de 40 GiB. A imagem e a cópia do código foram identificadas por SHA-256 no resultado. Node, npm e Docker estavam ausentes antes do teste; as credenciais do host não foram copiadas.

O fluxo real `./bootstrap.sh`, `npm run setup` e `npm start` instalou Node 22.23.2, npm 10.9.8, Docker 29.8.1 e Compose 5.5.1. Foi executado como usuário comum com sudo, sem pertencer ao grupo Docker.

| Critério | Resultado |
|---|---|
| Setup prepara sem iniciar contêineres | Aprovado, na instalação inicial e após parada |
| Login, consulta clínica e endpoints locais | Aprovado |
| Grafana e Prometheus | Disponíveis; cobertura 100% |
| Coleta e métricas dos contêineres | Sete alvos e métricas dos sete serviços |
| Regras de alerta | Testes promtool aprovados |
| Integração | 100 registros, três identidades, SELECT restrito e limites/portas corretos |
| Parada e retomada | Mesmo conteúdo dos registros e mesmo `.env`, com permissão 0600 |
| Isolamento do host | Mesmos sete contêineres e mesmas credenciais do laboratório original, sem reinicialização |

### Falha encontrada e corrigida

A primeira instalação chegou a 100% dos alvos HTTP, mas não produziu métricas por contêiner. O cAdvisor registrou erro ao acessar `/run/containerd/containerd.sock`. Instalações novas do [Docker 29 usam armazenamento containerd](https://docs.docker.com/engine/storage/containerd/); o [cAdvisor 0.60.5 consulta esse socket](https://github.com/google/cadvisor/blob/v0.60.5/container/docker/factory.go) nessa configuração.

A correção monta somente esse socket adicional no cAdvisor, sem publicar portas nem alterar o armazenamento do daemon. O setup verifica a existência do endpoint e `npm start` passou a exigir métricas dos sete serviços antes de declarar prontidão. O teste de regressão cobre o caso de cobertura 100% com métricas ausentes. Os 29 testes passaram.

Depois da correção, todo o fluxo foi repetido em **outra VM limpa**, incluindo instalação dos pacotes, integração, parada e retomada. A VM foi encerrada e seus discos/chaves temporários removidos. Os logs locais completos estão em `evidence/runs/ubuntu26-install-20260918T005950Z/`; somente o resultado revisado é incluído no repositório.

## Limites

O teste completo cobre Ubuntu 26.04 x86_64 em QEMU/KVM, com systemd, Docker e coletores reais. Não equivale a implantação em um provedor de nuvem. ARM64 e versões posteriores do Ubuntu tiveram apenas seleção/aceitação testadas com comandos simulados. Chromium e ferramentas visuais foram executados no host Ubuntu 24.04, não nessa VM 26.04. O suporte a versões futuras depende dos pacotes dos fornecedores.
