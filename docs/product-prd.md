# Product PRD

## Executive summary

**Recommendation.** needs_more_validation

**Critique verdict.** needs_more_validation

**Problem.** Студенты и научные сотрудники, работающие с русско- и англоязычной научной литературой, проверяют научные утверждения вручную: поиск релевантных источников занимает часы, цепочка «утверждение → источник → вывод» не сохраняется между сессиями, а повторная проверка того же или похожего утверждения начинается каждый раз с нуля. Кандидат JTBD: «Когда у меня появляется научное утверждение или поток утверждений, требующих проверки, я хочу получить прозрачный двуязычный ответ с доказательной базой — честный вердикт SUPPORT / REFUTE / UNKNOWN на русском языке со ссылками и цитатами из русско- и англоязычных источников, — чтобы позже вернуться к этому ответу без потери провенанса и не собирать те же доказательства заново». Контекст (верифицировано): за две недели Hacker Sprint #2 «Агент, который помнит» нужна прикладная реализация, которой можно пользоваться лично или на работе уже после спринта; платформа агента — pi.dev; коммуникация ведётся на русском языке, исходные исследовательские материалы — русско- и англоязычные.

**Value proposition.** Для студентов и сотрудников исследовательских групп продукт проверяет одно пользовательское утверждение или небольшой пакет утверждений по ограниченному русско- и англоязычному корпусу и показывает прозрачный вердикт SUPPORT/REFUTE/UNKNOWN вместе с журналом свидетельств и границами неизвестности. По сравнению с универсальным research copilot это предлагает более узкую и проверяемую единицу работы: можно оценить корректность вывода, соответствие источнику, калибровку UNKNOWN и повторное использование evidence, а не только субъективную полезность длинного ответа; превосходство пока является гипотезой.

**Target users.**
- Студенты, которым нужно проверять конкретные учебные или исследовательские утверждения по RU/EN материалам; частота и типы задач unknown.
- Сотрудники исследовательских групп, которым нужно перепроверять единичные утверждения или небольшие партии перед дальнейшей работой; домены и критерии качества unknown.

**Solution direction.** Рекомендуемый первичный режим для проверки (не утверждение об утверждённом продукте): пользователь подаёт один claim или небольшой batch; продукт отвечает только SUPPORT, REFUTE или UNKNOWN по заранее ограниченному RU/EN корпусу, показывает evidence ledger и отделяет найденное свидетельство от пробелов. Для повторных или связанных claims сравниваются stateless- и memory-варианты: проверяется, уменьшает ли reuse доказательств повторный поиск, повышает ли согласованность и сохраняет ли correction/reset контроль без переноса ошибки на unrelated claims. Autonomous external stream, open-ended research copilot и выход за границы корпуса откладываются.
**Platform and memory decision.** Pi.dev зафиксирован как engine/base platform агента: решение строится на его runtime и расширениях, а пользователи не обязаны уже работать в Pi. Для MVP команда на звонке выбрала Cognee как memory engine: его структуры данных и knowledge graph хорошо ложатся на claim/evidence ledger. Это выбор технической основы, а не доказательство эффективности; evaluation остаётся project-owned eval с заранее заданными протоколами и критериями.

**Initial public benchmark.** Начальная публичная точка сравнения — SciFact; он англоязычный и использует SUPPORT/CONTRADICT, поэтому проект обязан явно задать маппинг в SUPPORT/REFUTE/UNKNOWN и дополнить benchmark отдельной RU/EN held-out проверкой. SciFact сам по себе bilingual requirement не покрывает.

**Success metrics.**
- На согласованном gold-наборе claims доля verdicts, совпадающих с экспертной разметкой и реально поддержанных указанными источниками (entailment \+ traceability), достигает заранее установленного порога; набор и порог TBD до решений по corpus и judging rubric.
- В сравнении с универсальным research copilot пользователи чаще корректно определяют, что именно поддержано, опровергнуто или осталось UNKNOWN, и принимают правильное следующее исследовательское решение; comparator, sample и минимальный эффект TBD.
- Доля целевых пользователей, которые самостоятельно завершают проверку claim или small batch, объясняют verdict по evidence ledger и находят границы неизвестности, достигает заранее установленного порога; threshold TBD.
- На повторных или связанных claims memory-вариант уменьшает дублирующий просмотр свидетельств и/или время до обоснованного решения против stateless при не худших correctness и UNKNOWN-calibration; минимальный полезный эффект TBD.
- После correction/reset следующий релевантный task отражает исправление, не возвращает отвергнутое свидетельство и не ухудшает результат для unrelated claims; pass threshold TBD.
- В прикладном двухнедельном пилоте целевые пользователи добровольно повторяют сценарий на нескольких claims и подтверждают его полезность для реальной исследовательской задачи; размер выборки и критерий повторного использования TBD.

**Scope.**
- Прикладная двухнедельная проверка агента на базе Pi.dev как engine/base platform; коммуникация и продуктовые результаты на русском языке.
- Один пользовательский claim или небольшой batch на одну задачу.
- Заранее согласованный bounded RU/EN corpus с явными границами домена и покрытия; точный состав corpus TBD.
- Прозрачный триединый результат SUPPORT/REFUTE/UNKNOWN с evidence ledger, трассировкой источников и явными пробелами в доказательствах.
- Повторные или связанные claims с сопоставлением stateless и memory-условий на выбранном Cognee memory engine, включая correction/reset.
- Project-owned eval с initial public benchmark на SciFact, явной маппинг-политикой SUPPORT/CONTRADICT → SUPPORT/REFUTE/UNKNOWN и отдельной RU/EN held-out проверкой.

**Open product decisions.**
- Corpus: какой bounded RU/EN домен, состав и размер, баланс языков, eligibility/provenance/freshness источников и held-out claim set владелец продукта утверждает?
- Evaluation: как зафиксировать project-owned eval, включая SciFact как initial public benchmark, маппинг SUPPORT/CONTRADICT → SUPPORT/REFUTE/UNKNOWN, отдельную RU/EN held-out проверку, comparator, stateless baseline, gold labels, sample, минимальный эффект, stopping rule и критерии сравнения с generic research copilot?
- Pi runtime/package: какая фактическая целевая поверхность и user flow на базе pi.dev доступны для пилота, какие ограничения runtime/упаковки нужно обойти и можно ли провести пилот без изменения контекста задачи?
- Cognee validation spike: выдерживает ли выбранный memory engine схему claim/source/passage/relation/verdict/run, графовые связи, provenance, correction/reset и contamination controls; какие результаты project-owned eval нужны для продолжения?
- Memory fallback: при каком заранее оговорённом blocking результате Cognee допустимо рассматривать SimpleMem как резервную альтернативу, не смешивая его с выбранным MVP-движком?
- Judging rubric: кто и по какой процедуре устанавливает labels, entailment, source traceability, calibrated UNKNOWN, user usefulness и pass/fail thresholds?
- User validation: какие представители students и research staff, реальные claims, consent/workload и критерий повторного использования достаточно репрезентативны для решения?
- Product gate: какие совокупные результаты позволят перейти к следующему пилоту, а при каких результатах направление defer/reject; autonomous external stream этим spec не одобрен и требует отдельного решения?

## Product direction

**Recommendation.** needs_more_validation

### Value proposition

Для студентов и сотрудников исследовательских групп продукт проверяет одно пользовательское утверждение или небольшой пакет утверждений по ограниченному русско- и англоязычному корпусу и показывает прозрачный вердикт SUPPORT/REFUTE/UNKNOWN вместе с журналом свидетельств и границами неизвестности. По сравнению с универсальным research copilot это предлагает более узкую и проверяемую единицу работы: можно оценить корректность вывода, соответствие источнику, калибровку UNKNOWN и повторное использование evidence, а не только субъективную полезность длинного ответа; превосходство пока является гипотезой.

