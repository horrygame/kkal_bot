import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

// ========== КОНФИГУРАЦИЯ ==========
const token = process.env.TELEGRAM_BOT_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;
const port = process.env.PORT || 3000;
const appUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;

if (!token) {
  console.error('❌ Ошибка: TELEGRAM_BOT_TOKEN не установлен');
  console.error('Создайте бота через @BotFather');
  process.exit(1);
}

// ========== ИНИЦИАЛИЗАЦИЯ OPENAI ==========
let openai = null;
if (openaiApiKey) {
  try {
    const { default: OpenAI } = await import('openai');
    openai = new OpenAI({ 
      apiKey: openaiApiKey,
      timeout: 30000
    });
    console.log('✅ Нейросеть OpenAI подключена');
  } catch (error) {
    console.log('⚠️  OpenAI не подключен:', error.message);
    openai = null;
  }
} else {
  console.log('ℹ️  OpenAI API ключ не найден. Используется локальная база');
  openai = null;
}

// ========== ИНИЦИАЛИЗАЦИЯ БОТА ==========
let bot;
try {
  bot = new TelegramBot(token, { polling: true });
  console.log('🤖 Бот инициализирован');
} catch (error) {
  console.error('❌ Ошибка инициализации бота:', error.message);
  process.exit(1);
}

// ========== БАЗА ДАННЫХ ==========
const userData = new Map();
const foodDatabase = {
  'яблоко': { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
  'банан': { calories: 96, protein: 1.1, fat: 0.2, carbs: 23 },
  // ... (полная база продуктов как в предыдущем коде)
};

// ========== УЛУЧШЕННАЯ НЕЙРОСЕТЬ ==========
async function askAIEnhanced(foodText) {
  if (!openai) return null;
  
  try {
    const prompt = `Ты опытный диетолог-нутрициолог с 20-летним стажем. Твоя задача - максимально точно оценить пищевую ценность блюда.

ОПИСАНИЕ ОТ ПОЛЬЗОВАТЕЛЯ: "${foodText}"

АНАЛИЗИРУЙ СЛЕДУЮЩИЕ АСПЕКТЫ:
1. Основные ингредиенты и их примерное количество
2. Способ приготовления (варка, жарка, запекание и т.д.)
3. Дополнительные компоненты (соусы, масло, специи)
4. Типичный вес порции для такого блюда

РАССЧИТАЙ И ВЕРНИ В СТРОГОМ JSON ФОРМАТЕ:
{
  "foodName": "точное название блюда на русском",
  "quantity": число в граммах (реалистичный вес порции),
  "calories": точное число калорий для этого количества,
  "protein": число грамм белков (с округлением до 0.1),
  "fat": число грамм жиров (с округлением до 0.1),
  "carbs": число грамм углеводов (с округлением до 0.1),
  "confidence": число от 0.1 до 1.0 (уверенность в оценке),
  "ingredients": ["список", "основных", "ингредиентов"],
  "notes": "короткое пояснение расчета"
}

ПРАВИЛА РАСЧЕТА:
1. Если указано количество - используй его, иначе оцени стандартную порцию
2. Учитывай способ приготовления:
   - Жареные блюда: +20% калорий за счет масла
   - Запеченные: +5-10% калорий
   - Вареные: калории ингредиентов без изменений
3. Для сложных блюд суммируй все компоненты
4. Будь максимально реалистичным в оценках
5. Если сомневаешься - снижай confidence

ПРИМЕРЫ:
Ввод: "Пицца маргарита 2 куска"
Вывод: {"foodName": "Пицца Маргарита", "quantity": 300, "calories": 690, "protein": 28, "fat": 24, "carbs": 88, "confidence": 0.85, "ingredients": ["тесто", "сыр моцарелла", "томатный соус", "базилик"], "notes": "2 куска ≈ 300г, тесто 200г, сыр 80г, соус 20г"}

Ввод: "Кофе латте с сиропом"
Вывод: {"foodName": "Кофе латте с сиропом", "quantity": 300, "calories": 180, "protein": 9, "fat": 7, "carbs": 22, "confidence": 0.8, "ingredients": ["кофе", "молоко", "сироп"], "notes": "Молоко 250мл, сироп 20мл"}

Ввод: "Салат из помидоров и огурцов с маслом"
Вывод: {"foodName": "Салат овощной с маслом", "quantity": 200, "calories": 120, "protein": 2, "fat": 10, "carbs": 8, "confidence": 0.9, "ingredients": ["помидоры", "огурцы", "растительное масло"], "notes": "Овощи 180г, масло 20г (1 столовая ложка)"}

ВЕРНИ ТОЛЬКО JSON, БЕЗ ЛИШНЕГО ТЕКСТА.`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4", // Используем GPT-4 для большей точности
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2, // Очень низкая температура для консистентности
      max_tokens: 800,
      response_format: { type: "json_object" } // Просим JSON формат
    });

    const response = completion.choices[0].message.content.trim();
    
    try {
      const parsed = JSON.parse(response);
      
      // Валидация и нормализация ответа
      if (parsed && 
          parsed.calories && 
          parsed.quantity && 
          parsed.confidence &&
          parsed.calories > 0 &&
          parsed.calories < 5000) {
        
        // Округляем значения
        parsed.calories = Math.round(parsed.calories);
        parsed.protein = Math.round(parsed.protein * 10) / 10 || 0;
        parsed.fat = Math.round(parsed.fat * 10) / 10 || 0;
        parsed.carbs = Math.round(parsed.carbs * 10) / 10 || 0;
        parsed.confidence = Math.round(parsed.confidence * 100) / 100;
        
        console.log('✅ AI анализ:', {
          блюдо: parsed.foodName,
          граммы: parsed.quantity,
          калории: parsed.calories,
          уверенность: `${parsed.confidence * 100}%`
        });
        
        return parsed;
      }
    } catch (parseError) {
      console.log('❌ Ошибка парсинга AI:', parseError.message);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Ошибка AI API:', error.message);
    return null;
  }
}

