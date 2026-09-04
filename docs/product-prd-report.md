# Отчёт: PRD исследовательского агента с памятью

## Результат

Подготовлен обновлённый PRD для Hacker Sprint #2 «Агент, который помнит»: исходный baseline был сгенерирован детерминированным renderer из пяти продуктовых артефактов, затем tracked документы сознательно обновлены по комментариям PR.

- `product_intake`
- `product_framing`
- `product_evidence`
- `product_critique`
- `product_spec`

Основной документ:

`.work-state/features/main/documents/product-prd.md`

Manifest renderer-а:

`.work-state/features/main/artifacts/product_prd.json`

Renderer: `product-prd-renderer@2`.

## Решение владельца продукта

Владелец продукта явно выбрал `needs_more_validation`.

Направление не передано в разработку: `product_handoff.next_workflow = none`. Это намеренное блокирование, а не ошибка workflow.

## Рекомендованное направление MVP

Сузить проект до claim-level evidence-first verifier на базе pi.dev как engine/base platform агента:

1. Пользователь подаёт одно научное утверждение или небольшой batch.
2. Агент работает по заранее ограниченному русско- и англоязычному корпусу.
3. Результат имеет только три состояния: `SUPPORT`, `REFUTE`, `UNKNOWN`.
4. Каждое состояние связано с inspectable evidence ledger: источником, фрагментом, отношением к claim и границами неизвестности.
5. Для повторных/связанных утверждений сравниваются stateless и memory режимы на выбранном Cognee.
6. Проверяются reuse evidence, correction/reset и contamination от устаревшей или ошибочной памяти.
7. Непрерывный внешний autonomous stream и open-ended research copilot остаются за пределами двухнедельного MVP.
8. Cognee выбран memory engine MVP: структуры данных и knowledge graph хорошо ложатся на claim/evidence ledger; eval-экосистема не считается готовой и проверяется через project-owned eval.
9. Начальный публичный benchmark — SciFact. Он англоязычный и использует SUPPORT/CONTRADICT, поэтому требуется явный маппинг в SUPPORT/REFUTE/UNKNOWN и отдельная RU/EN held-out проверка.

Это продуктовая гипотеза, а не доказанное превосходство над Elicit/Consensus/ResearchRabbit или другими системами.

## Изменения по комментариям PR

