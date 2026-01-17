const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
require('dotenv').config();

// Инициализация
const token = process.env.TELEGRAM_BOT_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;
const port = process.env.PORT || 3000;

if (!token) {
  console.error('Ошибка: TELEGRAM_BOT_TOKEN не установлен в .env файле');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: process.env.NODE_ENV !== 'production' });
let openai;

if (openaiApiKey) {
  openai = new OpenAI({ apiKey: openaiApiKey });
  console.log('✅ Нейросеть OpenAI подключена');
} else {
  console.log('⚠️  OpenAI API ключ не найден. Будет использована локальная база данных');
}

// База данных (в продакшене используйте PostgreSQL/MongoDB)
const userData = new Map();
const foodDatabase = {
  'яблоко': { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
  'банан': { calories: 96, protein: 1.1, fat: 0.2, carbs: 23 },
  'курица': { calories: 165, protein: 31, fat: 3.6, carbs: 0 },
  'рис': { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  'гречка': { calories: 110, protein: 4, fat: 1, carbs: 21 },
  'яйцо': { calories: 155, protein: 13, fat: 11, carbs: 1.1 },
  'творог': { calories: 101, protein: 17, fat: 4, carbs: 3 },
  'сыр': { calories: 402, protein: 25, fat: 33, carbs: 1.3 },
  'хлеб': { calories: 265, protein: 9, fat: 3.2, carbs: 49 },
  'помидор': { calories: 18, protein: 0.9, fat: 0.2, carbs: 3.9 },
  'огурец': { calories: 15, protein: 0.7, fat: 0.1, carbs: 3.6 },
  'картофель': { calories: 77, protein: 2, fat: 0.1, carbs: 17 },
  'молоко': { calories: 42, protein: 3.4, fat: 1, carbs: 4.8 },
  'йогурт': { calories: 59, protein: 3.5, fat: 1.5, carbs: 6 },
  'шоколад': { calories: 546, protein: 5, fat: 31, carbs: 61 },
  'орехи': { calories: 607, protein: 20, fat: 54, carbs: 21 },
  'кофе': { calories: 2, protein: 0.1, fat: 0, carbs: 0 },
  'чай': { calories: 1, protein: 0, fat: 0, carbs: 0.2 },
  'авокадо': { calories: 160, protein: 2, fat: 15, carbs: 9 },
  'лосось': { calories: 208, protein: 20, fat: 13, carbs: 0 },
  'оливковое масло': { calories: 884, protein: 0, fat: 100, carbs: 0 },
  'сахар': { calories: 387, protein: 0, fat: 0, carbs: 100 },
};

// Функция для запроса к нейросети
async function askAI(foodText) {
  if (!openai) return null;
  
  try {
    const prompt = `Ты - диетолог и эксперт по питанию. 
    Пользователь ввел: "${foodText}"
    
    Проанализируй это и верни JSON в формате:
    {
      "foodName": "название продукта",
      "quantity": число (граммы или мл),
      "calories": число (ккал),
      "protein": число (граммы),
      "fat": число (граммы),
      "carbs": число (граммы),
      "confidence": число от 0 до 1 (уверенность в оценке)
    }
    
    Если не можешь определить - верни null.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const response = completion.choices[0].message.content;
    console.log('AI Response:', response);
    
    try {
      const parsed = JSON.parse(response);
      if (parsed && parsed.calories && parsed.confidence > 0.5) {
        return parsed;
      }
    } catch (e) {
      console.log('Failed to parse AI response:', e);
    }
    return null;
  } catch (error) {
    console.error('AI Error:', error.message);
    return null;
  }
}

// Функция для анализа текста от пользователя
async function analyzeFoodInput(text) {
  // Пытаемся сначала найти в локальной базе
  const lowerText = text.toLowerCase();
  
  // Ищем известные продукты
  for (const [foodName, nutrition] of Object.entries(foodDatabase)) {
    if (lowerText.includes(foodName.toLowerCase())) {
      // Пытаемся извлечь количество
      const quantityMatch = text.match(/\d+/g);
      let quantity = quantityMatch ? parseInt(quantityMatch[0]) : 100;
      
      if (quantity > 1000) quantity = quantity / 1000; // Если ввели в кг
      
      return {
        foodName: foodName,
        quantity: quantity,
        calories: Math.round((nutrition.calories * quantity) / 100),
        protein: Math.round((nutrition.protein * quantity) / 100 * 10) / 10,
        fat: Math.round((nutrition.fat * quantity) / 100 * 10) / 10,
        carbs: Math.round((nutrition.carbs * quantity) / 100 * 10) / 10,
        source: 'database'
      };
    }
  }
  
  // Если не нашли в базе, спрашиваем у AI
  const aiResult = await askAI(text);
  if (aiResult) {
    return {
      ...aiResult,
      source: 'ai'
    };
  }
  
  return null;
}

// Команды бота
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  const welcomeMessage = `
🍎 *Калорийный калькулятор с ИИ* 🍏

*Доступные команды:*
/setgoal - Установить дневную норму калорий
/add - Добавить еду (можно просто написать что съели)
/today - Статистика за сегодня
/week - Статистика за неделю
/clear - Сбросить данные за день
/products - Список продуктов в базе
/help - Помощь

*Примеры использования:*
• Просто напишите что съели: "Съел 200г риса с курицей"
• "На завтрак 2 яйца и кофе"
• "Пицца маргарита 300 грамм"
• "Борщ с хлебом"

Я использую ИИ для распознавания блюд и подсчета калорий!
  `;
  
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/add/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Что вы съели? Опишите блюдо или продукт с количеством:\n\nПримеры:\n• 200г риса с курицей\n• Омлет из 2 яиц\n• Яблоко и банан');
  
  const user = userData.get(chatId) || {};
  userData.set(chatId, { 
    ...user, 
    waitingFor: 'food'
  });
});

bot.onText(/\/setgoal/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Введите вашу дневную норму калорий:');
  
  const user = userData.get(chatId) || {};
  userData.set(chatId, { 
    ...user, 
    waitingFor: 'goal'
  });
});

bot.onText(/\/today/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (!user || !user.dailyGoal) {
    bot.sendMessage(chatId, 'Сначала установите дневную норму калорий: /setgoal');
    return;
  }
  
  const consumed = user.consumed || 0;
  const foods = user.foods || [];
  const remaining = Math.max(0, user.dailyGoal - consumed);
  const percentage = Math.round((consumed / user.dailyGoal) * 100);
  
  // Прогресс бар
  const progressBarLength = 10;
  const filled = Math.min(progressBarLength, Math.floor(percentage / 10));
  const progressBar = '🍎'.repeat(filled) + '⚪'.repeat(progressBarLength - filled);
  
  let message = `📊 *Статистика за сегодня*\n\n`;
  message += `🎯 Цель: *${user.dailyGoal}* ккал\n`;
  message += `🍽️ Съедено: *${consumed}* ккал\n`;
  message += `✅ Осталось: *${remaining}* ккал\n\n`;
  message += `${progressBar} ${percentage}%\n\n`;
  
  if (foods.length > 0) {
    message += '*Съеденная еда:*\n';
    foods.forEach((food, index) => {
      message += `${index + 1}. ${food.name} - ${food.calories} ккал\n`;
    });
  }
  
  if (consumed > user.dailyGoal) {
    message += `\n⚠️ *Превышение на ${consumed - user.dailyGoal} ккал*`;
  } else if (remaining === 0) {
    message += `\n🎉 *Цель достигнута!*`;
  }
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

bot.onText(/\/week/, (msg) => {
  const chatId = msg.chat.id;
  
  // В простой реализации показываем только сегодня
  // В реальном приложении нужно хранить историю
  const user = userData.get(chatId);
  
  if (user && user.consumed) {
    const avgCalories = user.consumed;
    const days = 1;
    
    bot.sendMessage(chatId, 
      `📈 *Статистика за неделю*\n\n` +
      `📅 Анализ за ${days} дней\n` +
      `📊 Среднедневное потребление: *${avgCalories}* ккал\n\n` +
      `_Для более детальной статистики нужна история за несколько дней_`,
      { parse_mode: 'Markdown' }
    );
  } else {
    bot.sendMessage(chatId, 'Начните отслеживать питание с помощью /add');
  }
});

bot.onText(/\/products/, (msg) => {
  const chatId = msg.chat.id;
  
  const products = Object.keys(foodDatabase)
    .sort()
    .slice(0, 20) // Показываем первые 20
    .map(product => `• ${product}`)
    .join('\n');
  
  bot.sendMessage(chatId, 
    `📋 *Продукты в базе:*\n\n${products}\n\n` +
    `_Всего продуктов: ${Object.keys(foodDatabase).length}_\n` +
    `_Для других продуктов используется ИИ_`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/clear/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (user) {
    userData.set(chatId, {
      ...user,
      consumed: 0,
      foods: [],
      waitingFor: null
    });
  }
  
  bot.sendMessage(chatId, '✅ Данные за день сброшены! Дневная норма сохранена.');
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `
*📖 Помощь по использованию бота*

1️⃣ *Установите цель*: /setgoal
   - Введите дневную норму калорий

2️⃣ *Добавляйте еду*: /add
   - Просто опишите что съели: "Съел 200г риса и курицу"
   - ИИ автоматически определит калории

3️⃣ *Следите за прогрессом*: /today
   - Смотрите статистику за день

4️⃣ *Сброс данных*: /clear
   - Обнуляет данные за текущий день

*Советы:*
• Чем точнее описание, тем точнее подсчет
• Используйте граммы для точности
• Бот запоминает только текущий день
• Для сложных блюд ИИ может оценить примерную калорийность

*Примеры команд:*
• "/setgoal 2000"
• "Обед: гречка 150г, курица 200г"
• "2 яблока и йогурт"
  `;
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Обработка всех сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Пропускаем команды
  if (text.startsWith('/')) return;
  
  const user = userData.get(chatId) || {};
  
  if (user.waitingFor === 'goal') {
    // Установка дневной нормы
    const goal = parseInt(text);
    
    if (isNaN(goal) || goal <= 0) {
      bot.sendMessage(chatId, '❌ Пожалуйста, введите корректное число калорий (больше 0)');
      return;
    }
    
    userData.set(chatId, {
      dailyGoal: goal,
      consumed: 0,
      foods: [],
      waitingFor: null
    });
    
    bot.sendMessage(chatId, 
      `✅ Дневная норма установлена: *${goal} ккал*\n\n` +
      `Теперь добавляйте еду командой /add или просто напишите что съели!`,
      { parse_mode: 'Markdown' }
    );
    
  } else if (user.waitingFor === 'food' || (!user.waitingFor && user.dailyGoal)) {
    // Обработка описания еды
    bot.sendChatAction(chatId, 'typing');
    
    try {
      const analysis = await analyzeFoodInput(text);
      
      if (!analysis) {
        bot.sendMessage(chatId, 
          '❌ Не смог распознать блюдо. Попробуйте описать точнее:\n\n' +
          'Примеры:\n• "200 грамм курицы"\n• "Рис 150г"\n• "2 яйца и тост"'
        );
        return;
      }
      
      // Сохраняем данные
      const currentConsumed = user.consumed || 0;
      const currentFoods = user.foods || [];
      
      currentFoods.push({
        name: analysis.foodName,
        calories: analysis.calories,
        quantity: analysis.quantity,
        time: new Date().toLocaleTimeString()
      });
      
      const newConsumed = currentConsumed + analysis.calories;
      const remaining = Math.max(0, user.dailyGoal - newConsumed);
      
      userData.set(chatId, {
        ...user,
        consumed: newConsumed,
        foods: currentFoods,
        waitingFor: null
      });
      
      // Формируем ответ
      let response = `✅ *Добавлено!*\n\n`;
      response += `🍽️ *${analysis.foodName}*\n`;
      response += `📊 ${analysis.quantity}г\n`;
      response += `🔥 ${analysis.calories} ккал\n`;
      
      if (analysis.protein && analysis.fat && analysis.carbs) {
        response += `🥩 Белки: ${analysis.protein}г\n`;
        response += `🥑 Жиры: ${analysis.fat}г\n`;
        response += `🍚 Углеводы: ${analysis.carbs}г\n`;
      }
      
      response += `\n📈 *Итого за день:* ${newConsumed}/${user.dailyGoal} ккал\n`;
      response += `📉 *Осталось:* ${remaining} ккал\n`;
      
      if (analysis.source === 'ai') {
        response += `\n🤖 _Определено с помощью ИИ_`;
      }
      
      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Error processing food:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка при обработке. Попробуйте еще раз.');
    }
    
  } else {
    // Если пользователь просто пишет текст без контекста
    if (!user.dailyGoal) {
      bot.sendMessage(chatId, 
        '👋 Для начала установите дневную норму калорий:\n\n' +
        '1. Введите /setgoal\n' +
        '2. Укажите вашу дневную норму (например, 2000)\n\n' +
        'Затем вы сможете добавлять съеденную еду.'
      );
    } else {
      // Предлагаем добавить как еду
      bot.sendMessage(chatId,
        'Хотите добавить это как съеденную еду?\n\n' +
        `Напишите "да" чтобы добавить "${text}" в ваш дневной рацион.`
      );
      
      userData.set(chatId, {
        ...user,
        pendingFood: text
      });
    }
  }
});

// Обработка "да" для добавления еды
bot.onText(/(да|yes|добавить|add)/i, async (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (user && user.pendingFood) {
    // Имитируем ввод еды
    msg.text = user.pendingFood;
    user.pendingFood = null;
    userData.set(chatId, user);
    
    // Вызываем обработчик сообщения
    bot.emit('message', msg);
  }
});

// Webhook для Render (если используется)
if (process.env.NODE_ENV === 'production') {
  const express = require('express');
  const app = express();
  
  app.use(express.json());
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
  });
  
  app.get('/', (req, res) => {
    res.send('🍎 Calorie Counter Bot is running!');
  });
  
  app.listen(port, () => {
    console.log(`🚀 Bot server is running on port ${port}`);
  });
} else {
  console.log('🤖 Bot started in polling mode...');
}
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const express = require('express');
const https = require('https');
const http = require('http');
require('dotenv').config();

// ========== КОНФИГУРАЦИЯ ==========
const token = process.env.TELEGRAM_BOT_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;
const port = process.env.PORT || 3000;
const appUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;

if (!token) {
  console.error('❌ Ошибка: TELEGRAM_BOT_TOKEN не установлен в .env файле');
  console.error('Создайте бота через @BotFather и добавьте токен в .env');
  process.exit(1);
}

// ========== ИНИЦИАЛИЗАЦИЯ БОТА ==========
const bot = new TelegramBot(token, { 
  polling: process.env.NODE_ENV !== 'production',
  polling: true, // Всегда используем polling для простоты
});

// ========== ИНИЦИАЛИЗАЦИЯ OPENAI ==========
let openai;
if (openaiApiKey) {
  try {
    openai = new OpenAI({ apiKey: openaiApiKey });
    console.log('✅ Нейросеть OpenAI подключена');
  } catch (error) {
    console.log('⚠️  Ошибка подключения OpenAI:', error.message);
  }
} else {
  console.log('ℹ️  OpenAI API ключ не найден. Будет использована локальная база данных');
}

// ========== БАЗА ДАННЫХ ==========
const userData = new Map(); // {chatId: {dailyGoal, consumed, foods, waitingFor}}
const foodDatabase = {
  'яблоко': { calories: 52, protein: 0.3, fat: 0.2, carbs: 14, category: 'фрукты' },
  'банан': { calories: 96, protein: 1.1, fat: 0.2, carbs: 23, category: 'фрукты' },
  'апельсин': { calories: 47, protein: 0.9, fat: 0.1, carbs: 12, category: 'фрукты' },
  'курица': { calories: 165, protein: 31, fat: 3.6, carbs: 0, category: 'мясо' },
  'говядина': { calories: 250, protein: 26, fat: 15, carbs: 0, category: 'мясо' },
  'свинина': { calories: 242, protein: 25, fat: 14, carbs: 0, category: 'мясо' },
  'рыба': { calories: 206, protein: 22, fat: 12, carbs: 0, category: 'рыба' },
  'лосось': { calories: 208, protein: 20, fat: 13, carbs: 0, category: 'рыба' },
  'рис': { calories: 130, protein: 2.7, fat: 0.3, carbs: 28, category: 'крупы' },
  'гречка': { calories: 110, protein: 4, fat: 1, carbs: 21, category: 'крупы' },
  'овсянка': { calories: 68, protein: 2.4, fat: 1.4, carbs: 12, category: 'крупы' },
  'макароны': { calories: 131, protein: 5, fat: 1.1, carbs: 25, category: 'крупы' },
  'картофель': { calories: 77, protein: 2, fat: 0.1, carbs: 17, category: 'овощи' },
  'помидор': { calories: 18, protein: 0.9, fat: 0.2, carbs: 3.9, category: 'овощи' },
  'огурец': { calories: 15, protein: 0.7, fat: 0.1, carbs: 3.6, category: 'овощи' },
  'морковь': { calories: 41, protein: 0.9, fat: 0.2, carbs: 10, category: 'овощи' },
  'лук': { calories: 40, protein: 1.1, fat: 0.1, carbs: 9, category: 'овощи' },
  'яйцо': { calories: 155, protein: 13, fat: 11, carbs: 1.1, category: 'молочные' },
  'творог': { calories: 101, protein: 17, fat: 4, carbs: 3, category: 'молочные' },
  'сыр': { calories: 402, protein: 25, fat: 33, carbs: 1.3, category: 'молочные' },
  'молоко': { calories: 42, protein: 3.4, fat: 1, carbs: 4.8, category: 'молочные' },
  'йогурт': { calories: 59, protein: 3.5, fat: 1.5, carbs: 6, category: 'молочные' },
  'кефир': { calories: 41, protein: 3.4, fat: 1, carbs: 4.8, category: 'молочные' },
  'сметана': { calories: 206, protein: 2.8, fat: 20, carbs: 3.2, category: 'молочные' },
  'хлеб': { calories: 265, protein: 9, fat: 3.2, carbs: 49, category: 'выпечка' },
  'булка': { calories: 270, protein: 8, fat: 3.5, carbs: 51, category: 'выпечка' },
  'печенье': { calories: 417, protein: 7.5, fat: 10, carbs: 76, category: 'сладости' },
  'шоколад': { calories: 546, protein: 5, fat: 31, carbs: 61, category: 'сладости' },
  'мороженое': { calories: 207, protein: 3.8, fat: 11, carbs: 24, category: 'сладости' },
  'орехи': { calories: 607, protein: 20, fat: 54, carbs: 21, category: 'орехи' },
  'арахис': { calories: 567, protein: 26, fat: 49, carbs: 16, category: 'орехи' },
  'миндаль': { calories: 579, protein: 21, fat: 50, carbs: 22, category: 'орехи' },
  'кофе': { calories: 2, protein: 0.1, fat: 0, carbs: 0, category: 'напитки' },
  'чай': { calories: 1, protein: 0, fat: 0, carbs: 0.2, category: 'напитки' },
  'сок': { calories: 46, protein: 0.5, fat: 0.1, carbs: 11, category: 'напитки' },
  'кола': { calories: 42, protein: 0, fat: 0, carbs: 11, category: 'напитки' },
  'вода': { calories: 0, protein: 0, fat: 0, carbs: 0, category: 'напитки' },
  'пиво': { calories: 43, protein: 0.5, fat: 0, carbs: 3.6, category: 'алкоголь' },
  'вино': { calories: 83, protein: 0.1, fat: 0, carbs: 2.7, category: 'алкоголь' },
  'водка': { calories: 231, protein: 0, fat: 0, carbs: 0, category: 'алкоголь' },
  'сахар': { calories: 387, protein: 0, fat: 0, carbs: 100, category: 'другое' },
  'соль': { calories: 0, protein: 0, fat: 0, carbs: 0, category: 'другое' },
  'масло': { calories: 884, protein: 0, fat: 100, carbs: 0, category: 'другое' },
  'майонез': { calories: 680, protein: 0.5, fat: 75, carbs: 2.5, category: 'другое' },
  'кетчуп': { calories: 112, protein: 1.8, fat: 0.4, carbs: 26, category: 'другое' },
};

// ========== КЛАСС KEEP ALIVE ==========
class KeepAlive {
  constructor(serverUrl, interval = 5 * 60 * 1000) {
    this.serverUrl = serverUrl;
    this.interval = interval;
    this.timer = null;
    this.isRunning = false;
    this.pingCount = 0;
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] 🔄 ${message}`);
  }

  async ping() {
    this.pingCount++;
    const pingNumber = this.pingCount;
    
    return new Promise((resolve) => {
      const url = new URL(this.serverUrl);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname || '/health',
        method: 'GET',
        timeout: 15000,
        headers: { 'User-Agent': 'CalorieBot-KeepAlive/1.0' }
      };

      const protocol = url.protocol === 'https:' ? https : http;
      const startTime = Date.now();
      
      const req = protocol.request(options, (res) => {
        const duration = Date.now() - startTime;
        let data = '';
        
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          this.log(`PING #${pingNumber}: ${res.statusCode} (${duration}ms)`);
          resolve({ success: true, statusCode: res.statusCode, duration });
        });
      });

      req.on('error', (error) => {
        this.log(`PING #${pingNumber}: ERROR - ${error.message}`);
        resolve({ success: false, error: error.message });
      });

      req.on('timeout', () => {
        this.log(`PING #${pingNumber}: TIMEOUT`);
        req.destroy();
        resolve({ success: false, error: 'Timeout' });
      });

      req.end();
    });
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.log(`Запуск KeepAlive для ${this.serverUrl}`);
    
    // Первый пинг сразу
    this.ping();
    
    // Пинг каждые 5 минут
    this.timer = setInterval(() => this.ping(), this.interval);
    
    // Дополнительные пинги в начале для разогрева
    setTimeout(() => this.ping(), 30000);
    setTimeout(() => this.ping(), 90000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.log('KeepAlive остановлен');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      serverUrl: this.serverUrl,
      pingCount: this.pingCount,
      interval: `${this.interval / 1000} секунд`
    };
  }
}

