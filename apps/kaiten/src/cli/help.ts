export const HELP_TEXT = `
Kaiten CLI - Полнофункциональный CLI для Kaiten API

Использование:
  kaiten <command> [args]

Команды для карточек:
  cards                            - Список карточек (JSON)
  card <id>                        - Детали карточки (JSON)
  simple                           - Список карточек (человекочитаемый)
  card-simple <id>                 - Детали карточки (человекочитаемый)
  create '<json>'                  - Создать карточку
  update <id> '<json>'             - Обновить карточку
  delete <id>                      - Удалить карточку
  move <id> <column_id> [lane_id]  - Переместить карточку
  assign <id> <user_id>            - Назначить исполнителя

Команды для подзадач:
  subtask create <parent_id> <title>  - Создать подзадачу
  subtask list <parent_id>            - Список подзадач

Команды для комментариев:
  comment add <card_id> <text>   - Добавить комментарий
  comment list <card_id>          - Список комментариев

Команды для навигации:
  board [space_id]                - Список досок
  column <board_id>               - Список колонок
  user [query]                    - Найти пользователя

Команды для меток:
  tag add <card_id> <tag_name>   - Добавить метку
  tag remove <card_id> <tag_name> - Удалить метку
  tag list                       - Список карточек с метками
  tag filter <tag_name> [-m]     - Фильтр по метке (-m = минимальный JSON)

Команды для поиска:
  find <tag_name> [-m] [--board=<id|name>]  - Поиск по метке (-m = минимальный JSON, --board = фильтр по ID или названию доски)

MCP-сервер:
  init                           - Сохранить credentials из текущего env/.env в ~/.kaiten/config
  mcp                            - Запустить stdio MCP-сервер для ИИ-агентов

Команды для Git:
  git-branch <card_id>             - Создать ветку для задачи
  git-checkout <card_id>           - Переключиться на ветку задачи
  git-commit <card_id> [msg]       - Закоммитить изменения (msg по умолчанию: "Work in progress")
  git-status                     - Показать статус git
  git-push <card_id>              - Запушить ветку

Флаги оптимизации:
  --minimal, -m                  - Минимальный JSON (без отступов, короткие ключи)
  --board=<id|name>             - Фильтр по доске (ID или название)

Примеры:
  kaiten cards
  kaiten create '{"title":"Новая задача","boardId":123,"columnId":456}'
  kaiten move 789 456
  kaiten comment add 789 "Текст комментария"
  kaiten git-branch 45791547
        `;
