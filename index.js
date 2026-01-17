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
  'апельсин': { calories: 47, protein: 0.9, fat: 0.1, carbs: 12 },
  'мандарин': { calories: 40, protein: 0.8, fat: 0.2, carbs: 10 },
  'груша': { calories: 57, protein: 0.4, fat: 0.1, carbs: 15 },
  'персик': { calories: 46, protein: 0.9, fat: 0.1, carbs: 11 },
  'виноград': { calories: 72, protein: 0.6, fat: 0.2, carbs: 18 },
  'арбуз': { calories: 30, protein: 0.6, fat: 0.2, carbs: 7 },
  'дыня': { calories: 34, protein: 0.8, fat: 0.2, carbs: 8 },
  'клубника': { calories: 32, protein: 0.7, fat: 0.3, carbs: 7 },
  'малина': { calories: 52, protein: 1.2, fat: 0.7, carbs: 12 },
  'черника': { calories: 57, protein: 0.7, fat: 0.3, carbs: 14 },
  
  'курица': { calories: 165, protein: 31, fat: 3.6, carbs: 0 },
  'индейка': { calories: 135, protein: 29, fat: 1.5, carbs: 0 },
  'утка': { calories: 337, protein: 19, fat: 28, carbs: 0 },
  'говядина': { calories: 250, protein: 26, fat: 15, carbs: 0 },
  'свинина': { calories: 242, protein: 25, fat: 14, carbs: 0 },
  'баранина': { calories: 294, protein: 25, fat: 21, carbs: 0 },
  'колбаса': { calories: 300, protein: 12, fat: 27, carbs: 1 },
  'сосиски': { calories: 260, protein: 11, fat: 24, carbs: 2 },
  'ветчина': { calories: 270, protein: 16, fat: 22, carbs: 1 },
  
  'лосось': { calories: 208, protein: 20, fat: 13, carbs: 0 },
  'тунец': { calories: 184, protein: 30, fat: 6, carbs: 0 },
  'треска': { calories: 82, protein: 18, fat: 0.7, carbs: 0 },
  'сельдь': { calories: 158, protein: 17, fat: 9, carbs: 0 },
  'минтай': { calories: 72, protein: 16, fat: 1, carbs: 0 },
  'креветки': { calories: 95, protein: 20, fat: 1.1, carbs: 0 },
  'кальмары': { calories: 92, protein: 16, fat: 1.4, carbs: 3 },
  
  'рис': { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  'гречка': { calories: 110, protein: 4, fat: 1, carbs: 21 },
  'овсянка': { calories: 68, protein: 2.4, fat: 1.4, carbs: 12 },
  'манка': { calories: 80, protein: 2.5, fat: 0.2, carbs: 17 },
  'перловка': { calories: 123, protein: 2.3, fat: 0.4, carbs: 28 },
  'пшено': { calories: 119, protein: 3.5, fat: 1, carbs: 23 },
  'булгур': { calories: 83, protein: 3.1, fat: 0.2, carbs: 18 },
  'киноа': { calories: 120, protein: 4.4, fat: 1.9, carbs: 21 },
  
  'картофель': { calories: 77, protein: 2, fat: 0.1, carbs: 17 },
  'помидор': { calories: 18, protein: 0.9, fat: 0.2, carbs: 3.9 },
  'огурец': { calories: 15, protein: 0.7, fat: 0.1, carbs: 3.6 },
  'морковь': { calories: 41, protein: 0.9, fat: 0.2, carbs: 10 },
  'лук': { calories: 40, protein: 1.1, fat: 0.1, carbs: 9 },
  'чеснок': { calories: 149, protein: 6.4, fat: 0.5, carbs: 33 },
  'перец': { calories: 27, protein: 1, fat: 0.2, carbs: 6 },
  'баклажан': { calories: 24, protein: 1, fat: 0.2, carbs: 6 },
  'кабачок': { calories: 24, protein: 0.6, fat: 0.3, carbs: 5 },
  'капуста': { calories: 25, protein: 1.3, fat: 0.1, carbs: 6 },
  'брокколи': { calories: 34, protein: 2.8, fat: 0.4, carbs: 7 },
  'цветная капуста': { calories: 25, protein: 2, fat: 0.3, carbs: 5 },
  'свекла': { calories: 43, protein: 1.6, fat: 0.2, carbs: 10 },
  'редис': { calories: 16, protein: 0.7, fat: 0.1, carbs: 3 },
  
  'яйцо': { calories: 155, protein: 13, fat: 11, carbs: 1.1 },
  'творог': { calories: 101, protein: 17, fat: 4, carbs: 3 },
  'творог 5%': { calories: 121, protein: 17, fat: 5, carbs: 3 },
  'творог 9%': { calories: 159, protein: 16, fat: 9, carbs: 3 },
  'сыр': { calories: 402, protein: 25, fat: 33, carbs: 1.3 },
  'сыр плавленный': { calories: 305, protein: 22, fat: 23, carbs: 2 },
  'брынза': { calories: 260, protein: 22, fat: 19, carbs: 0 },
  'молоко': { calories: 42, protein: 3.4, fat: 1, carbs: 4.8 },
  'молоко 2.5%': { calories: 52, protein: 2.9, fat: 2.5, carbs: 4.7 },
  'кефир': { calories: 41, protein: 3.4, fat: 1, carbs: 4.8 },
  'кефир 2.5%': { calories: 53, protein: 3, fat: 2.5, carbs: 4 },
  'йогурт': { calories: 59, protein: 3.5, fat: 1.5, carbs: 6 },
  'йогурт греческий': { calories: 115, protein: 9, fat: 3.5, carbs: 4 },
  'сметана': { calories: 206, protein: 2.8, fat: 20, carbs: 3.2 },
  'сметана 15%': { calories: 162, protein: 2.6, fat: 15, carbs: 3 },
  'сливки': { calories: 205, protein: 2.5, fat: 20, carbs: 4 },
  'масло сливочное': { calories: 717, protein: 0.5, fat: 81, carbs: 0.8 },
  
  'хлеб белый': { calories: 265, protein: 9, fat: 3.2, carbs: 49 },
  'хлеб черный': { calories: 250, protein: 8, fat: 3, carbs: 48 },
  'хлеб бородинский': { calories: 210, protein: 6.9, fat: 1.3, carbs: 43 },
  'батон': { calories: 270, protein: 8, fat: 3.5, carbs: 51 },
  'булка': { calories: 270, protein: 8, fat: 3.5, carbs: 51 },
  'лаваш': { calories: 277, protein: 9, fat: 1.2, carbs: 58 },
  'сухари': { calories: 400, protein: 12, fat: 14, carbs: 67 },
  
  'шоколад молочный': { calories: 546, protein: 5, fat: 31, carbs: 61 },
  'шоколад темный': { calories: 546, protein: 5, fat: 31, carbs: 61 },
  'печенье': { calories: 417, protein: 7.5, fat: 10, carbs: 76 },
  'конфеты': { calories: 450, protein: 2, fat: 20, carbs: 65 },
  'торт': { calories: 350, protein: 4, fat: 16, carbs: 45 },
  'пирог': { calories: 320, protein: 5, fat: 14, carbs: 42 },
  'мороженое': { calories: 207, protein: 3.8, fat: 11, carbs: 24 },
  'мед': { calories: 329, protein: 0.8, fat: 0, carbs: 81 },
  'варенье': { calories: 265, protein: 0.3, fat: 0, carbs: 70 },
  'сахар': { calories: 387, protein: 0, fat: 0, carbs: 100 },
  
  'орехи грецкие': { calories: 654, protein: 15, fat: 65, carbs: 14 },
  'миндаль': { calories: 579, protein: 21, fat: 50, carbs: 22 },
  'арахис': { calories: 567, protein: 26, fat: 49, carbs: 16 },
  'фисташки': { calories: 557, protein: 20, fat: 50, carbs: 27 },
  'кешью': { calories: 553, protein: 18, fat: 44, carbs: 30 },
  'семечки подсолнечника': { calories: 578, protein: 21, fat: 49, carbs: 20 },
  'семечки тыквенные': { calories: 446, protein: 24, fat: 19, carbs: 54 },
  
  'кофе': { calories: 2, protein: 0.1, fat: 0, carbs: 0 },
  'чай': { calories: 1, protein: 0, fat: 0, carbs: 0.2 },
  'сок апельсиновый': { calories: 46, protein: 0.5, fat: 0.1, carbs: 11 },
  'сок яблочный': { calories: 46, protein: 0.1, fat: 0.1, carbs: 11 },
  'кола': { calories: 42, protein: 0, fat: 0, carbs: 11 },
  'пепси': { calories: 42, protein: 0, fat: 0, carbs: 11 },
  'вода': { calories: 0, protein: 0, fat: 0, carbs: 0 },
  
  'пиво': { calories: 43, protein: 0.5, fat: 0, carbs: 3.6 },
  'вино красное': { calories: 85, protein: 0.1, fat: 0, carbs: 2.7 },
  'вино белое': { calories: 82, protein: 0.1, fat: 0, carbs: 2.7 },
  'водка': { calories: 231, protein: 0, fat: 0, carbs: 0 },
  'коньяк': { calories: 239, protein: 0, fat: 0, carbs: 0.1 },
  
  'масло подсолнечное': { calories: 884, protein: 0, fat: 100, carbs: 0 },
  'масло оливковое': { calories: 884, protein: 0, fat: 100, carbs: 0 },
  'майонез': { calories: 680, protein: 0.5, fat: 75, carbs: 2.5 },
  'кетчуп': { calories: 112, protein: 1.8, fat: 0.4, carbs: 26 },
  'горчица': { calories: 162, protein: 6.4, fat: 6.2, carbs: 22 },
  'соус соевый': { calories: 53, protein: 6, fat: 0, carbs: 11 },
  
  // Популярные блюда
  'борщ': { calories: 50, protein: 2.5, fat: 2, carbs: 7 },
  'щи': { calories: 45, protein: 2, fat: 1.5, carbs: 6 },
  'суп куриный': { calories: 30, protein: 3, fat: 1, carbs: 4 },
  'пюре картофельное': { calories: 106, protein: 2, fat: 4, carbs: 16 },
  'гречка с мясом': { calories: 150, protein: 10, fat: 5, carbs: 15 },
  'рис с курицей': { calories: 140, protein: 12, fat: 4, carbs: 14 },
  'омлет': { calories: 154, protein: 11, fat: 12, carbs: 2 },
  'блины': { calories: 230, protein: 6, fat: 8, carbs: 32 },
  'пицца': { calories: 266, protein: 11, fat: 9, carbs: 36 },
  'салат оливье': { calories: 198, protein: 5, fat: 16, carbs: 8 },
  'салат цезарь': { calories: 215, protein: 12, fat: 16, carbs: 7 },
  'пельмени': { calories: 275, protein: 12, fat: 15, carbs: 25 },
  'вареники': { calories: 265, protein: 8, fat: 5, carbs: 45 },
  'шашлык': { calories: 220, protein: 20, fat: 15, carbs: 0 },
  'котлеты': { calories: 220, protein: 15, fat: 16, carbs: 6 },
  'сосиска': { calories: 260, protein: 11, fat: 24, carbs: 2 },
  'бутерброд': { calories: 250, protein: 8, fat: 12, carbs: 30 },
};