// ========== ФУНКЦИИ ИИ ==========
async function askAI(foodText) {
  if (!openai) return null;
  
  try {
    const prompt = `Ты диетолог. Пользователь написал: "${foodText}"
    
    Извлеки информацию и верни JSON:
    {
      "foodName": "название продукта/блюда",
      "quantity": число (граммы, штуки или мл),
      "calories": число (ккал для указанного количества),
      "protein": число (граммы),
      "fat": число (граммы),
      "carbs": число (граммы),
      "unit": "г" или "мл" или "шт",
      "confidence": число от 0 до 1
    }
    
    Если не можешь определить - верни null.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 200
    });

    const response = completion.choices[0].message.content.trim();
    
    try {
      // Пытаемся найти JSON в ответе
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && parsed.calories && parsed.confidence > 0.4) {
          return parsed;
        }
      }
    } catch (e) {
      console.log('Ошибка парсинга ответа ИИ:', e.message);
    }
    return null;
  } catch (error) {
    console.error('Ошибка ИИ:', error.message);
    return null;
  }
}

async function analyzeFoodInput(text) {
  const lowerText = text.toLowerCase().trim();
  
  // Сначала пытаемся найти в локальной базе
  for (const [foodName, nutrition] of Object.entries(foodDatabase)) {
    if (lowerText.includes(foodName.toLowerCase())) {
      // Пытаемся извлечь количество
      const quantityMatch = text.match(/(\d+)\s*(г|грамм|мл|л|кг|шт|штук)/i) || text.match(/(\d+)/);
      let quantity = quantityMatch ? parseInt(quantityMatch[1]) : 100;
      let unit = quantityMatch && quantityMatch[2] ? quantityMatch[2].toLowerCase() : 'г';
      
      // Конвертация единиц
      if (unit === 'кг' || unit === 'л') quantity *= 1000;
      if (unit === 'шт' || unit === 'штук') {
        quantity = quantity * 100; // Примерно 100г на штуку для многих продуктов
      }
      
      return {
        foodName: foodName.charAt(0).toUpperCase() + foodName.slice(1),
        quantity: quantity,
        calories: Math.round((nutrition.calories * quantity) / 100),
        protein: Math.round((nutrition.protein * quantity) / 100 * 10) / 10,
        fat: Math.round((nutrition.fat * quantity) / 100 * 10) / 10,
        carbs: Math.round((nutrition.carbs * quantity) / 100 * 10) / 10,
        unit: 'г',
        source: 'база данных',
        category: nutrition.category
      };
    }
  }
  
  // Если не нашли в базе, пробуем ИИ
  if (openai) {
    const aiResult = await askAI(text);
    if (aiResult) {
      return {
        ...aiResult,
        source: 'ИИ',
        category: 'определено ИИ'
      };
    }
  }
  
  // Если ничего не помогло, пробуем простой парсинг
  const simpleMatch = text.match(/(\d+)\s*(г|грамм|мл)/i);
  if (simpleMatch) {
    const quantity = parseInt(simpleMatch[1]);
    return {
      foodName: text.substring(0, 50),
      quantity: quantity,
      calories: Math.round(quantity * 1.5), // Среднее значение
      protein: Math.round(quantity * 0.1),
      fat: Math.round(quantity * 0.08),
      carbs: Math.round(quantity * 0.2),
      unit: simpleMatch[2] || 'г',
      source: 'оценка',
      category: 'неизвестно'
    };
  }
  
  return null;
}

// ========== ИНИЦИАЛИЗАЦИЯ EXPRESS ==========
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    bot: 'running',
    uptime: `${Math.floor(uptime / 60)} минут`,
    memory: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
    users: userData.size,
    version: '2.0.0'
  });
});

// Статусная страница
app.get('/status', (req, res) => {
  const stats = {
    totalUsers: userData.size,
    activeToday: Array.from(userData.values()).filter(u => u.consumed > 0).length,
    foodDatabaseSize: Object.keys(foodDatabase).length,
    aiEnabled: !!openai,
    serverTime: new Date().toLocaleString('ru-RU')
  };
  
  res.json(stats);
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>🍎 Calorie Counter Bot</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        h1 { 
          color: #333;
          margin-bottom: 20px;
          font-size: 2.5em;
        }
        .emoji { font-size: 3em; margin-bottom: 20px; }
        .status {
          background: #f8f9fa;
          border-radius: 10px;
          padding: 20px;
          margin: 20px 0;
          text-align: left;
        }
        .status-item {
          margin: 10px 0;
          display: flex;
          justify-content: space-between;
        }
        .status-label { color: #666; }
        .status-value { 
          font-weight: bold;
          color: #2d3748;
        }
        .green { color: #38a169; }
        .blue { color: #4299e1; }
        .instructions {
          background: #e6f7ff;
          border-radius: 10px;
          padding: 20px;
          margin: 20px 0;
          text-align: left;
        }
        .instructions h3 {
          color: #1890ff;
          margin-bottom: 10px;
        }
        .instructions ol {
          margin-left: 20px;
          color: #555;
        }
        .instructions li {
          margin: 8px 0;
        }
        .telegram-link {
          display: inline-block;
          background: #0088cc;
          color: white;
          padding: 12px 30px;
          border-radius: 25px;
          text-decoration: none;
          font-weight: bold;
          margin-top: 20px;
          transition: transform 0.3s;
        }
        .telegram-link:hover {
          transform: translateY(-2px);
          background: #0077b5;
        }
        footer {
          margin-top: 30px;
          color: #718096;
          font-size: 0.9em;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="emoji">🍎🤖</div>
        <h1>Calorie Counter Bot</h1>
        
        <div class="status">
          <div class="status-item">
            <span class="status-label">Статус бота:</span>
            <span class="status-value green">✅ Работает</span>
          </div>
          <div class="status-item">
            <span class="status-label">Пользователей:</span>
            <span class="status-value blue">${userData.size}</span>
          </div>
          <div class="status-item">
            <span class="status-label">База продуктов:</span>
            <span class="status-value">${Object.keys(foodDatabase).length}</span>
          </div>
          <div class="status-item">
            <span class="status-label">ИИ:</span>
            <span class="status-value ${openai ? 'green' : 'blue'}">${openai ? '✅ Включен' : '📚 Локальная база'}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Время работы:</span>
            <span class="status-value">${Math.floor(process.uptime() / 60)} мин</span>
          </div>
        </div>
        
        <div class="instructions">
          <h3>Как использовать:</h3>
          <ol>
            <li>Найдите в Telegram: @CalorieCounterYourBot</li>
            <li>Нажмите /start для начала</li>
            <li>Установите дневную норму: /setgoal</li>
            <li>Добавляйте еду командой /add или просто напишите что съели</li>
            <li>Следите за прогрессом: /today</li>
          </ol>
        </div>
        
        <a href="https://t.me/CalorieCounterYourBot" class="telegram-link" target="_blank">
          💬 Открыть в Telegram
        </a>
        
        <footer>
          <p>Бот автоматически поддерживает активность каждые 5 минут</p>
          <p>© ${new Date().getFullYear()} Calorie Counter Bot v2.0</p>
        </footer>
      </div>
    </body>
    </html>
  `);
});