### Platform and memory decision

Pi.dev зафиксирован как engine/base platform агента, а не как продукт, которым целевые пользователи уже должны пользоваться. Техническая проверка ограничена runtime, package/SDK и способом упаковки демо. Выбранный memory engine MVP — Cognee: структуры данных и knowledge graph хорошо соответствуют claim/evidence ledger. Eval-экосистема не считается готовой свойством Cognee: её проектирует и владеет ею команда в рамках project-owned eval. SimpleMem остаётся отдельной резервной альтернативой с сильной встроенной eval-экосистемой, но с большей собственной работой по моделированию структур.

### Opportunity

Двухнедельный прикладной спринт позволяет проверить, решает ли claim-level evidence-first формат реальную задачу студентов и research staff на базе Pi.dev как engine/base platform лучше или надёжнее универсального research copilot. Потенциал — сделать исследовательскую проверку воспроизводимой и обозримой; частота потребности, готовность вводить claims, масштаб спроса, пригодность корпуса и переносимость результата пока unknown. Технические ограничения runtime и упаковки Pi.dev требуют отдельной проверки; пользовательское знакомство с Pi не является предпосылкой.

### Target users
- Студенты, которым нужно проверять конкретные учебные или исследовательские утверждения по RU/EN материалам; частота и типы задач unknown.
- Сотрудники исследовательских групп, которым нужно перепроверять единичные утверждения или небольшие партии перед дальнейшей работой; домены и критерии качества unknown.

### Solution direction

Рекомендуемый первичный режим для проверки (не утверждение об утверждённом продукте): пользователь подаёт один claim или небольшой batch; продукт отвечает только SUPPORT, REFUTE или UNKNOWN по заранее ограниченному RU/EN корпусу, показывает evidence ledger и отделяет найденное свидетельство от пробелов. Для повторных или связанных claims сравниваются stateless- и memory-варианты: проверяется, уменьшает ли reuse доказательств повторный поиск, повышает ли согласованность и сохраняет ли correction/reset контроль без переноса ошибки на unrelated claims. Autonomous external stream, open-ended research copilot и выход за границы корпуса откладываются.

### Success metrics
- На согласованном gold-наборе claims доля verdicts, совпадающих с экспертной разметкой и реально поддержанных указанными источниками (entailment \+ traceability), достигает заранее установленного порога; набор и порог TBD до решений по corpus и judging rubric.
- В сравнении с универсальным research copilot пользователи чаще корректно определяют, что именно поддержано, опровергнуто или осталось UNKNOWN, и принимают правильное следующее исследовательское решение; comparator, sample и минимальный эффект TBD.
- Доля целевых пользователей, которые самостоятельно завершают проверку claim или small batch, объясняют verdict по evidence ledger и находят границы неизвестности, достигает заранее установленного порога; threshold TBD.
- На повторных или связанных claims memory-вариант уменьшает дублирующий просмотр свидетельств и/или время до обоснованного решения против stateless при не худших correctness и UNKNOWN-calibration; минимальный полезный эффект TBD.
- После correction/reset следующий релевантный task отражает исправление, не возвращает отвергнутое свидетельство и не ухудшает результат для unrelated claims; pass threshold TBD.
- В прикладном двухнедельном пилоте целевые пользователи добровольно повторяют сценарий на нескольких claims и подтверждают его полезность для реальной исследовательской задачи; размер выборки и критерий повторного использования TBD.

### Guardrail metrics
- Unsupported verdict rate: доля SUPPORT/REFUTE, для которых evidence не влечёт label, и citation/traceability error остаются ниже согласованного порога; порог TBD.
- False-certainty rate: ошибочные SUPPORT/REFUTE там, где корректный ответ UNKNOWN, остаётся ниже порога; UNKNOWN не должен вытесняться стремлением отвечать всегда.
- RU/EN parity: correctness, traceability, task completion и UNKNOWN calibration не должны существенно ухудшаться для одного из языков; допустимый разрыв TBD.
- Memory safety: stale или incorrect evidence reuse, unrelated-claim contamination и нарушение correction/reset остаются ниже порогов; пороги TBD.
- User burden and trust: медианные время и усилие, понимание результата и доверие к нему не должны существенно ухудшаться относительно comparator; максимальная допустимая регрессия TBD.
- Source and claim safety: в пилоте нет случаев раскрытия чувствительного пользовательского claim или ошибочной атрибуции evidence без согласия; границы политики и измерения TBD.
- Out-of-corpus claims не представляются как подтверждённые или опровергнутые; доля уверенных ответов за пределами согласованного корпуса не превышает TBD.

### Scope
- Прикладная двухнедельная проверка агента на базе Pi.dev как engine/base platform; коммуникация и продуктовые результаты на русском языке.
- Один пользовательский claim или небольшой batch на одну задачу.
- Заранее согласованный bounded RU/EN corpus с явными границами домена и покрытия; точный состав corpus TBD.
- Прозрачный триединый результат SUPPORT/REFUTE/UNKNOWN с evidence ledger, трассировкой источников и явными пробелами в доказательствах.
- Повторные или связанные claims с сопоставлением stateless и memory-условий на выбранном Cognee memory engine, включая correction/reset.
- Project-owned eval с initial public benchmark на SciFact, явной маппинг-политикой SUPPORT/CONTRADICT → SUPPORT/REFUTE/UNKNOWN и отдельной RU/EN held-out проверкой.

### Anti-scope
- Autonomous external stream или непрерывный unattended discovery.
- Универсальный open-ended research copilot по произвольным темам, источникам или текущему вебу.
- Представление claims вне согласованного corpus как поддержанных или опровергнутых.
- Автоматизированные решения высокой значимости, публикация, выставление оценок или замена экспертной adjudication.
- Широкий personal memory или knowledge-management продукт; ценность memory ограничена повторным использованием evidence в этом сценарии.
- Production-readiness и широкий rollout в рамках этой двухнедельной проверки.

### Risks
- Выбор corpus, языковой дисбаланс, лицензирование, свежесть или domain bias могут сделать измеренное качество нерепрезентативным.
- Подача claims пользователем может создать трение и отобрать необычно мотивированных пользователей; autonomous stream может казаться более вовлекающим, но не будет сопоставим в этом спринте.
- Entailment и SUPPORT/REFUTE/UNKNOWN могут быть неоднозначными; непоследовательный judging rubric способен вознаградить беглые, но неверные ответы.
- Пользователи могут переоценить доверие к визуально прозрачному evidence ledger; miscalibration UNKNOWN или неверная связка с источником может привести к плохим исследовательским решениям.
- Memory может повторно использовать устаревшее или ошибочное evidence, сохранить ошибочную correction, загрязнить unrelated claims либо не дать добавочной ценности против stateless.
- Ограничения runtime, package/SDK и упаковки Pi.dev могут не позволить воспроизвести реальный workflow или провести демо без изменения контекста задачи; это технический риск, а не неопределённость целевой аудитории.
- Cognee может не дать нужную схему passages и графовых отношений, либо correction/reset и contamination controls могут оказаться недостаточными; выбранный движок не считается эффективным до project-owned eval.
- SciFact англоязычен и использует SUPPORT/CONTRADICT; без явного маппинга и отдельной RU/EN held-out проверки benchmark может создать ложное впечатление bilingual coverage.
- Малый двухнедельный sample и ограниченное число пользователей могут не доказать обобщаемый эффект или устойчивый спрос.
- Чувствительные claims или ограничения на использование источников могут сузить user validation и повторное применение evidence.