// Улучшенный анализатор ввода с ручной корректировкой
async function analyzeFoodInputEnhanced(text) {
  const lowerText = text.toLowerCase().trim();
  console.log(`🔍 Анализируем: "${text}"`);
  
  // Шаг 1: Извлекаем количество
  let quantity = 100;
  let unit = 'г';
  
  const quantityPatterns = [
    /(\d+)\s*(г|грамм|gram|g)\b/i,
    /(\d+)\s*(мл|ml|миллилитр)\b/i,
    /(\d+)\s*(л|литр|liter)\b/i,
    /(\d+)\s*(кг|kg|килограмм)\b/i,
    /(\d+)\s*(шт|штук|piece|pcs)\b/i,
    /(\d+)\s*(порци|serving|portion)\b/i,
    /(\d+)x(\d+)/i,
    /(\d+)/i
  ];
  
  for (const pattern of quantityPatterns) {
    const match = text.match(pattern);
    if (match) {
      quantity = parseInt(match[1]);
      if (match[2]) unit = match[2].toLowerCase();
      
      // Конвертация единиц
      if (['кг', 'kg', 'литр', 'л', 'liter'].includes(unit)) {
        quantity *= 1000;
        unit = 'г';
      } else if (['шт', 'штук', 'piece', 'pcs'].includes(unit)) {
        // Автоматическая оценка веса для штучных продуктов
        if (lowerText.includes('яблок') || lowerText.includes('банан') || lowerText.includes('апельсин')) {
          quantity *= 150;
        } else if (lowerText.includes('яйц') || lowerText.includes('egg')) {
          quantity *= 50;
        } else if (lowerText.includes('хлеб') || lowerText.includes('булк')) {
          quantity *= 30;
        } else if (lowerText.includes('печенье') || lowerText.includes('cookie')) {
          quantity *= 15;
        } else {
          quantity *= 100;
        }
        unit = 'г';
      }
      break;
    }
  }
  
  // Шаг 2: Проверяем ввод на "бред" (неразборчивый текст)
  const isGibberish = checkIfGibberish(text);
  
  // Шаг 3: Ищем в локальной базе
  let foundInDb = false;
  let dbResult = null;
  
  for (const [foodName, nutrition] of Object.entries(foodDatabase)) {
    if (lowerText.includes(foodName.toLowerCase()) || 
        foodName.toLowerCase().includes(lowerText) ||
        text.toLowerCase().includes(foodName.toLowerCase())) {
      
      foundInDb = true;
      const calories = Math.round((nutrition.calories * quantity) / 100);
      
      dbResult = {
        foodName: foodName.charAt(0).toUpperCase() + foodName.slice(1),
        quantity: quantity,
        unit: unit,
        calories: calories,
        protein: Math.round((nutrition.protein * quantity) / 100 * 10) / 10,
        fat: Math.round((nutrition.fat * quantity) / 100 * 10) / 10,
        carbs: Math.round((nutrition.carbs * quantity) / 100 * 10) / 10,
        source: '📚 База данных',
        confidence: 0.95,
        ingredients: [foodName],
        notes: 'Точные данные из базы',
        isGibberish: false,
        needsManualCorrection: false
      };
      break;
    }
  }
  
  if (foundInDb) {
    console.log(`✅ Найдено в базе: ${dbResult.foodName}`);
    return dbResult;
  }
  
  // Шаг 4: Используем улучшенный AI если доступен
  if (openai && !isGibberish) {
    console.log('🧠 Обращаемся к ИИ для детального анализа...');
    try {
      const aiResult = await askAIEnhanced(text);
      
      if (aiResult && aiResult.confidence >= 0.5) {
        console.log(`✅ ИИ определил: ${aiResult.foodName}, ${aiResult.calories} ккал`);
        
        return {
          foodName: aiResult.foodName,
          quantity: aiResult.quantity || quantity,
          unit: 'г',
          calories: aiResult.calories,
          protein: aiResult.protein || 0,
          fat: aiResult.fat || 0,
          carbs: aiResult.carbs || 0,
          source: '🧠 Искусственный интеллект',
          confidence: aiResult.confidence,
          ingredients: aiResult.ingredients || [],
          notes: aiResult.notes || 'Рассчитано нейросетью',
          isGibberish: false,
          needsManualCorrection: aiResult.confidence < 0.7
        };
      }
    } catch (aiError) {
      console.log('❌ ИИ не ответил:', aiError.message);
    }
  }
  
  // Шаг 5: Если AI не сработал или ввод неразборчивый
  console.log('📝 Используем общую оценку...');
  
  const estimatedCalories = estimateCaloriesFromText(text, quantity);
  
  return {
    foodName: text.substring(0, 40),
    quantity: quantity,
    unit: unit,
    calories: estimatedCalories,
    protein: Math.round(quantity * 0.1),
    fat: Math.round(quantity * 0.08),
    carbs: Math.round(quantity * 0.2),
    source: '📊 Примерная оценка',
    confidence: 0.4,
    ingredients: [],
    notes: 'Оценка на основе общего анализа текста',
    isGibberish: isGibberish,
    needsManualCorrection: true
  };
}

