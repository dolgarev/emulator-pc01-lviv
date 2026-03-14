# План миграции: Chrome App → SPA → PWA

## Контекст

Проект `emulator-pc01-lviv` — это Chrome Packaged App (manifest v2), который более не поддерживается браузерами. Миграция разделена на три фазы: SPA → PWA → Quality.

---

## Фаза 1: Миграция на SPA (Vite)

> [!IMPORTANT]
> Цель — запустить эмулятор в любом современном браузере без изменения логики эмуляции.

### 1.1. Инициализация Vite-проекта

```bash
npm init -y
npm install -D vite
```

Создать `vite.config.js`:
```js
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
  },
});
```

### 1.2. Реструктуризация файлов

**До:**
```
emulator-pc01-lviv/
├── window.html
├── background.js
├── manifest.json
├── js/
│   ├── main.js
│   ├── emulator.js
│   ├── ...
│   ├── rom.js      (125 КБ inline data)
│   └── dump.js     (2.18 МБ inline data)
├── assets/
│   ├── css/
│   ├── 960gs/
│   ├── fontello/
│   └── images/
├── lviv-16.png
└── lviv-128.png
```

**После:**
```
emulator-pc01-lviv/
├── index.html             ← переименованный window.html (точка входа Vite)
├── vite.config.js
├── package.json
├── js/
│   ├── main.js
│   ├── emulator.js
│   ├── ...
│   ├── rom.js             ← логика загрузки (без inline data)
│   └── dump.js            ← логика загрузки (без inline data)
├── public/
│   ├── data/
│   │   ├── rom-1990.bin   ← бинарный ROM-образ
│   │   ├── dump-bload.bin
│   │   ├── dump-cload.bin
│   │   ├── dump-aerco1.bin
│   │   └── ...            ← все дампы как отдельные файлы
│   └── images/
│       ├── lviv-16.png
│       └── lviv-128.png
├── assets/
│   ├── css/
│   ├── 960gs/
│   └── fontello/
└── [удалить] background.js, manifest.json (Chrome App)
```

### 1.3. Конвертация бинарных данных

Написать Node.js-скрипт для извлечения бинарных данных из `rom.js` и `dump.js` в `.bin`-файлы:

```js
// scripts/extract-binaries.js
// 1. Распарсить JS-массивы из rom.js / dump.js
// 2. Записать как Buffer в .bin файлы в public/data/
// 3. Сгенерировать manifest.json со списком доступных дампов
```

### 1.4. Переписать загрузку ROM и Dump

**`rom.js` — до:**
```js
Rom.prototype.images = {
    '1990': {
        data: [0xC3, 0x00, 0xE0, ...] // inline
    }
};
```

**`rom.js` — после:**
```js
Rom.prototype.loadImage = async function(shortName) {
    const response = await fetch(`/data/rom-${shortName}.bin`);
    const buffer = await response.arrayBuffer();
    this.images[shortName].data = new Uint8Array(buffer);
};
```

**`dump.js` — аналогично:** заменить inline-массивы на lazy-загрузку через `fetch()`.

> [!WARNING]
> Инициализация станет асинхронной. Необходимо добавить `async/await` в цепочку запуска: `main.js` → `Emulator` → `Computer` → `Profile` → `Rom`.

### 1.5. Удаление Chrome App зависимостей

| Файл | Действие |
| --- | --- |
| `background.js` | Удалить |
| `manifest.json` (Chrome App) | Удалить |
| `tape.js` → `chrome.fileSystem.chooseEntry()` | Заменить на `<input type="file">` + File API |
| `tape.js` → `webkitRequestFileSystem` | Заменить на `URL.createObjectURL()` + `<a download>` |
| `tape.js` → `FileError.*` | Заменить на стандартные `DOMException` |
| `tape.js` → `Tape.prototype.store()` | Заменить на IndexedDB или Blob download |
| `dnd.js` | Оставить как есть (стандартный Drag & Drop API) |

### 1.6. Адаптация `window.html` → `index.html`

1. Переименовать `window.html` → `index.html`
2. Добавить `<title>Emulator PC-01 Lviv</title>`
3. Сохранить все `<script>` в том же порядке (без переписывания на модули)
4. Добавить `<meta>` теги для SEO

### 1.7. Адаптация `Keyboard`

`evt.which` всё ещё работает в большинстве браузеров (только deprecated, не удалён). На этой фазе **оставить как есть** — исправить в Фазе 3.

### 1.8. Асинхронная инициализация

Основное изменение в потоке запуска:

**До (синхронный):**
```
DOMContentLoaded → new Emulator() → new Computer() → new Profile() → new Rom() → run()
```

