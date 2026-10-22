# Roteiro das coletas de evidência

Antes de começar, confirmar API funcional, sete alvos coletados e gráficos dos contêineres presentes. As novas coletas têm diretórios exclusivos, manifesto e validação offline. Consulte o [contrato dos arquivos](evidencias.md).

## Baseline separado

Executar `npm run baseline:run`. Após pelo menos cinco minutos de estabilização, observar 30 minutos a uma consulta/s, sem injetar falhas. O roteiro exige sucesso assistencial, coleta contínua, ausência de alertas disparados e históricos suficientes de recursos.

O caminho impresso é `evidence/runs/baseline-<UUID>`. Esse conjunto é a referência para comparar comportamento normal e experimento na Sprint 2; seus limites são a janela curta, o host compartilhado e o caráter fictício da carga.

## Experimento

Executar `npm run session:run` depois do baseline. Há uma nova estabilização de pelo menos cinco minutos, fora dos 60 minutos observados. Os minutos abaixo são relativos a `session_started`, depois da estabilização.

| Minuto aproximado | Ação automática | Evidência esperada |
|---:|---|---|
| 0 | Consulta normal a 1/s | Fluxo disponível, cobertura 100% |
| 10–20 | Carga a 5/s por 10 min | Mudança de volume, latência e recursos |
| 25 | Dez logins inválidos | Dez respostas HTTP 401; aumento do contador |
| 30–32 | Parar PostgreSQL por pelo menos 120 s após confirmação | API viva; consulta falha; alerta após persistência |
| 35 | Conferir recuperação | Consulta funciona; primeira recuperação identificável no histórico do probe |
| 40–41,5 | Interromper somente `/probe` por 90 s | Falha de coleta no job `probe`; API, job `lab` e gerador continuam ativos |
| 60 | Encerrar sessão e exportar | Séries originais, curvas derivadas, logs no intervalo e timeline |

O limite de concorrência do gerador é cinco. Em falhas ou lentidão, tentativas podem ser limitadas; `lab_load_attempts_total` informa o resultado. O perfil volta a 1/s ao expirar. O experimento opera somente sobre os componentes do laboratório.

O cenário de falha isolada usa controle acessível por loopback dentro do contêiner `lab`. Responder HTTP 503 no endpoint de coleta faz `up{job="probe"}` cair, sem produzir uma falsa amostra de indisponibilidade clínica. Ao expirar o controle, o endpoint volta a observar o fluxo. O evento de restauração do roteiro pode ocorrer alguns instantes depois da expiração automática.

O caminho do experimento é `evidence/runs/experiment-<UUID>`. Ao terminar, o roteiro exporta e valida duração, completude, métricas de carga, eventos, disparo dos alertas, recuperação e continuidade do gerador durante a lacuna do probe. Para repetir a conferência offline:

```bash
npm run session:summary -- evidence/runs/experiment-<UUID>
```

O comando só grava `summary.json` quando as verificações passam. As marcações são horários de comandos e observações reais; os tempos de detecção e recuperação possuem resolução e atrasos da coleta. A resposta é automatizada pelo roteiro. Ver as [convenções dos tempos](evidencias.md#tempo-do-incidente-simulado).

## Recuperação e interrupção

Ctrl+C/SIGTERM aciona as tentativas de restauração; o probe também tem TTL. O roteiro registra `interrupted_or_failed` ou `restoration_failed` quando aplicável e não aceita a pasta como sessão completa. Depois de uma interrupção, conferir:

```bash
npm run db:restore
npm run probe:restore
npm run check
npm run metrics:query -- 'lab:collection_coverage_percent'
```

Se tiver usado o comando anterior que para o contêiner `lab`, executar também `npm run collector:restore`. Aguardar a cobertura voltar a 100% antes de uma nova coleta.

## Capturas para a apresentação

1. Baseline saudável com intervalo e completude visíveis.
2. Período de maior carga e suas métricas.
3. Indisponibilidade observada, alerta e coleta preservada.
4. Recuperação após restaurar o banco.
5. Falha do probe, com geração de tráfego preservada e estado assistencial sem dados nesse período.

Após `npm ci` e `npm run browser:setup`, capturar o mesmo intervalo de uma sessão concluída:

```bash
npm run dashboard:verify -- --session-dir evidence/runs/experiment-<UUID>
```

As imagens e `validation.json` ficam em uma pasta exclusiva sob `captures/`, com vínculo ao manifesto. Para observar os alertas em outro terminal, durante o experimento:

```bash
npm run alerts:capture -- ISO_INICIO_DA_SESSAO \
  --output-dir evidence/runs/experiment-<UUID>/captures/alerts
```

Substituir pelos valores reais. O observador consulta o histórico e não provoca falhas. `observation.json` distingue o horário do alerta do horário da captura. A sessão precisa estar dentro da retenção do Prometheus para novas capturas; os dados exportados permanecem utilizáveis offline.

Capturar somente o dashboard; nunca `.env`, console com tokens ou configuração Docker expandida. Revisar o conjunto antes de copiá-lo para `evidence/validated/`.

## Continuidade com a entrega anterior

As evidências de setembro usam o roteiro anterior, que interrompia o contêiner inteiro do gerador/verificador. Elas permanecem preservadas em `evidence/validated/sprint1/`; não representam o novo cenário isolado. O leitor de resumo mantém suporte ao formato histórico.

Na defesa, partir da falha real do PostgreSQL, mostrar a consulta malsucedida e o indicador, explicar o impacto fictício e defender a prioridade de restauração. Comprovar a recuperação pela fonte técnica e pela timeline. Distinguir saúde do serviço e qualidade da observação; registrar os limites da janela curta.