// Функция проверки на "бред"
function checkIfGibberish(text) {
  const textLength = text.length;
  
  // Слишком короткий текст
  if (textLength < 3) return true;
  
  // Проверяем наличие цифр или известных единиц измерения
  const hasNumbers = /\d/.test(text);
  const hasUnits = /(г|грамм|мл|шт|кг|литр)/i.test(text);
  const hasFoodKeywords = /(еда|съел|ел|завтрак|обед|ужин|перекус|блюдо)/i.test(text);
  
  // Если есть цифры или единицы измерения - вероятно не бред
  if (hasNumbers || hasUnits || hasFoodKeywords) return false;
  
  // Слишком много бессмысленных символов
  const specialChars = (text.match(/[^a-zA-Zа-яА-Я0-9\s]/g) || []).length;
  if (specialChars > textLength * 0.3) return true;
  
  // Проверяем на повторяющиеся символы (типа "ааааа")
  const repeatingChars = /(.)\1{4,}/.test(text);
  if (repeatingChars) return true;
  
  return false;
}

// Функция оценки калорий по тексту
function estimateCaloriesFromText(text, quantity) {
  const lowerText = text.toLowerCase();
  
  // Весовые коэффициенты для разных категорий
  const categories = [
    { keywords: ['салат', 'овощ', 'огурец', 'помидор', 'капуст'], caloriesPer100g: 30 },
    { keywords: ['фрукт', 'яблок', 'банан', 'апельсин', 'персик'], caloriesPer100g: 60 },
    { keywords: ['суп', 'борщ', 'щи', 'бульон'], caloriesPer100g: 50 },
    { keywords: ['мясо', 'куриц', 'говядин', 'свинин', 'котлет'], caloriesPer100g: 200 },
    { keywords: ['рыб', 'лосос', 'тунец', 'креветк'], caloriesPer100g: 150 },
    { keywords: ['рис', 'гречк', 'макарон', 'картош', 'пюре'], caloriesPer100g: 130 },
    { keywords: ['хлеб', 'булк', 'тост', 'сухар'], caloriesPer100g: 250 },
    { keywords: ['сыр', 'творог', 'йогурт', 'кефир', 'молок'], caloriesPer100g: 100 },
    { keywords: ['шоколад', 'печенье', 'торт', 'сладк', 'конфет'], caloriesPer100g: 400 },
    { keywords: ['орех', 'семечк', 'арахис'], caloriesPer100g: 600 },
    { keywords: ['масло', 'майонез', 'соус'], caloriesPer100g: 800 },
    { keywords: ['пицц', 'бургер', 'хот-дог'], caloriesPer100g: 280 },
    { keywords: ['кофе', 'чай', 'напиток'], caloriesPer100g: 10 },
    { keywords: ['алкоголь', 'пиво', 'вино', 'водк'], caloriesPer100g: 200 }
  ];
  
  let caloriesPer100g = 100; // По умолчанию
  
  for (const category of categories) {
    for (const keyword of category.keywords) {
      if (lowerText.includes(keyword)) {
        caloriesPer100g = category.caloriesPer100g;
        break;
      }
    }
    if (caloriesPer100g !== 100) break;
  }
  
  return Math.round((caloriesPer100g * quantity) / 100);
}