// ========== УЛУЧШЕННЫЕ ФУНКЦИИ AI ==========
async function askAIEnhanced(foodText) {
  if (!openai) return null;
  
  try {
    const prompt = `Ты опытный диетолог и специалист по питанию. Пользователь написал: "${foodText}"

    ПРОАНАЛИЗИРУЙ ЭТО ОПИСАНИЕ И ВЕРНИ ОТВЕТ В СТРОГОМ JSON ФОРМАТЕ:
    
    {
      "foodName": "название блюда или продукта на русском",
      "quantity": число (граммы или мл, если не указано - оцени примерное количество),
      "calories": точное число калорий для указанного количества,
      "protein": число грамм белков,
      "fat": число грамм жиров,
      "carbs": число грамм углеводов,
      "confidence": число от 0.5 до 1 (уверенность в оценке)
    }
    
    ПРАВИЛА:
    1. Если указано количество (200г, 2 шт, 300 мл) - используй его
    2. Если количество не указано - оцени разумное стандартное количество (порцию)
    3. Для сложных блюд учитывай все ингредиенты
    4. Будь максимально точным в подсчетах
    5. Если сомневаешься - указывай confidence ниже 0.7
    
    Примеры правильных ответов:
    {"foodName": "Рис с курицей", "quantity": 300, "calories": 420, "protein": 36, "fat": 12, "carbs": 42, "confidence": 0.85}
    {"foodName": "Яблоко", "quantity": 150, "calories": 78, "protein": 0.5, "fat": 0.3, "carbs": 21, "confidence": 0.9}
    {"foodName": "Омлет из 2 яиц", "quantity": 120, "calories": 185, "protein": 13, "fat": 14, "carbs": 1.2, "confidence": 0.8}
    
    ВЕРНИ ТОЛЬКО JSON, БЕЗ ЛИШНЕГО ТЕКСТА.`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1, // Низкая температура для консистентности
      max_tokens: 500
    });

    const response = completion.choices[0].message.content.trim();
    
    // Извлекаем JSON из ответа
    try {
      // Ищем JSON в ответе
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Валидация ответа
        if (parsed && 
            parsed.calories && 
            parsed.quantity && 
            parsed.confidence && 
            parsed.confidence >= 0.5 &&
            parsed.calories > 0 &&
            parsed.calories < 5000) { // Реалистичные пределы
            
          console.log('✅ AI распознал:', parsed);
          return parsed;
        }
      }
    } catch (parseError) {
      console.log('❌ Ошибка парсинга AI ответа:', parseError.message);
    }
    
    return null;
  } catch (error) {
    console.error('Ошибка AI API:', error.message);
    return null;
  }
}