### Validation plan
- Corpus: до пилота выбрать домен(ы), баланс RU/EN, eligibility и provenance источников, свежесть и held-out claim set; проверить coverage и поведение для out-of-corpus claims.
- Judging rubric: до просмотра результатов согласовать labels, entailment и traceability, calibrated UNKNOWN, user task success, correction/reset и pass/fail thresholds.
- Evaluation: заранее описать project-owned eval: сопоставление узкого режима с generic research copilot и stateless baseline на повторных или связанных claims; использовать SciFact как initial public benchmark с маппингом SUPPORT/CONTRADICT → SUPPORT/REFUTE/UNKNOWN, а bilingual requirement проверять отдельным RU/EN held-out набором; определить sample, gold labels, минимальные effect sizes и stopping rule.
- Cognee memory-engine spike: проверить выбранный Cognee на схеме claim/source/passage/evidence relation/verdict/run, provenance passages, graph relations, versioning, correction/reset и stale/contamination regressions; измерять memory value как task outcome, а не как объём сохранённых данных или число recall. Eval остаётся project-owned.
- Pi runtime/package validation: проверить реальный user flow на базе Pi.dev, целевую поверхность, package/SDK и возможность провести пилот без изменения контекста задачи; до этой технической проверки не заявлять готовность упаковки.
- User validation: привлечь студентов и research staff, наблюдать реальные RU/EN claims, измерить input burden, completion, comprehension, trust, repeat intent и пригодность сценария против generic copilot; зафиксировать различия сегментов.
- Decision gate: по заранее установленным порогам решить, расширять ли claim-level режим; autonomous external stream остаётся отложенным до подтверждения comparative value, safety и user demand.

### Evidence trace
- [verified: V1 | shared context] Pi.dev — это программная engine/base platform агента с расширениями → архитектурная основа зафиксирована; технические ограничения runtime, package/SDK и упаковки демо требуют проверки.
- [verified: V2 | shared context] Пользователи — students и research staff → целевые сегменты обоснованы; частота, workflow и willingness to use unknown.
- [verified: V3 | shared context] Коммуникация русская, source materials — RU/EN → русское взаимодействие и двуязычный scope обоснованы; domain coverage и parity unknown.
- [verified: V4 | shared context] Sprint прикладной и длится две недели → узкая проверка user-submitted claim или small batch соответствует time box; demand, quality и production readiness не подтверждены.
- [verified: V5 | critique artifact] Verdict критики — needs_more_validation → рекомендация остаётся needs_more_validation и не является одобрением владельца продукта.
- [assumption: A1 | product framing] Claim-level evidence-first предпочтительнее generic research copilot, потому что ограничивает единицу работы и делает evidence и UNKNOWN видимыми → это нужно проверить сравнением correctness, traceability, calibration и user-decision outcomes.
- [assumption: A2 | product framing] User-submitted claims или small batches дают более чистый двухнедельный сигнал, чем autonomous external stream, поскольку input, corpus, attribution и denominator ограничены → нужно проверить burden, repeat use и comparative value.
- [assumption: A3 | product framing] Evidence ledger и memory reuse могут уменьшить duplicate review и повысить consistency → это проверяется только на повторных или связанных tasks против stateless, с correction/reset.
- [assumption: A4 | product framing] Correction/reset может сделать memory value controllable и recoverable → нужно проверить correction success и unrelated-claim contamination.
- [unknown: U1 | evidence gap] Реальные demand, repeat usage и willingness целевых пользователей не установлены → требуется user validation.
- [unknown: U2 | evidence gap] Representativeness corpus, баланс RU/EN, eligibility источников, labels и out-of-corpus coverage не установлены → требуется corpus decision.
- [unknown: U3 | evidence gap] Gold labels, judging rubric, comparator, sample, effect thresholds и stopping rules не установлены → требуется project-owned eval/rubric decision; SciFact задаёт только initial public benchmark и не заменяет RU/EN held-out проверку.
- [unknown: U4 | technical validation] Ограничения runtime/package и representative user flow на Pi.dev не установлены → требуется техническая Pi validation, а не решение о значении или целевой платформе.
- [unknown: U5 | evidence gap] Incremental task value, freshness, graph-relation behavior, correction/reset и contamination behavior выбранного Cognee engine не установлены → требуется Cognee memory spike.

### Open product decisions
- Corpus: какой bounded RU/EN домен, состав и размер, баланс языков, eligibility/provenance/freshness источников и held-out claim set владелец продукта утверждает?
- Evaluation: какие comparator и stateless baseline, gold labels, sample, минимальный эффект, stopping rule и критерии project-owned eval принимаются; как SciFact используется как initial public benchmark с маппингом SUPPORT/CONTRADICT → SUPPORT/REFUTE/UNKNOWN и отдельной RU/EN held-out проверкой?
- Pi runtime/package: какая фактическая целевая поверхность и user flow на базе pi.dev доступны для пилота и какие ограничения runtime/упаковки нужно подтвердить?
- Cognee validation spike: какой repeated/related-claim сценарий и порог эффекта докажут ценность выбранного Cognee, и как принимаются schema, passages, graph relations, staleness, contamination и correction/reset failures?
- Memory fallback: при каком blocking результате и по какому протоколу допустимо вернуться к SimpleMem как резервной альтернативе с самостоятельной моделью структур?
- Judging rubric: кто и по какой процедуре устанавливает labels, entailment, source traceability, calibrated UNKNOWN, user usefulness и pass/fail thresholds?
- User validation: какие представители students и research staff, реальные claims, consent/workload и критерий повторного использования достаточно репрезентативны для решения?
- Product gate: какие совокупные результаты позволят перейти к следующему пилоту, а при каких результатах направление defer/reject; autonomous external stream этим spec не одобрен и требует отдельного решения?

## Product critique

### Verdict

needs_more_validation

