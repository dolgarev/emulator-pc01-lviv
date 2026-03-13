# Agents.md

## Обзор проекта

**Emulator PC-01 Lviv** — эмулятор советского домашнего компьютера ПК-01 «Львов» (Украина, 1980-е годы), написанный на JavaScript и HTML5. Изначально создан как Chrome Packaged App (manifest v2).

## Архитектура

```
Emulator (точка входа)
 └── Computer
      └── Profile (оркестратор)
           ├── Config      — конфигурация профиля
           ├── Beeper      — звук (Web Audio API)
           ├── Keyboard    — клавиатурный ввод
           ├── IO          — I/O порты (i8255A PPI)
           ├── Memory      — страничная память (ROM / RAM / VRAM)
           ├── Rom         — ROM-образы
           ├── I8080       — эмуляция процессора Intel 8080
           ├── Viewport    — управление canvas
           ├── Screen      — видеовывод на canvas
           ├── Tape        — файловый I/O (Chrome FS API)
           ├── DnD         — drag-and-drop загрузка файлов
           └── Watcher     — трапы (перехват BLOAD/CLOAD)
```

## Стек технологий

- **Язык:** JavaScript (ES3/ES5, function constructors + prototype)
- **UI:** HTML5, CSS, Canvas 2D
- **Звук:** Web Audio API
- **Платформа:** Chrome Packaged App (manifest v2) — **deprecated**
- **Сборка:** отсутствует (ручное подключение `<script>` тегов)
- **Тесты:** отсутствуют
- **Линтинг:** отсутствует

## Ключевые файлы

| Файл | Размер | Описание |
|------|--------|----------|
| `js/i8080.js` | 38 КБ | Ядро эмуляции CPU Intel 8080 (полный набор opcodes) |
| `js/profile.js` | 16 КБ | Оркестратор: game loop, загрузка/сохранение, снапшоты |
| `js/memory.js` | 10 КБ | Страничная память (80/144/256 КБ конфигурации) |
| `js/keyboard.js` | 10 КБ | Маппинг клавиатуры PC → ПК-01 |
| `js/screen.js` | 8 КБ | Видеовыход на canvas с палитрами и grayscale |
| `js/tape.js` | 8 КБ | Файловый I/O через Chrome File System API |
| `js/rom.js` | 125 КБ | ROM-образы (бинарные данные inline в JS) |
| `js/dump.js` | 2.18 МБ | Дампы/снапшоты (бинарные данные inline в JS) |
| `js/config.js` | 5 КБ | Конфигурация профилей эмулятора |
| `js/setting.js` | 5 КБ | Глобальные настройки, привязка к DOM |
| `js/io.js` | 5 КБ | Эмуляция I/O портов (i8255A) |
| `js/beeper.js` | 4 КБ | Звуковая подсистема (Web Audio API) |
| `js/watcher.js` | 4 КБ | Трапы для перехвата BLOAD/CLOAD |
| `js/dnd.js` | 4 КБ | Drag-and-drop загрузка файлов |
| `js/notify.js` | 2 КБ | Singleton уведомлений |
| `js/computer.js` | 3 КБ | Обёртка над Profile |
| `js/emulator.js` | 2 КБ | Точка входа, инициализация UI |
| `js/viewport.js` | 2 КБ | Управление canvas-элементом |
| `js/main.js` | 1 КБ | DOMContentLoaded → запуск эмулятора |
| `window.html` | 11 КБ | Основная HTML-страница |
| `background.js` | 313 Б | Chrome App background script |
| `manifest.json` | 593 Б | Chrome App manifest (v2) |

## Форматы файлов

- `.lvt` / `.lvr` / `.lv0`-`.lv99` — файлы программ ПК-01
- `.sav` — снапшоты формата LVOV/DUMP/2.0/H+
- `.e3` — снапшоты формата Emulator 3000

## Как работать с кодом

1. **Запуск:** Проект запускался как Chrome Packaged App. Для запуска в современном браузере нужна миграция (см. `IMPROVEMENTS.md`).
2. **Основной цикл:** `Profile.run()` — main loop с `setTimeout`→CPU→Beeper→`requestAnimationFrame`→Screen→повтор.
3. **CPU:** `I8080.execute(opcode)` — монолитный `switch` на все ~256 opcodes.
4. **Память:** 4 страницы по 16 КБ, с VRAM overlay и расширенными банками (144/256 КБ).
5. **Экран:** 256×256 пикселей, 4 цвета на пиксель из палитры, canvas с Uint32Array.

## Важные соглашения

- Конструкторы используют `instanceof` проверки для dependency injection
- Свойства конфигурации определяются через `Object.defineProperty` (non-writable)
- `Notify` — singleton через `Notify.instance`
- `Watcher` — трапы привязываются к адресам PC (program counter)
- Комментарии в коде на русском и английском языках

## Текущая миграция

**Статус:** Планирование завершено, реализация не начата.

Проект мигрирует с Chrome Packaged App на веб-приложение в три фазы:

1. **Фаза 1 (текущая): SPA на Vite** — эмулятор заработает в любом браузере
2. **Фаза 2: PWA** — оффлайн-доступ + установка (через `vite-plugin-pwa`)
3. **Фаза 3: Качество кода** — баги, ESLint, ES-модули, классы, тесты

Подробный план: [`MIGRATION_PLAN.md`](file:///home/oleg/dev/repositories/github.com/dolgarev/emulator-pc01-lviv/MIGRATION_PLAN.md)
Список улучшений: [`IMPROVEMENTS.md`](file:///home/oleg/dev/repositories/github.com/dolgarev/emulator-pc01-lviv/IMPROVEMENTS.md)

### Ключевые решения

- **Electron/Tauri не рассматриваются** — только веб
- **SPA сначала, PWA потом** — из-за ограниченности ресурсов
- **Бинарные данные** (`rom.js` 125 КБ, `dump.js` 2.18 МБ) нужно вынести в `.bin` файлы в `public/data/` и загружать через `fetch()`
- **Инициализация станет асинхронной** — ключевое архитектурное изменение при выносе данных
- **Chrome API (`chrome.fileSystem`)** заменяется на `<input type="file">` + File API

