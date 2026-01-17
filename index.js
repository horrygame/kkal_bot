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
  console.error('❌ Ошибка: TELEGRAM_BOT_TOKEN не установлен');
  console.error('Создайте бота через @BotFather и добавьте токен в переменные окружения Render');
  process.exit(1);
}

// ========== ИНИЦИАЛИЗАЦИЯ БОТА ==========
let bot;
try {
  if (process.env.NODE_ENV === 'production') {
    // В продакшене используем вебхуки
    bot = new TelegramBot(token);
    const webhookUrl = `${appUrl}/bot${token}`;
    bot.setWebHook(webhookUrl);
    console.log(`🌐 Вебхук установлен: ${webhookUrl}`);
  } else {
    // В разработке используем polling
    bot = new TelegramBot(token, { polling: true });
    console.log('🔧 Режим разработки: polling');
  }
} catch (error) {
  console.error('❌ Ошибка инициализации бота:', error.message);
  process.exit(1);
}

// ========== ИНИЦИАЛИЗАЦИЯ OPENAI ==========
let openai;
if (openaiApiKey) {
  try {
    openai = new OpenAI({ 
      apiKey: openaiApiKey,
      timeout: 30000 // 30 секунд таймаут
    });
    console.log('✅ Нейросеть OpenAI подключена');
  } catch (error) {
    console.log('⚠️  OpenAI не подключен:', error.message);
  }
} else {
  console.log('ℹ️  OpenAI API ключ не найден. Используется локальная база');
}

// ========== БАЗА ДАННЫХ ==========
const userData = new Map();
const foodDatabase = {
  'яблоко': { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
  'банан': { calories: 96, protein: 1.1, fat: 0.2, carbs: 23 },
  'апельсин': { calories: 47, protein: 0.9, fat: 0.1, carbs: 12 },
  'курица': { calories: 165, protein: 31, fat: 3.6, carbs: 0 },
  'говядина': { calories: 250, protein: 26, fat: 15, carbs: 0 },
  'рыба': { calories: 206, protein: 22, fat: 12, carbs: 0 },
  'рис': { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  'гречка': { calories: 110, protein: 4, fat: 1, carbs: 21 },
  'овсянка': { calories: 68, protein: 2.4, fat: 1.4, carbs: 12 },
  'картофель': { calories: 77, protein: 2, fat: 0.1, carbs: 17 },
  'помидор': { calories: 18, protein: 0.9, fat: 0.2, carbs: 3.9 },
  'огурец': { calories: 15, protein: 0.7, fat: 0.1, carbs: 3.6 },
  'яйцо': { calories: 155, protein: 13, fat: 11, carbs: 1.1 },
  'творог': { calories: 101, protein: 17, fat: 4, carbs: 3 },
  'сыр': { calories: 402, protein: 25, fat: 33, carbs: 1.3 },
  'молоко': { calories: 42, protein: 3.4, fat: 1, carbs: 4.8 },
  'хлеб': { calories: 265, protein: 9, fat: 3.2, carbs: 49 },
  'шоколад': { calories: 546, protein: 5, fat: 31, carbs: 61 },
  'орехи': { calories: 607, protein: 20, fat: 54, carbs: 21 },
  'кофе': { calories: 2, protein: 0.1, fat: 0, carbs: 0 },
  'чай': { calories: 1, protein: 0, fat: 0, carbs: 0.2 },
};

// ========== ИНИЦИАЛИЗАЦИЯ EXPRESS ==========
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логирование запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Health check endpoint (обязательно для Render)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    bot: 'running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    users: userData.size
  });
});

