# Результаты тестирования 3М MUSIC

> Это исходный аудит до исправлений. Последующие изменения и повторные проверки описаны в [FIX_IMPLEMENTATION_REPORT.md](FIX_IMPLEMENTATION_REPORT.md).

Дата 23 ноября 2026 года. Коммит `7d8c0d3bd5ff93c9ac622ab1623eccd6ec823d65`. Исходный код сохранён без изменений.

## Среда

| Инструмент | Версия или состояние |
| --- | --- |
| Node.js | 24.22.3 |
| Проектный Playwright | 1.62.1 |
| Независимый Playwright | 1.65.1 |
| Lighthouse | 13.6.0 |
| axe Playwright | 4.14.0 |
| chromium | 156.0.8078.79 |
| firefox | browserType.launch: Executable doesn't exist at /tmp/3m-audit-browsers/firefox-1572/firefox/firefox |
| webkit | browserType.launch: Executable doesn't exist at /tmp/3m-audit-browsers/webkit-2388/pw_run.sh |

Набор аудита установлен в /tmp/3m-audit-tools, его package.json и lockfile воспроизведения находятся в audit/. Основные package.json и package-lock.json проекта не менялись.

## Итоговый автоматический прогон

| Сценарий | Результат |
| --- | --- |
| Internal links and static files under GitHub Pages subpath | PASS |
| Navigation, modal buttons, Escape, focus trap and restoration | PASS |
| Carousel wheel, keyboard, 3 visible artists, momentum, focus and touch swipe | PASS |
| Carousel focus survives hiding an old card | FAIL |
| 200% browser zoom approximation via half CSS viewport, all pages | FAIL |
| JavaScript disabled baseline and phone access | PASS |
| Populated content screenshots, 12 releases and 3 additional artists | PASS |
| Admin artist, teacher and release CRUD, URL validation, logout | PASS |
| Malformed localStorage handling | FAIL |
| Removing local override restores baseline | FAIL |
| Missing artist must have accessible heading and usable return link | FAIL |
| Reduced-motion toggle removes animated enhancement | PASS |
| Keyboard focus indicators and 200% text zoom overflow probe | PASS |

Итого 8 PASS и 5 FAIL среди 13 сценариев. Последний прогон возвращает exit code 1 из-за найденных дефектов. Он не маскируется успешным результатом. Файлы audit.json и runner-final.log содержат фактические assertion errors.

Матрица содержит 240 уникальных записей обычных страниц. Заполненные сценарии имеют 12 уникальных комбинаций страницы и ширины. С учётом повторных функциональных запусков в сыром JSON 276 записей. Повторы не выдаются за дополнительные уникальные разрешения.

## Уточнение тестового инструмента

Первый вариант проверки внутренних ссылок ошибочно использовал response.status() для Node fetch. Исправлен на response.status. Первая строгая проверка модального Tab считала временный фокус BODY выходом в фон. В native dialog этот переход не даёт фокуса фоновым контролам. Уточнена проверка, подтверждено отсутствие перехода на фоновые кнопки. Эти два первоначальных сбоя не записаны как дефекты сайта.

В performance runner исправлено чтение coverage для нового V8-формата. Итоговые измерения завершены. Сырые журналы предыдущих попыток сохранены для прозрачности, они не являются отдельными ошибками сайта.

## Точечные подтверждения

| Проверка | Результат | Артефакт |
| --- | --- | --- |
| CRUD артистов/преподавателей/релизов и HTTPS | PASS в основном функциональном сценарии | [audit/results/audit.json](audit/results/audit.json) |
| Конкурентное сохранение преподавателей | Потеря первой правки подтверждена | [audit/results/concurrency.json](audit/results/concurrency.json) |
| Скрытые предпросмотры | hidden перекрыт display у фото и видео | [audit/results/targeted.json](audit/results/targeted.json) |
| Семантика map link | axe подтвердил несовпадение имён | [audit/results/audit.json](audit/results/audit.json) |
| XSS текстового описания | Строка HTML осталась текстом, img не внедрён | [audit/results/targeted.json](audit/results/targeted.json) |
| Статическая генерация профиля | PASS, экранирование и относительная ссылка | [audit/results/build-fixture.json](audit/results/build-fixture.json) |
| javascript: в сборке | PASS, небезопасная схема отклонена | [audit/results/build-fixture.json](audit/results/build-fixture.json) |
| Локальный серверный вход | 401/403/cookie/logout подтверждены | [audit/results/security.json](audit/results/security.json) |
| Внешний продакшен | BLOCKED средой, CONNECT 403 | [audit/results/external-access.json](audit/results/external-access.json) |
| Карта | Не проверена, запрос явно блокировался в локальных прогонах | [audit/results/external-access.json](audit/results/external-access.json) |

