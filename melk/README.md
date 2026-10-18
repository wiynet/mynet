# Мельк

Короткие вертикальные видео: лента «Для вас» и «Подписки», лайки, комментарии, избранное, профили и публикация роликов.

- Сайт: https://wiynet.github.io/mynet/melk/
- База: Supabase-проект `mynet`, таблицы `melk_*`, видео в бакете `melk-videos`.
- Вход по нику и паролю без писем. Ник превращается в служебный адрес `ник@melk.local`. Аккаунты общие с mynet: туда можно войти той же почтой или ником.

## Файлы

- `index.html` — разметка
- `style.css` — стили
- `app.js` — вся логика и запросы к Supabase

## Модерация

Чтобы дать человеку право удалять любые ролики и комментарии, добавьте его в `melk_admins`:

```sql
insert into public.melk_admins (user_id)
select id from public.melk_profiles where username = 'ник';
```

## Обязательная настройка

В Supabase: Authentication → Sign In / Providers → Email → выключить **Confirm email**. Иначе регистрация по нику не заработает.
