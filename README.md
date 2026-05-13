# Поток — лендинг ИИ-агентства

Astro + Tailwind. SSR на Node. Готов под РФ: 152-ФЗ, Битрикс24, OpenRouter, YandexGPT резерв.

## Структура

```
src/
├── components/      Hero, Products, Cases, AiWidget и т.д.
├── content/blog/    Статьи в Markdown — добавляй .md, появятся автоматически
├── layouts/         Base.astro — общий layout
├── pages/
│   ├── index.astro       главная
│   ├── privacy.astro     политика
│   ├── blog/             блог
│   └── api/
│       ├── lead.ts       приём формы → Битрикс24 + Telegram
│       └── chat.ts       AI-виджет → OpenRouter + YandexGPT
├── styles/global.css
└── content/config.ts
```

## Запуск локально (3 команды)

```bash
npm install
cp .env.example .env    # затем заполни ключи
npm run dev
```

Открой http://localhost:4321

## Что заполнить в .env (по приоритету)

1. **BITRIX_WEBHOOK_URL** — без него форма не работает.
   - В Битрикс24: Разработчикам → Другое → Входящий вебхук → дать права `crm`
   - Скопируй URL вида `https://xxx.bitrix24.ru/rest/1/ABC123/`

2. **OPENROUTER_API_KEY** — для AI-виджета.
   - Регистрация: https://openrouter.ai
   - Закинь $5 — хватит на ~10 000 сообщений Haiku

3. **TELEGRAM_BOT_TOKEN + CHAT_ID** — мгновенные уведомления о лидах.
   - Создай бота через @BotFather
   - Свой chat_id узнай у @userinfobot

4. **YANDEX_API_KEY + FOLDER_ID** — резерв если OpenRouter упадёт.
   - https://cloud.yandex.ru → создать сервисный аккаунт → API ключ

## Билд для прода

```bash
npm run build       # собирает в /dist
npm run start       # запускает сервер на :4321
```

## Хостинг (РФ)

### Вариант 1: Selectel Cloud (рекомендую)

1. Регистрация: https://selectel.ru (юрлицо/самозанятый — нужно для договора)
2. Создать виртуальный сервер: Ubuntu 22.04, 1 CPU / 1 ГБ / 10 ГБ — ~250 ₽/мес
3. Подключиться по SSH:
   ```bash
   ssh root@IP_СЕРВЕРА
   ```
4. Установить Node.js 20 и nginx:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt-get install -y nodejs nginx
   ```
5. Загрузить проект:
   ```bash
   git clone <твой_репозиторий> /var/www/potok
   cd /var/www/potok
   npm install
   cp .env.example .env
   nano .env    # заполни
   npm run build
   ```
6. Запустить через pm2 (чтобы не падал):
   ```bash
   npm install -g pm2
   pm2 start npm --name potok -- run start
   pm2 startup && pm2 save
   ```
7. Настроить nginx + домен (см. ниже).

### Вариант 2: Timeweb Cloud — то же, проще панель.

### Вариант 3: Vercel — НЕ подходит для РФ (хостинг США + персональные данные).

## Nginx + домен + SSL

1. Купить домен на reg.ru (.ru — 199₽/год)
2. В DNS-настройках указать A-запись на IP сервера
3. На сервере:
   ```bash
   nano /etc/nginx/sites-available/potok
   ```
   Вставить:
   ```nginx
   server {
       listen 80;
       server_name potok.ai www.potok.ai;
       location / {
           proxy_pass http://localhost:4321;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
4. Включить:
   ```bash
   ln -s /etc/nginx/sites-available/potok /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```
5. SSL бесплатно через Let's Encrypt:
   ```bash
   apt install certbot python3-certbot-nginx
   certbot --nginx -d potok.ai -d www.potok.ai
   ```

## Юридические чеки перед запуском

- [ ] Подать уведомление в Роскомнадзор (10 мин, бесплатно): https://pd.rkn.gov.ru
- [ ] В `src/pages/privacy.astro` подставить реальные ФИО/ИНН в раздел "Контакты"
- [ ] Проверить, что обе галочки в форме работают (152-ФЗ обязательная, 38-ФЗ опциональная)

## Что доделать после первых лидов

- Я.Метрика — вставить счётчик в `src/layouts/Base.astro`
- Реальные кейсы вместо заглушек в `src/components/Cases.astro`
- Подключить email-рассылку (Unisender) к подтверждению заявки
- Подключить Яндекс.Календарь к выбору слота
- Скачать Onest локально и подключить через @font-face — Google Fonts тормозит в РФ

## Структура продаж

1. Лид с формы → Битрикс24 + Telegram (мгновенно)
2. Ты звонишь/пишешь в течение часа
3. 30-минутный бриф → расчёт стоимости
4. Договор → предоплата 50%
5. Запуск за 2-3 недели

Цены ориентир: чат-агент 80-150к за внедрение + 15-30к/мес, голосовой 150-300к + минуты.
