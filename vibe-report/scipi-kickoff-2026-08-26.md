# SciPi: kick-off харнесса

## Результат

Создан минимальный Bun/TypeScript-харнесс поверх публичного API Pi 0.84.3. При запуске интерактивного режима отображается адаптивная onboarding-заставка `SciPi`: семистрочный логотип шириной 57 колонок занимает примерно половину стандартного 120-колоночного терминала и окрашен локальным truecolor-градиентом cyan → indigo → violet → pink. На узких терминалах используется компактный цветной заголовок и семантический перенос слогана без обрыва слов. Глобальная конфигурация и состояние SciPi по умолчанию изолированы в `~/.scipi/agent`: совместимые с Pi `auth.json`, `settings.json`, `models.json`, packages и resources, а также canonical cwd-encoded sessions отделены от обычного Pi. Project-local settings, packages и resources изолированы в `.scipi`, тогда как обычный Pi продолжает использовать `.pi`; явный `--session-dir` сознательно имеет приоритет над изоляцией сессий.

Реализация использует публичные точки расширения Pi:

- собственный distribution artifact импортирует `main(args, { extensionFactories })` и сохраняет штатный CLI, совместимость форматов Pi 0.84.3 и стандартные механизмы аутентификации, настроек, package manager и сессий;
- `ctx.ui.setHeader(...)` для кастомного заголовка TUI.

Глобальный каталог, каталог сессий и project-local `.scipi` задаются официальными distribution-параметрами `piConfig.name` и `piConfig.configDir`. Скрипт `scripts/build-scipi-distribution.ts` детерминированно создаёт отдельный ignored artifact из точно зафиксированного опубликованного Pi; dependency в `node_modules` не патчится и внутренние компоненты не копируются в git.

Это собственная downstream-дистрибуция, а не runtime adapter: она намеренно владеет app name, config namespace и обновлением своей Pi-базы.

## Изменения

- добавлен исполняемый entrypoint `src/main.ts`;
- добавлена собственная SciPi-дистрибуция `@podlodka-ai-club/scipi-coding-agent`, генерируемая при `bun install` и перед runtime/gates;
- global config по умолчанию находится в `~/.scipi/agent`, native overrides — `SCIPI_CODING_AGENT_DIR` и `SCIPI_CODING_AGENT_SESSION_DIR`; Pi-переменные находятся в другом namespace и не влияют на SciPi;
- project-local settings, packages, resources и trust используют `.scipi`, тогда как обычный Pi продолжает использовать `.pi`;
- добавлено branding-расширение `src/branding.ts` и контрактные тесты distribution manifest, заголовка и CLI-wrapper;
- добавлен центрированный семистрочный логотип `SciPi` с русским слоганом `Научные утверждения • доказательства • память`;
- добавлены ANSI-aware ограничение ширины, narrow fallback и кэширование рендера с корректной инвалидацией;
- градиент, RGB-интерполяция и ANSI-рендеринг реализованы локально; пакет `pi-startup-header` и другие зависимости не добавлялись;
- для ширины 24 колонки слоган раскладывается на завершённые строки `Научные утверждения`, `• доказательства •`, `память`;
- зависимости Pi зафиксированы на версии `0.84.3`;
- добавлены команды `bun run scipi`, `bun run check`, `bun test`;
- README дополнен разделом конфигурации, совместимости и безопасной миграции без symlink-смешивания; global state хранится в `~/.scipi/agent`, а project-local state — в `.scipi`, отдельно от Pi `.pi`.

PRD из ветки `feat/research-agent-prd` использован как контекст и не переносился в текущую ветку.

## Ограничения и владение обновлениями

- SciPi намеренно определяется как non-official distribution, поэтому official-distribution-only first-time setup Pi не запускается; первичная настройка выполняется через `/login`, settings и package commands SciPi.
- `scipi update --self` не является механизмом обновления этой дистрибуции. Версия Pi меняется точным dependency bump в репозитории с review manifest contract и последующим `bun install`.
- `.scipi-dist` — ignored build artifact. После checkout обязателен `bun install`; runtime и gates также запускают cached builder как poka-yoke.

## Верификация

- `bun run check` — успешно;
- `bun test` — 9 тестов успешно, 0 ошибок, включая fail-closed manifest transformation, отдельные package/app names, project-local `.scipi` и CLI-wrapper;
- `bun run scipi -- --help` — аргументы передаются штатному Pi CLI;
- интерактивные PTY-smoke в offline-режиме на ширинах 120 и 24 колонки — широкий градиентный wordmark и компактная семантическая раскладка видны при старте, оба процесса завершены штатно с кодом 0;
- LSP diagnostics недоступны: TypeScript language server в окружении не зарегистрирован; контракт типов проверен `tsc --noEmit`.
- production-timing проверен по установленному Pi 0.84.3: `getAgentDir()` читает `SCIPI_CODING_AGENT_DIR` лениво при каждом вызове, первое разрешение каталога происходит внутри `main()`, а module-level кэша каталогов нет;
- upstream `node_modules/@earendil-works/pi-coding-agent` остаётся с `piConfig.configDir === ".pi"`, generated distribution получает `name === "@podlodka-ai-club/scipi-coding-agent"`, `piConfig.name === "scipi"` и `piConfig.configDir === ".scipi"`;
- чистый `bun install --frozen-lockfile` создал distribution из unmodified upstream package без dependency patch; mismatch версии или upstream config contract завершает сборку ошибкой;
- E2E-smoke custom distribution: `install <local-package> -l --approve` создал только `<project>/.scipi/settings.json`; последующий интерактивный запуск при конфликтующих `PI_CODING_AGENT_*` загрузил extension (`SCIPI_DISTRIBUTION_EXTENSION_LOADED`, `extension.ts` в списке), создал global state только в `SCIPI_CODING_AGENT_DIR`, использовал docs из `.scipi-dist` и завершился с кодом 0.
