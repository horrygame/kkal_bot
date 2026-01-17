import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import dotenv from 'dotenv';
import { createRequire } from 'module';

dotenv.config();

// Для совместимости с require внутри ES модуля
const require = createRequire(import.meta.url);

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
    // Динамический импорт OpenAI
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

// ========== ФУНКЦИИ AI ==========
async function askAI(foodText) {
  if (!openai) return null;
  
  try {
    const prompt = `Пользователь съел: "${foodText}". Оцени калории в ккал. Ответь только числом.`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 50
    });

    const response = completion.choices[0].message.content.trim();
    const calories = parseInt(response.replace(/[^\d]/g, ''));
    
    if (!isNaN(calories) && calories > 0) {
      return calories;
    }
    return null;
  } catch (error) {
    console.error('Ошибка AI:', error.message);
    return null;
  }
}

async function analyzeFoodInput(text) {
  const lowerText = text.toLowerCase().trim();
  
  // Сначала ищем в локальной базе
  for (const [foodName, nutrition] of Object.entries(foodDatabase)) {
    if (lowerText.includes(foodName.toLowerCase())) {
      const match = text.match(/(\d+)\s*(г|грамм|мл)/i);
      const quantity = match ? parseInt(match[1]) : 100;
      const calories = Math.round((nutrition.calories * quantity) / 100);
      
      return {
        foodName: foodName.charAt(0).toUpperCase() + foodName.slice(1),
        quantity: quantity,
        calories: calories,
        protein: Math.round((nutrition.protein * quantity) / 100 * 10) / 10,
        fat: Math.round((nutrition.fat * quantity) / 100 * 10) / 10,
        carbs: Math.round((nutrition.carbs * quantity) / 100 * 10) / 10,
        source: 'база'
      };
    }
  }
  
  // Если не нашли в базе, пробуем AI
  if (openai) {
    try {
      const aiCalories = await askAI(text);
      if (aiCalories) {
        return {
          foodName: text.substring(0, 30),
          quantity: 100,
          calories: aiCalories,
          protein: 0,
          fat: 0,
          carbs: 0,
          source: 'ИИ'
        };
      }
    } catch (error) {
      console.log('AI не сработал, используем оценку');
    }
  }
  
  // Если ничего не помогло, используем оценку
  const match = text.match(/(\d+)/);
  const quantity = match ? parseInt(match[1]) : 100;
  const estimatedCalories = Math.round(quantity * 1.5);
  
  return {
    foodName: text.substring(0, 30),
    quantity: quantity,
    calories: estimatedCalories,
    protein: Math.round(quantity * 0.1),
    fat: Math.round(quantity * 0.08),
    carbs: Math.round(quantity * 0.2),
    source: 'оценка'
  };
}