## Работа без JavaScript

Проверены все 8 маршрутов в отдельном context javaScriptEnabled=false. Статическая навигация, телефон и исходный контент главной доступны. Generic artist.html остаётся без данных профиля, локальные релизы и админка не работают. PASS соответствующего теста означает, что сценарий наблюдения выполнился, а не полную функциональность сайта без JS. Данные каждого маршрута сохранены в no-js.json.

## Axe

| Правило | Число уникальных запусков с нарушением |
| --- | --- |
| label-content-name-mismatch | 8 |
| image-redundant-alt | 4 |
| heading-order | 4 |
| page-has-heading-one | 12 |
| region | 4 |
| skip-link | 4 |
| landmark-one-main | 8 |

Счётчик относится к запускам страницы и ширины, а не числу уникальных дефектов. Часть правил — best practice. Incomplete-результаты сохранены отдельно в audit.json и не выдаются за PASS. Нарушения объединены по причине в FULL_AUDIT_REPORT.md.

## Проверка путей

Все обычные внутренние ссылки в проверенном наборе возвращают 200 под /3m_music-/. Исключения — robots.txt, sitemap.xml, заведомо несуществующий маршрут и серверный API на статическом хостинге, которые ожидаемо дают 404. Исходные страницы двух артистов возвращают 200 с пустым body. Это незавершённый контент, не HTTP broken link.

Локальные скрипты, модули, стили и фотографии загружались без подтверждённых обычных сетевых ошибок в чистом профиле. Яндекс Карты имеют намеренные requestfailed=ERR_BLOCKED_BY_CLIENT в детерминированном прогоне. Непредвиденные ошибки при плохих localStorage данных сохранены отдельно.

## Покрытие мыши, клавиатуры и touch

- Мышь — меню, карточки, формы, диалог, закрытие по фону.
- Клавиатура — Tab, ArrowLeft/Right, Escape, фокус после закрытия, потеря фокуса карусели.
- Touch — CDP touchStart/touchMove/touchEnd, свайп без открытия вкладки.
- Телефон — проверен href tel:, реальный звонок не выполнялся.
- Внешние платформы и видео — проверены созданный URL, target и rel. Воспроизведение внешнего медиа не подтверждено.
- Отдельных кнопок-стрелок карусели в интерфейсе нет, проверены клавиши стрелок. Отсутствие удалённых ранее декоративных стрелок не считается дефектом.

## Доступные команды воспроизведения

Из корня репозитория

```sh
npm run build
npm ci --prefix audit
npm test --prefix audit
npm run performance --prefix audit
node audit/build-fixture.cjs
node audit/security.cjs
```

Для дополнительных точечных сценариев

```sh
node audit/targeted.cjs
node audit/visual-probes.cjs
node audit/concurrency.cjs
```

Если браузеры устанавливаются через Playwright

```sh
cd audit
npx playwright install chromium firefox webkit
```

В текущем окружении использовался /usr/bin/chromium. Для другого пути задайте CHROMIUM_PATH для основного runner и performance runner. Некоторым точечным локальным скриптам путь /usr/bin/chromium задан явно. Если зависимости находятся в другом каталоге, задайте AUDIT_TOOLS абсолютным путём к папке с package.json и node_modules.

Для проверки внешнего URL эти локальные скрипты автоматически не переключаются на продакшен. Это сделано, чтобы не запускать демо-CRUD и локальные security-пробы на чужой машине. Production smoke должен быть отдельным согласованным read-only запуском.

## Что не подтверждено

Firefox/WebKit, фактическое поведение iPhone/Safari и Android Chrome, нативный 200% browser zoom, скринридеры, внешний вид загруженной Яндекс Карты, внешнее воспроизведение, текущий деплой, HTTP-заголовки CDN и CrUX. Скриншоты полностью локальные. Ручной просмотр ключевых изображений дополняет автоматические проверки и не заменяет тестирование на реальных устройствах.