**После (асинхронный):**
```
DOMContentLoaded → new Emulator() → await loadResources() → new Computer() → ... → run()
```

Подход: добавить метод `Emulator.prototype.loadResources()`, который загружает ROM и нужный Dump, и только после этого создаёт Computer.

### 1.9. Обновление `package.json`

```json
{
  "name": "emulator-pc01-lviv",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "extract-data": "node scripts/extract-binaries.js"
  },
  "devDependencies": {
    "vite": "^6.x"
  }
}
```

### 1.10. Проверка

- [ ] `npm run dev` — эмулятор запускается в браузере
- [ ] ROM загружается корректно (BIOS-экран виден)
- [ ] Клавиатура работает
- [ ] Звук работает (может потребовать взаимодействие пользователя для AudioContext)
- [ ] Загрузка файла через кнопку LOAD работает
- [ ] Drag & Drop работает
- [ ] Скриншот сохраняется
- [ ] Дампы загружаются (aerco1 и другие)
- [ ] `npm run build` + `npm run preview` — production-сборка работает

---

## Фаза 2: Добавление PWA (после Фазы 1)

> Эта фаза выполняется **после** завершения и стабилизации Фазы 1.

### 2.1. Установить `vite-plugin-pwa`

```bash
npm install -D vite-plugin-pwa
```

### 2.2. Настроить `vite.config.js`

```js
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['data/**/*.bin', 'images/*.png'],
      manifest: {
        name: 'Emulator PC-01 Lviv',
        short_name: 'ПК-01 Львов',
        description: 'Emulator of the Soviet computer PC-01 Lviv',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          { src: '/images/lviv-128.png', sizes: '128x128', type: 'image/png' },
          { src: '/images/lviv-16.png', sizes: '16x16', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,bin,png,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.bin$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'emulator-data',
              expiration: { maxEntries: 50, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
```

### 2.3. Добавить иконки

Создать иконки размерами 192×192 и 512×512 (обязательны для PWA).

### 2.4. Проверка PWA

- [ ] Lighthouse audit → PWA score ≥ 90
- [ ] Установка через браузер работает
- [ ] Оффлайн-режим: отключить сеть → эмулятор работает
- [ ] Обновление Service Worker: изменить код → обновление применяется

---

## Фаза 3: Качество кода (после Фаз 1 и 2)

> Эта фаза выполняется **после** стабилизации PWA. Возможно разбить на итерации.

### 3.1. Критические баги

- [ ] `screen.js:111` — добавить `var` к `result`
- [ ] `notify.js:69` — заменить `innerHTML` на `textContent`
- [x] `memory.js:263` — исправить `io.EXTENDED_MODE_PORT` на `io.ports[io.EXTENDED_MODE_PORT]` (исправлено март 2026)
- [ ] `screen.js:221` — исправить grayscale-формулу (заменить `&&` на правильные весовые коэффициенты)

### 3.2. Инфраструктура

- [ ] Добавить `"use strict"` во все JS-файлы
- [ ] Настроить ESLint + Prettier
- [ ] Добавить `.editorconfig`
- [ ] Настроить GitHub Actions для линтинга

### 3.3. Модернизация кода (опционально, после 3.1–3.2)

- [ ] Миграция на ES-модули (`import`/`export`)
- [ ] Перевод на ES6+ классы
- [ ] Замена `evt.which` на `evt.code`
- [ ] Замена `webkitImageSmoothingEnabled` на `imageSmoothingEnabled`
- [ ] Исправить опечатки (`standart` → `standard`, `Unknow` → `Unknown`)

### 3.4. Тесты (опционально)

- [ ] Юнит-тесты для I8080 (CPU exerciser)
- [ ] Тесты для Memory, IO
- [ ] Интеграционный тест: загрузка snapshot → корректное состояние CPU/памяти

---

## Ключевые риски

| Риск | Влияние | Митигация |
| --- | --- | --- |
| Асинхронная загрузка ROM/Dump ломает порядок инициализации | Высокое | Тщательная проработка цепочки `async/await`, показывать загрузочный экран |
| AudioContext требует user gesture | Среднее | Добавить splash-screen с кнопкой «Start» или активировать по первому клику |
| `chrome.fileSystem` → File API: потеря возможности записи | Среднее | Для сохранения файлов использовать `<a download>` + Blob URL |
| Горячие клавиши перехватываются браузером (Ctrl+P, Ctrl+S) | Низкое | Использовать `evt.preventDefault()` — уже делается в `keyboard.js` |
| Большой размер дампов (~2 МБ) при первой загрузке | Среднее (до PWA) | Сжатие gzip на сервере, lazy-loading дампов по требованию |
