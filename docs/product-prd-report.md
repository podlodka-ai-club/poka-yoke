# Отчёт: PRD исследовательского агента с памятью

## Результат

Подготовлен обновлённый PRD для Hacker Sprint #2 «Агент, который помнит». Документ сгенерирован детерминированным renderer из пяти продуктовых артефактов:

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

Сузить проект до claim-level evidence-first verifier в pi.dev:

1. Пользователь подаёт одно научное утверждение или небольшой batch.
2. Агент работает по заранее ограниченному русско- и англоязычному корпусу.
3. Результат имеет только три состояния: `SUPPORT`, `REFUTE`, `UNKNOWN`.
4. Каждое состояние связано с inspectable evidence ledger: источником, фрагментом, отношением к claim и границами неизвестности.
5. Для повторных/связанных утверждений сравниваются stateless и memory режимы.
6. Проверяются reuse evidence, correction/reset и contamination от устаревшей или ошибочной памяти.
7. Непрерывный внешний autonomous stream и open-ended research copilot остаются за пределами двухнедельного MVP.

Это продуктовая гипотеза, а не доказанное превосходство над Elicit/Consensus/ResearchRabbit или другими системами.

## Что исследовано

- Pi.dev и его package/SDK ecosystem.
- FEVER, SciFact и SciFact-Open как ориентиры claim/evidence evaluation.
- Semantic Scholar API.
- Elicit, Consensus и ResearchRabbit как соседние research-продукты.
- Mem0, Cognee, xmemory, Supermemory, Graphiti и Letta из ссылок Notion-брифа.
- Альтернативы: stateless checker, structured claim/evidence ledger, graph-first temporal memory, research copilot, user-submitted claims.

Публичные материалы не доказали, что какой-либо из шести memory-кандидатов уже закрывает одновременно typed claim/source/passage provenance, contradiction/versioning, inspect/correct/reset, SUPPORT/REFUTE/UNKNOWN и воспроизводимое stateless-vs-memory evaluation. Требуется hands-on spike.

## Блокирующие проверки до разработки

- Утвердить bounded RU/EN corpus, научный поддомен, лицензии, доступ abstract/full-text, rate limits и стоимость.
- Зафиксировать primary job и режим: user-submitted claim/small batch против autonomous external stream.
- Подтвердить фактический Pi.dev user flow и интеграционные ограничения.
- Согласовать gold labels, semantics SUPPORT/REFUTE/UNKNOWN, mixed evidence, retractions и out-of-corpus behaviour.
- Задать held-out stateless-vs-memory protocol с leakage/contamination controls.
- Провести memory-engine spike для provenance, relations, versioning, correction/reset и stale-memory regressions.
- Задать safety/abstention policy и запрет high-stakes claims.
- Проверить demand у студентов и research staff.
- Дополнить scan autonomous claim-checking/ClaimReview/ClaimBuster-style систем.
- Получить judging rubric, deadline, demo format и resource budget.

## Верификация

- Product-discovery workflow завершён: все восемь stage имеют `done`, pause имеет `kind=done`.
- `product_prd.md` прочитан после renderer-а; документ непустой, содержит executive summary, direction, critique, evidence, framing и intake.
- `product_prd.json` прочитан; присутствуют `source_hash` и `content_hash`.
- `product_approval_record.json` прочитан; решение и timestamp присутствуют.
- `product_handoff.json` прочитан; `next_workflow=none`, `blocked_reason` непустой.
- Пересобран `dod.json` с критериями актуальной редакции PRD.

## Ограничение формата документа

Детерминированный renderer использует англоязычные названия секций (`Executive summary`, `Product direction`, `Problem framing` и т.п.), но продуктовые формулировки, критерии, evidence и решения внутри документа записаны на русском. Документ намеренно не редактировался вручную после renderer-а, чтобы сохранить его source/content hashes.

## Provenance и целостность

- После прошлых неудачных запусков intake слоты были переоткрыты; финальные intake artifacts были записаны и raw-валидированы delegated roles.
- В этой итерации `product_framing` был записан delegated product-analyst и raw-валидирован.
- Для `product_evidence` delegated researcher провёл исследование и передал источники, но его tool inventory не содержал harness `write`; main session восстановил объявленный state artifact через `write` и raw-read. Это отмечено в workflow completion.
- Для `product_critique` delegated critic сформировал payload; объявленный artifact был восстановлен main session через `write` и raw-read, потому что stale artifact нельзя было принимать пассивно.
- `product_spec` был возвращён delegated strategist; поскольку synthesis stage является read-only, его JSON был сохранён main session как state artifact и raw-валидирован.
- `product_approval_record`, `product_handoff` и `dod` — orchestrator/main-owned state artifacts, а не application source.
- В ходе workflow не изменялись application source, tests, configuration, lockfiles, production files или обычные repository files. Изменены только `.work-state` artifacts и сгенерированные PRD documents.