// ========== EXPRESS СЕРВЕР ==========
const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'calorie-bot-enhanced',
    timestamp: new Date().toISOString(),
    users: userData.size,
    aiEnabled: !!openai
  });
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Calorie Counter AI+</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .container { max-width: 600px; margin: 0 auto; }
        .features { text-align: left; margin: 30px 0; }
        .feature { margin: 15px 0; padding: 10px; background: #f0f0f0; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🍎🤖 Calorie Counter AI+</h1>
        <p>Умный бот с улучшенной нейросетью и ручной корректировкой</p>
        
        <div class="features">
          <div class="feature">✅ Улучшенная нейросеть GPT-4</div>
          <div class="feature">🎯 Ручная корректировка калорий</div>
          <div class="feature">📊 Детальный анализ БЖУ</div>
          <div class="feature">🔄 KeepAlive система</div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ========== ОБРАБОТЧИКИ КОМАНД ==========

// Хранилище для временных данных о корректировке
const pendingCorrections = new Map();

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name;
  
  const welcome = `
🍎 *Привет, ${name}!* 🤖

Я — продвинутый бот для подсчета калорий с *улучшенной нейросетью GPT-4*!

*✨ Новые возможности:*
• Улучшенная точность подсчета калорий
• Детальный анализ состава блюд
• *Ручная корректировка* если оценка неточная
• Интеллектуальное распознавание "бредовых" сообщений

*📋 Основные команды:*
/setgoal - Установить дневную норму
/add - Добавить съеденную еду
/today - Статистика за сегодня
/clear - Сбросить данные за день
/kkal - Указать калории вручную
/help - Подробная помощь

*🎯 Начните с установки цели:*
/setgoal
  `;
  
  bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
});

// /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const help = `
*🤖 ПОМОЩЬ ПО ИСПОЛЬЗОВАНИЮ БОТА*

*🎯 ОСНОВНЫЕ КОМАНДЫ:*
/setgoal - установить дневную норму калорий
/add - добавить съеденную еду
/today - статистика за сегодня
/clear - сбросить данные за день
/foods - список продуктов в базе

*🆕 НОВАЯ КОМАНДА /kkal:*
Если бот неправильно определил калории, вы можете:
1. Написать /kkal [количество калорий] [название блюда]
   Пример: /kkal 350 Пицца Маргарита
2. Или использовать кнопку "Указать свои калории"

*🧠 УЛУЧШЕННАЯ НЕЙРОСЕТЬ:*
• Использует GPT-4 для максимальной точности
• Анализирует состав и способ приготовления
• Показывает уверенность в оценке
• Определяет "бредовые" сообщения

