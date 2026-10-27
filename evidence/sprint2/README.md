# Validação da entrega analítica — Sprint 2

Entrega: [relatório com as dez seções](../../docs/relatorio-sprint2.md), [dados e fontes](../../analysis/sprint2/README.md) e Dashboard v0.2. O relatório e as visões analíticas reutilizam o baseline e o experimento preservados; não houve nova coleta longa para esta entrega.

## Verificações da versão inicial

| Verificação | Resultado |
|---|---|
| `npm run build` | TypeScript compilado |
| `npm test` | 36 testes aprovados |
| `npm run test:evidence` | 20 testes aprovados |
| `npm run analysis:sprint2` | Relatório, dados, fontes e dashboard gerados; integridade das fontes conferida |
| `npm run config:check` | Compose válido |
| `npm run test:rules` | Regras Prometheus aprovadas |
| `npm run test:integration` | Login/consulta, 100 registros, 3 identidades, permissões, idempotência, 7 alvos e métricas, portas loopback e limites aprovados |
| `npm run dashboard:verify` | Login, consultas operacionais, 16 consultas analíticas, 10 seções do relatório e hashes das 14 fontes servidas conferidos |

O teste opcional de instalação em VM Ubuntu não foi repetido: esta entrega não altera o instalador. A sessão longa e o verificador de aceite anterior não foram reexecutados. Sua rejeição original permanece documentada como limitação, sem bloquear o uso analítico aprovado.

## Capturas

As capturas usam o intervalo do experimento nos painéis operacionais. As visões analíticas têm o recorte fixo identificado no dashboard. Datas da captura, quantidade de painéis e erros de consulta/JavaScript estão em [validation.json](dashboard/validation.json).

- [Síntese](dashboard/sintese.png)
- [Baseline e tendências](dashboard/baseline.png)
- [Matriz e registro de riscos](dashboard/riscos.png)
- [Vulnerabilidades](dashboard/vulnerabilidades.png)
- [Incidentes e alertas](dashboard/incidentes.png)
- [KPIs e KRIs](dashboard/indicadores.png)
- [Operação](dashboard/operacao.png)
- [Infraestrutura](dashboard/infraestrutura.png)
- [Relatório no navegador](dashboard/relatorio.png)

Comando de reprodução, usando uma nova pasta para preservar estas capturas:

```bash
npm run dashboard:verify -- --from 2026-10-26T22:57:04.597Z --to 2026-10-26T23:57:05.715Z
```

A aprovação final da apresentação cabe à revisão do usuário. Os tratamentos de risco continuam propostos, sem declaração de implantação ou de risco mitigado.

## Fechamento conforme os critérios de entrega

O relatório foi complementado com índice das dez entregas, médias/picos de baseline e experimento, 18 indicadores consolidados, 11 consultas originais e referências por vulnerabilidade, risco e recomendação com linhas, seletores ou eventos. A timeline diferencia início, detecção, ação automatizada e recuperação, preservando a ação do probe anterior à amostra de alerta. A exposição dos ativos considera severidade, acesso e dependência, sem pontuação adicional.

Verificação dirigida desta revisão: 22 testes de evidências, dois testes das rotas do relatório e build da API aprovados. A suíte completa anterior não foi repetida e não houve nova coleta longa. As fontes originais e as capturas da versão inicial permanecem preservadas.

As capturas analíticas atualizadas em `fechamento/` alimentam quatro figuras do relatório; as outras duas são os alertas capturados durante o experimento. A conferência final fica em [fechamento-final/validation.json](fechamento-final/validation.json): dashboard provisionado corresponde ao gerado, 16 consultas analíticas válidas, dez seções, 18 indicadores, 15 fontes e seis imagens incorporadas com hashes conferidos.

- [Indicadores consolidados](fechamento-final/indicadores.png)
- [Incidentes e ação automatizada](fechamento-final/incidentes.png)
- [Relatório: baseline, limiares e consultas](fechamento-final/relatorio-baseline.png)
- [Relatório: achados e exposição](fechamento-final/relatorio-vulnerabilidades.png)
- [Relatório: timeline e alertas](fechamento-final/relatorio-incidentes.png)
- [Relatório: KPIs e KRIs](fechamento-final/relatorio-indicadores.png)

Para reproduzir a conferência, usar uma pasta nova em `--output-dir`, mantendo `fechamento/` e `fechamento-final/` como evidências desta revisão.