// Улучшенная функция анализа ввода
async function analyzeFoodInputEnhanced(text) {
  const lowerText = text.toLowerCase().trim();
  console.log(`🔍 Анализируем: "${text}"`);
  
  // Шаг 1: Пытаемся извлечь количество
  let quantity = 100; // по умолчанию 100г
  let unit = 'г';
  
  // Регулярки для разных форматов количества
  const quantityPatterns = [
    /(\d+)\s*(г|грамм|gram|g)\b/i,
    /(\d+)\s*(мл|ml|миллилитр)\b/i,
    /(\d+)\s*(л|литр|liter)\b/i,
    /(\d+)\s*(кг|kg|килограмм)\b/i,
    /(\d+)\s*(шт|штук|piece|pcs)\b/i,
    /(\d+)\s*(порци|serving|portion)\b/i,
    /(\d+)x(\d+)/i, // например 2x100
    /(\d+)/ // просто число
  ];
  
  for (const pattern of quantityPatterns) {
    const match = text.match(pattern);
    if (match) {
      quantity = parseInt(match[1]);
      if (match[2]) unit = match[2].toLowerCase();
      
      // Конвертация единиц
      if (unit === 'кг' || unit === 'kg' || unit === 'литр' || unit === 'л' || unit === 'liter') {
        quantity *= 1000;
        unit = 'г';
      } else if (unit === 'шт' || unit === 'штук' || unit === 'piece' || unit === 'pcs') {
        // Для штучных продуктов предполагаем средний вес
        if (lowerText.includes('яблок') || lowerText.includes('банан') || lowerText.includes('апельсин')) {
          quantity *= 150; // средний фрукт ~150г
        } else if (lowerText.includes('яйц') || lowerText.includes('egg')) {
          quantity *= 50; // яйцо ~50г
        } else if (lowerText.includes('хлеб') || lowerText.includes('булк')) {
          quantity *= 30; // кусок хлеба ~30г
        } else {
          quantity *= 100; // по умолчанию 100г на штуку
        }
        unit = 'г';
      }
      break;
    }
  }
  
  // Шаг 2: Сначала ищем точное совпадение в локальной базе
  for (const [foodName, nutrition] of Object.entries(foodDatabase)) {
    // Ищем точное совпадение или вхождение
    if (lowerText.includes(foodName.toLowerCase()) || 
        foodName.toLowerCase().includes(lowerText) ||
        text.toLowerCase().includes(foodName.toLowerCase())) {
      
      const calories = Math.round((nutrition.calories * quantity) / 100);
      
      console.log(`✅ Найдено в базе: ${foodName}, ${quantity}${unit}, ${calories} ккал`);
      
      return {
        foodName: foodName.charAt(0).toUpperCase() + foodName.slice(1),
        quantity: quantity,
        unit: unit,
        calories: calories,
        protein: Math.round((nutrition.protein * quantity) / 100 * 10) / 10,
        fat: Math.round((nutrition.fat * quantity) / 100 * 10) / 10,
        carbs: Math.round((nutrition.carbs * quantity) / 100 * 10) / 10,
        source: '📚 База данных',
        confidence: 0.9
      };
    }
  }
  
  // Шаг 3: Если не нашли в базе, используем улучшенный AI
  if (openai) {
    console.log('🤖 Обращаемся к ИИ для анализа...');
    try {
      const aiResult = await askAIEnhanced(text);
      
      if (aiResult && aiResult.confidence >= 0.6) {
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
          confidence: aiResult.confidence
        };
      }
    } catch (aiError) {
      console.log('❌ ИИ не ответил:', aiError.message);
    }
  }
  
  // Шаг 4: Резервный метод - оценка по ключевым словам
  console.log('📝 Используем резервную оценку...');
  
  // Определяем тип пищи для примерной оценки
  let caloriesPer100g = 100; // по умолчанию
  
  if (lowerText.includes('салат') || lowerText.includes('овощ') || 
      lowerText.includes('огурец') || lowerText.includes('помидор')) {
    caloriesPer100g = 30;
  } else if (lowerText.includes('фрукт') || lowerText.includes('яблок') || 
             lowerText.includes('банан') || lowerText.includes('апельсин')) {
    caloriesPer100g = 60;
  } else if (lowerText.includes('суп') || lowerText.includes('борщ') || 
             lowerText.includes('щи')) {
    caloriesPer100g = 50;
  } else if (lowerText.includes('мясо') || lowerText.includes('куриц') || 
             lowerText.includes('говядин') || lowerText.includes('свинин')) {
    caloriesPer100g = 200;
  } else if (lowerText.includes('рыб') || lowerText.includes('лосос') || 
             lowerText.includes('тунец')) {
    caloriesPer100g = 150;
  } else if (lowerText.includes('рис') || lowerText.includes('гречк') || 
             lowerText.includes('макарон') || lowerText.includes('картошк')) {
    caloriesPer100g = 130;
  } else if (lowerText.includes('хлеб') || lowerText.includes('булк') || 
             lowerText.includes('тост')) {
    caloriesPer100g = 250;
  } else if (lowerText.includes('сыр') || lowerText.includes('творог') || 
             lowerText.includes('йогурт')) {
    caloriesPer100g = 100;
  } else if (lowerText.includes('шоколад') || lowerText.includes('печенье') || 
             lowerText.includes('торт') || lowerText.includes('сладк')) {
    caloriesPer100g = 400;
  } else if (lowerText.includes('орех') || lowerText.includes('семечк')) {
    caloriesPer100g = 600;
  } else if (lowerText.includes('масло') || lowerText.includes('майонез')) {
    caloriesPer100g = 800;
  }
  
  const estimatedCalories = Math.round((caloriesPer100g * quantity) / 100);
  
  return {
    foodName: text.substring(0, 40),
    quantity: quantity,
    unit: unit,
    calories: estimatedCalories,
    protein: Math.round(quantity * 0.1),
    fat: Math.round(quantity * 0.08),
    carbs: Math.round(quantity * 0.2),
    source: '📊 Примерная оценка',
    confidence: 0.5
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
    foodsInDb: Object.keys(foodDatabase).length,
    aiEnabled: !!openai,
    memory: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
  });
});