*🎯 ДЛЯ ТОЧНОСТИ:*
• Указывайте количество и единицы измерения
• Описывайте способ приготовления
• Для сложных блюд используйте /kkal для точного ввода
  `;
  
  bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
});

// /kkal - ручной ввод калорий
bot.onText(/\/kkal(?:@\w+)?\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1].trim();
  
  // Парсим ввод: [калории] [название]
  const matchResult = input.match(/^(\d+)\s+(.+)$/);
  
  if (!matchResult) {
    bot.sendMessage(chatId, 
      `❌ *Неверный формат!*\n\n` +
      `Используйте: /kkal [калории] [название блюда]\n` +
      `Пример: /kkal 350 Пицца Маргарита\n` +
      `Или: /kkal 120 Кофе с молоком`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const calories = parseInt(matchResult[1]);
  const foodName = matchResult[2];
  
  if (calories <= 0 || calories > 5000) {
    bot.sendMessage(chatId, '❌ Укажите реалистичное количество калорий (1-5000)');
    return;
  }
  
  const user = userData.get(chatId);
  if (!user || !user.dailyGoal) {
    bot.sendMessage(chatId, 'Сначала установите норму: /setgoal');
    return;
  }
  
  // Сохраняем данные
  user.consumed = (user.consumed || 0) + calories;
  user.foods = user.foods || [];
  user.foods.push({
    name: foodName,
    calories: calories,
    quantity: 100, // предполагаем 100г
    unit: 'г',
    protein: 0,
    fat: 0,
    carbs: 0,
    time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    source: '✍️ Ручной ввод',
    addedAt: new Date().toISOString()
  });
  
  userData.set(chatId, user);
  
  // Отправляем результат
  const remaining = Math.max(0, user.dailyGoal - user.consumed);
  const percent = Math.round((user.consumed / user.dailyGoal) * 100);
  
  let response = `✅ *Добавлено вручную!*\n\n`;
  response += `🍽️ *${foodName}*\n`;
  response += `🔥 ${calories} ккал\n`;
  response += `📏 Примерное количество: 100г\n`;
  response += `📊 *Итого за день:* ${user.consumed}/${user.dailyGoal} ккал\n`;
  response += `📉 *Осталось:* ${remaining} ккал\n`;
  response += `📈 *Прогресс:* ${percent}%\n\n`;
  response += `✍️ *Калории указаны вручную*`;
  
  bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
});

// /setgoal
bot.onText(/\/setgoal/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId) || {};
  
  bot.sendMessage(chatId, '🎯 Введите дневную норму калорий:');
  user.waitingFor = 'goal';
  userData.set(chatId, user);
});

// /add
bot.onText(/\/add/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (!user || !user.dailyGoal) {
    bot.sendMessage(chatId, 'Сначала установите норму: /setgoal');
    return;
  }
  
  bot.sendMessage(chatId, 
    `🍽️ *Что вы съели?*\n\n` +
    `Опишите блюдо или продукты:\n\n` +
    `*Примеры:*\n` +
    `• "200г гречки с куриной грудкой"\n` +
    `• "Салат Цезарь 300г"\n` +
    `• "Омлет из 2 яиц с сыром"\n` +
    `• "Чашка кофе с молоком 200мл"`,
    { parse_mode: 'Markdown' }
  );
  
  user.waitingFor = 'food';
  userData.set(chatId, user);
});

// /today
bot.onText(/\/today/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (!user || !user.dailyGoal) {
    bot.sendMessage(chatId, 'Сначала установите норму: /setgoal');
    return;
  }
  
  const consumed = user.consumed || 0;
  const foods = user.foods || [];
  const remaining = Math.max(0, user.dailyGoal - consumed);
  const percent = Math.round((consumed / user.dailyGoal) * 100);
  
  let message = `📊 *Статистика за сегодня*\n\n`;
  message += `🎯 Дневная норма: *${user.dailyGoal}* ккал\n`;
  message += `🍽️ Съедено: *${consumed}* ккал\n`;
  message += `✅ Осталось: *${remaining}* ккал\n`;
  message += `📈 Выполнено: *${percent}%*\n\n`;
  
  if (foods.length > 0) {
    message += `*Съеденная еда:*\n`;
    foods.forEach((food, i) => {
      const time = food.time ? ` (${food.time})` : '';
      const source = food.source ? ` ${food.source}` : '';
      message += `${i+1}. ${food.name} - *${food.calories}* ккал${time}${source}\n`;
    });
  } else {
    message += `🍽️ *Еще ничего не съедено*\n`;
  }
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// /clear
bot.onText(/\/clear/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (user) {
    user.consumed = 0;
    user.foods = [];
    userData.set(chatId, user);
  }
  
  bot.sendMessage(chatId, '✅ Данные за день очищены!');
});

// Обработка сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const userName = msg.from.first_name;
  
  if (text.startsWith('/')) return;
  
  console.log(`[${new Date().toLocaleTimeString()}] ${userName}: ${text}`);
  
  let user = userData.get(chatId) || {};
  user.userId = userId;
  user.userName = userName;
  user.lastActive = new Date().toISOString();
  
  if (user.waitingFor === 'goal') {
    const goal = parseInt(text.replace(/[^\d]/g, ''));
    
    if (isNaN(goal) || goal <= 0 || goal > 10000) {
      bot.sendMessage(chatId, '❌ Введите число от 100 до 10000 ккал');
      return;
    }
    
    user.dailyGoal = goal;
    user.consumed = 0;
    user.foods = [];
    user.waitingFor = null;
    
    userData.set(chatId, user);
    
    bot.sendMessage(chatId, 
      `✅ Норма установлена: *${goal} ккал*\n\n` +
      `Теперь добавляйте еду командой /add`,
      { parse_mode: 'Markdown' }
    );
    
  } else if (user.waitingFor === 'food' || (!user.waitingFor && user.dailyGoal)) {
    
    if (!text || text.length < 2) {
      bot.sendMessage(chatId, 'Пожалуйста, опишите что вы съели');
      return;
    }
    
    bot.sendChatAction(chatId, 'typing');
    
    try {
      const analysis = await analyzeFoodInputEnhanced(text);
      
      // Сохраняем временные данные для возможной корректировки
      pendingCorrections.set(chatId, {
        text: text,
        analysis: analysis,
        timestamp: Date.now()
      });
      
      // Формируем сообщение с результатом
      let response = '';
      
      if (analysis.isGibberish) {
        response = `🤔 *Похоже на "бред" или неразборчивый текст*\n\n`;
        response += `Я не могу точно определить что это за еда.\n\n`;
        response += `📝 *Что делать?*\n`;
        response += `1. Перефразируйте описание\n`;
        response += `2. Используйте команду /kkal для ручного ввода\n`;
        response += `3. Напишите более понятное описание\n\n`;
        response += `*Пример:* "2 яйца и кофе" вместо "яичко и кофейный напиток"`;
      } else {
        response = `🍽️ *${analysis.foodName}*\n`;
        response += `📏 ${analysis.quantity}${analysis.unit}\n`;
        response += `🔥 *${analysis.calories} ккал*\n\n`;
        
        if (analysis.protein > 0 || analysis.fat > 0 || analysis.carbs > 0) {
          response += `🥩 Белки: ${analysis.protein.toFixed(1)}г\n`;
          response += `🥑 Жиры: ${analysis.fat.toFixed(1)}г\n`;
          response += `🍚 Углеводы: ${analysis.carbs.toFixed(1)}г\n\n`;
        }
        
        response += `${analysis.source}\n`;
        
        if (analysis.confidence) {
          const confidencePercent = Math.round(analysis.confidence * 100);
          let confidenceText = '';
          if (confidencePercent >= 80) confidenceText = '✅ Высокая точность';
          else if (confidencePercent >= 60) confidenceText = '⚠️ Средняя точность';
          else confidenceText = '❓ Низкая точность';
          
          response += `${confidenceText} (${confidencePercent}%)\n\n`;
        }
        
        if (analysis.ingredients && analysis.ingredients.length > 0) {
          response += `*Состав:* ${analysis.ingredients.slice(0, 3).join(', ')}\n`;
        }
        
        if (analysis.notes) {
          response += `*Примечание:* ${analysis.notes}\n\n`;
        }
        
        // Добавляем предупреждение если нужна корректировка
        if (analysis.needsManualCorrection || analysis.confidence < 0.7) {
          response += `⚠️ *Внимание!*\n`;
          response += `Оценка может быть неточной. Если это так:\n`;
        }
      }
      
      // Добавляем кнопки для действий
      const options = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Подтвердить и добавить',
                callback_data: `confirm_${analysis.calories}`
              }
            ],
            [
              {
                text: '✏️ Указать свои калории',
                callback_data: 'manual_calories'
              }
            ],
            [
              {
                text: '📝 Использовать /kkal',
                callback_data: 'use_kkal'
              }
            ]
          ]
        }
      };
      
      if (analysis.isGibberish) {
        options.reply_markup.inline_keyboard = [
          [
            {
              text: '✏️ Указать калории вручную',
              callback_data: 'manual_calories'
            }
          ],
          [
            {
              text: '📝 Использовать команду /kkal',
              callback_data: 'use_kkal'
            }
          ]
        ];
      }
      
      bot.sendMessage(chatId, response, options);
      
    } catch (error) {
      console.error('Ошибка обработки:', error);
      bot.sendMessage(chatId, '❌ Ошибка. Попробуйте еще раз или используйте /kkal');
    }
    
  } else {
    if (!user.dailyGoal) {
      bot.sendMessage(chatId, 
        `👋 *Привет!*\n\n` +
        `Начните с установки дневной нормы:\n` +
        `/setgoal`,
        { parse_mode: 'Markdown' }
      );
    } else {
      bot.sendMessage(chatId, 
        `Используйте /add чтобы добавить еду\n` +
        `Или /today чтобы посмотреть статистику`
      );
    }
    
    userData.set(chatId, user);
  }
});

// Обработка callback-кнопок
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;
  const messageId = msg.message_id;
  
  try {
    const pending = pendingCorrections.get(chatId);
    
    if (!pending) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Данные устарели. Попробуйте снова.' });
      return;
    }
    
    const analysis = pending.analysis;
    const user = userData.get(chatId);
    
    if (!user || !user.dailyGoal) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Сначала установите норму /setgoal' });
      return;
    }
    
    if (data.startsWith('confirm_')) {
      const calories = parseInt(data.split('_')[1]);
      
      // Сохраняем данные
      user.consumed = (user.consumed || 0) + calories;
      user.foods = user.foods || [];
      user.foods.push({
        name: analysis.foodName,
        quantity: analysis.quantity,
        unit: analysis.unit,
        calories: calories,
        protein: analysis.protein || 0,
        fat: analysis.fat || 0,
        carbs: analysis.carbs || 0,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        source: analysis.source,
        confidence: analysis.confidence,
        addedAt: new Date().toISOString()
      });
      
      userData.set(chatId, user);
      
      // Удаляем временные данные
      pendingCorrections.delete(chatId);
      
      // Обновляем сообщение
      const remaining = Math.max(0, user.dailyGoal - user.consumed);
      const percent = Math.round((user.consumed / user.dailyGoal) * 100);
      
      let response = `✅ *Добавлено!*\n\n`;
      response += `🍽️ ${analysis.foodName}\n`;
      response += `📏 ${analysis.quantity}${analysis.unit}\n`;
      response += `🔥 ${calories} ккал\n\n`;
      response += `📊 *Итого за день:* ${user.consumed}/${user.dailyGoal} ккал\n`;
      response += `📉 *Осталось:* ${remaining} ккал\n`;
      response += `📈 *Прогресс:* ${percent}%\n\n`;
      response += `${analysis.source}`;
      
      bot.editMessageText(response, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
      
      bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Еда добавлена!' });
      
    } else if (data === 'manual_calories') {
      // Запрашиваем ручной ввод калорий
      bot.sendMessage(chatId, 
        `✍️ *Укажите калории вручную*\n\n` +
        `Для блюда: *${analysis.foodName}*\n` +
        `Введите количество калорий:\n\n` +
        `Пример: 350`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '150 ккал', callback_data: 'set_150' },
                { text: '250 ккал', callback_data: 'set_250' },
                { text: '350 ккал', callback_data: 'set_350' }
              ],
              [
                { text: '450 ккал', callback_data: 'set_450' },
                { text: '550 ккал', callback_data: 'set_550' },
                { text: 'Другое', callback_data: 'other_calories' }
              ]
            ]
          }
        }
      );
      
      bot.answerCallbackQuery(callbackQuery.id);
      
    } else if (data === 'use_kkal') {
      bot.sendMessage(chatId, 
        `📝 *Используйте команду /kkal*\n\n` +
        `Формат: /kkal [калории] [название]\n\n` +
        `Примеры:\n` +
        `/kkal 350 Пицца Маргарита\n` +
        `/kkal 120 Кофе с молоком\n` +
        `/kkal 250 Салат Цезарь`,
        { parse_mode: 'Markdown' }
      );
      
      bot.answerCallbackQuery(callbackQuery.id);
      
    } else if (data.startsWith('set_')) {
      const calories = parseInt(data.split('_')[1]);
      
      // Сохраняем с ручными калориями
      user.consumed = (user.consumed || 0) + calories;
      user.foods = user.foods || [];
      user.foods.push({
        name: analysis.foodName,
        quantity: analysis.quantity,
        unit: analysis.unit,
        calories: calories,
        protein: analysis.protein || 0,
        fat: analysis.fat || 0,
        carbs: analysis.carbs || 0,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        source: '✍️ Ручная корректировка',
        addedAt: new Date().toISOString()
      });
      
      userData.set(chatId, user);
      pendingCorrections.delete(chatId);
      
      const remaining = Math.max(0, user.dailyGoal - user.consumed);
      const percent = Math.round((user.consumed / user.dailyGoal) * 100);
      
      let response = `✅ *Добавлено с ручной корректировкой!*\n\n`;
      response += `🍽️ ${analysis.foodName}\n`;
      response += `📏 ${analysis.quantity}${analysis.unit}\n`;
      response += `🔥 ${calories} ккал\n\n`;
      response += `📊 *Итого за день:* ${user.consumed}/${user.dailyGoal} ккал\n`;
      response += `📉 *Осталось:* ${remaining} ккал\n`;
      response += `📈 *Прогресс:* ${percent}%\n\n`;
      response += `✍️ *Калории указаны вручную*`;
      
      bot.editMessageText(response, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
      
      bot.answerCallbackQuery(callbackQuery.id, { text: `✅ Установлено ${calories} ккал` });
      
    } else if (data === 'other_calories') {
      bot.sendMessage(chatId, 
        `✍️ *Введите точное количество калорий:*\n\n` +
        `Для блюда: ${analysis.foodName}\n\n` +
        `Просто напишите число (например: 425)`,
        { parse_mode: 'Markdown' }
      );
      
      // Сохраняем что ожидаем ручной ввод калорий
      user.waitingFor = 'manual_calories';
      user.pendingFood = analysis;
      userData.set(chatId, user);
      
      bot.answerCallbackQuery(callbackQuery.id);
    }
    
  } catch (error) {
    console.error('Ошибка callback:', error);
    bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Ошибка. Попробуйте снова.' });
  }
});

// Обработка ручного ввода калорий
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text.startsWith('/')) return;
  
  const user = userData.get(chatId);
  if (!user || user.waitingFor !== 'manual_calories') return;
  
  const calories = parseInt(text);
  
  if (isNaN(calories) || calories <= 0 || calories > 5000) {
    bot.sendMessage(chatId, '❌ Введите число от 1 до 5000');
    return;
  }
  
  const analysis = user.pendingFood;
  
  if (analysis) {
    // Сохраняем
    user.consumed = (user.consumed || 0) + calories;
    user.foods = user.foods || [];
    user.foods.push({
      name: analysis.foodName,
      quantity: analysis.quantity,
      unit: analysis.unit,
      calories: calories,
      protein: analysis.protein || 0,
      fat: analysis.fat || 0,
      carbs: analysis.carbs || 0,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      source: '✍️ Ручной ввод',
      addedAt: new Date().toISOString()
    });
    
    user.waitingFor = null;
    user.pendingFood = null;
    userData.set(chatId, user);
    pendingCorrections.delete(chatId);
    
    const remaining = Math.max(0, user.dailyGoal - user.consumed);
    const percent = Math.round((user.consumed / user.dailyGoal) * 100);
    
    let response = `✅ *Добавлено с ручным вводом!*\n\n`;
    response += `🍽️ ${analysis.foodName}\n`;
    response += `📏 ${analysis.quantity}${analysis.unit}\n`;
    response += `🔥 ${calories} ккал\n\n`;
    response += `📊 *Итого за день:* ${user.consumed}/${user.dailyGoal} ккал\n`;
    response += `📉 *Осталось:* ${remaining} ккал\n`;
    response += `📈 *Прогресс:* ${percent}%\n\n`;
    response += `✍️ *Калории указаны вручную*`;
    
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  }
});

// ========== KEEP ALIVE ==========
function startKeepAlive() {
  const keepAliveUrl = appUrl;
  let pingCount = 0;
  
  async function ping() {
    pingCount++;
    try {
      const response = await fetch(`${keepAliveUrl}/health`);
      const data = await response.json();
      console.log(`🔄 KeepAlive #${pingCount}: ${response.status}`);
      return data;
    } catch (error) {
      console.log(`⚠️  KeepAlive #${pingCount}: ${error.message}`);
      return null;
    }
  }
  
  console.log(`🔄 KeepAlive запущен для ${keepAliveUrl}`);
  
  ping();
  setInterval(ping, 5 * 60 * 1000);
  
  // Дополнительные пинги
  setTimeout(ping, 30000);
  setTimeout(ping, 60000);
}

// ========== ЗАПУСК СЕРВЕРА ==========
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║     🍎 CALORIE BOT AI+ v2.2 🍏       ║
╠════════════════════════════════════════╣
║ Статус:    ✅ Запущен                 ║
║ Порт:      ${port}                    ║
║ Пользователи: ${userData.size}        ║
║ ИИ:        ${openai ? '✅ GPT-4' : '❌ Выкл'} ║
║ Ручная коррекция: ✅ Включена        ║
║ KeepAlive: ✅ Активен                ║
╚════════════════════════════════════════╝
  `);
  
  startKeepAlive();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Завершаем работу...');
  server.close(() => {
    console.log('✅ Сервер остановлен');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Завершаем работу...');
  server.close(() => {
    console.log('✅ Сервер остановлен');
    process.exit(0);
  });
});