### Findings
- Главная ценность «память переиспользуется и с каждой итерацией повышает precision» пока не доказана: precision не определена, baseline отсутствует, протокол оценки не зафиксирован, поэтому ключевое обещание нефальсифицируемо.
- Переиспользование может ухудшить качество: устаревшие, ошибочные или опровергнутые evidence способны распространяться в новые проверки. Provenance, correction и защита от memory-induced regression пока остаются требованиями, а не проверенными возможностями.
- Pi ambiguity закрыта пользовательским решением: Pi означает pi.dev и используется как engine/base platform агента, не как продукт с уже существующей пользовательской базой. Остаётся только техническая проверка runtime, package/SDK и упаковки демо.
- Критерии balanced evidence и traceability опираются на неизвестное предпочтение пользователей/жюри. Наличие цитат само по себе не означает истинность вывода или качество научного доказательства.
- Целевая аудитория теперь известна на уровне групп (студенты и research staff), но первичный job, потребитель вердикта и частота задачи не подтверждены интервью. Это разные продуктовые сценарии.
- Режим интерактивной подачи утверждения и режим автономного внешнего потока — разные продукты. Текущий фрейминг оставляет оба варианта открытыми, хотя двухнедельный scope требует выбрать один.
- Отрицательное утверждение о том, что подходящего агента для непрерывного потока не существует, не доказано: исследование охватило research assistants и benchmarks, но не полный класс ClaimReview/ClaimBuster и production fact-verification pipelines.
- Из рассмотренных альтернатив ни одна полностью не реализует автономный непрерывный stream: verifier принимает claims, benchmark — статический набор, memory extension не доказывает качество проверки, copilot — другой продукт. Отклонение от исходной формулировки нужно назвать явно.
- Решение по memory engine теперь зафиксировано: для MVP выбран Cognee из-за структур данных и knowledge graph, которые хорошо ложатся на claim/evidence ledger. Это не доказательство эффективности; нужен project-owned eval и проверка рисков.
- Доступ к источникам не установлен: корпус, full text против abstract, лицензии, rate limits, стоимость и допустимое хранение неизвестны. Требование показывать и supporting, и refuting источники может оказаться невыполнимым в срок.
- Научный домен не ограничен, а verdict claim-level требует синтеза. Смешанные evidence, различие между «опровергнуто» и «не найдено подтверждение», качество дизайна исследования и репликация ещё не определены.
- Автономность пока не имеет safety boundary: нет формальной политики abstention/UNKNOWN, calibration expectation, запрета ответственных медицинских/юридических выводов и обязательного inspect/correct/reset для памяти.
- FEVER и SciFact могут быть загрязнены обучающими данными моделей; SciFact вдобавок англоязычен и использует SUPPORT/CONTRADICT. Его нужно применять как initial public benchmark с явным маппингом в SUPPORT/REFUTE/UNKNOWN и дополнять отдельным RU/EN held-out набором, а не выдавать за bilingual eval.
- Критерий «видимое переиспользование» измеряет факт активности памяти, но не результат: нужно разделить reuse rate, качество вердикта, полноту provenance и число memory-induced regressions.
- Положительная сторона: фрейминг честно перечисляет unknowns и не выдумывает numeric targets. Выбор Cognee и SciFact как стартовой benchmark-точки уточняет направление, но не заменяет проверку эффективности и закрытие остальных продуктовых unknowns.

### Blocking gaps
- Проверить техническую упаковку Pi.dev: runtime/package/SDK и demo consequences; ambiguity о значении Pi и целевой платформе закрыта.
- Операционализировать precision: gold labels, семантика SUPPORT/REFUTE/UNKNOWN, mixed-evidence aggregation, stateless control и memory comparison с contamination/leakage controls.
- Выбрать первичный job и режим взаимодействия: пользователь подаёт одно утверждение/пакет или система получает автономный внешний stream.
- Установить выполнимый corpus: научный поддомен, источники, abstract/full-text, лицензии, rate limits, стоимость и правила хранения.
- Определить epistemic/safety policy: обязательный UNKNOWN/abstention, calibration expectations, границы ответственных доменов, inspect/correction/reset и защиту от устаревшей или отравленной памяти.
- Дополнить конкурентный scan автономными claim-checking/fact-verification системами и сформулировать конкретную дифференциацию.
- Получить judging rubric, формат демо, deadline и практические критерии «можно использовать лично или на работе» от организаторов.
- Провести hands-on spike выбранного Cognee: typed records, passages, graph relations/contradictions, versioning, inspect, correction, reset, contamination controls, локальный запуск и стоимость; сопоставить с project-owned eval, не выбирать memory engine заново.

## Evidence

### Claims
- **Claim:** Hacker Sprint #2 «Агент, который помнит» рассчитан на двухнедельную прикладную реализацию, которую можно использовать лично или на работе после спринта.
  - **Status:** verified
  - **Source:** Notion-бриф: https://app.notion.com/p/Hacker-Sprint-2-3a12db4c860e80928153c5d511b367ed?session_sync_attempted=1 (заголовок и интро страницы прочитаны браузером)
- **Claim:** Бриф содержит ссылки на воркшопы по памяти агентов и на mem0, Cognee, xmemory, Supermemory, Graphiti и Letta; команда на звонке выбрала Cognee для MVP, но его пригодность и эффективность требуют project-owned validation.
  - **Status:** verified
  - **Source:** Notion-бриф: https://app.notion.com/p/Hacker-Sprint-2-3a12db4c860e80928153c5d511b367ed?session_sync_attempted=1; решение команды отражено в обсуждении PR
- **Claim:** Pi.dev позиционируется как терминальный coding agent с расширениями, skills, пакетами и SDK; в этом проекте он зафиксирован как engine/base platform агента, а не как продукт, которым пользователи уже должны пользоваться.
  - **Status:** verified
  - **Source:** Официальные документы Pi: https://pi.dev/docs/latest и https://pi.dev/docs/latest/sdk
- **Claim:** Каталог Pi содержит пакеты для web-доступа, MCP, subagents и persistent memory; это расширения экосистемы Pi, а не готовый научный verifier.
  - **Status:** verified
  - **Source:** Каталог пакетов Pi: https://pi.dev/packages
- **Claim:** FEVER задаёт задачу проверки утверждений с метками SUPPORTS, REFUTES и NOT ENOUGH INFO и требует найденные предложения-доказательства.
  - **Status:** verified
  - **Source:** FEVER task: https://fever.ai/2018/task.html; статья: https://aclanthology.org/N18-1074/
- **Claim:** SciFact оценивает поиск научных доказательств, классификацию SUPPORT/CONTRADICT и sentence-level rationale для научного утверждения; для MVP это initial public benchmark, но он англоязычный и не покрывает bilingual requirement.
  - **Status:** verified
  - **Source:** Статья SciFact: https://aclanthology.org/2020.emnlp-main.609/; данные и схема: https://github.com/allenai/scifact/blob/master/doc/data.md; репозиторий: https://github.com/allenai/scifact
- **Claim:** SciFact-Open расширяет постановку в сторону open-domain поиска доказательств по научным abstract-коллекциям.
  - **Status:** verified
  - **Source:** Статья: https://aclanthology.org/2022.findings-emnlp.347/; репозиторий: https://github.com/dwadden/scifact-open
- **Claim:** SciFact и другие claim/evidence benchmarks дают полезные evaluation-паттерны, но SciFact нельзя считать готовой политикой русского/английского продукта: проект должен задать маппинг SUPPORT/CONTRADICT → SUPPORT/REFUTE/UNKNOWN, mixed-evidence rules и отдельную RU/EN held-out проверку.
  - **Status:** assumption
  - **Source:** SciFact data documentation: https://github.com/allenai/scifact/blob/master/doc/data.md; проектная evaluation policy
- **Claim:** Semantic Scholar предоставляет поиск научной литературы, граф цитирований и API академического графа; сам API не сертифицирует истинность научного утверждения.
  - **Status:** verified
  - **Source:** Semantic Scholar API: https://api.semanticscholar.org/api-docs
- **Claim:** Elicit предлагает семантический поиск литературы, screening и структурированное извлечение для задач обзора.
  - **Status:** verified
  - **Source:** Elicit: https://elicit.com/ и https://docs.elicit.com/
- **Claim:** Consensus строит ответы на найденных научных статьях, но конкретная полнота текста/abstract/metadata и правила покрытия доказательств должны проверяться для каждого сценария.
  - **Status:** verified
  - **Source:** Consensus feature documentation: https://help.consensus.app/en/collections/10600168-explore-features
- **Claim:** ResearchRabbit ориентирован на исследование литературы и citation-network discovery, а не на явную классификацию SUPPORT/REFUTE/UNKNOWN с цитатным доказательством.
  - **Status:** verified
  - **Source:** ResearchRabbit features: https://www.researchrabbit.ai/features
- **Claim:** Mem0 документирует слой памяти для AI-приложений/агентов, но из доступного описания нельзя считать доказанными typed claim-evidence provenance, версионирование научных источников и управляемый reset для нашего сценария.
  - **Status:** verified
  - **Source:** Mem0 documentation: https://docs.mem0.ai/introduction
