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