// ========== КОМАНДЫ ТЕЛЕГРАМ БОТА ==========

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  
  const welcomeMessage = `
🍎 *Привет, ${firstName}!* 🤖

Я помогу тебе следить за питанием и считать калории!

*🎯 Основные команды:*
/setgoal - Установить дневную норму калорий
/add - Добавить съеденную еду
/today - Статистика за сегодня
/week - Статистика за неделю
/products - Список продуктов
/clear - Сбросить сегодняшние данные
/help - Помощь и инструкции

*📝 Как добавлять еду:*
• Используйте команду /add
• Или просто напишите что съели
• Примеры: "200г риса с курицей", "2 яйца и кофе", "Яблоко 150г"

*🤖 Возможности:*
• База из ${Object.keys(foodDatabase).length} продуктов
• ${openai ? 'ИИ для сложных блюд' : 'Локальная база данных'}
• Подсчет БЖУ (белки, жиры, углеводы)
• Ежедневная статистика

*💡 Совет:* Начните с установки дневной нормы: /setgoal
  `;
  
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `
*📚 Помощь по использованию бота*

*1. Установите цель*
   /setgoal - введите дневную норму калорий
   *Пример:* /setgoal 2000

*2. Добавляйте еду*
   /add - опишите что съели
   *Примеры:*
   • "Гречка 150г с курицей 200г"
   • "2 яйца, тост и кофе"
   • "Салат из помидоров и огурцов 300г"

*3. Следите за прогрессом*
   /today - статистика за день
   /week - статистика за неделю
   /products - список продуктов в базе

*4. Управление данными*
   /clear - сбросить сегодняшние данные
   /setgoal - изменить дневную норму

*📋 Формат добавления еды:*
• Указывайте количество: "200г", "2 шт", "150 мл"
• Можно несколько продуктов в одном сообщении
• ИИ распознает сложные блюда

*🎯 Советы для точности:*
• Используйте граммы для твердой пищи
• Указывайте "мл" для жидкостей
• Чем подробнее описание, тем точнее подсчет

*🔧 Техническая информация:*
• База данных: ${Object.keys(foodDatabase).length} продуктов
• ИИ: ${openai ? 'активен (OpenAI GPT)' : 'не активен'}
• Сохранение данных: в памяти (обнуляется при перезапуске)
  `;
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// /setgoal
bot.onText(/\/setgoal/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId) || {};
  
  bot.sendMessage(chatId, 
    '🎯 *Введите вашу дневную норму калорий:*\n\n' +
    'Рекомендации:\n' +
    '• Для похудения: 1500-1800 ккал\n' +
    '• Для поддержания: 2000-2200 ккал\n' +
    '• Для набора массы: 2500-3000 ккал\n\n' +
    'Или укажите ваше индивидуальное значение:',
    { parse_mode: 'Markdown' }
  );
  
  userData.set(chatId, { 
    ...user, 
    waitingFor: 'goal'
  });
});