// Статусная страница
app.get('/status', (req, res) => {
  res.json({
    service: 'Calorie Counter Bot',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    stats: {
      users: userData.size,
      active: Array.from(userData.values()).filter(u => u.consumed > 0).length,
      foodItems: Object.keys(foodDatabase).length
    }
  });
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Calorie Counter Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .container { max-width: 600px; margin: 0 auto; }
        .status { background: #f0f0f0; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .green { color: green; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🍎 Calorie Counter Bot</h1>
        <div class="status">
          <h2>✅ Сервер работает</h2>
          <p>Активных пользователей: ${userData.size}</p>
          <p>Продуктов в базе: ${Object.keys(foodDatabase).length}</p>
          <p>Время работы: ${Math.floor(process.uptime() / 60)} минут</p>
        </div>
        <p>Используйте Telegram для взаимодействия с ботом.</p>
      </div>
    </body>
    </html>
  `);
});

// Вебхук для Telegram (только в продакшене)
if (process.env.NODE_ENV === 'production') {
  app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
}

// ========== ФУНКЦИИ БОТА ==========

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcome = `
🍎 *Calorie Counter Bot* 🍏

Я помогу считать калории!

*Команды:*
/setgoal - Установить норму калорий
/add - Добавить еду
/today - Статистика за день
/clear - Сбросить данные
/help - Помощь

Начните с /setgoal
  `;
  bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
});

// /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const help = `
*Помощь:*

1. /setgoal - установите дневную норму
2. /add - добавьте съеденную еду
3. /today - посмотрите статистику

Примеры:
• "200г риса с курицей"
• "2 яйца и кофе"
• "Яблоко 150г"
  `;
  bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
});

// /setgoal
bot.onText(/\/setgoal/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Введите дневную норму калорий:');
  
  const user = userData.get(chatId) || {};
  userData.set(chatId, { ...user, waitingFor: 'goal' });
});

// /add
bot.onText(/\/add/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (!user || !user.dailyGoal) {
    bot.sendMessage(chatId, 'Сначала установите норму: /setgoal');
    return;
  }
  
  bot.sendMessage(chatId, 'Что вы съели? Опишите:');
  userData.set(chatId, { ...user, waitingFor: 'food' });
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
  const remaining = Math.max(0, user.dailyGoal - consumed);
  const percent = Math.round((consumed / user.dailyGoal) * 100);
  
  const message = `
📊 *Статистика*

🎯 Норма: ${user.dailyGoal} ккал
🍽️ Съедено: ${consumed} ккал
✅ Осталось: ${remaining} ккал
📈 ${percent}% выполнено
  `;
  
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
  
  bot.sendMessage(chatId, '✅ Данные очищены!');
});

// Обработка сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text.startsWith('/')) return;
  
  const user = userData.get(chatId) || {};
  
  if (user.waitingFor === 'goal') {
    const goal = parseInt(text);
    
    if (isNaN(goal) || goal <= 0) {
      bot.sendMessage(chatId, 'Ошибка! Введите число больше 0');
      return;
    }
    
    user.dailyGoal = goal;
    user.consumed = 0;
    user.foods = [];
    user.waitingFor = null;
    
    userData.set(chatId, user);
    
    bot.sendMessage(chatId, `✅ Норма установлена: ${goal} ккал\nТеперь добавляйте еду: /add`);
    
  } else if (user.waitingFor === 'food') {
    // Простая обработка еды
    let calories = 0;
    let foodName = text;
    
    // Пытаемся найти продукт в базе
    for (const [name, data] of Object.entries(foodDatabase)) {
      if (text.toLowerCase().includes(name.toLowerCase())) {
        const match = text.match(/(\d+)\s*(г|грамм|мл)/i);
        const quantity = match ? parseInt(match[1]) : 100;
        calories = Math.round((data.calories * quantity) / 100);
        foodName = name;
        break;
      }
    }
    
    if (calories === 0) {
      // Если не нашли, используем среднее значение
      const match = text.match(/(\d+)/);
      const quantity = match ? parseInt(match[1]) : 100;
      calories = Math.round(quantity * 1.5); // Примерно 1.5 ккал/г
    }
    
    user.consumed = (user.consumed || 0) + calories;
    user.waitingFor = null;
    user.foods = user.foods || [];
    user.foods.push({ name: foodName, calories, time: new Date().toLocaleTimeString() });
    
    userData.set(chatId, user);
    
    const remaining = Math.max(0, user.dailyGoal - user.consumed);
    bot.sendMessage(chatId, 
      `✅ Добавлено: ${foodName} - ${calories} ккал\n` +
      `📊 Всего: ${user.consumed}/${user.dailyGoal} ккал\n` +
      `✅ Осталось: ${remaining} ккал`
    );
  } else if (user.dailyGoal) {
    bot.sendMessage(chatId, 'Используйте /add чтобы добавить еду');
  } else {
    bot.sendMessage(chatId, 'Начните с команды /setgoal');
  }
});

// ========== KEEP ALIVE ==========
class KeepAlive {
  constructor(url, interval = 5 * 60 * 1000) {
    this.url = url;
    this.interval = interval;
    this.timer = null;
    this.count = 0;
  }
  
  start() {
    console.log(`🔄 KeepAlive запущен для ${this.url}`);
    this.ping();
    this.timer = setInterval(() => this.ping(), this.interval);
  }
  
  async ping() {
    this.count++;
    try {
      const response = await fetch(`${this.url}/health`);
      const data = await response.json();
      console.log(`✅ KeepAlive #${this.count}: ${response.status}`);
      return data;
    } catch (error) {
      console.log(`⚠️  KeepAlive #${this.count}: ${error.message}`);
      return null;
    }
  }
  
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('🛑 KeepAlive остановлен');
  }
}

// ========== ЗАПУСК СЕРВЕРА ==========
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${port}`);
  console.log(`🌐 URL: ${appUrl}`);
  console.log(`🤖 Бот: ${bot ? 'активен' : 'не активен'}`);
  console.log(`🍎 Продуктов в базе: ${Object.keys(foodDatabase).length}`);
  
  // Запускаем KeepAlive
  if (process.env.NODE_ENV === 'production') {
    const keepAlive = new KeepAlive(appUrl);
    keepAlive.start();
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Получен SIGTERM, завершаем работу...');
  server.close(() => {
    console.log('✅ HTTP сервер остановлен');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Получен SIGINT, завершаем работу...');
  server.close(() => {
    console.log('✅ HTTP сервер остановлен');
    process.exit(0);
  });
});
