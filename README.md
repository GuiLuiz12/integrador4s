# Painel de Governança em Cibersegurança — Saúde

Laboratório da **Sprint 1**, com prontuários inteiramente fictícios, consulta autenticada e Dashboard v0.1. Prazo de referência: duas semanas; esforço previsto: 20–40 horas totais, sem pressupor número de pessoas.

Sprint 1 concluída e validada em 17/09/2026. Consulte o [relatório com a DoD](docs/relatorio-sprint1.md) e as [evidências revisadas](evidence/validated/sprint1/README.md). A entrega combina a sessão de falhas de 10/09 com a validação de retomada de 17/09, sem misturar os dois períodos.

## Reconstruir

Requisitos: Linux, Docker Engine com Compose, Node.js 22+, npm e Python 3. Reserve até 6 CPUs, 8 GiB de RAM e 10 GiB de disco, além das imagens. O usuário precisa conseguir executar Docker. cAdvisor requer acesso de leitura aos metadados do host; este Compose é destinado a Docker Linux com daemon convencional, não Docker rootless/Desktop.

```bash
npm ci
npm run setup
./scripts/lab.sh up
./scripts/lab.sh status
./scripts/lab.sh check-api
```

Com o ambiente funcionando, `python3 scripts/verify-integration.py` verifica permissões efetivas, inicialização idempotente, endpoints, métricas, portas e limites. Para a validação visual opcional:

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/integrador4s-browser npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/integrador4s-browser node scripts/verify-dashboard.mjs
```

As capturas do navegador ficam em `evidence/runs/dashboard/` e não incluem a tela de login. Para preservar uma execução anterior e selecionar um intervalo absoluto, use as opções abaixo com horários que tenham dados coletados:

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/integrador4s-browser node scripts/verify-dashboard.mjs \
  --from 2026-09-17T22:24:00Z --to 2026-09-17T22:29:00Z \
  --output-dir evidence/runs/minha-validacao
```

`--from` e `--to` devem ser informados juntos, em ISO 8601 com fuso. Sem essas opções, o intervalo é a última hora. As consultas verificadas usam o mesmo período e horário final das capturas.

## Acessos locais

`setup` cria `.env` com segredos aleatórios e permissão 0600, sem exibi-los. Não sobrescreve arquivo existente. Abra esse arquivo **localmente** para obter `GRAFANA_PASSWORD`; não o inclua em screenshots ou relatórios. Login do painel: `admin`.

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
docker compose --env-file .env -f infra/compose.yaml exec postgres \
  psql -U lab_owner -d healthlab
```

No `psql`, `\dt` lista as tabelas, `SELECT count(*) FROM prontuarios;` verifica o total e `\q` sai. O administrador configurado é `lab_owner` (`POSTGRES_PASSWORD`); a aplicação usa `clinical_reader` (`APP_DB_PASSWORD`), com permissão somente de leitura. A conexão acima usa o socket local dentro do contêiner. O banco não possui porta publicada no host.

Use sempre `--env-file .env` nos comandos diretos do Compose: o arquivo de configuração está em `infra/`, mas os segredos ficam na raiz. Os comandos de `scripts/lab.sh` já resolvem esses caminhos. Prometheus, Node Exporter, cAdvisor e gerador permanecem acessíveis somente nas redes internas do projeto.

## Demonstrar

```bash
./scripts/lab.sh query 'lab:collection_coverage_percent'
./scripts/lab.sh load 5 600
./scripts/lab.sh invalid-logins
./scripts/lab.sh fail-db 120
./scripts/lab.sh check-api
./scripts/lab.sh evidence
```

Para a sequência completa de **60 minutos reais**, começar com cobertura de 100%:

```bash
./scripts/lab.sh session
```

A sessão inclui carga ampliada por dez minutos, dez logins inválidos, queda do banco por dois minutos, recuperação e interrupção do verificador por 90 s. Evidências ficam em `evidence/runs/`, ignorado pelo Git. O histórico não é fabricado nem preenchido retroativamente. Ver [roteiro](docs/demonstracao.md) e [relatório de validação](docs/relatorio-sprint1.md).

## Validar

```bash
npm run build
npm test
./scripts/lab.sh config-check
./scripts/lab.sh rules-test
./scripts/lab.sh check-api
```

O dashboard é provisionado automaticamente. Para modificar sua definição: editar `scripts/dashboard.mjs`, executar `npm run dashboard` e recriar Grafana com Compose. A origem e o JSON gerado devem ser versionados juntos.

## Encerrar e recuperar

`./scripts/lab.sh down` encerra apenas este projeto e preserva volumes. Executar `up` novamente recupera banco e histórico. Não usar `down -v` para manutenção: remove os dados. A limpeza de volumes deve ser uma ação deliberada, separada deste fluxo.

Não regenere `.env` mantendo volumes existentes: senhas do banco, usuários iniciais e administrador Grafana são inicializadas na primeira criação. Rotações exigem alteração coordenada no serviço e no segredo, não somente edição do arquivo.

Somente as portas 3000 e 3001 são publicadas, vinculadas a loopback. A rede do banco e a de monitoramento são internas; uma terceira rede de acesso conecta apenas API e Grafana para permitir a publicação local. Montagens especiais do host ficam restritas aos coletores. O socket Docker montado como somente leitura ainda permite chamadas à API do daemon; trate cAdvisor como componente de confiança e não o exponha.

## Documentação

- [Arquitetura e implantação futura](docs/arquitetura.md)
- [Inventário e cobertura](docs/inventario.md)
- [Catálogo dos indicadores](docs/indicadores.md)
- [Procedimento de recuperação](docs/recuperacao.md)
- [Glossário](CONTEXT.md)
- [Logs e evidências](logging/README.md)
- [Casos de teste autorizados](security/README.md)
- [Relatório e checklist de conclusão da Sprint 1](docs/relatorio-sprint1.md)
- [Evidências revisadas da Sprint 1](evidence/validated/sprint1/README.md)

Centralização de logs, KRIs, registro formal de riscos, vulnerabilidades, conformidade, workflow de ações e implantação efetiva na nuvem não fazem parte desta sprint.