// Статусная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>🍎 Calorie Counter AI Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          margin: 0;
          padding: 20px;
          display: flex;
          justify-content: center;
          align-items: center;
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
          color: #2d3748;
          margin-bottom: 10px;
          font-size: 2.2em;
        }
        .emoji {
          font-size: 3em;
          margin-bottom: 20px;
        }
        .status {
          background: #f7fafc;
          border-radius: 10px;
          padding: 20px;
          margin: 25px 0;
          text-align: left;
        }
        .status-item {
          display: flex;
          justify-content: space-between;
          margin: 10px 0;
          padding-bottom: 10px;
          border-bottom: 1px solid #e2e8f0;
        }
        .status-label {
          color: #718096;
          font-weight: 500;
        }
        .status-value {
          font-weight: bold;
          color: #2d3748;
        }
        .ai-badge {
          display: inline-block;
          background: #c6f6d5;
          color: #22543d;
          padding: 5px 15px;
          border-radius: 20px;
          font-weight: bold;
          margin: 10px 0;
        }
        .telegram-btn {
          display: inline-block;
          background: #0088cc;
          color: white;
          text-decoration: none;
          padding: 14px 30px;
          border-radius: 25px;
          font-weight: bold;
          font-size: 1.1em;
          margin-top: 20px;
          transition: all 0.3s;
        }
        .telegram-btn:hover {
          background: #0077b5;
          transform: translateY(-2px);
        }
        footer {
          margin-top: 30px;
          color: #a0aec0;
          font-size: 0.9em;
        }
        .keepalive {
          background: #e6fffa;
          color: #234e52;
          padding: 10px;
          border-radius: 8px;
          margin-top: 20px;
          font-size: 0.9em;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="emoji">🍎🤖</div>
        <h1>Calorie Counter AI</h1>
        
        <div class="ai-badge">
          ${openai ? '🧠 ИИ АКТИВЕН' : '📚 Локальная база'}
        </div>
        
        <div class="status">
          <div class="status-item">
            <span class="status-label">Статус сервера:</span>
            <span class="status-value" style="color:#38a169;">✅ Работает</span>
          </div>
          <div class="status-item">
            <span class="status-label">Активных пользователей:</span>
            <span class="status-value">${userData.size}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Продуктов в базе:</span>
            <span class="status-value">${Object.keys(foodDatabase).length}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Искусственный интеллект:</span>
            <span class="status-value">${openai ? '✅ Включен' : '❌ Не подключен'}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Время работы:</span>
            <span class="status-value">${Math.floor(process.uptime() / 60)} минут</span>
          </div>
        </div>
        
        <p style="color: #4a5568; line-height: 1.6;">
          Умный бот для подсчета калорий с использованием искусственного интеллекта.
          Распознает сложные блюда и точно считает калории.
        </p>
        
        <a href="https://t.me/${bot.token ? bot.token.split(':')[0] : 'ваш_бот'}_bot" 
           class="telegram-btn" target="_blank">
          💬 Открыть в Telegram
        </a>
        
        <div class="keepalive">
          ⚡ KeepAlive активен: пинги каждые 5 минут
        </div>
        
        <footer>
          <p>Версия 2.1 | AI Enhanced Calorie Counter</p>
          <p>Автоматическая поддержка активности на Render</p>
        </footer>
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
🍎 *Привет, ${name}!* 🤖

Я — продвинутый бот для подсчета калорий с *искусственным интеллектом*!

*✨ Мои возможности:*
• Точный подсчет калорий с помощью ИИ
• База из *${Object.keys(foodDatabase).length}* продуктов и блюд
• Распознавание сложных описаний
• Подсчет БЖУ (белки, жиры, углеводы)
• Ежедневная статистика

*📋 Основные команды:*
/setgoal - Установить дневную норму
/add - Добавить съеденную еду
/today - Статистика за сегодня
/foods - Список продуктов
/clear - Сбросить данные за день
/help - Подробная помощь

*🍽️ Примеры что можно писать:*
• "200г гречки с куриной грудкой"
• "Салат Цезарь 300г"
• "Омлет из 2 яиц с сыром"
• "Чашка кофе с молоком и сахаром"
• "Пицца пепперони 2 куска"
• "Борщ со сметаной и хлебом"

*🎯 Начните с установки цели:*
/setgoal
  `;
  
  bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const help = `
*🤖 ПОМОЩЬ ПО ИСПОЛЬЗОВАНИЮ БОТА*

*1. 🎯 Установите цель*
   Используйте /setgoal чтобы установить дневную норму калорий

*2. 🍽️ Добавляйте еду*
   • Команда /add
   • Или просто напишите что съели
   
   *Формат:* "название количество"
   *Примеры:*
   • "гречка 150г с курицей 200г"
   • "салат из помидоров и огурцов 300г"
   • "2 яйца вареных"
   • "кофе с молоком 200мл"

*3. 📊 Отслеживайте прогресс*
   • /today - статистика за день
   • Прогресс-бар и БЖУ

*4. 🗑️ Управление данными*
   • /clear - сбросить данные за день
   • /setgoal - изменить норму

*🧠 ОСОБЕННОСТИ ИИ:*
• Распознает сложные блюда и рецепты
• Учитывает все ингредиенты
• Оценивает порции если не указано количество
• Показывает уверенность в оценке

*📈 ДЛЯ ТОЧНОСТИ:*
• Указывайте количество (г, мл, шт)
• Чем подробнее описание, тем точнее подсчет
• Для сложных блюд ИИ даст наиболее точную оценку

*🔧 ТЕХНИЧЕСКАЯ ИНФОРМАЦИЯ:*
• База данных: ${Object.keys(foodDatabase).length} продуктов
• ИИ: ${openai ? '✅ Активен (OpenAI GPT-3.5)' : '❌ Не активен'}
• Точность: ИИ оценивает с уверенностью 60-95%
  `;
  
  bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
});

bot.onText(/\/setgoal/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId) || {};
  
  bot.sendMessage(chatId, 
    `🎯 *Установите дневную норму калорий*\n\n` +
    `Рекомендуемые значения:\n` +
    `• Похудение: 1500-1800 ккал\n` +
    `• Поддержание: 2000-2200 ккал\n` +
    `• Набор массы: 2500-3000 ккал\n\n` +
    `*Введите вашу индивидуальную норму:*`,
    { parse_mode: 'Markdown' }
  );
  
  user.waitingFor = 'goal';
  userData.set(chatId, user);
});

bot.onText(/\/add/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId);
  
  if (!user || !user.dailyGoal) {
    bot.sendMessage(chatId, 
      `⚠️ *Сначала установите дневную норму!*\n\n` +
      `Используйте команду /setgoal`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  bot.sendMessage(chatId, 
    `🍽️ *Что вы съели?*\n\n` +
    `Опишите блюдо или продукты *с количеством*:\n\n` +
    `*Примеры:*\n` +
    `• "200г риса с куриной грудкой"\n` +
    `• "Салат Цезарь 300г"\n` +
    `• "Омлет из 2 яиц с сыром"\n` +
    `• "Чашка кофе с молоком 200мл"\n` +
    `• "Борщ 400мл и хлеб 50г"\n\n` +
    `*ИИ проанализирует и точно посчитает калории!*`,
    { parse_mode: 'Markdown' }
  );
  
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
  
  // Считаем БЖУ
  let totalProtein = 0, totalFat = 0, totalCarbs = 0;
  foods.forEach(food => {
    totalProtein += food.protein || 0;
    totalFat += food.fat || 0;
    totalCarbs += food.carbs || 0;
  });
  
  let message = `📊 *Статистика за сегодня*\n\n`;
  message += `🎯 Дневная норма: *${user.dailyGoal}* ккал\n`;
  message += `🍽️ Съедено: *${consumed}* ккал\n`;
  message += `✅ Осталось: *${remaining}* ккал\n`;
  message += `📈 Выполнено: *${percent}%*\n\n`;
  
  // Прогресс бар
  const barLength = 10;
  const filled = Math.min(barLength, Math.floor(percent / 10));
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
  message += `${bar}\n\n`;
  
  // БЖУ
  message += `*Питательные вещества:*\n`;
  message += `🥩 Белки: *${totalProtein.toFixed(1)}г*\n`;
  message += `🥑 Жиры: *${totalFat.toFixed(1)}г*\n`;
  message += `🍚 Углеводы: *${totalCarbs.toFixed(1)}г*\n\n`;
  
  // Список еды
  if (foods.length > 0) {
    message += `*Съеденная еда:*\n`;
    foods.forEach((food, i) => {
      const time = food.time ? ` (${food.time})` : '';
      const source = food.source ? ` ${food.source}` : '';
      message += `${i+1}. ${food.name} - *${food.calories}* ккал${time}${source}\n`;
    });
  } else {
    message += `🍽️ *Еще ничего не съедено*\n`;
    message += `Добавьте первую запись с помощью /add`;
  }
  
  // Рекомендации
  if (consumed > user.dailyGoal) {
    const over = consumed - user.dailyGoal;
    message += `\n⚠️ *Превышение нормы на ${over} ккал*`;
  } else if (remaining === 0) {
    message += `\n🎉 *Цель достигнута! Отличная работа!*`;
  } else if (remaining < 500) {
    message += `\n👍 *Осталось немного! Почти у цели!*`;
  }
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

bot.onText(/\/foods/, (msg) => {
  const chatId = msg.chat.id;
  
  const categories = {};
  Object.entries(foodDatabase).forEach(([name, data]) => {
    // Простая категоризация по ключевым словам
    let category = 'другое';
    if (name.includes('яблок') || name.includes('банан') || name.includes('апельсин') || 
        name.includes('фрукт') || name.includes('ягод')) {
      category = 'фрукты';
    } else if (name.includes('куриц') || name.includes('говядин') || name.includes('мясо') || 
               name.includes('свинин') || name.includes('колбас')) {
      category = 'мясо';
    } else if (name.includes('рыб') || name.includes('лосос') || name.includes('креветк')) {
      category = 'рыба';
    } else if (name.includes('рис') || name.includes('гречк') || name.includes('овсянк') || 
               name.includes('круп')) {
      category = 'крупы';
    } else if (name.includes('овощ') || name.includes('помидор') || name.includes('огурец') || 
               name.includes('картош') || name.includes('салат')) {
      category = 'овощи';
    } else if (name.includes('молок') || name.includes('сыр') || name.includes('творог') || 
               name.includes('йогурт') || name.includes('яйц')) {
      category = 'молочные';
    } else if (name.includes('хлеб') || name.includes('булк')) {
      category = 'хлеб';
    } else if (name.includes('шоколад') || name.includes('печенье') || name.includes('торт') || 
               name.includes('сладк')) {
      category = 'сладости';
    } else if (name.includes('орех') || name.includes('семечк')) {
      category = 'орехи';
    }
    
    if (!categories[category]) categories[category] = [];
    categories[category].push(name);
  });
  
  let message = `📋 *База продуктов*\n\n`;
  message += `Всего продуктов: *${Object.keys(foodDatabase).length}*\n\n`;
  
  Object.entries(categories).forEach(([category, products]) => {
    if (products.length > 0) {
      message += `*${category.toUpperCase()}* (${products.length}):\n`;
      products.slice(0, 5).forEach(product => {
        const nutrition = foodDatabase[product];
        message += `• ${product} - ${nutrition.calories} ккал/100г\n`;
      });
      if (products.length > 5) {
        message += `... и еще ${products.length - 5}\n`;
      }
      message += '\n';
    }
  });
  
  message += `_Для других продуктов используется ${openai ? 'ИИ с высокой точностью' : 'оценка'}_`;
  
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
  
  bot.sendMessage(chatId, 
    `🗑️ *Данные за день очищены!*\n\n` +
    `Дневная норма сохранена: *${user?.dailyGoal || 0} ккал*\n` +
    `Можно начинать новый день!`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/keepalive/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    `🔄 *KeepAlive статус*\n\n` +
    `🌐 Сервер: ${appUrl}\n` +
    `⏱️  Пинги: каждые 5 минут\n` +
    `📊 Health check: /health\n` +
    `✅ Сервер поддерживается активным\n\n` +
    `_Это предотвращает "засыпание" на бесплатном тарифе Render_`,
    { parse_mode: 'Markdown' }
  );
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
      `🎉 *Отлично, ${userName}!*\n\n` +
      `Дневная норма установлена: *${goal} ккал*\n\n` +
      `Теперь добавляйте съеденную еду:\n` +
      `• Используйте команду /add\n` +
      `• Или просто напишите что съели\n\n` +
      `*Пример:* "На завтрак 2 яйца и кофе с молоком"`,
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
      
      if (!analysis) {
        bot.sendMessage(chatId, 
          '❌ *Не удалось распознать еду*\n\n' +
          'Попробуйте описать точнее:\n' +
          '• "Гречка 150г с курицей 100г"\n' +
          '• "2 яйца всмятку"\n' +
          '• "Суп 300мл и хлеб 50г"\n\n' +
          'Или используйте продукты из базы: /foods',
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      // Сохраняем данные
      user.consumed = (user.consumed || 0) + analysis.calories;
      user.foods = user.foods || [];
      user.foods.push({
        name: analysis.foodName,
        quantity: analysis.quantity,
        unit: analysis.unit,
        calories: analysis.calories,
        protein: analysis.protein,
        fat: analysis.fat,
        carbs: analysis.carbs,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        source: analysis.source,
        confidence: analysis.confidence,
        addedAt: new Date().toISOString()
      });
      user.waitingFor = null;
      
      userData.set(chatId, user);
      
      // Формируем ответ
      const remaining = Math.max(0, user.dailyGoal - user.consumed);
      const percent = Math.round((user.consumed / user.dailyGoal) * 100);
      
      let response = `✅ *Еда добавлена!*\n\n`;
      response += `🍽️ *${analysis.foodName}*\n`;
      response += `📏 ${analysis.quantity}${analysis.unit}\n`;
      response += `🔥 ${analysis.calories} ккал\n\n`;
      
      if (analysis.protein > 0 || analysis.fat > 0 || analysis.carbs > 0) {
        response += `🥩 Белки: ${analysis.protein.toFixed(1)}г\n`;
        response += `🥑 Жиры: ${analysis.fat.toFixed(1)}г\n`;
        response += `🍚 Углеводы: ${analysis.carbs.toFixed(1)}г\n\n`;
      }
      
      response += `📊 *Итого за день:* ${user.consumed}/${user.dailyGoal} ккал\n`;
      response += `📉 *Осталось:* ${remaining} ккал\n`;
      response += `📈 *Прогресс:* ${percent}%\n\n`;
      
      response += `${analysis.source}\n`;
      
      if (analysis.confidence) {
        const confidencePercent = Math.round(analysis.confidence * 100);
        let confidenceEmoji = '✅';
        if (analysis.confidence < 0.7) confidenceEmoji = '⚠️';
        if (analysis.confidence < 0.5) confidenceEmoji = '❓';
        
        response += `${confidenceEmoji} Уверенность: ${confidencePercent}%`;
      }
      
      // Добавляем рекомендацию если превышение
      if (user.consumed > user.dailyGoal) {
        const over = user.consumed - user.dailyGoal;
        response += `\n\n⚠️ *Превышение нормы на ${over} ккал*`;
      }
      
      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Ошибка обработки еды:', error);
      bot.sendMessage(chatId, 
        '❌ *Произошла ошибка*\n\n' +
        'Пожалуйста, попробуйте еще раз или опишите по-другому.\n' +
        'Пример: "Рис 200г с курицей 150г"',
        { parse_mode: 'Markdown' }
      );
    }
    
  } else {
    // Первое сообщение от пользователя
    if (!user.dailyGoal) {
      bot.sendMessage(chatId, 
        `👋 *Привет, ${userName}!*\n\n` +
        `Я умный бот для подсчета калорий с ИИ.\n\n` +
        `Для начала установите дневную норму:\n` +
        `/setgoal\n\n` +
        `Затем добавляйте съеденную еду и следите за прогрессом!`,
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

// ========== KEEP ALIVE СИСТЕМА ==========
function startKeepAlive() {
  const keepAliveUrl = appUrl;
  let pingCount = 0;
  
  async function ping() {
    pingCount++;
    try {
      const response = await fetch(`${keepAliveUrl}/health`);
      const data = await response.json();
      console.log(`🔄 KeepAlive #${pingCount}: ${response.status} - ${data.users} пользователей`);
      return data;
    } catch (error) {
      console.log(`⚠️  KeepAlive #${pingCount}: ${error.message}`);
      return null;
    }
  }
  
  console.log(`🔄 Запуск KeepAlive для ${keepAliveUrl}`);
  
  // Первый пинг сразу
  setTimeout(() => ping(), 1000);
  
  // Затем каждые 5 минут
  const interval = setInterval(ping, 5 * 60 * 1000);
  
  // Дополнительные пинги в начале
  setTimeout(ping, 30000);
  setTimeout(ping, 60000);
  setTimeout(ping, 120000);
  
  // Очистка при завершении
  process.on('SIGTERM', () => {
    clearInterval(interval);
  });
  
  process.on('SIGINT', () => {
    clearInterval(interval);
  });
  
  return interval;
}

// ========== ЗАПУСК СЕРВЕРА ==========
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║              🍎 CALORIE AI BOT v2.1 🍏              ║
╠══════════════════════════════════════════════════════╣
║ Статус:              ✅ ЗАПУЩЕН                      ║
║ Порт:                ${port.toString().padEnd(30)}║
║ URL:                 ${appUrl.padEnd(30)}║
║ Пользователей:       ${userData.size.toString().padEnd(30)}║
║ База продуктов:      ${Object.keys(foodDatabase).length.toString().padEnd(30)}║
║ Искусственный интеллект: ${openai ? '✅ ВКЛЮЧЕН'.padEnd(28) : '❌ ВЫКЛЮЧЕН'.padEnd(28)}║
║ KeepAlive:           ✅ АКТИВЕН                     ║
╚══════════════════════════════════════════════════════╝
  `);
  
  // Запускаем KeepAlive
  startKeepAlive();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Получен SIGTERM, завершаем работу...');
  server.close(() => {
    console.log('✅ HTTP сервер остановлен');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 Получен SIGINT (Ctrl+C), завершаем работу...');
  server.close(() => {
    console.log('✅ HTTP сервер остановлен');
    process.exit(0);
  });
});
