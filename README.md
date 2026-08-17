# Unicorns & Rainbows (js13k)

Минималистичная 3D веб-игра для конкурса [js13k](https://js13kgames.com/) — весь зип-архив должен
укладываться в **13 312 байт**. Тема конкурса: **Unicorns and Rainbows**. Концепт пока не финальный.

Технологии: чистый JS (без фреймворков и сторонних библиотек), WebGL, DOM-оверлей для UI.

## Документация

- [docs/concept.md](docs/concept.md) — концепт игры, тема, статус
- [docs/architecture.md](docs/architecture.md) — организация кода: стейт-машина, ECS-лайт, конвенции
- [docs/camera.md](docs/camera.md) — орбитальная камера и её ограничители по сценам
- [docs/ui.md](docs/ui.md) — система панелей/кнопок (DOM-хак поверх WebGL)
- [docs/build.md](docs/build.md) — сборка, минификация, контроль размера

Инструкции для Claude Code — в [.claude/CLAUDE.md](.claude/CLAUDE.md).

## Запуск (разработка)

Просто открыть `html/index.html` в браузере — сервер не нужен, скрипты подключены отдельными
файлами в `html/js/`, ассетов с внешних доменов нет.

## Сборка релиза

```
python html/packed/build.py         # склеить html/js/*.js в один bundle.js + packed/index.html (неминифицированный)
# вручную: скормить html/packed/bundle.js внешнему минификатору,
# результат сохранить в html/packed/bundle.min.js
python html/packed/build.py --pack  # собрать финальный packed/index.html из bundle.min.js + dist/game.zip + отчёт по размеру
```

Подробности — в [docs/build.md](docs/build.md).

Mefistofel
mfstfl@gmail.com