- **Claim:** Cognee документирует построение и использование knowledge graph/knowledge engine для AI-приложений; команда на звонке выбрала его memory engine MVP, поскольку структуры данных и графовые отношения хорошо ложатся на claim/evidence ledger. Пригодность passages, contradictory evidence, correction/reset, contamination controls и audit-ready verdicts ещё требует проверки.
  - **Status:** verified
  - **Source:** Cognee documentation: https://docs.cognee.ai/core-concepts/overview; решение команды зафиксировано в комментариях PR
- **Claim:** SimpleMem в обсуждении PR отмечен как альтернатива с сильной встроенной eval-экосистемой, но его структуры данных нужно моделировать самостоятельно; поэтому он остаётся резервным fallback и не заменяет выбранный Cognee в MVP.
  - **Status:** verified
  - **Source:** Обсуждение PR о memory engine: https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3873964023 и reply https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3873968914
- **Claim:** xmemory позиционируется как память для AI-агентов, но публичное описание не подтверждает полный научный claim/evidence ledger с версионностью, correction и воспроизводимым stateless baseline.
  - **Status:** verified
  - **Source:** xmemory product overview: https://xmemory.ai/product-overview/
- **Claim:** Supermemory описывает долговременную memory-инфраструктуру и обработку контекста, но наличие именно научной provenance-модели, явных противоположных evidence и audit trail для этого проекта неизвестно.
  - **Status:** verified
  - **Source:** Supermemory documentation: https://supermemory.ai/docs/concepts/how-it-works
- **Claim:** Graphiti — open-source temporal knowledge graph для данных, которые меняются во времени; временные связи полезны для superseded findings и as-of запросов, но добавляют сложность конфликтов и графовой схемы.
  - **Status:** verified
  - **Source:** Graphiti repository: https://github.com/getzep/graphiti
- **Claim:** Letta документирует агентную архитектуру с долговременной памятью, но из публичного описания не следует готовая модель научного доказательства или автоматическая оценка вердиктов.
  - **Status:** verified
  - **Source:** Letta documentation: https://docs.letta.com/
- **Claim:** Выбор Cognee как MVP memory engine не доказывает, что он уже закрывает typed claim/source/passage, graph relations, contradictory evidence, temporal correction, inspect/reset и evaluation isolation одновременно; это проверяется hands-on и project-owned eval. SimpleMem остаётся fallback при blocking результате Cognee.
  - **Status:** unknown
  - **Source:** Сравнительный review публичных материалов и решение команды; требуется Cognee validation spike
- **Claim:** Vector-only memory сама по себе не гарантирует явные отношения между claim, source, passage, contradiction и версией; это проектный вывод, а не доказанное свойство каждого конкретного вендора.
  - **Status:** assumption
  - **Source:** Проектная гипотеза, подлежащая проверке на выбранном Cognee engine; SimpleMem рассматривается только как fallback
- **Claim:** Для пользовательского результата требуется двуязычный контур: коммуникация и итог на русском, материалы и цитаты могут быть на русском и английском.
  - **Status:** verified
  - **Source:** Прямое уточнение пользователя в текущем раунде
- **Claim:** Легальность доступа, лицензии, rate limits и воспроизводимость выбранного корпуса научных источников пока не установлены.
  - **Status:** unknown
  - **Source:** Не исследовано; требует решения до фиксации источников MVP
- **Claim:** Пользователи и жюри предпочтут проверяемый и сбалансированный evidence trail бинарному ответу без provenance.
  - **Status:** unknown
  - **Source:** Интервью, judging rubric и acceptance test от организаторов отсутствуют

### Evidence gaps
- Выбрать первичный сценарий для MVP: одно пользовательское утверждение/небольшой пакет или автономный внешний поток; E-режим безопаснее по срокам, но решение требует согласования команды.
- Зафиксировать научный поддомен, корпус, формат источников, полнотекстовый доступ и допустимые лицензии; без этого нельзя честно обещать качество retrieval.
- Определить политику SUPPORT/REFUTE/UNKNOWN при смешанных, косвенных или недостаточных доказательствах и отдельно учесть качество/дизайн исследования.
- Собрать bilingual held-out evaluation set с русскими и английскими claims, золотыми evidence passages и ручными метками; использовать SciFact как initial public benchmark только для англоязычной SUPPORT/CONTRADICT-задачи, с явным маппингом в SUPPORT/REFUTE/UNKNOWN.
- Определить protocol stateless-vs-memory: held-out claims, запрет утечки train/evidence, passage recall, verdict accuracy, provenance completeness, latency, новые загрузки и correction rate; evaluation принадлежит проекту, а не Cognee.
- Провести hands-on spike выбранного Cognee: хранение typed records, passage provenance, graph relations/contradictions, versioning, inspect, correction, reset, contamination, Pi.dev integration, локальный запуск, стоимость и усилия; не выбирать движок заново.
- Проверить, как сохранять оригинальную англоязычную цитату и русское резюме без потери смысла, как обрабатывать cross-language retrieval и как отдельная RU/EN held-out проверка дополняет SciFact.
- Проверить источники, retractions, даты и конфликты: публичные материалы кандидатов не доказывают автоматически научную temporal correctness.
- Получить judging rubric, формат демо и критерии «использовать лично или на работе» от организаторов; сейчас это неизвестно.
- Провести минимум несколько интервью/разборов задач со студентами и research staff, чтобы подтвердить частоту ручной перепроверки и ценность memory reuse.
- Зафиксировать бюджет, API keys, rate limits, правила хранения пользовательских данных и требования к приватности/IP.
- Необходима техническая проверка Pi.dev как runtime/base platform и способа упаковки расширения: официальные docs подтверждают платформу/SDK, но не готовую научную интеграцию.

### Alternatives considered
- **A-stateless-checker:** Pi-агент получает утверждение, ищет источники и возвращает SUPPORT/REFUTE/UNKNOWN без долговременной памяти.
  - **Pros:** Минимальный объём реализации и простой baseline.; Проще отделить качество retrieval/verdict от эффекта памяти.; Можно быстро показать на FEVER/SciFact-срезе.
  - **Cons:** Почти не отвечает теме «агент, который помнит».; Повторные проверки не получают накопленного evidence и не демонстрируют улучшение.; Не даёт устойчивого продукта после хакатона.
- **B-cognee-structured-claim-evidence-ledger (выбранный MVP):** Ограниченный claim-level verifier на Pi.dev с Cognee memory engine и явными сущностями claim, source, passage, evidence relation, verdict, run и correction; memory переиспользуется между проверками.
  - **Pros:** Структуры данных и knowledge graph Cognee хорошо соответствуют claim/evidence ledger.; Каждую связь можно показать пользователю и исправить.; Естественно поддерживает stateless-vs-memory сравнение и UNKNOWN.
  - **Cons:** Совместимость схемы Cognee с passages, contradictory evidence, versioning, correction/reset и contamination controls не доказана.; Нужно выбрать ограниченный корпус и не обещать полноту научного поиска.; Выбор не гарантирует истинность или улучшение correctness без project-owned eval.
- **F-simplemem-fallback:** Тот же ограниченный claim-level verifier на Pi.dev с SimpleMem как резервным memory engine, если Cognee не проходит заранее заданный blocking criterion.
  - **Pros:** По обсуждению PR у SimpleMem сильная встроенная eval-экосистема.; Может дать полезный fallback для сравнения и ускорить оценочную часть при сохранении claim/evidence scope.
  - **Cons:** Структуры claim/source/passage/relation/versioning нужно моделировать самостоятельно.; Это отдельная ветка с дополнительным объёмом и не является направлением MVP.; Нельзя переносить предположения о SimpleMem на Cognee.
