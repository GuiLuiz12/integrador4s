# Guia de entrega da Sprint 3 — PDF, apresentação e defesa

Este guia orienta a montagem de documentos estáticos a partir das evidências. Não é o relatório final e não deve ser apresentado como prova independente dos resultados. A aplicação não gera nem hospeda relatórios. O PDF e os slides serão montados pelo Cowork e revisados academicamente depois da entrega técnica.

## Material de entrada

Utilizar o pacote `entrega-sprint3-cowork.zip`, preservando a estrutura de pastas e as extensões originais. A versão de partida, datas, hashes e caminhos devem vir do índice incluído no pacote, não de links ao repositório ou do ambiente atualmente aberto.

| Material | Fonte no projeto | Uso na montagem |
|---|---|---|
| Dados consolidados | `analysis/sprint3/analysis.json` | Valores, períodos, fórmulas, incidentes e catálogo de fontes |
| Registro de governança | `analysis/sprint3/registers.json` | Controles, critérios, responsáveis, ações e avaliações de risco |
| Checkpoint inicial | `evidence/sprint3/checkpoint-inicial/checkpoint.json` e fontes correspondentes | Situação anterior à implementação, com limites de comprovação |
| Execuções de segurança | `evidence/sprint3/auth-01/` e `evidence/sprint3/auth-02/` | Eventos, séries, consultas, regras, timeline, manifestos e verificação |
| Validação final | `evidence/sprint3/validation/runtime.json` e resultados correspondentes | Comportamento e controles efetivamente conferidos |
| Capturas do dashboard/alertas | Pasta de captura identificada no índice do pacote | Figuras legíveis com período, título, fonte e interpretação |
| Diretriz e metodologia | Diretriz interna, arquitetura, inventário, indicadores e contrato das evidências | Critérios, escopo, fórmulas e limitações |
| Contexto histórico | Dados e fontes selecionadas das Sprints 1/2, com seus IDs e hashes | Continuidade do projeto; nunca reclassificar período ou aceite antigo |

O índice deve relacionar cada identificador a arquivo, origem, intervalo ou data de revisão, consulta/seletor e hash. Preservar a diferença entre configuração capturada na execução, código consultado posteriormente e avaliação qualitativa. Se um arquivo listado estiver ausente ou um resultado não estiver comprovado, apontar a falta antes de montar a conclusão.

## Matriz dos requisitos

| Entrega obrigatória | Conteúdo a incorporar | Sustentação técnica a conferir |
|---|---|---|
| 1. Centralização | Arquitetura, fonte API, Alloy, Loki, acesso e retenção | Configurações, inventário, consulta de evento real e teste de persistência |
| 2. Caso de detecção | Cenário, origem, condição, criticidade e resposta | Regra de login e procedimento executado |
| 3. Alerta funcional | Estado normal, disparado e resolvido | Séries `ALERTS`, eventos `401`, capturas e timeline |
| 4. Indicadores de incidentes | Abertos/fechados, severidade, MTTD, MTTR e comparação | Duas execuções completas, fórmulas, períodos e n por categoria |
| 5. Riscos | Mapas inerente/residual, tratamentos e responsáveis | Cinco IDs, justificativas e fontes de cada risco |
| 6. Conformidade | Dez controles, implementados/parciais/pendentes e gaps | Critérios da diretriz, evidências e checkpoints |
| 7. Diretriz | Fontes, minimização, acesso, retenção e resposta | Texto da diretriz e limites do que foi executado |
| 8. Plano de ação | Prioridade, esforço, ação, responsável, prazo, status | Resultado de execução para cada ação concluída |
| 9. Dashboard v1.0 | Visões executiva, infraestrutura, segurança, risco e governança | Capturas e verificação de consultas/tabelas |
| 10. Catálogo KPI/KRI | Fonte, fórmula, população, janela, limiar e decisão | Catálogo e dados consolidados reproduzíveis |
| 11. Documentação técnica | Arquitetura, implantação, operação e recuperação | Configurações e procedimento centralizado no README |
| 12. Relatório final | Síntese técnica e executiva com evidências incorporadas | PDF a produzir e revisar; não equivale ao pacote técnico |
| 13. Apresentação e defesa | Decisões, demonstração e limitações | Slides e roteiro a produzir; defesa depende dos participantes |

## Montagem do PDF pelo Cowork

Produzir um documento autossuficiente. Incorporar as evidências relevantes nas páginas, com tabelas, gráficos, eventos e trechos curtos de configuração/código acompanhados de interpretação. Links e caminhos podem constar como referência suplementar, mas não substituem o conteúdo técnico apresentado no PDF.

Estrutura sugerida, na ausência de outro modelo acadêmico informado:

1. Resumo executivo: situação, melhorias comprovadas, riscos e decisões prioritárias.
2. Escopo, arquitetura e fontes: nove componentes, fonte de eventos, períodos e limitações.
3. Centralização, acesso e retenção: fluxo API → Alloy → Loki → Grafana e evidências de funcionamento.
4. Detecção e resposta: regra, duas execuções, eventos, alertas e timelines.
5. KPIs/KRIs e evolução: fórmulas, valores individuais, n e comparação por categoria.
6. Vulnerabilidades e riscos: contexto histórico, situação atual, inerente/residual e justificativas.
7. Governança e conformidade interna: dez controles, critérios, gaps e comparação inicial/final.
8. Plano de ação: prioridades, responsáveis por papel, prazos D+, status e comprovações.
9. Dashboard v1.0: cinco visões com figuras e decisões apoiadas.
10. Conclusões, recomendações e limites; matriz de requisitos e evidências como apêndices quando necessário.

Solicitar nomes, instituição, curso, docente, modelo acadêmico ou limites de páginas apenas quando forem exigidos e não constarem no material. Não inventar metadados, aprovação institucional ou datas de compromisso. Se o usuário optar por documento sem identificação acadêmica, omitir esses elementos.

### Evidências que precisam aparecer nas páginas

- Diagrama da centralização e pequeno trecho da configuração que demonstre fonte, minimização e retenção.
- Consulta LogQL e eventos reais de autenticação, com horário, status e correlação legíveis.
- Regra de login e evidência do alerta disparado/resolvido, com datas e fuso.
- Timeline de cada execução, incluindo primeiro `401`, detecção, ação posterior e encerramento confirmado.
- Tabela de cálculo de MTTD, tempo até ação e MTTR simulado, seguida de médias somente para a mesma categoria.
- Mapas de risco inerente e residual, registro dos cinco riscos e fonte de sustentação para cada conclusão.
- Quadro dos dez controles e ações, com trechos dos testes/consultas que comprovam implementados/concluídas; pendências claramente identificadas.
- Figuras das cinco visões do dashboard, recortadas para preservar legibilidade, sem repetir capturas do próprio relatório como prova técnica.

Usar referências internas por número de figura, tabela, evidência e página. Definir a paginação somente após renderizar o PDF e conferir que todas as referências apontam para o lugar correto. Dividir tabelas longas, repetir cabeçalhos e evitar fontes pequenas para caber conteúdo. No documento final, cada risco, incidente e recomendação deve apontar para evidência efetivamente incorporada.

### Limites que devem permanecer explícitos

- Conformidade é relativa à diretriz interna; não existe certificação ou parecer de conformidade legal.
- Dados assistenciais são fictícios; duas execuções curtas não provam tendência estatística ou SLA.
- A regra estima falhas agregadas pela API; eventos permitem contagem exata. Não há identificação de atacante ou demonstração de invasão.
- Ação automática interrompe o gerador após a detecção. Limitação de tentativas, autorização por prontuário, restauração de backup ensaiada e observação externa permanecem pendentes enquanto não houver prova específica.
- Retenção de sete dias foi configurada; testes curtos comprovam configuração, ingestão e persistência, não sete dias contínuos.
- Centralização no mesmo host não elimina perda do host ou do volume; o acesso ao socket Docker é privilegiado.
- Notas residuais conservadoras podem permanecer iguais às inerentes. Melhoria de investigação não exige redução artificial de P/I.
- Fontes de código/configuração sustentam revisão estática. Registros qualitativos, inclusive C07 da Sprint 2, não comprovam as próprias conclusões.
- Períodos, resultados e limitações históricos, inclusive rejeição original do experimento da Sprint 2, não devem ser reescritos.

## Apresentação e defesa

Montar os slides a partir das evidências já incorporadas ao PDF, preservando números e períodos. Organizar a narrativa em objetivo, arquitetura, caso de detecção, timeline e indicadores, riscos/controles, plano de ação e conclusões. Confirmar com o usuário eventual tempo de fala ou quantidade obrigatória de slides antes de impor um limite.

Roteiro da demonstração:

1. Abrir a visão executiva e explicar a diferença entre saúde atual e recorte analítico.
2. Mostrar que a consulta autenticada funciona e que os nove alvos são observados.
3. Abrir os eventos de autenticação no Loki e localizar a execução preservada por período/correlação.
4. Mostrar a regra, o disparo e a timeline, explicando por que a ação ocorreu depois da detecção.
5. Apresentar MTTD, tempo até ação e MTTR com seus limites; comparar apenas as duas execuções da mesma categoria.
6. Percorrer um risco até o controle, a ação e a evidência; distinguir planejado de concluído.
7. Mostrar os gaps que permanecem e a decisão prioritária, sem alegar eliminação do risco.

Uma repetição ao vivo é opcional e deve usar pasta nova pelos comandos do README. As fontes preservadas permitem a defesa mesmo após expirar a retenção das ferramentas. Não executar simulação nova apenas para produzir números mais convenientes.

## Conferência antes da entrega acadêmica

- Conferir os 13 itens da matriz e registrar o que depende ainda de PDF, slides ou defesa.
- Recalcular amostras de valores e tempos a partir das fontes; não arredondar antes de calcular médias.
- Verificar que cada figura é legível no tamanho final e contém fonte, período e interpretação.
- Conferir as referências internas após renderização, inclusive para riscos, incidentes e recomendações.
- Confirmar que nenhum campo sigiloso ou conteúdo clínico apareceu nos anexos.
- Manter o pacote original e a versão final do PDF/slides identificados, sem sobrescrever evidências históricas.