// /add
bot.onText(/\/add/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (!user || !user.dailyGoal) {
    bot.sendMessage(chatId, 
      '⚠️ *Сначала установите дневную норму калорий!*\n\n' +
      'Используйте команду /setgoal',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  bot.sendMessage(chatId, 
    '🍽️ *Что вы съели?*\n\n' +
    'Опишите блюдо или продукт с количеством:\n\n' +
    '*Примеры:*\n' +
    '• "200г риса с курицей"\n' +
    '• "Омлет из 2 яиц"\n' +
    '• "Суп 300мл и хлеб"\n' +
    '• "Кофе с молоком"\n\n' +
    'Можно добавить несколько продуктов в одном сообщении.',
    { parse_mode: 'Markdown' }
  );
  
  userData.set(chatId, { 
    ...user, 
    waitingFor: 'food'
  });
});

// /today
bot.onText(/\/today/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (!user || !user.dailyGoal) {
    bot.sendMessage(chatId, 
      '📊 *Сначала установите дневную норму калорий!*\n\n' +
      'Используйте команду /setgoal',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const consumed = user.consumed || 0;
  const foods = user.foods || [];
  const remaining = Math.max(0, user.dailyGoal - consumed);
  const percentage = Math.round((consumed / user.dailyGoal) * 100);
  
  // Расчет БЖУ за день
  let totalProtein = 0;
  let totalFat = 0;
  let totalCarbs = 0;
  
  foods.forEach(food => {
    totalProtein += food.protein || 0;
    totalFat += food.fat || 0;
    totalCarbs += food.carbs || 0;
  });
  
  // Создание прогресс-бара
  const progressBarLength = 10;
  const filled = Math.min(progressBarLength, Math.floor(percentage / 10));
  const progressBar = '█'.repeat(filled) + '░'.repeat(progressBarLength - filled);
  
  let message = `📊 *Статистика за сегодня*\n\n`;
  message += `🎯 Цель: *${user.dailyGoal}* ккал\n`;
  message += `🍽️ Съедено: *${consumed}* ккал\n`;
  message += `✅ Осталось: *${remaining}* ккал\n`;
  message += `📈 Прогресс: *${percentage}%*\n\n`;
  
  message += `${progressBar}\n\n`;
  
  // БЖУ
  message += `*Питательные вещества:*\n`;
  message += `🥩 Белки: *${totalProtein.toFixed(1)}г*\n`;
  message += `🥑 Жиры: *${totalFat.toFixed(1)}г*\n`;
  message += `🍚 Углеводы: *${totalCarbs.toFixed(1)}г*\n\n`;
  
  // Список еды
  if (foods.length > 0) {
    message += `*Съеденная еда:*\n`;
    foods.forEach((food, index) => {
      const time = food.time ? ` (${food.time})` : '';
      message += `${index + 1}. ${food.name} - ${food.calories} ккал${time}\n`;
    });
  } else {
    message += `🍽️ *Еще ничего не съедено*\n`;
    message += `Добавьте первую запись с помощью /add`;
  }
  
  // Статус
  if (consumed > user.dailyGoal) {
    const over = consumed - user.dailyGoal;
    message += `\n⚠️ *Превышение нормы на ${over} ккал*`;
  } else if (remaining === 0) {
    message += `\n🎉 *Цель достигнута! Отличная работа!*`;
  } else if (remaining < user.dailyGoal * 0.3) {
    message += `\n👍 *Осталось немного! Почти у цели!*`;
  }
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// /week
bot.onText(/\/week/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (!user || !user.dailyGoal) {
    bot.sendMessage(chatId, 'Сначала установите дневную норму: /setgoal');
    return;
  }
  
  const consumed = user.consumed || 0;
  const dailyAverage = consumed; // В упрощенной версии берем только сегодня
  
  let weekStatus = '';
  if (dailyAverage < user.dailyGoal * 0.8) {
    weekStatus = '📉 *Ниже нормы* - нужно есть больше';
  } else if (dailyAverage > user.dailyGoal * 1.2) {
    weekStatus = '📈 *Выше нормы* - возможно переедание';
  } else {
    weekStatus = '✅ *В пределах нормы* - отлично!';
  }
  
  const message = `
📅 *Статистика за неделю*\n
*Сегодня:* ${consumed}/${user.dailyGoal} ккал
*Среднедневное:* ${dailyAverage} ккал
*Статус:* ${weekStatus}\n
_Для детальной статистики нужна история за несколько дней._
  `;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// /products
bot.onText(/\/products/, (msg) => {
  const chatId = msg.chat.id;
  
  const categories = {};
  Object.entries(foodDatabase).forEach(([name, data]) => {
    if (!categories[data.category]) {
      categories[data.category] = [];
    }
    categories[data.category].push(name);
  });
  
  let message = `📋 *База продуктов*\n\n`;
  message += `Всего продуктов: *${Object.keys(foodDatabase).length}*\n\n`;
  
  // Показываем по 3 продукта из каждой категории
  Object.entries(categories).forEach(([category, products]) => {
    message += `*${category.toUpperCase()}*:\n`;
    products.slice(0, 3).forEach(product => {
      const nutrition = foodDatabase[product];
      message += `• ${product} (${nutrition.calories} ккал/100г)\n`;
    });
    if (products.length > 3) {
      message += `... и еще ${products.length - 3} продуктов\n`;
    }
    message += '\n';
  });
  
  message += `_Для других продуктов используется ${openai ? 'ИИ' : 'оценка'}_`;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// /clear
bot.onText(/\/clear/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (!user) {
    bot.sendMessage(chatId, 'Нет данных для очистки. Сначала установите норму: /setgoal');
    return;
  }
  
  userData.set(chatId, {
    dailyGoal: user.dailyGoal,
    consumed: 0,
    foods: [],
    waitingFor: null
  });
  
  bot.sendMessage(chatId, 
    '🗑️ *Данные за сегодня очищены!*\n\n' +
    `Дневная норма сохранена: *${user.dailyGoal} ккал*\n` +
    'Теперь можно начать новый день!',
    { parse_mode: 'Markdown' }
  );
});

// /keepalive
bot.onText(/\/keepalive/, (msg) => {
  const chatId = msg.chat.id;
  const status = keepAlive.getStatus();
  
  bot.sendMessage(chatId, 
    `🔧 *Статус KeepAlive*\n\n` +
    `🌐 Сервер: ${status.serverUrl}\n` +
    `⏱️  Интервал: ${status.interval}\n` +
    `📊 Пингов: ${status.pingCount}\n` +
    `🔄 Статус: ${status.isRunning ? '✅ Активен' : '❌ Остановлен'}\n\n` +
    `Сервер получает запросы каждые 5 минут для поддержания активности на Render.`,
    { parse_mode: 'Markdown' }
  );
});

// ========== ОБРАБОТКА ОБЫЧНЫХ СООБЩЕНИЙ ==========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const userName = msg.from.first_name;
  
  // Игнорируем команды
  if (text.startsWith('/')) return;
  
  console.log(`[${new Date().toLocaleTimeString()}] Сообщение от ${userName}: ${text}`);
  
  let user = userData.get(chatId) || {};
  
  // Если пользователь новый, сохраняем информацию
  if (!user.userId) {
    user.userId = userId;
    user.userName = userName;
    user.joinedDate = new Date().toISOString();
  }
  
  if (user.waitingFor === 'goal') {
    // Обработка установки дневной нормы
    const goal = parseInt(text.replace(/[^\d]/g, ''));
    
    if (isNaN(goal) || goal <= 0 || goal > 10000) {
      bot.sendMessage(chatId, 
        '❌ *Неверное значение!*\n\n' +
        'Пожалуйста, введите число от 100 до 10000 ккал.\n' +
        'Пример: 2000',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    user.dailyGoal = goal;
    user.consumed = 0;
    user.foods = [];
    user.waitingFor = null;
    
    userData.set(chatId, user);
    
    bot.sendMessage(chatId, 
      `🎉 *Отлично, ${userName}!*\n\n` +
      `Дневная норма установлена: *${goal} ккал*\n\n` +
      `Теперь добавляйте съеденную еду:\n` +
      `• Используйте команду /add\n` +
      `• Или просто напишите что съели\n\n` +
      `Попробуйте: "На завтрак 2 яйца и кофе"`,
      { parse_mode: 'Markdown' }
    );
    
  } else if (user.waitingFor === 'food' || (!user.waitingFor && user.dailyGoal)) {
    // Обработка добавления еды
    if (!text || text.length < 2) {
      bot.sendMessage(chatId, 'Пожалуйста, опишите что вы съели');
      return;
    }
    
    bot.sendChatAction(chatId, 'typing');
    
    try {
      const analysis = await analyzeFoodInput(text);
      
      if (!analysis) {
        bot.sendMessage(chatId, 
          '❌ *Не удалось распознать еду*\n\n' +
          'Попробуйте описать точнее:\n' +
          '• "Гречка 150г с курицей 100г"\n' +
          '• "2 яйца всмятку"\n' +
          '• "Суп 300мл и хлеб 50г"\n\n' +
          'Или используйте продукты из базы: /products',
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      // Обновляем данные пользователя
      const currentConsumed = user.consumed || 0;
      const currentFoods = user.foods || [];
      
      const foodRecord = {
        name: analysis.foodName,
        quantity: analysis.quantity,
        unit: analysis.unit,
        calories: analysis.calories,
        protein: analysis.protein || 0,
        fat: analysis.fat || 0,
        carbs: analysis.carbs || 0,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        source: analysis.source,
        addedAt: new Date().toISOString()
      };
      
      currentFoods.push(foodRecord);
      const newConsumed = currentConsumed + analysis.calories;
      
      user.consumed = newConsumed;
      user.foods = currentFoods;
      user.waitingFor = null;
      user.lastActivity = new Date().toISOString();
      
      userData.set(chatId, user);
      
      // Формируем ответ
      const remaining = Math.max(0, user.dailyGoal - newConsumed);
      const percentage = Math.round((newConsumed / user.dailyGoal) * 100);
      
      let response = `✅ *Еда добавлена!*\n\n`;
      response += `🍽️ *${analysis.foodName}*\n`;
      response += `📏 ${analysis.quantity}${analysis.unit}\n`;
      response += `🔥 ${analysis.calories} ккал\n\n`;
      
      if (analysis.protein && analysis.fat && analysis.carbs) {
        response += `🥩 Белки: ${analysis.protein.toFixed(1)}г\n`;
        response += `🥑 Жиры: ${analysis.fat.toFixed(1)}г\n`;
        response += `🍚 Углеводы: ${analysis.carbs.toFixed(1)}г\n\n`;
      }
      
      response += `📊 *Итого за день:* ${newConsumed}/${user.dailyGoal} ккал\n`;
      response += `📉 *Осталось:* ${remaining} ккал\n`;
      response += `📈 *Прогресс:* ${percentage}%\n\n`;
      
      if (analysis.source === 'ИИ') {
        response += `🤖 _Определено с помощью искусственного интеллекта_`;
      } else if (analysis.source === 'оценка') {
        response += `📝 _Примерная оценка_`;
      }
      
      // Добавляем эмодзи в зависимости от процента выполнения
      if (percentage >= 100) {
        response = `🎉 ${response}`;
      } else if (percentage >= 80) {
        response = `👍 ${response}`;
      }
      
      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Ошибка при обработке еды:', error);
      bot.sendMessage(chatId, 
        '❌ *Произошла ошибка*\n\n' +
        'Пожалуйста, попробуйте еще раз или опишите по-другому.\n' +
        'Пример: "Рис 200г с курицей 150г"',
        { parse_mode: 'Markdown' }
      );
    }
    
  } else {
    // Если пользователь просто пишет без контекста
    if (!user.dailyGoal) {
      bot.sendMessage(chatId, 
        `👋 *Привет, ${userName}!*\n\n` +
        `Я помогу тебе считать калории. Для начала:\n\n` +
        `1. Установи дневную норму: /setgoal\n` +
        `2. Добавляй съеденную еду: /add\n` +
        `3. Следи за прогрессом: /today\n\n` +
        `Начни с команды /setgoal 🎯`,
        { parse_mode: 'Markdown' }
      );
      
      userData.set(chatId, user);
    } else {
      // Предлагаем добавить как еду
      bot.sendMessage(chatId, 
        `Хочешь добавить это как съеденную еду?\n\n` +
        `"${text.substring(0, 50)}"\n\n` +
        `Напиши "да" чтобы добавить.`,
        { parse_mode: 'Markdown' }
      );
      
      user.pendingFood = text;
      userData.set(chatId, user);
    }
  }
});

// ========== ЗАПУСК СЕРВЕРА ==========
const server = app.listen(port, () => {
  console.log(`🚀 HTTP сервер запущен на порту ${port}`);
  console.log(`🌐 Веб-интерфейс: ${appUrl}`);
  console.log(`🔧 Режим: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 База продуктов: ${Object.keys(foodDatabase).length} позиций`);
  console.log(`💾 Пользователей в памяти: ${userData.size}`);
});

// ========== ЗАПУСК KEEP ALIVE ==========
const keepAlive = new KeepAlive(appUrl);
keepAlive.start();

// ========== GRACEFUL SHUTDOWN ==========
process.on('SIGINT', () => {
  console.log('\n🛑 Получен SIGINT (Ctrl+C)');
  gracefulShutdown();
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Получен SIGTERM');
  gracefulShutdown();
});

async function gracefulShutdown() {
  console.log('🔄 Завершение работы...');
  
  // Сохраняем статистику перед выходом
  const stats = {
    totalUsers: userData.size,
    activeUsers: Array.from(userData.values()).filter(u => u.consumed > 0).length,
    timestamp: new Date().toISOString()
  };
  console.log('📊 Статистика перед завершением:', stats);
  
  // Останавливаем keep-alive
  keepAlive.stop();
  
  // Останавливаем HTTP сервер
  server.close(() => {
    console.log('✅ HTTP сервер остановлен');
    
    // Останавливаем бота
    if (bot.isPolling()) {
      bot.stopPolling();
      console.log('✅ Polling бота остановлен');
    }
    
    console.log('👋 Бот завершил работу');
    process.exit(0);
  });
  
  // Таймаут на завершение
  setTimeout(() => {
    console.log('⏰ Принудительное завершение');
    process.exit(1);
  }, 10000);
}

// ========== ИНФОРМАЦИЯ ПРИ ЗАПУСКЕ ==========
console.log(`
╔══════════════════════════════════════════════════════╗
║         🍎 CALORIE COUNTER BOT v2.0 🍏              ║
╠══════════════════════════════════════════════════════╣
║ Статус:              ✅ Запущен                      ║
║ Порт:                ${port.toString().padEnd(30)}║
║ Пользователей:       ${userData.size.toString().padEnd(30)}║
║ База продуктов:      ${Object.keys(foodDatabase).length.toString().padEnd(30)}║
║ ИИ:                  ${openai ? '✅ Включен'.padEnd(30) : '📚 Локальная база'.padEnd(30)}║
║ KeepAlive:           ✅ Активен каждые 5 минут      ║
╚══════════════════════════════════════════════════════╝
`);

console.log('🤖 Бот запущен и готов к работе!');
console.log('📱 Используйте Telegram для взаимодействия');
console.log('🌐 Веб-страница доступна по адресу:', appUrl);
