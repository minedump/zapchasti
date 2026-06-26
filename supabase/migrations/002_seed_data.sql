-- ============================================================
-- 002_seed_data.sql
-- Default template and initial data
-- ============================================================

-- Default questionnaire template
INSERT INTO public.templates (version, schema, prompt, is_active)
VALUES (
  1,
  '{
    "fields": [
      {"key": "brand", "label": "Марка автомобиля", "description": "Марка автомобиля (Toyota, BMW, Mercedes и т.д.)", "required": true, "type": "text"},
      {"key": "model", "label": "Модель", "description": "Модель автомобиля (Camry, X5, E-Class и т.д.)", "required": true, "type": "text"},
      {"key": "year", "label": "Год выпуска", "description": "Год выпуска автомобиля", "required": true, "type": "text"},
      {"key": "vin", "label": "VIN-номер", "description": "VIN-номер автомобиля (17 символов)", "required": false, "type": "text"},
      {"key": "part", "label": "Запчасть", "description": "Название нужной запчасти", "required": true, "type": "text"},
      {"key": "condition", "label": "Состояние", "description": "Новая или б/у запчасть", "required": false, "type": "select", "options": ["новая", "б/у", "любое"]},
      {"key": "budget", "label": "Бюджет", "description": "Максимальный бюджет в рублях", "required": false, "type": "text"},
      {"key": "urgency", "label": "Срочность", "description": "Как срочно нужна запчасть", "required": false, "type": "select", "options": ["срочно", "в течение недели", "не срочно"]},
      {"key": "city", "label": "Город", "description": "Город доставки", "required": false, "type": "text"},
      {"key": "notes", "label": "Дополнительно", "description": "Любые дополнительные сведения", "required": false, "type": "text"}
    ]
  }',
  'Ты — помощник по подбору автозапчастей. Собери информацию у клиента по одному вопросу за раз.',
  TRUE
);