- **C-graph-first-temporal-memory:** Graph-first агент на temporal knowledge graph, который связывает claims, источники, цитаты, версии, противоречия и даты.
  - **Pros:** Сильная демонстрация долгосрочной и временной памяти.; Подходит для retraction, superseded findings и запросов «что было известно на дату».; Graphiti/Zep даёт релевантный технический ориентир.
  - **Cons:** Высокий риск утонуть в графовой модели и conflict resolution до end-to-end демо.; Граф не заменяет retrieval, entailment и оценку качества источника.; Hands-on совместимость с Pi.dev и выбранным корпусом неизвестна.
- **D-research-copilot:** Русскоязычный research copilot с bilingual search, clustering, summaries и citation graph, но без обязательного формального verdict на каждое утверждение.
  - **Pros:** Ближе к привычным сценариям Elicit/Consensus/ResearchRabbit.; Полезен для широкого поиска и подготовки литературного обзора.; Проще показать ценность для студентов и научных сотрудников.
  - **Cons:** Слабее проверяемость: summary может выглядеть убедительно без entailment evidence.; Перенасыщенная конкурентная зона и слабая дифференциация.; Труднее доказать, что итерации становятся точнее.
- **E-user-submitted-claims:** Пользователь вручную подаёт одно утверждение или небольшой пакет claims; агент автономно выполняет проверку и сохраняет evidence, но не строит внешний ingestion stream.
  - **Pros:** Снимает самый рискованный неизвестный — формат, права и качество внешнего потока.; Позволяет за две недели сделать полный путь claim → evidence → verdict → memory reuse.; Хорошо подходит для живого демо и личного/рабочего использования.
  - **Cons:** Автономность ограничена запуском проверки пользователем.; Не проверяет масштабный непрерывный поток научных утверждений.; Нужно явно объяснить, что это scope choice, а не отказ от будущего stream режима.

## Problem framing

**Problem restatement.** Студенты и научные сотрудники, работающие с русско- и англоязычной научной литературой, проверяют научные утверждения вручную: поиск релевантных источников занимает часы, цепочка «утверждение → источник → вывод» не сохраняется между сессиями, а повторная проверка того же или похожего утверждения начинается каждый раз с нуля. Кандидат JTBD: «Когда у меня появляется научное утверждение или поток утверждений, требующих проверки, я хочу получить прозрачный двуязычный ответ с доказательной базой — честный вердикт SUPPORT / REFUTE / UNKNOWN на русском языке со ссылками и цитатами из русско- и англоязычных источников, — чтобы позже вернуться к этому ответу без потери провенанса и не собирать те же доказательства заново». Контекст (верифицировано): за две недели Hacker Sprint #2 «Агент, который помнит» нужна прикладная реализация, которой можно пользоваться лично или на работе уже после спринта; платформа агента — pi.dev; коммуникация ведётся на русском языке, исходные исследовательские материалы — русско- и англоязычные.