// ========== EXPRESS СЕРВЕР ==========
const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'calorie-bot',
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
      <title>Calorie Counter Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          max-width: 800px; 
          margin: 0 auto; 
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          background: white;
          border-radius: 15px;
          padding: 40px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          text-align: center;
        }
        h1 {
          color: #333;
          margin-bottom: 20px;
        }
        .emoji {
          font-size: 3em;
          margin-bottom: 20px;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
          margin: 20px 0;
        }
        .stat-item {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
        }
        .stat-label {
          color: #666;
          font-size: 0.9em;
        }
        .stat-value {
          font-size: 1.5em;
          font-weight: bold;
          color: #333;
        }
        .green { color: #38a169; }
        .blue { color: #4299e1; }
        .status-badge {
          display: inline-block;
          padding: 5px 15px;
          border-radius: 20px;
          font-weight: bold;
          margin: 10px 0;
        }
        .status-running {
          background: #c6f6d5;
          color: #22543d;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="emoji">🍎🤖</div>
        <h1>Calorie Counter Bot</h1>
        
        <div class="status-badge status-running">✅ Сервер работает</div>
        
        <div class="stats">
          <div class="stat-item">
            <div class="stat-label">Пользователей</div>
            <div class="stat-value blue">${userData.size}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Продуктов в базе</div>
            <div class="stat-value blue">${Object.keys(foodDatabase).length}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Искусственный интеллект</div>
            <div class="stat-value ${openai ? 'green' : 'blue'}">${openai ? '✅ Включен' : '📚 Локальная база'}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Время работы</div>
            <div class="stat-value">${Math.floor(process.uptime() / 60)} мин</div>
          </div>
        </div>
        
        <p style="margin-top: 30px; color: #666;">
          Используйте Telegram для взаимодействия с ботом. Бот автоматически поддерживает активность.
        </p>
      </div>
    </body>
    </html>
  `);
});

// ========== КОМАНДЫ БОТА ==========

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name;
  
  const welcome = `
🍎 *Привет, ${name}!*

Я помогу считать калории!

*Команды:*
/setgoal - Установить дневную норму
/add - Добавить еду
/today - Статистика за день
/clear - Сбросить данные
/help - Помощь

*Пример добавления еды:*
"200г риса с курицей"
"2 яйца и кофе"
"Яблоко 150г"

Начните с /setgoal
  `;
  
  bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const help = `
*📖 Помощь*

1. Установите норму: /setgoal
2. Добавляйте еду: /add
3. Следите: /today

*📝 Формат:*
• Указывайте количество: "200г", "2 шт"
• Можно несколько продуктов
• ИИ поможет с сложными блюдами

*🔧 Технически:*
• База: ${Object.keys(foodDatabase).length} продуктов
• ИИ: ${openai ? '✅ Включен' : '❌ Выключен'}
  `;
  
  bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
});

bot.onText(/\/setgoal/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '🎯 Введите дневную норму калорий:');
  
  const user = userData.get(chatId) || {};
  user.waitingFor = 'goal';
  userData.set(chatId, user);
});

bot.onText(/\/add/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (!user || !user.dailyGoal) {
    bot.sendMessage(chatId, 'Сначала установите норму: /setgoal');
    return;
  }
  
  bot.sendMessage(chatId, '🍽️ Что вы съели? Опишите:');
  user.waitingFor = 'food';
  userData.set(chatId, user);
});

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
  
  let message = `📊 *Статистика за день*\n\n`;
  message += `🎯 Норма: ${user.dailyGoal} ккал\n`;
  message += `🍽️ Съедено: ${consumed} ккал\n`;
  message += `✅ Осталось: ${remaining} ккал\n`;
  message += `📈 ${percent}% выполнено\n\n`;
  
  if (foods.length > 0) {
    message += '*Съедено:*\n';
    foods.forEach((food, i) => {
      message += `${i+1}. ${food.name} - ${food.calories} ккал\n`;
    });
  } else {
    message += 'Еще ничего не съедено. Добавьте: /add';
  }
  
  // Прогресс бар
  const barLength = 10;
  const filled = Math.min(barLength, Math.floor(percent / 10));
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
  message += `\n${bar}`;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

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

bot.onText(/\/keepalive/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    `🔄 KeepAlive активен\n` +
    `🌐 Сервер: ${appUrl}\n` +
    `📊 Пинги: каждые 5 минут\n` +
    `✅ Статус: работает`,
    { parse_mode: 'Markdown' }
  );
});

// Обработка сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  
  if (text.startsWith('/')) return;
  
  let user = userData.get(chatId) || {};
  user.userId = userId;
  user.lastActive = new Date().toISOString();
  
  if (user.waitingFor === 'goal') {
    const goal = parseInt(text);
    
    if (isNaN(goal) || goal <= 0 || goal > 10000) {
      bot.sendMessage(chatId, '❌ Введите число от 100 до 10000');
      return;
    }
    
    user.dailyGoal = goal;
    user.consumed = 0;
    user.foods = [];
    user.waitingFor = null;
    
    userData.set(chatId, user);
    
    bot.sendMessage(chatId, 
      `✅ Норма установлена: *${goal} ккал*\n\n` +
      `Теперь добавляйте еду командой /add\n` +
      `Или просто напишите что съели!`,
      { parse_mode: 'Markdown' }
    );
    
  } else if (user.waitingFor === 'food' || (!user.waitingFor && user.dailyGoal)) {
    
    if (!text || text.length < 2) {
      bot.sendMessage(chatId, 'Пожалуйста, опишите что съели');
      return;
    }
    
    bot.sendChatAction(chatId, 'typing');
    
    try {
      const analysis = await analyzeFoodInput(text);
      
      if (!analysis) {
        bot.sendMessage(chatId, 'Не удалось распознать. Попробуйте: "200г риса"');
        return;
      }
      
      // Сохраняем
      user.consumed = (user.consumed || 0) + analysis.calories;
      user.foods = user.foods || [];
      user.foods.push({
        name: analysis.foodName,
        calories: analysis.calories,
        time: new Date().toLocaleTimeString('ru-RU')
      });
      user.waitingFor = null;
      
      userData.set(chatId, user);
      
      // Отправляем результат
      const remaining = Math.max(0, user.dailyGoal - user.consumed);
      const percent = Math.round((user.consumed / user.dailyGoal) * 100);
      
      let response = `✅ *Добавлено!*\n\n`;
      response += `🍽️ ${analysis.foodName}\n`;
      response += `📏 ${analysis.quantity}г\n`;
      response += `🔥 ${analysis.calories} ккал\n\n`;
      
      if (analysis.protein > 0) {
        response += `🥩 Белки: ${analysis.protein}g\n`;
        response += `🥑 Жиры: ${analysis.fat}g\n`;
        response += `🍚 Углеводы: ${analysis.carbs}g\n\n`;
      }
      
      response += `📊 Итого: ${user.consumed}/${user.dailyGoal} ккал\n`;
      response += `✅ Осталось: ${remaining} ккал\n`;
      response += `📈 ${percent}% выполнено`;
      
      if (analysis.source === 'ИИ') {
        response += `\n\n🤖 *Определено ИИ*`;
      } else if (analysis.source === 'оценка') {
        response += `\n\n📝 *Примерная оценка*`;
      }
      
      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Ошибка обработки:', error);
      bot.sendMessage(chatId, '❌ Ошибка. Попробуйте еще раз');
    }
    
  } else {
    // Первое сообщение
    if (!user.dailyGoal) {
      bot.sendMessage(chatId, 
        `👋 Привет! Я бот для подсчета калорий.\n\n` +
        `Начните с установки дневной нормы:\n` +
        `/setgoal`
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

// ========== KEEP ALIVE ФУНКЦИЯ ==========
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
  
  // Первый пинг сразу
  ping();
  
  // Затем каждые 5 минут
  const interval = setInterval(ping, 5 * 60 * 1000);
  
  // Дополнительные пинги в начале
  setTimeout(ping, 30000);
  setTimeout(ping, 60000);
  
  // Очистка при завершении
  process.on('SIGTERM', () => {
    clearInterval(interval);
  });
  
  process.on('SIGINT', () => {
    clearInterval(interval);
  });
}

// ========== ЗАПУСК СЕРВЕРА ==========
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║        🍎 CALORIE BOT v2.0 🍏         ║
╠════════════════════════════════════════╣
║ Статус:    ✅ Запущен                 ║
║ Порт:      ${port}                    ║
║ URL:       ${appUrl}                  ║
║ Пользователи: ${userData.size}        ║
║ Продукты:  ${Object.keys(foodDatabase).length} ║
║ ИИ:        ${openai ? '✅' : '❌'}    ║
╚════════════════════════════════════════╝
  `);
  
  // Запускаем KeepAlive
  startKeepAlive();
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
  console.log('🛑 Получен SIGINT (Ctrl+C), завершаем работу...');
  server.close(() => {
    console.log('✅ HTTP сервер остановлен');
    process.exit(0);
  });
});

// Экспорт для тестирования
export { app, bot, userData, foodDatabase };