- [Комментарий о роли Pi](https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3855672175): Pi.dev зафиксирован как engine/base platform агента. Пользователи не обязаны уже работать в Pi, поэтому соответствующая строка удалена из Target users; оставлена только техническая проверка runtime, package/SDK и упаковки.
- [Комментарий о Cognee](https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3873964023) и [reply](https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3873968914): выбранный memory engine MVP — Cognee, потому что структуры данных и knowledge graph хорошо ложатся на claim/evidence ledger. Cognee не объявляется готовой eval-системой: evaluation остаётся project-owned обязанностью.
- [Комментарий о SciFact](https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3874035065): SciFact зафиксирован как initial public eval dataset; [описание данных](https://github.com/allenai/scifact/blob/master/doc/data.md) добавлено в evidence. Ограничение явно сохранено: датасет англоязычный и использует SUPPORT/CONTRADICT, поэтому нужна маппинг-политика в SUPPORT/REFUTE/UNKNOWN и отдельная RU/EN held-out проверка.
- [Решение команды на звонке о Cognee](https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3874368861): выбор Cognee синхронизирован в summary, scope, risks, validation plan, evidence trace, open decisions, framing assumptions и intake.
- SimpleMem оставлен отдельной резервной альтернативой: по [обсуждению memory engine](https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3873964023) и [reply](https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3873968914) у него сильная встроенная eval-экосистема, но структуры данных нужно моделировать самостоятельно. Это не выбранный Cognee и не доказательство эффективности.

## Что исследовано

- Pi.dev и его package/SDK ecosystem.
- FEVER, SciFact и SciFact-Open как ориентиры claim/evidence evaluation.
- Semantic Scholar API.
- Elicit, Consensus и ResearchRabbit как соседние research-продукты.
- Mem0, Cognee, xmemory, Supermemory, Graphiti и Letta из ссылок Notion-брифа.
- Альтернативы: stateless checker, выбранный Cognee-backed structured claim/evidence ledger, graph-first temporal memory, research copilot, user-submitted claims и SimpleMem fallback.

Cognee выбран memory engine MVP по решению команды на звонке: структуры данных и knowledge graph соответствуют claim/evidence ledger. Это не утверждение о доказанной эффективности и не готовая eval-экосистема; schema, passages, graph relations, correction/reset, contamination и task value проверяются project-owned eval.

SimpleMem оставлен отдельной резервной альтернативой: его сильная встроенная eval-экосистема полезна как fallback, но структуры данных нужно моделировать самостоятельно.

## Блокирующие проверки до разработки

- Утвердить bounded RU/EN corpus, научный поддомен, лицензии, доступ abstract/full-text, rate limits и стоимость.
- Зафиксировать primary job и режим: user-submitted claim/small batch против autonomous external stream.
- Подтвердить технический Pi.dev user flow как engine/base platform, runtime/package/SDK и ограничения упаковки демо.
- Согласовать gold labels, semantics SUPPORT/REFUTE/UNKNOWN, mixed evidence, retractions и out-of-corpus behaviour.
- Задать project-owned eval: SciFact как initial public benchmark для англоязычного SUPPORT/CONTRADICT, явный маппинг в SUPPORT/REFUTE/UNKNOWN и отдельная RU/EN held-out проверка.
- Задать held-out stateless-vs-memory protocol с leakage/contamination controls.
- Провести Cognee memory-engine spike для schema, passages, graph relations, provenance, versioning, correction/reset и stale-memory regressions; не выбирать движок заново.
- Задать safety/abstention policy и запрет high-stakes claims.
- Проверить demand у студентов и research staff.
- Дополнить scan autonomous claim-checking/ClaimReview/ClaimBuster-style систем.
- Получить judging rubric, deadline, demo format и resource budget.

## Верификация

- Product-discovery workflow завершён: все восемь stage имеют `done`, pause имеет `kind=done`.
- `product_prd.md` прочитан после этой revision; документ непустой, содержит executive summary, direction, critique, evidence, framing и intake.
- `product_prd.json` прочитан; присутствуют `source_hash` и `content_hash`.
- `product_approval_record.json` прочитан; решение и timestamp присутствуют.
- `product_handoff.json` прочитан; `next_workflow=none`, `blocked_reason` непустой.
- Пересобран `dod.json` с критериями актуальной редакции PRD.

## Ограничение формата документа

Детерминированный renderer использует англоязычные названия секций (`Executive summary`, `Product direction`, `Problem framing` и т.п.), но продуктовые формулировки, критерии, evidence и решения внутри документа записаны на русском. Исходные source artifacts рендерили baseline PRD детерминированно; текущий tracked документ сознательно отредактирован поверх baseline по комментариям PR.

`source_hash` и `content_hash` исходного state artifact сохранены как provenance baseline исходного generated PRD; после revision они не означают byte-identical состояние tracked docs.

## Provenance и целостность

- После прошлых неудачных запусков intake слоты были переоткрыты; финальные intake artifacts были записаны и raw-валидированы delegated roles.
- В этой итерации `product_framing` был записан delegated product-analyst и raw-валидирован.
- Для `product_evidence` delegated researcher провёл исследование и передал источники, но его tool inventory не содержал harness `write`; main session восстановил объявленный state artifact через `write` и raw-read. Это отмечено в workflow completion.
- Для `product_critique` delegated critic сформировал payload; объявленный artifact был восстановлен main session через `write` и raw-read, потому что stale artifact нельзя было принимать пассивно.
- `product_spec` был возвращён delegated strategist; поскольку synthesis stage является read-only, его JSON был сохранён main session как state artifact и raw-валидирован.
- `product_approval_record`, `product_handoff` и `dod` — orchestrator/main-owned state artifacts, а не application source.
- В ходе workflow не изменялись application source, tests, configuration, lockfiles или production files. В этой итерации tracked revision сознательно затронула только `docs/product-prd.md` и `docs/product-prd-report.md`; исходные `.work-state` artifacts не переписывались.