### Target users
- Студенты, работающие с научной литературой и исследованиями (проверка утверждений перед цитированием, обзоры, курсовые и дипломные задачи) — верифицированная первичная группа.
- Научные сотрудники (research staff), проверяющие утверждения в статьях, грантовых и рабочих материалах — верифицированная вторичная группа.
- Автор/команда проекта как первый пользователь: результат спринта обязан оставаться пригодным для личного или рабочего использования после его окончания (верифицированная цель брифа Hacker Sprint #2).
- Языковой профиль всех групп: рабочая коммуникация на русском; читаемые материалы русско- и англоязычные.

### Success criteria
- Трассируемость провенанса (цель демо: 100%): каждый вердикт демо-прогона содержит кликабельную ссылку на источник с дословной цитатой и метаданными (URL, дата обращения); по любому сохранённому ответу исходные фрагменты источников восстанавливаются минимум через 24 часа без потери ссылок.
- Русская коммуникация поверх RU/EN доказательств (цель демо: 100%): все ответы, вердикты и пояснения — на русском языке; при этом минимум одно проверяемое утверждение опирается на англоязычный источник, цитируемый в оригинале с русским резюме.
- Честность вердиктов: таксономия жёстко трёхзначна (SUPPORT / REFUTE / UNKNOWN); на контрольном наборе из ≥10 утверждений нет ни одного SUPPORT/REFUTE без прямой цитатной поддержки (0 сфабрикованных ссылок), и каждый UNKNOWN сопровождается указанием, каких именно данных не хватило.
- Видимое переиспользование памяти: повторный запрос того же или близкого утверждения использует ранее собранные доказательства, и это видно пользователю (метка/лог вида «источники из памяти: N»); число новых загрузок источников при втором проходе сокращается ≥50% относительно первого.
- Коррекция и сброс устаревшей памяти: пользователь одной командой исправляет сохранённый факт/вердикт либо сбрасывает сегмент памяти; следующий ответ по затронутому утверждению отражает изменение — 0 переносов устаревших выводов в новые ответы.
- Воспроизводимое сравнение stateless vs memory: один и тот же набор утверждений (включая удержанные, не участвовавшие в наполнении памяти) прогоняется в обоих режимах; отчёт — число источников, латентность, согласованность вердиктов, доля переиспользования — сохраняется и воспроизводится повторным запуском с теми же входами.

### Non-goals
- Не production-эксплуатация: без многопользовательности, регистрации, SLA, мониторинга и масштабирования — цель спринта: работающая реализация для личного/рабочего использования, а не публичный сервис.
- Не индексация всей научной литературы: работа идёт по заранее согласованному ограниченному корпусу источников; сплошной краулинг вне рамок спринта.
- Не обучение и не файнтюнинг моделей: используются существующие возможности LLM/pi.dev и выбранный Cognee; его schema, relations и эффективность проверяются отдельно project-owned eval.
- Не автоматизация систематических обзоров и не замена экспертной рецензии: продукт проверяет отдельные утверждения, а не даёт гарантированно полный обзор области.
- Не универсальный фактчекинг новостей, политики и бытовых утверждений — только научные утверждения.
- Не полировка UI: интерфейс на уровне, достаточном для живого демо и последующего личного/рабочего использования автором.
- Не языки сверх заданных: коммуникация только на русском, источники RU/EN; мультиязычная поддержка сверх этого вне рамок.
- Не медицинские, юридические и финансовые гарантии достоверности для ответственных решений.
- Массовая автономная инфраструктура приёма внешних потоков (очереди, коннекторы RSS/PDF-конвейеров) вне рамок спринта — независимо от итогового решения о режиме подачи утверждений.

### Framing assumptions
- НЕ РЕШЕНО — явное открытое решение, обязательное до архитектурной стадии: интерактивная подача утверждений пользователем против автономного потока утверждений (claim stream). Это разные продукты (разный UX, схема памяти и метрики); решение должно быть зафиксировано явно, а не умолчанием. До решения критерии успеха сформулированы так, что выполнимы в обоих режимах.
- Корпус источников НЕ ВЫБРАН (TBD): кандидаты (arXiv, PubMed Central, Semantic Scholar, eLIBRARY.RU, КиберЛенинка и др.) требуют проверки легального доступа, лицензий и полноты до реализации сбора доказательств.
- Предметная область НЕ ВЫБРАНА (TBD): конкретная подобласть (биомедицина, ML, психология и т. п.) определяет корпус, лексику и сложность вердиктов; критерий выбора — машиночитаемость корпуса и реальная потребность подтверждённых групп пользователей.
- Критерии оценки жюри Hacker Sprint #2 и формат демо НЕИЗВЕСТНЫ (TBD): приведённые продуктовые пороги (100%, ≥50%, ≥10 утверждений) — предлагаемые цели демо, подлежащие сверке с официальной рубрикой, когда она станет доступна.
- Доступ к источникам НЕ ПОДТВЕРЖДЁН (TBD): paywall, API-ключи, rate limits и стоимость могут ограничить сбор доказательств и поставить под угрозу критерий полного провенанса.
- Выбранный memory engine MVP — Cognee (решение команды на звонке): его структуры данных и knowledge graph хорошо ложатся на claim/evidence ledger. Пригодность schema/passages/relations, correction/reset и contamination ещё не доказана и проверяется project-owned eval.
- SciFact — initial public benchmark для англоязычной SUPPORT/CONTRADICT-задачи; проект сам задаёт маппинг в SUPPORT/REFUTE/UNKNOWN и отдельную RU/EN held-out проверку, поэтому SciFact не считается самостоятельным bilingual eval.
- SimpleMem — отвергнутая для MVP, но резервная альтернатива: сильная встроенная eval-экосистема при большей собственной работе по моделированию структур данных.
- Предположение (интервью не проводилось): у студентов и научных сотрудников есть устойчивая боль ручной проверки утверждений и потери результатов между сессиями; пользу памяти нужно доказать сравнением stateless vs memory, а не постулировать.
- Предположение: целевым пользователям достаточно читать англоязычные цитаты в оригинале с русским резюме, полный перевод источников не требуется (следует из верифицированного двуязычного профиля материалов, но терпимость к формату не проверена).
- Предположение: двух недель достаточно, чтобы довести все шесть критериев до демонстрируемого состояния; если нет — приоритет отдаётся провенансу и честности вердиктов как ядру ценности, а объём контрольного набора сокращается.

## Product intake

### Problem statements
- Студенты и научные сотрудники, работающие с русско- и англоязычной научной литературой, проверяют научные утверждения вручную по первоисточникам, а сделанные выводы теряются между сессиями: им нужен агент на базе Pi.dev с долговременной памятью, который накапливает результаты проверок и переиспользует их при новых утверждениях.
- За две недели хакатона «Hacker Sprint #2: Агент, который помнит» нужно довести до прикладного результата агента на базе Pi.dev как engine/base platform, решающего одну узкую задачу проверки утверждений так, чтобы им можно было пользоваться лично или на работе уже после спринта, а не только в демо.
- Студентам и сотрудникам, работающим с научной литературой и исследованиями, нужен более точный способ получать помощь от агента на базе Pi.dev с учётом накопленного исследовательского контекста, а не начинать каждое взаимодействие без проверенной памяти.
- Нужно сформулировать и проверить прикладной продукт в рамках двухнедельного спринта: русскоязычный агент для коммуникации, способный работать с русскими и английскими исходными материалами; текущий запрос — существенно более точный русский PRD, а не расплывчатое описание идеи.

### Context
- Формат работы: хакатон «Hacker Sprint #2: Агент, который помнит» — двухнедельный спринт; видимое интро Notion-брифа заявляет целью прикладную реализацию, которую затем можно использовать лично или на работе.
- Pi.dev зафиксирован как engine/base platform агента; это не продукт, которым пользователи уже должны пользоваться, и не предположение о существующей пользовательской базе.
- Бриф содержит ссылки на workshops по memory management и материалы/проекты mem0, Cognee, xmemory, supermemory, Graphiti и Letta; Cognee выбран для MVP, но его техническая пригодность и эффективность ещё не исследованы.
- Коммуникация по проекту, включая итоговый PRD, ведётся на русском языке; исходные исследовательские материалы бывают на русском и английском.
- Работа ведётся в репозитории challenge/poka-yoke; предыдущий раунд уточнения продукта признан пользователем слишком слабым — запрошены существенно более точный фрейминг и PRD на русском.
- Контекстом продукта является Hacker Sprint #2: «Агент, который помнит»; видимый brief описывает двухнедельную разработку прикладной реализации, которую можно затем использовать лично или на работе.
- Основной рабочий контекст — научная литература и исследовательская работа студентов и research staff; коммуникация агента должна быть на русском, при этом исходные материалы могут быть на русском и английском.

### Stakeholders
- Студенты, работающие с научной литературой и исследованиями, — первая подтверждённая группа конечных пользователей.
- Научные сотрудники (research staff), работающие с исследованиями, — вторая подтверждённая группа конечных пользователей.
- Пользователь-заказчик (владелец проекта) — задаёт требования, принимает результат, требует точный русский PRD.
- Команда разработки спринта — реализует агента на базе Pi.dev как engine/base platform за две недели хакатона.
- Организаторы и жюри Hacker Sprint #2 — оценивают результат; их критерии и формат демо пока неизвестны.
- Автор/команда проекта — первые потенциальные пользователи результата; пригодность для личного или рабочего применения требует user validation.
- Владелец решения по памяти — команда спринта: для MVP выбран Cognee, а SimpleMem остаётся fallback при заранее заданном blocking результате.

### Constraints
- Жёсткий срок: две недели спринта; результат обязан быть прикладной реализацией, пригодной к использованию после спринта, а не концептом «для слайда».
- Язык общения и отчётности — русский; при этом корпус источников двуязычный (RU/EN), что должно учитываться в retrieval и генерации ответов.
- Базовая платформа задана: pi.dev как engine/base platform агента; memory engine MVP выбран — Cognee. Его структуры данных и knowledge graph соответствуют claim/evidence ledger, но schema, passages, relations, correction/reset, contamination и effectiveness требуют project-owned validation.
- SciFact используется как initial public benchmark для англоязычной SUPPORT/CONTRADICT-задачи; необходимы явный маппинг в SUPPORT/REFUTE/UNKNOWN и отдельная RU/EN held-out проверка.
- Разрешены только те источники данных, доступ к которым легален для команды (open access или имеющиеся подписки); лицензии и права на корпуса ещё не выяснены.
- Инфраструктурный бюджет (локальное vs облачное хранение памяти, платные внешние API) не зафиксирован и должен быть определён до реализации.
- Спринт ограничен двумя неделями; реалистичный объём и критерии успеха необходимо определить доказательно.
- Агентская коммуникация — русский язык; материалы-источники — русский и английский.
- Нельзя считать Cognee подходящим или доказавшим пользу до отдельного project-owned eval; SimpleMem допускается только как заранее оговорённый fallback при blocking результате Cognee.
- Нужно явно учитывать Pi.dev как engine/base platform и проверять только технические ограничения runtime, package/SDK и упаковки.
- PRD должен быть на русском и существенно точнее предыдущего framing; формат, границы и измеримые критерии ещё не зафиксированы.

### Open questions
- Пользовательская работа (job): какую конкретную задачу автоматизируем — (а) проверка отдельных утверждений из свежей статьи перед цитированием, (б) регулярный мониторинг потока публикаций по теме, (в) проверка собственного черновика на противоречия с известной литературой? Решение определяет UX, поток данных и метрики успеха.
- Поток утверждений (claim stream): откуда берутся проверяемые утверждения — ручной ввод, RSS/arXiv-подписка, пакетная загрузка PDF или фиксированный датасет для демо — и каков cadence: онлайн по запросу или периодические прогоны?
- Научная подобласть: какую предметную область выбираем для глубокой проверки (например, биомедицина, ML, психология)? Критерий выбора — наличие машиночитаемого корпуса и реальная потребность подтверждённых групп пользователей.
- Гранулярность проверки: работаем ли мы на уровне атомарных утверждений (claim-level) или на уровне статьи целиком (paper-level)? Решение определяет схему памяти, чанкинг источников и формат вердикта.
- Корпус источников: какие корпуса легально доступны (PubMed Central, arXiv, Semantic Scholar, локальные библиотеки пользователей), каковы ограничения доступа/лицензирования и достаточна ли полнота корпуса для обоснованных вердиктов?
- Двуязычное поведение: как retrieval и ответы работают на смешанном RU/EN корпусе — всегда искать по обоим языкам, переводить запросы и цитаты, отвечать на языке вопроса с цитатами в оригинале?
- Семантика вердиктов: ограничиваемся ли мы {SUPPORTS, REFUTES, UNKNOWN} или вводим градации (частичная поддержка, противоречивые свидетельства), и какие пороги уверенности принудительно переводят сомнительный случай в UNKNOWN вместо рискованной категории?
- Оценка качества: SciFact — initial public benchmark для англоязычной SUPPORT/CONTRADICT-задачи (источник схемы: https://github.com/allenai/scifact/blob/master/doc/data.md); проектная политика должна маппить её в SUPPORT/REFUTE/UNKNOWN и включать отдельную RU/EN held-out проверку, а также stateless baseline.
- Исправление памяти: что происходит с ранее сохранённым вердиктом при появлении новых опровергающих данных; есть ли ручное редактирование и полный сброс памяти; как не даём системе закреплять ошибочный вывод (собственно poka-yoke-требование к продукту)?
- Приватность: какие данные пользователей допустимо хранить в долговременной памяти (полные тексты, заметки, история запросов), где они физически находятся и как выполняется удаление по требованию?
- Критерии жюри: каковы официальные критерии оценки Hacker Sprint #2 (новизна, применимость, инженерное качество, работа с памятью) и требуемый формат демо (live-сценарий, видео, публичная ссылка)?
- Смысл «лично или на работе»: какой реальный сценарий должен продолжать работать после спринта без доработок, чтобы демо честно соответствовало заявленной цели брифа?
- Какой конкретный повторяющийся сценарий научной работы является первичным: поиск литературы, чтение, синтез, ведение заметок, подготовка обзора или другое?
- Что именно должно сохраняться, откуда извлекаться и как пользователь исправляет или удаляет память?
- Как измерить пользу и точность памяти за две недели: экономия времени, качество ответов, воспроизводимость ссылок, снижение повторного ввода или иные метрики?
- Какие типы источников и рабочие форматы обязательны, и как обрабатываются русско-английские материалы и цитаты?
- Какие ограничения приватности, авторских прав, доступа к исследовательским данным и хранения обязательны?
- Как Pi.dev участвует в пользовательском потоке как engine/base platform и какие его реальные runtime/package/SDK-ограничения нужно подтвердить?
- Как проверить выбранный Cognee на schema, passages, graph relations, provenance, correction/reset и contamination в рамках project-owned eval; при каком blocking результате допустим SimpleMem fallback?
- Какой минимальный прикладной результат можно надёжно завершить и продемонстрировать за двухнедельный спринт?
- Кто принимает решение о корректности сохранённого контекста и как обрабатываются ошибочные воспоминания или неподтверждённые выводы?

### Intake evidence
- **Claim:** Хакатон называется «Hacker Sprint #2: Агент, который помнит», длится две недели, и его цель — прикладная реализация, которую можно использовать лично или на работе.
  - **Status:** verified
  - **Source:** Notion-бриф (страница открыта браузером; заголовок и интро прочитаны)
- **Claim:** Основные пользователи продукта — студенты и научные сотрудники, работающие с научной литературой и исследованиями.
  - **Status:** verified
  - **Source:** Прямое подтверждение пользователя в текущем раунде уточнений
- **Claim:** Pi.dev используется как engine/base platform агента; пользователи не обязаны уже работать в Pi.
  - **Status:** verified
  - **Source:** Прямое подтверждение пользователя и комментарий PR: https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3855672175
- **Claim:** Целевой язык коммуникации — русский; исходные исследовательские материалы могут быть на русском и английском.
  - **Status:** verified
  - **Source:** Прямое подтверждение пользователя
- **Claim:** Для MVP команда на звонке выбрала Cognee как memory engine из-за структур данных и knowledge graph, хорошо соответствующих claim/evidence ledger; его eval не считается готовой и остаётся project-owned responsibility.
  - **Status:** verified
  - **Source:** Решение команды на звонке; обсуждение PR: https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3873964023 и reply https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3873968914
- **Claim:** SimpleMem рассмотрен как резервная альтернатива с сильной встроенной eval-экосистемой, но с необходимостью самостоятельно моделировать структуры данных; это не выбранный Cognee engine.
  - **Status:** verified
  - **Source:** Обсуждение PR: https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3873964023 и reply https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3873968914
- **Claim:** SciFact выбран как initial public benchmark для англоязычной SUPPORT/CONTRADICT-задачи; его схема и данные опубликованы, но bilingual requirement он не покрывает.
  - **Status:** verified
  - **Source:** SciFact data documentation: https://github.com/allenai/scifact/blob/master/doc/data.md; комментарий PR: https://github.com/podlodka-ai-club/poka-yoke/pull/1#discussion_r3874035065
- **Claim:** У целевых пользователей есть устойчивая боль: проверку утверждений приходится выполнять вручную, результаты теряются между сессиями, и долговременная память агента даст здесь измеримую пользу.
  - **Status:** assumption
  - **Source:** [INFERENCE] из темы брифа «агент, который помнит» и направления задачи; интервью с пользователями не проводилось
- **Claim:** Продукт направлен на проверку научных утверждений с вердиктами SUPPORT/REFUTE/UNKNOWN и накоплением результатов в долговременной памяти.
  - **Status:** assumption
  - **Source:** Формулировка открытых вопросов текущей итерации и имя репозитория poka-yoke («защита от ошибок»); письменного ТЗ нет
- **Claim:** Официальные критерии жюри и формат демо хакатона неизвестны.
  - **Status:** unknown
  - **Source:** Отсутствуют в доступном фрагменте брифа; нужны полная страница брифа или вопрос организаторам
- **Claim:** Легальный доступ и лицензионные ограничения корпусов научных текстов (открытые архивы против подписок) не установлены.
  - **Status:** unknown
  - **Source:** Исследование корпусов не проводилось
- **Claim:** Предложенный продукт улучшит качество или эффективность исследовательской работы.
  - **Status:** unknown
  - **Source:** Требует user validation и project-owned eval
- **Claim:** Эффективность выбранного Cognee и ценность memory не доказаны; SimpleMem может рассматриваться только при blocking результате Cognee и не переносит на него свои eval-свойства.
  - **Status:** unknown
  - **Source:** Требует Cognee validation spike и project-owned eval
- **Claim:** Можно завершить и доказать ценность решения в пределах двухнедельного спринта.
  - **Status:** unknown
  - **Source:** Зависит от выбранного сценария и критериев успеха

## Document metadata

**Renderer.** product-prd-renderer@2

**Source artifacts.** product_intake, product_framing, product_evidence, product_critique, product_spec

**Rendering provenance.** Исходные source artifacts детерминированно рендерили baseline Markdown без встроенных timestamp; текущий tracked PRD — сознательная revision поверх этого исходного generated PRD по комментариям PR.

**Source/content hash provenance.** `source_hash` и `content_hash` из исходного state artifact сохранены как provenance baseline; они не являются утверждением, что текущий tracked документ byte-identical исходному renderer output.

**Unknown handling.** Explicit unknowns stay visible: absent concepts render the '_Unknown — not provided by the source artifacts_' marker; 'unknown'/'TBD' values render verbatim.

