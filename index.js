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
  process.exit(1);
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

// ========== ХРАНИЛИЩЕ ДАННЫХ ==========
const userData = new Map();          // Данные пользователей (норма, съеденное)
const userStates = new Map();        // Состояния пользователей (текущий шаг)
const pendingCorrections = new Map(); // Временные данные для подтверждения

// ========== КЛАВИАТУРЫ ==========
const goalKeyboard = {
  keyboard: [
    ['1500 ккал', '2000 ккал'],
    ['2500 ккал', 'Ввести свою норму']
  ],
  resize_keyboard: true,
  one_time_keyboard: true
};

const mainKeyboard = {
  keyboard: [
    ['🍽️ Добавить еду', '📊 Статистика'],
    ['🎯 Изменить норму', '📋 Продукты'],
    ['🔄 Сбросить день', '❓ Помощь']
  ],
  resize_keyboard: true
};

// ========== БАЗА ДАННЫХ ПРОДУКТОВ (упрощенная версия) ==========
const foodDatabase = {
  // ФРУКТЫ И ЯГОДЫ (150 продуктов)
  'яблоко': { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
  'яблоко зеленое': { calories: 47, protein: 0.4, fat: 0.1, carbs: 12 },
  'яблоко красное': { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
  'банан': { calories: 96, protein: 1.1, fat: 0.2, carbs: 23 },
  'банан спелый': { calories: 105, protein: 1.3, fat: 0.3, carbs: 27 },
  'апельсин': { calories: 47, protein: 0.9, fat: 0.1, carbs: 12 },
  'мандарин': { calories: 40, protein: 0.8, fat: 0.2, carbs: 10 },
  'грейпфрут': { calories: 42, protein: 0.8, fat: 0.1, carbs: 11 },
  'лимон': { calories: 29, protein: 1.1, fat: 0.3, carbs: 9 },
  'лайм': { calories: 30, protein: 0.7, fat: 0.2, carbs: 11 },
  'груша': { calories: 57, protein: 0.4, fat: 0.1, carbs: 15 },
  'персик': { calories: 46, protein: 0.9, fat: 0.1, carbs: 11 },
  'нектарин': { calories: 44, protein: 1.1, fat: 0.3, carbs: 11 },
  'абрикос': { calories: 48, protein: 1.4, fat: 0.4, carbs: 11 },
  'слива': { calories: 46, protein: 0.7, fat: 0.3, carbs: 11 },
  'вишня': { calories: 52, protein: 0.8, fat: 0.2, carbs: 12 },
  'черешня': { calories: 63, protein: 1.1, fat: 0.2, carbs: 16 },
  'киви': { calories: 61, protein: 1.1, fat: 0.5, carbs: 15 },
  'ананас': { calories: 50, protein: 0.5, fat: 0.1, carbs: 13 },
  'манго': { calories: 60, protein: 0.8, fat: 0.4, carbs: 15 },
  'папайя': { calories: 43, protein: 0.5, fat: 0.3, carbs: 11 },
  'гранат': { calories: 83, protein: 1.7, fat: 1.2, carbs: 19 },
  'инжир': { calories: 74, protein: 0.8, fat: 0.3, carbs: 19 },
  'финик': { calories: 282, protein: 2.5, fat: 0.4, carbs: 75 },
  'изюм': { calories: 299, protein: 3.1, fat: 0.5, carbs: 79 },
  'курага': { calories: 241, protein: 3.4, fat: 0.5, carbs: 63 },
  'чернослив': { calories: 240, protein: 2.2, fat: 0.4, carbs: 64 },
  'инжир сушеный': { calories: 249, protein: 3.3, fat: 0.9, carbs: 64 },
  'виноград': { calories: 72, protein: 0.6, fat: 0.2, carbs: 18 },
  'виноград зеленый': { calories: 69, protein: 0.7, fat: 0.2, carbs: 18 },
  'виноград красный': { calories: 75, protein: 0.6, fat: 0.2, carbs: 19 },
  'арбуз': { calories: 30, protein: 0.6, fat: 0.2, carbs: 7 },
  'дыня': { calories: 34, protein: 0.8, fat: 0.2, carbs: 8 },
  'дыня торпеда': { calories: 36, protein: 0.6, fat: 0.1, carbs: 9 },
  'клубника': { calories: 32, protein: 0.7, fat: 0.3, carbs: 8 },
  'малина': { calories: 52, protein: 1.2, fat: 0.7, carbs: 12 },
  'ежевика': { calories: 43, protein: 1.4, fat: 0.5, carbs: 10 },
  'черника': { calories: 57, protein: 0.7, fat: 0.3, carbs: 14 },
  'голубика': { calories: 57, protein: 0.7, fat: 0.3, carbs: 14 },
  'смородина красная': { calories: 56, protein: 0.6, fat: 0.2, carbs: 14 },
  'смородина черная': { calories: 63, protein: 1.0, fat: 0.4, carbs: 15 },
  'крыжовник': { calories: 44, protein: 0.9, fat: 0.6, carbs: 10 },
  'клюква': { calories: 46, protein: 0.5, fat: 0.1, carbs: 12 },
  'брусника': { calories: 46, protein: 0.7, fat: 0.5, carbs: 10 },
  'облепиха': { calories: 82, protein: 1.2, fat: 5.4, carbs: 10 },
  'шиповник': { calories: 109, protein: 1.6, fat: 0.7, carbs: 24 },
  'авокадо': { calories: 160, protein: 2, fat: 15, carbs: 9 },
  
  // ОВОЩИ И ЗЕЛЕНЬ (150 продуктов)
  'помидор': { calories: 18, protein: 0.9, fat: 0.2, carbs: 3.9 },
  'помидор черри': { calories: 20, protein: 1.0, fat: 0.2, carbs: 4.0 },
  'огурец': { calories: 15, protein: 0.7, fat: 0.1, carbs: 3.6 },
  'огурец тепличный': { calories: 12, protein: 0.6, fat: 0.1, carbs: 2.5 },
  'морковь': { calories: 41, protein: 0.9, fat: 0.2, carbs: 10 },
  'морковь молодая': { calories: 35, protein: 0.9, fat: 0.2, carbs: 8 },
  'картофель': { calories: 77, protein: 2, fat: 0.1, carbs: 17 },
  'картофель молодой': { calories: 70, protein: 2.1, fat: 0.1, carbs: 16 },
  'лук репчатый': { calories: 40, protein: 1.1, fat: 0.1, carbs: 9 },
  'лук зеленый': { calories: 20, protein: 1.3, fat: 0.1, carbs: 4.6 },
  'лук порей': { calories: 61, protein: 1.5, fat: 0.3, carbs: 14 },
  'чеснок': { calories: 149, protein: 6.4, fat: 0.5, carbs: 33 },
  'перец болгарский': { calories: 27, protein: 1, fat: 0.2, carbs: 6 },
  'перец красный': { calories: 31, protein: 1.3, fat: 0.3, carbs: 6 },
  'перец зеленый': { calories: 20, protein: 0.9, fat: 0.2, carbs: 5 },
  'перец желтый': { calories: 27, protein: 1, fat: 0.2, carbs: 6 },
  'перец чили': { calories: 40, protein: 2, fat: 0.2, carbs: 9 },
  'баклажан': { calories: 24, protein: 1, fat: 0.2, carbs: 6 },
  'кабачок': { calories: 24, protein: 0.6, fat: 0.3, carbs: 5 },
  'цуккини': { calories: 17, protein: 1.2, fat: 0.3, carbs: 3.1 },
  'тыква': { calories: 26, protein: 1, fat: 0.1, carbs: 7 },
  'репа': { calories: 32, protein: 1.5, fat: 0.1, carbs: 7 },
  'редька': { calories: 36, protein: 1.2, fat: 0.1, carbs: 8 },
  'редис': { calories: 16, protein: 0.7, fat: 0.1, carbs: 3 },
  'редиска': { calories: 16, protein: 0.7, fat: 0.1, carbs: 3 },
  'свекла': { calories: 43, protein: 1.6, fat: 0.2, carbs: 10 },
  'свекла вареная': { calories: 44, protein: 1.7, fat: 0.2, carbs: 10 },
  'редька черная': { calories: 36, protein: 1.9, fat: 0.2, carbs: 8 },
  'капуста белокочанная': { calories: 25, protein: 1.3, fat: 0.1, carbs: 6 },
  'капуста краснокочанная': { calories: 31, protein: 1.4, fat: 0.2, carbs: 7 },
  'капуста цветная': { calories: 25, protein: 2, fat: 0.3, carbs: 5 },
  'капуста брокколи': { calories: 34, protein: 2.8, fat: 0.4, carbs: 7 },
  'капуста брюссельская': { calories: 43, protein: 3.4, fat: 0.3, carbs: 9 },
  'капуста пекинская': { calories: 16, protein: 1.2, fat: 0.2, carbs: 3 },
  'капуста кольраби': { calories: 44, protein: 2.8, fat: 0.1, carbs: 10 },
  'капуста савойская': { calories: 28, protein: 1.2, fat: 0.1, carbs: 6 },
  'салат листовой': { calories: 15, protein: 1.4, fat: 0.2, carbs: 3 },
  'салат айсберг': { calories: 14, protein: 0.9, fat: 0.1, carbs: 3 },
  'салат романо': { calories: 17, protein: 1.2, fat: 0.3, carbs: 3 },
  'салат латук': { calories: 15, protein: 1.4, fat: 0.2, carbs: 3 },
  'руккола': { calories: 25, protein: 2.6, fat: 0.7, carbs: 4 },
  'шпинат': { calories: 23, protein: 2.9, fat: 0.4, carbs: 3.6 },
  'щавель': { calories: 22, protein: 1.5, fat: 0.3, carbs: 5 },
  'укроп': { calories: 40, protein: 2.5, fat: 0.5, carbs: 6 },
  'петрушка': { calories: 49, protein: 3.7, fat: 0.4, carbs: 10 },
  'петрушка корень': { calories: 51, protein: 1.5, fat: 0.6, carbs: 11 },
  'сельдерей': { calories: 16, protein: 0.7, fat: 0.2, carbs: 3 },
  'сельдерей корень': { calories: 42, protein: 1.5, fat: 0.3, carbs: 9 },
  'сельдерей стебель': { calories: 16, protein: 0.7, fat: 0.2, carbs: 3 },
  'кинза': { calories: 23, protein: 2.1, fat: 0.5, carbs: 4 },
  'базилик': { calories: 23, protein: 3.2, fat: 0.6, carbs: 3 },
  'мята': { calories: 70, protein: 3.8, fat: 0.9, carbs: 15 },
  'розмарин': { calories: 131, protein: 3.3, fat: 5.9, carbs: 21 },
  'орегано': { calories: 265, protein: 9, fat: 4.3, carbs: 69 },
  'тимьян': { calories: 101, protein: 5.6, fat: 1.7, carbs: 24 },
  'майоран': { calories: 271, protein: 13, fat: 7, carbs: 61 },
  'чабрец': { calories: 101, protein: 5.6, fat: 1.7, carbs: 24 },
  'имбирь': { calories: 80, protein: 1.8, fat: 0.8, carbs: 18 },
  'имбирь маринованный': { calories: 51, protein: 0.3, fat: 0.1, carbs: 13 },
  'хрен': { calories: 56, protein: 3.2, fat: 0.4, carbs: 10 },
  'спаржа': { calories: 20, protein: 2.2, fat: 0.1, carbs: 4 },
  'артишок': { calories: 47, protein: 3.3, fat: 0.2, carbs: 11 },
  'ревень': { calories: 21, protein: 0.9, fat: 0.2, carbs: 5 },
  'патиссон': { calories: 19, protein: 0.6, fat: 0.1, carbs: 4 },
  'брюква': { calories: 37, protein: 1.2, fat: 0.1, carbs: 8 },
  'топинамбур': { calories: 61, protein: 2.1, fat: 0.1, carbs: 13 },
  'фенхель': { calories: 31, protein: 1.2, fat: 0.2, carbs: 7 },
  'черемша': { calories: 35, protein: 2.4, fat: 0.1, carbs: 7 },
  'кервель': { calories: 237, protein: 23, fat: 4, carbs: 49 },
  'эстрагон': { calories: 295, protein: 23, fat: 7, carbs: 50 },
  'любисток': { calories: 20, protein: 3.7, fat: 0.4, carbs: 3 },
  'мелисса': { calories: 49, protein: 3.7, fat: 0.4, carbs: 8 },
  'стевия': { calories: 18, protein: 0, fat: 0, carbs: 0 },
  'салат корн': { calories: 21, protein: 2, fat: 0.4, carbs: 4 },
  'салат фризе': { calories: 14, protein: 1.5, fat: 0.2, carbs: 3 },
  'салат радиччио': { calories: 23, protein: 1.4, fat: 0.3, carbs: 4 },
  'салат цикорий': { calories: 23, protein: 1.7, fat: 0.3, carbs: 4 },
  'салат мангольд': { calories: 19, protein: 1.8, fat: 0.2, carbs: 4 },
  'салат кресс': { calories: 32, protein: 2.6, fat: 0.7, carbs: 6 },
  'микрозелень': { calories: 25, protein: 2.5, fat: 0.5, carbs: 5 },
  
  // ГРИБЫ (50 продуктов)
  'шампиньоны': { calories: 27, protein: 4.3, fat: 1, carbs: 0.1 },
  'шампиньоны свежие': { calories: 27, protein: 4.3, fat: 1, carbs: 0.1 },
  'шампиньоны консервированные': { calories: 20, protein: 2.2, fat: 0.5, carbs: 1 },
  'вешенки': { calories: 38, protein: 3.3, fat: 0.4, carbs: 6 },
  'лисички': { calories: 38, protein: 1.5, fat: 0.5, carbs: 6.9 },
  'опята': { calories: 22, protein: 2.2, fat: 1.2, carbs: 0.5 },
  'белые грибы': { calories: 34, protein: 3.7, fat: 1.7, carbs: 1.1 },
  'подберезовики': { calories: 31, protein: 2.3, fat: 0.9, carbs: 3.7 },
  'подосиновики': { calories: 22, protein: 3.3, fat: 0.5, carbs: 3.4 },
  'маслята': { calories: 19, protein: 2.4, fat: 0.7, carbs: 1.7 },
  'рыжики': { calories: 17, protein: 1.9, fat: 0.8, carbs: 2.7 },
  'грузди': { calories: 16, protein: 1.8, fat: 0.5, carbs: 3.2 },
  'волнушки': { calories: 22, protein: 2.5, fat: 0.5, carbs: 4.5 },
  'сыроежки': { calories: 15, protein: 1.7, fat: 0.7, carbs: 2 },
  'трюфели': { calories: 24, protein: 3, fat: 0.5, carbs: 2 },
  'шиитаке': { calories: 34, protein: 2.2, fat: 0.5, carbs: 7 },
  'мацутакэ': { calories: 23, protein: 1.9, fat: 0.7, carbs: 4 },
  'портобелло': { calories: 22, protein: 2.1, fat: 0.3, carbs: 3.3 },
  'грибы сушеные': { calories: 286, protein: 23, fat: 6.8, carbs: 31 },
  'грибы маринованные': { calories: 24, protein: 2.2, fat: 0.4, carbs: 4 },
  'грибы замороженные': { calories: 25, protein: 2.5, fat: 0.5, carbs: 3 },
  
  // БОБОВЫЕ И ЗЕРНОВЫЕ (100 продуктов)
  'рис белый': { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  'рис бурый': { calories: 112, protein: 2.6, fat: 0.9, carbs: 23 },
  'рис дикий': { calories: 101, protein: 4, fat: 0.3, carbs: 21 },
  'рис басмати': { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  'рис жасмин': { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  'рис красный': { calories: 110, protein: 2.5, fat: 0.5, carbs: 23 },
  'рис черный': { calories: 105, protein: 3.5, fat: 1.1, carbs: 20 },
  'гречка': { calories: 110, protein: 4, fat: 1, carbs: 21 },
  'гречка зеленая': { calories: 92, protein: 3.4, fat: 0.6, carbs: 19 },
  'овсянка': { calories: 68, protein: 2.4, fat: 1.4, carbs: 12 },
  'овсянка быстрого приготовления': { calories: 70, protein: 2.5, fat: 1.5, carbs: 12 },
  'овсяные хлопья': { calories: 366, protein: 11.9, fat: 7.2, carbs: 69 },
  'перловка': { calories: 123, protein: 2.3, fat: 0.4, carbs: 28 },
  'ячневая крупа': { calories: 76, protein: 2.3, fat: 0.3, carbs: 16 },
  'пшено': { calories: 119, protein: 3.5, fat: 1, carbs: 23 },
  'манка': { calories: 80, protein: 2.5, fat: 0.2, carbs: 17 },
  'кукурузная крупа': { calories: 86, protein: 2.1, fat: 0.3, carbs: 19 },
  'булгур': { calories: 83, protein: 3.1, fat: 0.2, carbs: 18 },
  'кускус': { calories: 112, protein: 3.8, fat: 0.2, carbs: 23 },
  'киноа': { calories: 120, protein: 4.4, fat: 1.9, carbs: 21 },
  'полба': { calories: 127, protein: 5.5, fat: 0.9, carbs: 26 },
  'амарант': { calories: 102, protein: 3.8, fat: 1.6, carbs: 19 },
  'теф': { calories: 101, protein: 3.9, fat: 0.7, carbs: 20 },
  'сорго': { calories: 110, protein: 3.3, fat: 1.3, carbs: 24 },
  'пшеница': { calories: 130, protein: 4.3, fat: 0.4, carbs: 28 },
  'рожь': { calories: 111, protein: 2.7, fat: 0.5, carbs: 24 },
  'ячмень': { calories: 123, protein: 2.3, fat: 0.4, carbs: 28 },
  'овес': { calories: 68, protein: 2.4, fat: 1.4, carbs: 12 },
  'горох': { calories: 81, protein: 5.4, fat: 0.4, carbs: 14 },
  'горох сушеный': { calories: 299, protein: 23, fat: 1.2, carbs: 53 },
  'горох консервированный': { calories: 55, protein: 3.2, fat: 0.4, carbs: 10 },
  'нут': { calories: 364, protein: 19, fat: 6, carbs: 61 },
  'нут консервированный': { calories: 119, protein: 5, fat: 1.5, carbs: 20 },
  'фасоль': { calories: 127, protein: 8.7, fat: 0.5, carbs: 22 },
  'фасоль красная': { calories: 127, protein: 8.7, fat: 0.5, carbs: 22 },
  'фасоль белая': { calories: 102, protein: 7, fat: 0.5, carbs: 17 },
  'фасоль черная': { calories: 132, protein: 8.9, fat: 0.5, carbs: 24 },
  'фасоль стручковая': { calories: 31, protein: 1.8, fat: 0.1, carbs: 7 },
  'чечевица': { calories: 116, protein: 9, fat: 0.4, carbs: 20 },
  'чечевица красная': { calories: 116, protein: 9, fat: 0.4, carbs: 20 },
  'чечевица зеленая': { calories: 116, protein: 9, fat: 0.4, carbs: 20 },
  'чечевица коричневая': { calories: 116, protein: 9, fat: 0.4, carbs: 20 },
  'соя': { calories: 173, protein: 17, fat: 9, carbs: 10 },
  'маш': { calories: 300, protein: 23.5, fat: 2, carbs: 46 },
  'бобы': { calories: 57, protein: 4, fat: 0.1, carbs: 10 },
  'люпин': { calories: 371, protein: 36, fat: 9.7, carbs: 40 },
  'тофу': { calories: 76, protein: 8, fat: 4.8, carbs: 1.9 },
  'темпе': { calories: 193, protein: 19, fat: 11, carbs: 9 },
  'сейтан': { calories: 120, protein: 25, fat: 0.5, carbs: 3 },
  
  // МЯСО И ПТИЦА (150 продуктов)
  'курица': { calories: 165, protein: 31, fat: 3.6, carbs: 0 },
  'курица грудка': { calories: 165, protein: 31, fat: 3.6, carbs: 0 },
  'курица бедро': { calories: 209, protein: 26, fat: 11, carbs: 0 },
  'курица крылья': { calories: 203, protein: 30, fat: 8, carbs: 0 },
  'курица голень': { calories: 172, protein: 28, fat: 6, carbs: 0 },
  'курица окорочка': { calories: 185, protein: 27, fat: 8, carbs: 0 },
  'курица тушка': { calories: 190, protein: 29, fat: 7.5, carbs: 0 },
  'курица филе': { calories: 165, protein: 31, fat: 3.6, carbs: 0 },
  'индейка': { calories: 135, protein: 29, fat: 1.5, carbs: 0 },
  'индейка грудка': { calories: 135, protein: 29, fat: 1.5, carbs: 0 },
  'индейка бедро': { calories: 144, protein: 20, fat: 6, carbs: 0 },
  'утка': { calories: 337, protein: 19, fat: 28, carbs: 0 },
  'утка грудка': { calories: 201, protein: 23, fat: 12, carbs: 0 },
  'утка бедро': { calories: 337, protein: 19, fat: 28, carbs: 0 },
  'гусь': { calories: 371, protein: 16, fat: 33, carbs: 0 },
  'перепелка': { calories: 192, protein: 19.6, fat: 12, carbs: 0 },
  'фазан': { calories: 181, protein: 24, fat: 8.5, carbs: 0 },
  'говядина': { calories: 250, protein: 26, fat: 15, carbs: 0 },
  'говядина вырезка': { calories: 198, protein: 19, fat: 13, carbs: 0 },
  'говядина филе': { calories: 267, protein: 26, fat: 17, carbs: 0 },
  'говядина ребра': { calories: 305, protein: 17, fat: 26, carbs: 0 },
  'говядина язык': { calories: 231, protein: 16, fat: 18, carbs: 0 },
  'говядина печень': { calories: 135, protein: 20, fat: 3.6, carbs: 4 },
  'говядина сердце': { calories: 112, protein: 17, fat: 4, carbs: 1 },
  'говядина почки': { calories: 86, protein: 15.5, fat: 2, carbs: 1 },
  'говядина мозги': { calories: 143, protein: 11, fat: 10, carbs: 1 },
  'телятина': { calories: 172, protein: 30, fat: 5, carbs: 0 },
  'свинина': { calories: 242, protein: 25, fat: 14, carbs: 0 },
  'свинина вырезка': { calories: 143, protein: 19, fat: 7, carbs: 0 },
  'свинина шея': { calories: 267, protein: 16, fat: 22, carbs: 0 },
  'свинина ребра': { calories: 321, protein: 15, fat: 28, carbs: 0 },
  'свинина грудинка': { calories: 518, protein: 9.3, fat: 53, carbs: 0 },
  'свинина окорок': { calories: 261, protein: 16, fat: 21, carbs: 0 },
  'свинина язык': { calories: 208, protein: 16, fat: 16, carbs: 0 },
  'свиная печень': { calories: 130, protein: 22, fat: 3.7, carbs: 2 },
  'свиное сердце': { calories: 118, protein: 16, fat: 5, carbs: 1 },
  'баранина': { calories: 294, protein: 25, fat: 21, carbs: 0 },
  'баранина вырезка': { calories: 232, protein: 18, fat: 17, carbs: 0 },
  'баранина ребра': { calories: 320, protein: 16, fat: 28, carbs: 0 },
  'баранина окорок': { calories: 232, protein: 18, fat: 17, carbs: 0 },
  'козлятина': { calories: 216, protein: 27, fat: 12, carbs: 0 },
  'конина': { calories: 187, protein: 21, fat: 10, carbs: 0 },
  'оленина': { calories: 157, protein: 30, fat: 3.2, carbs: 0 },
  'кролик': { calories: 197, protein: 21, fat: 11, carbs: 0 },
  'кролик тушка': { calories: 197, protein: 21, fat: 11, carbs: 0 },
  'кролик мясо': { calories: 197, protein: 21, fat: 11, carbs: 0 },
  'колбаса вареная': { calories: 300, protein: 12, fat: 27, carbs: 1 },
  'колбаса докторская': { calories: 257, protein: 13, fat: 22, carbs: 1.5 },
  'колбаса молочная': { calories: 252, protein: 11, fat: 22, carbs: 1.5 },
  'колбаса сервелат': { calories: 360, protein: 24, fat: 29, carbs: 0 },
  'колбаса салями': { calories: 568, protein: 21, fat: 55, carbs: 1 },
  'колбаса чоризо': { calories: 455, protein: 24, fat: 38, carbs: 1.9 },
  'колбаса пепперони': { calories: 494, protein: 19, fat: 44, carbs: 3 },
  'колбаса краковская': { calories: 380, protein: 16, fat: 35, carbs: 1 },
  'сосиски': { calories: 260, protein: 11, fat: 24, carbs: 2 },
  'сосиски молочные': { calories: 261, protein: 11, fat: 23, carbs: 2 },
  'сосиски куриные': { calories: 242, protein: 11, fat: 20, carbs: 4 },
  'сосиски свиные': { calories: 300, protein: 12, fat: 28, carbs: 1 },
  'сардельки': { calories: 270, protein: 11, fat: 25, carbs: 2 },
  'сардельки свиные': { calories: 320, protein: 12, fat: 30, carbs: 1 },
  'ветчина': { calories: 270, protein: 16, fat: 22, carbs: 1 },
  'ветчина вареная': { calories: 270, protein: 16, fat: 22, carbs: 1 },
  'ветчина копченая': { calories: 320, protein: 16, fat: 28, carbs: 0 },
  'ветчина сырокопченая': { calories: 430, protein: 23, fat: 38, carbs: 0 },
  'бекон': { calories: 541, protein: 37, fat: 42, carbs: 1 },
  'бекон вареный': { calories: 540, protein: 37, fat: 42, carbs: 1 },
  'бекон копченый': { calories: 541, protein: 37, fat: 42, carbs: 1 },
  'грудинка': { calories: 518, protein: 9.3, fat: 53, carbs: 0 },
  'грудинка копченая': { calories: 470, protein: 10, fat: 47, carbs: 0 },
  'окорок': { calories: 261, protein: 16, fat: 21, carbs: 0 },
  'окорок копченый': { calories: 320, protein: 18, fat: 27, carbs: 0 },
  'карбонад': { calories: 190, protein: 17, fat: 13, carbs: 0 },
  'шпик': { calories: 720, protein: 2, fat: 80, carbs: 0 },
  'сало': { calories: 720, protein: 2, fat: 80, carbs: 0 },
  'сало соленое': { calories: 720, protein: 2, fat: 80, carbs: 0 },
  'сало копченое': { calories: 740, protein: 2, fat: 82, carbs: 0 },
  'пастрома': { calories: 320, protein: 25, fat: 24, carbs: 0 },
  'буженина': { calories: 260, protein: 17, fat: 21, carbs: 0 },
  'корейка': { calories: 260, protein: 16, fat: 21, carbs: 0 },
  'антрекот': { calories: 220, protein: 29, fat: 10, carbs: 0 },
  'стейк': { calories: 271, protein: 26, fat: 18, carbs: 0 },
  'стейк рибай': { calories: 291, protein: 25, fat: 21, carbs: 0 },
  'стейк томагавк': { calories: 301, protein: 24, fat: 22, carbs: 0 },
  'стейк филе миньон': { calories: 267, protein: 26, fat: 17, carbs: 0 },
  'стейк нью-йорк': { calories: 280, protein: 25, fat: 19, carbs: 0 },
  'стейк портерхаус': { calories: 295, protein: 24, fat: 21, carbs: 0 },
  'отбивная': { calories: 220, protein: 25, fat: 12, carbs: 0 },
  'отбивная куриная': { calories: 220, protein: 25, fat: 12, carbs: 0 },
  'отбивная свиная': { calories: 242, protein: 25, fat: 14, carbs: 0 },
  'отбивная говяжья': { calories: 250, protein: 26, fat: 15, carbs: 0 },
  'люля-кебаб': { calories: 220, protein: 20, fat: 15, carbs: 2 },
  'шашлык': { calories: 220, protein: 20, fat: 15, carbs: 0 },
  'шашлык куриный': { calories: 180, protein: 25, fat: 8, carbs: 0 },
  'шашлык свиной': { calories: 250, protein: 22, fat: 17, carbs: 0 },
  'шашлык говяжий': { calories: 230, protein: 26, fat: 13, carbs: 0 },
  'шашлык из баранины': { calories: 280, protein: 23, fat: 20, carbs: 0 },
  'котлеты': { calories: 220, protein: 15, fat: 16, carbs: 6 },
  'котлеты куриные': { calories: 210, protein: 18, fat: 14, carbs: 5 },
  'котлеты свиные': { calories: 280, protein: 14, fat: 23, carbs: 7 },
  'котлеты говяжьи': { calories: 260, protein: 16, fat: 20, carbs: 6 },
  'котлеты рыбные': { calories: 200, protein: 15, fat: 12, carbs: 10 },
  'бифштекс': { calories: 220, protein: 29, fat: 10, carbs: 0 },
  'медальоны': { calories: 210, protein: 28, fat: 9, carbs: 0 },
  'рёбрышки': { calories: 321, protein: 15, fat: 28, carbs: 0 },
  'рёбрышки свиные': { calories: 321, protein: 15, fat: 28, carbs: 0 },
  'рёбрышки бараньи': { calories: 320, protein: 16, fat: 28, carbs: 0 },
  'плов': { calories: 250, protein: 10, fat: 15, carbs: 25 },
  'плов с курицей': { calories: 230, protein: 12, fat: 10, carbs: 25 },
  'плов со свининой': { calories: 280, protein: 11, fat: 18, carbs: 25 },
  'плов с говядиной': { calories: 260, protein: 13, fat: 15, carbs: 25 },
  'плов с бараниной': { calories: 290, protein: 14, fat: 20, carbs: 25 },
  'гуляш': { calories: 180, protein: 16, fat: 10, carbs: 8 },
  'бефстроганов': { calories: 190, protein: 17, fat: 12, carbs: 5 },
  'рагу': { calories: 150, protein: 12, fat: 8, carbs: 10 },
  'жаркое': { calories: 200, protein: 15, fat: 12, carbs: 10 },
  'тефтели': { calories: 180, protein: 12, fat: 10, carbs: 12 },
  'фрикадельки': { calories: 180, protein: 12, fat: 10, carbs: 12 },
  'зразы': { calories: 220, protein: 14, fat: 12, carbs: 15 },
  'рулет мясной': { calories: 250, protein: 18, fat: 18, carbs: 3 },
  'шницель': { calories: 250, protein: 20, fat: 15, carbs: 10 },
  'эскалоп': { calories: 220, protein: 25, fat: 12, carbs: 0 },
  'филе-миньон': { calories: 267, protein: 26, fat: 17, carbs: 0 },
  
  // РЫБА И МОРЕПРОДУКТЫ (150 продуктов)
  'лосось': { calories: 208, protein: 20, fat: 13, carbs: 0 },
  'лосось свежий': { calories: 208, protein: 20, fat: 13, carbs: 0 },
  'лосось слабосоленый': { calories: 202, protein: 22, fat: 12, carbs: 0 },
  'лосось копченый': { calories: 203, protein: 22, fat: 12, carbs: 0 },
  'лосось консервированный': { calories: 200, protein: 20, fat: 13, carbs: 0 },
  'семга': { calories: 208, protein: 20, fat: 13, carbs: 0 },
  'форель': { calories: 119, protein: 18, fat: 4.5, carbs: 0 },
  'форель радужная': { calories: 119, protein: 18, fat: 4.5, carbs: 0 },
  'форель речная': { calories: 97, protein: 19, fat: 2, carbs: 0 },
  'тунец': { calories: 184, protein: 30, fat: 6, carbs: 0 },
  'тунец свежий': { calories: 184, protein: 30, fat: 6, carbs: 0 },
  'тунец консервированный': { calories: 198, protein: 29, fat: 8, carbs: 0 },
  'тунец в собственном соку': { calories: 96, protein: 21, fat: 1, carbs: 0 },
  'тунец в масле': { calories: 198, protein: 29, fat: 8, carbs: 0 },
  'горбуша': { calories: 142, protein: 21, fat: 6, carbs: 0 },
  'горбуша свежая': { calories: 142, protein: 21, fat: 6, carbs: 0 },
  'горбуша консервированная': { calories: 136, protein: 21, fat: 5, carbs: 0 },
  'кета': { calories: 127, protein: 19, fat: 5.5, carbs: 0 },
  'нерка': { calories: 157, protein: 20, fat: 8.5, carbs: 0 },
  'кижуч': { calories: 140, protein: 21, fat: 6, carbs: 0 },
  'чавыча': { calories: 148, protein: 19, fat: 8, carbs: 0 },
  'сиг': { calories: 144, protein: 19, fat: 7.5, carbs: 0 },
  'омуль': { calories: 88, protein: 18, fat: 2, carbs: 0 },
  'нельма': { calories: 115, protein: 22, fat: 2.5, carbs: 0 },
  'сельдь': { calories: 158, protein: 17, fat: 9, carbs: 0 },
  'сельдь соленая': { calories: 217, protein: 20, fat: 15, carbs: 0 },
  'сельдь маринованная': { calories: 192, protein: 17, fat: 13, carbs: 4 },
  'сельдь копченая': { calories: 218, protein: 25, fat: 12, carbs: 0 },
  'салака': { calories: 125, protein: 17, fat: 6, carbs: 0 },
  'салака копченая': { calories: 152, protein: 19, fat: 8, carbs: 0 },
  'килька': { calories: 137, protein: 17, fat: 7.5, carbs: 0 },
  'килька соленая': { calories: 137, protein: 17, fat: 7.5, carbs: 0 },
  'килька копченая': { calories: 152, protein: 19, fat: 8, carbs: 0 },
  'анчоус': { calories: 131, protein: 20, fat: 5, carbs: 0 },
  'анчоус соленый': { calories: 210, protein: 25, fat: 12, carbs: 0 },
  'скумбрия': { calories: 191, protein: 18, fat: 13, carbs: 0 },
  'скумбрия свежая': { calories: 191, protein: 18, fat: 13, carbs: 0 },
  'скумбрия копченая': { calories: 221, protein: 20, fat: 15, carbs: 0 },
  'скумбрия соленая': { calories: 194, protein: 19, fat: 13, carbs: 0 },
  'ставрида': { calories: 114, protein: 18, fat: 4.5, carbs: 0 },
  'сайра': { calories: 182, protein: 19, fat: 11, carbs: 0 },
  'сайра консервированная': { calories: 283, protein: 18, fat: 23, carbs: 0 },
  'иваси': { calories: 182, protein: 19, fat: 11, carbs: 0 },
  'мойва': { calories: 157, protein: 13, fat: 11, carbs: 0 },
  'мойва свежая': { calories: 157, protein: 13, fat: 11, carbs: 0 },
  'мойва копченая': { calories: 270, protein: 18, fat: 22, carbs: 0 },
  'корюшка': { calories: 102, protein: 15, fat: 4, carbs: 0 },
  'щука': { calories: 84, protein: 18, fat: 0.7, carbs: 0 },
  'судак': { calories: 84, protein: 19, fat: 0.8, carbs: 0 },
  'окунь': { calories: 91, protein: 19, fat: 0.9, carbs: 0 },
  'окунь речной': { calories: 91, protein: 19, fat: 0.9, carbs: 0 },
  'окунь морской': { calories: 79, protein: 15, fat: 1.5, carbs: 0 },
  'карась': { calories: 87, protein: 18, fat: 1.2, carbs: 0 },
  'карп': { calories: 112, protein: 16, fat: 5.5, carbs: 0 },
  'сазан': { calories: 97, protein: 18, fat: 2.5, carbs: 0 },
  'лещ': { calories: 105, protein: 17, fat: 4.5, carbs: 0 },
  'треска': { calories: 82, protein: 18, fat: 0.7, carbs: 0 },
  'треска свежая': { calories: 82, protein: 18, fat: 0.7, carbs: 0 },
  'треска соленая': { calories: 98, protein: 23, fat: 0.6, carbs: 0 },
  'треска копченая': { calories: 94, protein: 23, fat: 0.5, carbs: 0 },
  'треска консервированная': { calories: 82, protein: 18, fat: 0.7, carbs: 0 },
  'пикша': { calories: 71, protein: 17, fat: 0.2, carbs: 0 },
  'минтай': { calories: 72, protein: 16, fat: 1, carbs: 0 },
  'минтай свежий': { calories: 72, protein: 16, fat: 1, carbs: 0 },
  'минтай консервированный': { calories: 88, protein: 19, fat: 1, carbs: 0 },
  'путассу': { calories: 72, protein: 16, fat: 0.9, carbs: 0 },
  'хек': { calories: 86, protein: 17, fat: 2.2, carbs: 0 },
  'мерлуза': { calories: 86, protein: 17, fat: 2.2, carbs: 0 },
  'навага': { calories: 73, protein: 16, fat: 1, carbs: 0 },
  'камбала': { calories: 83, protein: 16, fat: 2.5, carbs: 0 },
  'палтус': { calories: 102, protein: 19, fat: 3, carbs: 0 },
  'морской язык': { calories: 83, protein: 16, fat: 2.5, carbs: 0 },
  'дорадо': { calories: 96, protein: 18, fat: 2.5, carbs: 0 },
  'сибас': { calories: 97, protein: 18, fat: 2.5, carbs: 0 },
  'морской окунь': { calories: 79, protein: 15, fat: 1.5, carbs: 0 },
  'тилапия': { calories: 96, protein: 20, fat: 1.7, carbs: 0 },
  'пангасиус': { calories: 89, protein: 15, fat: 3, carbs: 0 },
  'сом': { calories: 95, protein: 16, fat: 3.5, carbs: 0 },
  'угорь': { calories: 184, protein: 19, fat: 11, carbs: 0 },
  'угорь речной': { calories: 184, protein: 19, fat: 11, carbs: 0 },
  'угорь копченый': { calories: 326, protein: 18, fat: 28, carbs: 0 },
  'осетр': { calories: 164, protein: 16, fat: 11, carbs: 0 },
  'стерлядь': { calories: 122, protein: 17, fat: 6, carbs: 0 },
  'белуга': { calories: 147, protein: 16, fat: 9, carbs: 0 },
  'севрюга': { calories: 160, protein: 17, fat: 10, carbs: 0 },
  'икра красная': { calories: 249, protein: 32, fat: 13, carbs: 0 },
  'икра лососевая': { calories: 249, protein: 32, fat: 13, carbs: 0 },
  'икра черная': { calories: 235, protein: 26, fat: 14, carbs: 4 },
  'икра осетровая': { calories: 235, protein: 26, fat: 14, carbs: 4 },
  'икра минтая': { calories: 132, protein: 28, fat: 1.9, carbs: 1.8 },
  'икра трески': { calories: 115, protein: 24, fat: 1.8, carbs: 0 },
  'икра мойвы': { calories: 282, protein: 28, fat: 19, carbs: 0 },
  'икра летучей рыбы': { calories: 72, protein: 6.5, fat: 1.5, carbs: 7 },
  'креветки': { calories: 95, protein: 20, fat: 1.1, carbs: 0 },
  'креветки вареные': { calories: 95, protein: 20, fat: 1.1, carbs: 0 },
  'креветки королевские': { calories: 87, protein: 18, fat: 1.1, carbs: 0 },
  'креветки тигровые': { calories: 85, protein: 19, fat: 0.7, carbs: 0 },
  'креветки консервированные': { calories: 81, protein: 17, fat: 0.9, carbs: 0 },
  'кальмары': { calories: 92, protein: 16, fat: 1.4, carbs: 3 },
  'кальмары свежие': { calories: 92, protein: 16, fat: 1.4, carbs: 3 },
  'кальмары вареные': { calories: 110, protein: 18, fat: 2.2, carbs: 2 },
  'кальмары сушеные': { calories: 286, protein: 62, fat: 2, carbs: 5 },
  'кальмары копченые': { calories: 242, protein: 53, fat: 2, carbs: 3 },
  'осьминог': { calories: 82, protein: 15, fat: 1, carbs: 2 },
  'мидии': { calories: 77, protein: 11, fat: 2, carbs: 3 },
  'мидии свежие': { calories: 77, protein: 11, fat: 2, carbs: 3 },
  'мидии вареные': { calories: 150, protein: 24, fat: 4, carbs: 7 },
  'мидии консервированные': { calories: 120, protein: 17, fat: 2, carbs: 5 },
  'устрицы': { calories: 81, protein: 9, fat: 2.5, carbs: 5 },
  'гребешки': { calories: 88, protein: 17, fat: 0.5, carbs: 3 },
  'каракатица': { calories: 79, protein: 16, fat: 0.7, carbs: 0.8 },
  'омар': { calories: 90, protein: 19, fat: 0.9, carbs: 0.5 },
  'лангуст': { calories: 112, protein: 20, fat: 1.5, carbs: 2 },
  'краб': { calories: 87, protein: 18, fat: 1.1, carbs: 0 },
  'крабовое мясо': { calories: 87, protein: 18, fat: 1.1, carbs: 0 },
  'крабовые палочки': { calories: 73, protein: 6, fat: 0.5, carbs: 10 },
  'краб консервированный': { calories: 85, protein: 17, fat: 1, carbs: 0 },
  'трепанг': { calories: 34, protein: 7.3, fat: 0.6, carbs: 0 },
  'морской еж': { calories: 104, protein: 13.8, fat: 4.3, carbs: 2.5 },
  'водоросли нори': { calories: 349, protein: 46, fat: 1, carbs: 44 },
  'морская капуста': { calories: 49, protein: 0.9, fat: 0.2, carbs: 12 },
  'морская капуста консервированная': { calories: 61, protein: 1, fat: 0.2, carbs: 15 },
  'ламинария': { calories: 49, protein: 0.9, fat: 0.2, carbs: 12 },
  'спирулина': { calories: 290, protein: 57, fat: 7.7, carbs: 24 },
  'хлорелла': { calories: 410, protein: 58, fat: 9.3, carbs: 23 },
  
  // МОЛОЧНЫЕ ПРОДУКТЫ И ЯЙЦА (150 продуктов)
  'молоко': { calories: 42, protein: 3.4, fat: 1, carbs: 4.8 },
  'молоко 0.5%': { calories: 35, protein: 3, fat: 0.5, carbs: 4.8 },
  'молоко 1%': { calories: 42, protein: 3.4, fat: 1, carbs: 4.8 },
  'молоко 1.5%': { calories: 44, protein: 3.4, fat: 1.5, carbs: 4.8 },
  'молоко 2.5%': { calories: 52, protein: 2.9, fat: 2.5, carbs: 4.7 },
  'молоко 3.2%': { calories: 60, protein: 3, fat: 3.2, carbs: 4.7 },
  'молоко 3.5%': { calories: 64, protein: 3.3, fat: 3.5, carbs: 4.8 },
  'молоко 6%': { calories: 84, protein: 3.3, fat: 6, carbs: 4.8 },
  'молоко пастеризованное': { calories: 60, protein: 3, fat: 3.2, carbs: 4.7 },
  'молоко ультрапастеризованное': { calories: 60, protein: 3, fat: 3.2, carbs: 4.7 },
  'молоко стерилизованное': { calories: 60, protein: 3, fat: 3.2, carbs: 4.7 },
  'молоко топленое': { calories: 67, protein: 3, fat: 4, carbs: 4.7 },
  'молоко сгущенное': { calories: 320, protein: 7.2, fat: 8.5, carbs: 56 },
  'молоко сгущенное с сахаром': { calories: 321, protein: 7.2, fat: 8.5, carbs: 56 },
  'молоко сгущенное без сахара': { calories: 136, protein: 6.6, fat: 7.5, carbs: 10 },
  'молоко сухое': { calories: 469, protein: 24, fat: 25, carbs: 39 },
  'молоко сухое обезжиренное': { calories: 362, protein: 36, fat: 1, carbs: 52 },
  'сливки': { calories: 205, protein: 2.5, fat: 20, carbs: 4 },
  'сливки 10%': { calories: 118, protein: 3, fat: 10, carbs: 4 },
  'сливки 20%': { calories: 205, protein: 2.5, fat: 20, carbs: 4 },
  'сливки 30%': { calories: 287, protein: 2.5, fat: 30, carbs: 3.2 },
  'сливки 35%': { calories: 337, protein: 2.2, fat: 35, carbs: 3.2 },
  'сливки взбитые': { calories: 257, protein: 3.2, fat: 22, carbs: 13 },
  'сливки сгущенные': { calories: 332, protein: 7, fat: 19, carbs: 56 },
  'сливки сухие': { calories: 579, protein: 23, fat: 42, carbs: 30 },
  'сметана': { calories: 206, protein: 2.8, fat: 20, carbs: 3.2 },
  'сметана 10%': { calories: 115, protein: 3, fat: 10, carbs: 2.9 },
  'сметана 15%': { calories: 162, protein: 2.6, fat: 15, carbs: 3 },
  'сметана 20%': { calories: 206, protein: 2.8, fat: 20, carbs: 3.2 },
  'сметана 25%': { calories: 248, protein: 2.6, fat: 25, carbs: 2.5 },
  'сметана 30%': { calories: 294, protein: 2.4, fat: 30, carbs: 3.1 },
  'кефир': { calories: 41, protein: 3.4, fat: 1, carbs: 4.8 },
  'кефир 0%': { calories: 30, protein: 3, fat: 0, carbs: 3.8 },
  'кефир 1%': { calories: 40, protein: 3, fat: 1, carbs: 4 },
  'кефир 2.5%': { calories: 53, protein: 3, fat: 2.5, carbs: 4 },
  'кефир 3.2%': { calories: 56, protein: 3, fat: 3.2, carbs: 4.1 },
  'кефир обезжиренный': { calories: 30, protein: 3, fat: 0, carbs: 3.8 },
  'кефир бифидок': { calories: 56, protein: 3, fat: 3.2, carbs: 4.1 },
  'ряженка': { calories: 67, protein: 3, fat: 4, carbs: 4.2 },
  'ряженка 2.5%': { calories: 54, protein: 2.9, fat: 2.5, carbs: 4.2 },
  'ряженка 4%': { calories: 67, protein: 3, fat: 4, carbs: 4.2 },
  'простокваша': { calories: 58, protein: 2.9, fat: 3.2, carbs: 4.1 },
  'варенец': { calories: 53, protein: 2.9, fat: 2.5, carbs: 4.1 },
  'айран': { calories: 24, protein: 1.1, fat: 1.2, carbs: 1.4 },
  'тан': { calories: 24, protein: 1.1, fat: 1.2, carbs: 1.4 },
  'кумыс': { calories: 50, protein: 2.1, fat: 1.9, carbs: 5 },
  'йогурт': { calories: 59, protein: 3.5, fat: 1.5, carbs: 6 },
  'йогурт натуральный': { calories: 59, protein: 3.5, fat: 1.5, carbs: 6 },
  'йогурт питьевой': { calories: 72, protein: 3, fat: 2.5, carbs: 10 },
  'йогурт греческий': { calories: 115, protein: 9, fat: 3.5, carbs: 4 },
  'йогурт обезжиренный': { calories: 56, protein: 5, fat: 0, carbs: 7.5 },
  'йогурт с фруктами': { calories: 105, protein: 4, fat: 2.5, carbs: 17 },
  'йогурт со злаками': { calories: 120, protein: 4.5, fat: 3, carbs: 18 },
  'йогурт активия': { calories: 75, protein: 3.5, fat: 2.5, carbs: 9 },
  'йогурт данон': { calories: 75, protein: 3.5, fat: 2.5, carbs: 9 },
  'творог': { calories: 101, protein: 17, fat: 4, carbs: 3 },
  'творог 0%': { calories: 71, protein: 16, fat: 0, carbs: 1.3 },
  'творог 1%': { calories: 79, protein: 16.5, fat: 1, carbs: 1.3 },
  'творог 2%': { calories: 103, protein: 18, fat: 2, carbs: 3.3 },
  'творог 5%': { calories: 121, protein: 17, fat: 5, carbs: 3 },
  'творог 9%': { calories: 159, protein: 16, fat: 9, carbs: 3 },
  'творог 18%': { calories: 232, protein: 14, fat: 18, carbs: 2.8 },
  'творог зерненый': { calories: 105, protein: 13, fat: 5, carbs: 3 },
  'творог домашний': { calories: 232, protein: 14, fat: 18, carbs: 2.8 },
  'творог обезжиренный': { calories: 71, protein: 16, fat: 0, carbs: 1.3 },
  'творог мягкий': { calories: 140, protein: 12, fat: 5, carbs: 9 },
  'творожная масса': { calories: 341, protein: 7.1, fat: 23, carbs: 29 },
  'творожный сырок': { calories: 341, protein: 7.1, fat: 23, carbs: 29 },
  'творожный сырок глазированный': { calories: 407, protein: 8.5, fat: 27, carbs: 33 },
  'сыр': { calories: 402, protein: 25, fat: 33, carbs: 1.3 },
  'сыр твердый': { calories: 402, protein: 25, fat: 33, carbs: 1.3 },
  'сыр российский': { calories: 364, protein: 23, fat: 29, carbs: 0 },
  'сыр голландский': { calories: 352, protein: 26, fat: 26.5, carbs: 0 },
  'сыр гауда': { calories: 356, protein: 25, fat: 27, carbs: 2 },
  'сыр эдам': { calories: 357, protein: 25, fat: 27, carbs: 1.4 },
  'сыр маасдам': { calories: 350, protein: 23, fat: 26, carbs: 0 },
  'сыр чеддер': { calories: 402, protein: 25, fat: 33, carbs: 1.3 },
  'сыр пармезан': { calories: 392, protein: 35, fat: 26, carbs: 3.2 },
  'сыр эмменталь': { calories: 380, protein: 29, fat: 29, carbs: 0 },
  'сыр маасдам': { calories: 350, protein: 23, fat: 26, carbs: 0 },
  'сыр брынза': { calories: 260, protein: 22, fat: 19, carbs: 0 },
  'сыр фета': { calories: 264, protein: 14, fat: 21, carbs: 4 },
  'сыр адыгейский': { calories: 240, protein: 19, fat: 18, carbs: 1.5 },
  'сыр сулугуни': { calories: 286, protein: 20, fat: 22, carbs: 0.4 },
  'сыр моцарелла': { calories: 280, protein: 28, fat: 17, carbs: 3.1 },
  'сыр рикотта': { calories: 174, protein: 11, fat: 13, carbs: 3 },
  'сыр плавленный': { calories: 305, protein: 22, fat: 23, carbs: 2 },
  'сыр колбасный': { calories: 275, protein: 21, fat: 19, carbs: 4 },
  'сыр косичка': { calories: 320, protein: 19, fat: 24, carbs: 2.5 },
  'сыр с плесенью': { calories: 353, protein: 21, fat: 28, carbs: 2 },
  'сыр дорблю': { calories: 353, protein: 21, fat: 28, carbs: 2 },
  'сыр рокфор': { calories: 369, protein: 22, fat: 31, carbs: 2 },
  'сыр камамбер': { calories: 300, protein: 20, fat: 24, carbs: 0.5 },
  'сыр бри': { calories: 291, protein: 21, fat: 23, carbs: 0.5 },
  'сыр творожный': { calories: 317, protein: 7, fat: 31, carbs: 2.5 },
  'сыр филадельфия': { calories: 250, protein: 5, fat: 24, carbs: 3 },
  'сыр маскарпоне': { calories: 435, protein: 4.8, fat: 47, carbs: 4.8 },
  'сыр тофу': { calories: 76, protein: 8, fat: 4.8, carbs: 1.9 },
  'сыр веганский': { calories: 280, protein: 1, fat: 28, carbs: 6 },
  'масло сливочное': { calories: 717, protein: 0.5, fat: 81, carbs: 0.8 },
  'масло сливочное 72.5%': { calories: 661, protein: 0.8, fat: 72.5, carbs: 1.3 },
  'масло сливочное 82.5%': { calories: 748, protein: 0.5, fat: 82.5, carbs: 0.8 },
  'масло сливочное топленое': { calories: 892, protein: 0.2, fat: 99, carbs: 0 },
  'масло сливочное соленое': { calories: 717, protein: 0.5, fat: 81, carbs: 0.8 },
  'маргарин': { calories: 717, protein: 0.2, fat: 81, carbs: 0.4 },
  'спред': { calories: 545, protein: 0.3, fat: 60, carbs: 0.7 },
  'спред растительно-сливочный': { calories: 545, protein: 0.3, fat: 60, carbs: 0.7 },
  'паста арахисовая': { calories: 588, protein: 25, fat: 50, carbs: 20 },
  'урбеч': { calories: 534, protein: 18, fat: 45, carbs: 25 },
  'яйцо': { calories: 155, protein: 13, fat: 11, carbs: 1.1 },
  'яйцо куриное': { calories: 155, protein: 13, fat: 11, carbs: 1.1 },
  'яйцо перепелиное': { calories: 168, protein: 11.9, fat: 13.1, carbs: 0.6 },
  'яйцо гусиное': { calories: 185, protein: 13.9, fat: 13.3, carbs: 1.4 },
  'яйцо утиное': { calories: 185, protein: 13, fat: 14, carbs: 1.5 },
  'яйцо индюшиное': { calories: 171, protein: 13.7, fat: 11.9, carbs: 1.1 },
  'яйцо страусиное': { calories: 118, protein: 12.2, fat: 11.7, carbs: 0.7 },
  'яичный белок': { calories: 52, protein: 11, fat: 0.2, carbs: 0.7 },
  'яичный желток': { calories: 322, protein: 16, fat: 27, carbs: 3.6 },
  'яйцо вареное': { calories: 155, protein: 13, fat: 11, carbs: 1.1 },
  'яйцо вареное вкрутую': { calories: 155, protein: 13, fat: 11, carbs: 1.1 },
  'яйцо вареное всмятку': { calories: 155, protein: 13, fat: 11, carbs: 1.1 },
  'яйцо жареное': { calories: 196, protein: 14, fat: 15, carbs: 1.2 },
  'яйцо пашот': { calories: 155, protein: 13, fat: 11, carbs: 1.1 },
  'яйцо омлет': { calories: 154, protein: 11, fat: 12, carbs: 2 },
  'яйцо скрэмбл': { calories: 170, protein: 12, fat: 13, carbs: 2 },
  'яичный порошок': { calories: 542, protein: 46, fat: 37, carbs: 4.5 },
  
  // ОРЕХИ И СЕМЕНА (100 продуктов)
  'грецкие орехи': { calories: 654, protein: 15, fat: 65, carbs: 14 },
  'орехи грецкие': { calories: 654, protein: 15, fat: 65, carbs: 14 },
  'миндаль': { calories: 579, protein: 21, fat: 50, carbs: 22 },
  'орехи миндаль': { calories: 579, protein: 21, fat: 50, carbs: 22 },
  'арахис': { calories: 567, protein: 26, fat: 49, carbs: 16 },
  'орехи арахис': { calories: 567, protein: 26, fat: 49, carbs: 16 },
  'фисташки': { calories: 557, protein: 20, fat: 50, carbs: 27 },
  'орехи фисташки': { calories: 557, protein: 20, fat: 50, carbs: 27 },
  'кешью': { calories: 553, protein: 18, fat: 44, carbs: 30 },
  'орехи кешью': { calories: 553, protein: 18, fat: 44, carbs: 30 },
  'фундук': { calories: 628, protein: 15, fat: 61, carbs: 17 },
  'орехи фундук': { calories: 628, protein: 15, fat: 61, carbs: 17 },
  'пекан': { calories: 691, protein: 9, fat: 72, carbs: 14 },
  'орехи пекан': { calories: 691, protein: 9, fat: 72, carbs: 14 },
  'бразильский орех': { calories: 656, protein: 14, fat: 66, carbs: 12 },
  'орехи бразильские': { calories: 656, protein: 14, fat: 66, carbs: 12 },
  'макадамия': { calories: 718, protein: 8, fat: 76, carbs: 14 },
  'орехи макадамия': { calories: 718, protein: 8, fat: 76, carbs: 14 },
  'кедровые орехи': { calories: 673, protein: 14, fat: 68, carbs: 13 },
  'орехи кедровые': { calories: 673, protein: 14, fat: 68, carbs: 13 },
  'каштан': { calories: 213, protein: 2.4, fat: 2.3, carbs: 46 },
  'орехи каштаны': { calories: 213, protein: 2.4, fat: 2.3, carbs: 46 },
  'семечки подсолнечника': { calories: 578, protein: 21, fat: 49, carbs: 20 },
  'семечки тыквенные': { calories: 446, protein: 24, fat: 19, carbs: 54 },
  'семена льна': { calories: 534, protein: 18, fat: 42, carbs: 29 },
  'семена чиа': { calories: 486, protein: 17, fat: 31, carbs: 42 },
  'семена кунжута': { calories: 573, protein: 18, fat: 49, carbs: 23 },
  'семена мака': { calories: 525, protein: 18, fat: 42, carbs: 28 },
  'семена конопли': { calories: 553, protein: 31, fat: 48, carbs: 9 },
  'ореховая паста': { calories: 588, protein: 25, fat: 50, carbs: 20 },
  'урбеч из семян': { calories: 534, protein: 18, fat: 45, carbs: 25 },

  'бургер': { calories: 534, protein: 18, fat: 45, carbs: 25 },
  'пицца Маргарита': { calories: 285, protein: 12, fat: 11, carbs: 35 },
  'паста карбонара': { calories: 450, protein: 15, fat: 28, carbs: 35 },
  'ролл Калифорния': { calories: 255, protein: 9, fat: 7, carbs: 38 },
  'салат Цезарь': { calories: 350, protein: 18, fat: 26, carbs: 12 },
  'стейк рибай': { calories: 410, protein: 35, fat: 30, carbs: 0 },
  'куриная грудка на гриле': { calories: 165, protein: 31, fat: 3.6, carbs: 0 },
  'картофель фри': { calories: 312, protein: 3.4, fat: 15, carbs: 41 },
  'оладьи': { calories: 227, protein: 6, fat: 9, carbs: 28 },
  'блины': { calories: 227, protein: 6, fat: 9, carbs: 28 },
  'пельмени': { calories: 275, protein: 12, fat: 12, carbs: 25 },
  'суши с лососем (нигири)': { calories: 56, protein: 4, fat: 1, carbs: 8 },
  'шашлык из свинины': { calories: 320, protein: 25, fat: 24, carbs: 0 },
  'плов': { calories: 360, protein: 12, fat: 18, carbs: 35 },
  'борщ': { calories: 150, protein: 5, fat: 8, carbs: 15 },
  'суп том ям': { calories: 120, protein: 8, fat: 5, carbs: 10 },
  'лазанья': { calories: 330, protein: 17, fat: 18, carbs: 25 },
  'чизкейк': { calories: 321, protein: 5.5, fat: 22, carbs: 25 },
  'тирамису': { calories: 450, protein: 8, fat: 30, carbs: 35 },
  'греческий салат': { calories: 180, protein: 6, fat: 15, carbs: 7 },
  'рыба с жареным картофелем': { calories: 450, protein: 18, fat: 22, carbs: 40 },
  'такос': { calories: 226, protein: 9, fat: 13, carbs: 18 },
  'буррито': { calories: 450, protein: 18, fat: 20, carbs: 50 },
  'хумус': { calories: 177, protein: 4, fat: 11, carbs: 14 },
  'фалафель': { calories: 333, protein: 13, fat: 18, carbs: 31 },
  'омлет': { calories: 154, protein: 11, fat: 12, carbs: 0.7 },
  'яичница': { calories: 196, protein: 14, fat: 15, carbs: 1 },
  'вафли': { calories: 291, protein: 8, fat: 14, carbs: 33 },
  'сырники': { calories: 215, protein: 18, fat: 9, carbs: 15 },
  'хот-дог': { calories: 290, protein: 10, fat: 18, carbs: 24 },
  'гамбургер': { calories: 534, protein: 18, fat: 45, carbs: 25 },
  'чизбургер': { calories: 560, protein: 25, fat: 35, carbs: 40 },
  'сэндвич с курицей': { calories: 350, protein: 25, fat: 12, carbs: 35 },
  'клубничный чизкейк': { calories: 321, protein: 5.5, fat: 22, carbs: 25 },
  'морковный торт': { calories: 415, protein: 5, fat: 24, carbs: 46 },
  'шоколадный торт': { calories: 370, protein: 5, fat: 20, carbs: 45 },
  'паста болоньезе': { calories: 380, protein: 16, fat: 12, carbs: 50 },
  'ризотто с грибами': { calories: 320, protein: 9, fat: 12, carbs: 45 },
  'куриный суп с лапшой': { calories: 75, protein: 7, fat: 2, carbs: 8 },
  'грибной крем-суп': { calories: 175, protein: 5, fat: 12, carbs: 12 },
  'гаспачо': { calories: 80, protein: 2, fat: 4, carbs: 10 },
  'мисо суп': { calories: 84, protein: 6, fat: 4, carbs: 6 },
  'фо бо': { calories: 350, protein: 25, fat: 10, carbs: 40 },
  'печенье шоколадное': { calories: 488, protein: 6, fat: 25, carbs: 60 },
  'пончики': { calories: 452, protein: 5, fat: 25, carbs: 50 },
  'круассан': { calories: 406, protein: 8, fat: 21, carbs: 45 },
  'эклер': { calories: 262, protein: 4, fat: 16, carbs: 26 },
  'карри куриное': { calories: 250, protein: 20, fat: 15, carbs: 10 },
  'сашими': { calories: 150, protein: 20, fat: 6, carbs: 2 },
  'суп рамен': { calories: 436, protein: 20, fat: 17, carbs: 49 },
  'удон с курицей': { calories: 430, protein: 25, fat: 8, carbs: 65 },
  'спагетти с морепродуктами': { calories: 390, protein: 20, fat: 10, carbs: 55 },
  'цыпленок табака': { calories: 280, protein: 30, fat: 16, carbs: 2 },
  'люля-кебаб': { calories: 320, protein: 25, fat: 24, carbs: 0 },
  'чебурек': { calories: 350, protein: 12, fat: 20, carbs: 25 },
  'хачапури по-аджарски': { calories: 550, protein: 20, fat: 30, carbs: 45 },
  'манты': { calories: 275, protein: 12, fat: 12, carbs: 25 },
  'бефстроганов': { calories: 355, protein: 25, fat: 25, carbs: 8 },
  'гуляш': { calories: 280, protein: 20, fat: 18, carbs: 10 },
  'чили кон карне': { calories: 350, protein: 20, fat: 15, carbs: 30 },
  'энчилада': { calories: 320, protein: 15, fat: 20, carbs: 25 },
  'тортилья': { calories: 300, protein: 8, fat: 10, carbs: 45 },
  'пирог с яблоками': { calories: 265, protein: 3, fat: 11, carbs: 40 },
  'шарлотка': { calories: 250, protein: 6, fat: 8, carbs: 35 },
  'пирожок с капустой': { calories: 220, protein: 5, fat: 8, carbs: 30 },
  'пирожок с мясом': { calories: 280, protein: 10, fat: 15, carbs: 25 },
  'ватрушка': { calories: 300, protein: 8, fat: 12, carbs: 40 },
  'сметанник': { calories: 350, protein: 6, fat: 20, carbs: 35 },
  'торт Наполеон': { calories: 450, protein: 5, fat: 30, carbs: 40 },
  'медовик': { calories: 400, protein: 6, fat: 20, carbs: 45 },
  'прага': { calories: 380, protein: 6, fat: 20, carbs: 40 },
  'крем-брюле': { calories: 300, protein: 5, fat: 22, carbs: 20 },
  'панна-котта': { calories: 300, protein: 5, fat: 25, carbs: 15 },
  'мороженое пломбир': { calories: 227, protein: 3.5, fat: 15, carbs: 20 },
  'шоколадное мороженое': { calories: 250, protein: 4, fat: 16, carbs: 22 },
  'крем-суп из брокколи': { calories: 120, protein: 6, fat: 7, carbs: 10 },
  'цезарь ролл': { calories: 400, protein: 20, fat: 25, carbs: 25 },
  'стейк из тунца': { calories: 184, protein: 40, fat: 1, carbs: 0 },
  'лосось на гриле': { calories: 233, protein: 25, fat: 14, carbs: 0 },
  'креветки в кляре': { calories: 300, protein: 20, fat: 15, carbs: 20 },
  'кальмар жареный': { calories: 175, protein: 18, fat: 7, carbs: 8 },
  'мидии в соусе': { calories: 200, protein: 20, fat: 10, carbs: 6 },
  'осьминог на гриле': { calories: 164, protein: 25, fat: 4, carbs: 4 },
  'утка по-пекински': { calories: 340, protein: 25, fat: 25, carbs: 5 },
  'свинина в кисло-сладком соусе': { calories: 280, protein: 20, fat: 15, carbs: 20 },
  'курица в сливочном соусе': { calories: 250, protein: 25, fat: 15, carbs: 5 },
  'говядина по-строгановски': { calories: 355, protein: 25, fat: 25, carbs: 8 },
  'телячьи отбивные': { calories: 300, protein: 30, fat: 18, carbs: 4 },
  'бараньи ребрышки': { calories: 380, protein: 30, fat: 29, carbs: 0 },
  'котлеты по-киевски': { calories: 450, protein: 25, fat: 30, carbs: 15 },
  'зразы': { calories: 280, protein: 20, fat: 15, carbs: 15 },
  'тефтели': { calories: 220, protein: 15, fat: 12, carbs: 12 },
  'мясной рулет': { calories: 300, protein: 25, fat: 20, carbs: 8 },
  'колбаски гриль': { calories: 300, protein: 12, fat: 27, carbs: 2 },
  'сальтисон': { calories: 400, protein: 15, fat: 36, carbs: 2 },
  'холодец': { calories: 200, protein: 20, fat: 13, carbs: 2 },
  'заливная рыба': { calories: 150, protein: 20, fat: 7, carbs: 3 },
  'сельдь под шубой': { calories: 250, protein: 10, fat: 18, carbs: 15 },
  'оливье': { calories: 200, protein: 8, fat: 15, carbs: 10 },
  'винегрет': { calories: 130, protein: 2, fat: 10, carbs: 9 },
  'капрезе': { calories: 250, protein: 10, fat: 20, carbs: 5 },
  'табуле': { calories: 120, protein: 3, fat: 5, carbs: 17 },
  'салат с тунцом': { calories: 180, protein: 20, fat: 10, carbs: 5 },
  'кукурузный салат': { calories: 150, protein: 4, fat: 8, carbs: 18 },
  'салат из свеклы': { calories: 120, protein: 2, fat: 7, carbs: 14 },
  'морковный салат': { calories: 100, protein: 1, fat: 6, carbs: 11 },
  'гречка с грибами': { calories: 150, protein: 6, fat: 5, carbs: 22 },
  'пшенная каша': { calories: 120, protein: 3, fat: 1, carbs: 25 },
  'овсянка': { calories: 150, protein: 5, fat: 3, carbs: 27 },
  'манная каша': { calories: 120, protein: 3, fat: 3, carbs: 20 },
  'рисовая каша': { calories: 130, protein: 2, fat: 1, carbs: 28 },
  'перловая каша': { calories: 123, protein: 3, fat: 0.4, carbs: 28 },
  'кукурузная каша': { calories: 141, protein: 4, fat: 2, carbs: 28 },
  'гороховая каша': { calories: 130, protein: 9, fat: 0.5, carbs: 20 },
  'сырный суп': { calories: 300, protein: 15, fat: 20, carbs: 15 },
  'харчо': { calories: 180, protein: 15, fat: 10, carbs: 10 },
  'солянка': { calories: 200, protein: 15, fat: 13, carbs: 8 },
  'уха': { calories: 120, protein: 15, fat: 5, carbs: 5 },
  'окрошка': { calories: 80, protein: 5, fat: 3, carbs: 8 },
  'свекольник': { calories: 90, protein: 3, fat: 4, carbs: 10 },
  'щи': { calories: 100, protein: 5, fat: 4, carbs: 10 },
  'рататуй': { calories: 120, protein: 3, fat: 7, carbs: 12 },
  'запеченные овощи': { calories: 150, protein: 4, fat: 7, carbs: 20 },
  'овощное рагу': { calories: 130, protein: 4, fat: 5, carbs: 18 },
  'картофельное пюре': { calories: 130, protein: 2, fat: 5, carbs: 20 },
  'жареный картофель': { calories: 192, protein: 2.5, fat: 7, carbs: 30 },
  'картофель по-деревенски': { calories: 250, protein: 4, fat: 12, carbs: 30 },
  'драники': { calories: 200, protein: 4, fat: 10, carbs: 25 },
  'вареники с картошкой': { calories: 220, protein: 6, fat: 5, carbs: 35 },
  'вареники с творогом': { calories: 210, protein: 10, fat: 5, carbs: 30 },
  'ленивые вареники': { calories: 190, protein: 12, fat: 6, carbs: 20 },
  'кнедлики': { calories: 250, protein: 5, fat: 2, carbs: 55 },
  'квашеная капуста': { calories: 27, protein: 1, fat: 0.1, carbs: 4.5 },
  'соленые огурцы': { calories: 11, protein: 0.6, fat: 0.1, carbs: 2.2 },
  'маринованные грибы': { calories: 24, protein: 3, fat: 0.5, carbs: 1.5 },
  'икра баклажанная': { calories: 150, protein: 2, fat: 12, carbs: 8 },
  'икра кабачковая': { calories: 90, protein: 2, fat: 6, carbs: 8 },
  'паштет печеночный': { calories: 319, protein: 16, fat: 27, carbs: 4 },
  'жюльен': { calories: 300, protein: 15, fat: 22, carbs: 10 },
  'канапе с лососем': { calories: 60, protein: 4, fat: 3, carbs: 5 },
  'брускетта': { calories: 180, protein: 5, fat: 10, carbs: 18 },
  'гуакамоле': { calories: 160, protein: 2, fat: 15, carbs: 7 },
  'цацики': { calories: 150, protein: 5, fat: 12, carbs: 6 },
  'сырные палочки': { calories: 350, protein: 15, fat: 22, carbs: 25 },
  'луковые кольца': { calories: 385, protein: 4, fat: 24, carbs: 38 },
  'куриные крылышки': { calories: 320, protein: 30, fat: 22, carbs: 0 },
  'куриные наггетсы': { calories: 320, protein: 20, fat: 20, carbs: 15 },
  'мясные шарики': { calories: 220, protein: 15, fat: 12, carbs: 12 },
  'роллы с угрем': { calories: 300, protein: 10, fat: 12, carbs: 35 },
  'роллы Филадельфия': { calories: 350, protein: 12, fat: 15, carbs: 40 },
  'сашими из тунца': { calories: 184, protein: 40, fat: 1, carbs: 0 },
  'суп с фрикадельками': { calories: 120, protein: 10, fat: 6, carbs: 8 },
  'куриный бульон': { calories: 50, protein: 7, fat: 2, carbs: 1 },
  'овощной бульон': { calories: 12, protein: 0.6, fat: 0.2, carbs: 2 },
  'бульон с яйцом': { calories: 70, protein: 8, fat: 3, carbs: 2 },
  'гуляш из свинины': { calories: 280, protein: 20, fat: 18, carbs: 10 },
  'плов с бараниной': { calories: 380, protein: 15, fat: 20, carbs: 35 },
  'плов с курицей': { calories: 350, protein: 18, fat: 15, carbs: 35 },
  'плов с морепродуктами': { calories: 320, protein: 20, fat: 10, carbs: 35 },
  'фрикасе': { calories: 280, protein: 25, fat: 18, carbs: 5 },
  'курица терияки': { calories: 250, protein: 25, fat: 10, carbs: 15 },
  'стейк из семги': { calories: 233, protein: 25, fat: 14, carbs: 0 },
  'семга слабосоленая': { calories: 202, protein: 22, fat: 12, carbs: 0 },
  'скумбрия копченая': { calories: 221, protein: 20, fat: 16, carbs: 0 },
  'сельдь соленая': { calories: 217, protein: 20, fat: 15, carbs: 0 },
  'салат из морской капусты': { calories: 122, protein: 1, fat: 10, carbs: 6 },
  'салат с крабовыми палочками': { calories: 180, protein: 8, fat: 12, carbs: 10 },
  'паэлья': { calories: 350, protein: 20, fat: 12, carbs: 35 },
  'джез-бей': { calories: 250, protein: 20, fat: 15, carbs: 10 },
  'макароны по-флотски': { calories: 300, protein: 12, fat: 15, carbs: 30 },
  'спагетти с томатным соусом': { calories: 220, protein: 7, fat: 5, carbs: 38 },
  'лапша соба': { calories: 336, protein: 12, fat: 1, carbs: 70 },
  'печень по-строгановски': { calories: 250, protein: 25, fat: 15, carbs: 5 },
  'почки тушеные': { calories: 200, protein: 25, fat: 10, carbs: 5 },
  'язык отварной': { calories: 231, protein: 23, fat: 15, carbs: 0 },
  'сало соленое': { calories: 816, protein: 2.4, fat: 89, carbs: 0 },
  'шпик': { calories: 816, protein: 2.4, fat: 89, carbs: 0 },
  'колбаса докторская': { calories: 257, protein: 12.8, fat: 22.2, carbs: 1.5 },
  'колбаса салями': { calories: 336, protein: 22, fat: 26, carbs: 2 },
  'буженина': { calories: 233, protein: 16, fat: 18, carbs: 1 },
  'окорок': { calories: 261, protein: 18, fat: 21, carbs: 0 },
  'грудинка копченая': { calories: 518, protein: 10, fat: 52, carbs: 0 },
  'корейка': { calories: 384, protein: 17, fat: 34, carbs: 0 },
  'антрекот': { calories: 220, protein: 29, fat: 11, carbs: 0 },
  'филе-миньон': { calories: 220, protein: 29, fat: 11, carbs: 0 },
  'турнедо': { calories: 220, protein: 29, fat: 11, carbs: 0 },
  'шницель': { calories: 350, protein: 20, fat: 25, carbs: 10 },
  'котлета пожарская': { calories: 400, protein: 25, fat: 30, carbs: 10 },
  'бифштекс рубленый': { calories: 300, protein: 25, fat: 22, carbs: 0 },
  'медальоны из свинины': { calories: 350, protein: 25, fat: 27, carbs: 0 },
  'эскалоп': { calories: 350, protein: 25, fat: 27, carbs: 0 },
  'куриный шашлык': { calories: 200, protein: 30, fat: 8, carbs: 0 },
  'шашлык из баранины': { calories: 320, protein: 25, fat: 24, carbs: 0 },
  'шаурма': { calories: 450, protein: 20, fat: 25, carbs: 35 },
  'шаверма': { calories: 450, protein: 20, fat: 25, carbs: 35 },
  'донер-кебаб': { calories: 450, protein: 20, fat: 25, carbs: 35 },
  'кесадилья': { calories: 350, protein: 15, fat: 20, carbs: 25 },
  'начос': { calories: 450, protein: 8, fat: 25, carbs: 50 },
  'чипсы': { calories: 536, protein: 7, fat: 35, carbs: 50 },
  'попкорн': { calories: 375, protein: 12, fat: 4, carbs: 78 },
  'снеки': { calories: 500, protein: 6, fat: 30, carbs: 50 },
  'сушки': { calories: 372, protein: 11, fat: 1.5, carbs: 73 },
  'баранки': { calories: 372, protein: 11, fat: 1.5, carbs: 73 },
  'бублики': { calories: 372, protein: 11, fat: 1.5, carbs: 73 },
  'сухарики': { calories: 400, protein: 11, fat: 5, carbs: 75 },
  'гренки': { calories: 407, protein: 9, fat: 21, carbs: 45 },
  'яйца пашот': { calories: 143, protein: 13, fat: 10, carbs: 0.7 },
  'яйца бенедикт': { calories: 350, protein: 18, fat: 27, carbs: 10 },
  'скрэмбл': { calories: 196, protein: 14, fat: 15, carbs: 1 },
  'рататуй провансальский': { calories: 120, protein: 3, fat: 7, carbs: 12 },
  'фриттата': { calories: 154, protein: 11, fat: 12, carbs: 0.7 },
  'киш': { calories: 400, protein: 15, fat: 30, carbs: 20 },
  'пирог киш': { calories: 400, protein: 15, fat: 30, carbs: 20 },
  'пирог с мясом': { calories: 350, protein: 15, fat: 20, carbs: 25 },
  'пирог с рыбой': { calories: 300, protein: 15, fat: 15, carbs: 25 },
  'пирог с курицей': { calories: 320, protein: 20, fat: 18, carbs: 20 },
  'курник': { calories: 350, protein: 20, fat: 20, carbs: 25 },
  'расстегай': { calories: 250, protein: 10, fat: 12, carbs: 25 },
  'кулебяка': { calories: 300, protein: 15, fat: 15, carbs: 25 },
  'беляш': { calories: 350, protein: 12, fat: 20, carbs: 25 },
  'самса': { calories: 350, protein: 12, fat: 20, carbs: 25 },
  'эчпочмак': { calories: 300, protein: 15, fat: 15, carbs: 25 },
  'бэлиш': { calories: 350, protein: 15, fat: 20, carbs: 25 },
  'перемяч': { calories: 300, protein: 15, fat: 15, carbs: 25 },
  'чизкейк нью-йорк': { calories: 321, protein: 5.5, fat: 22, carbs: 25 },
  'чизкейк ягодный': { calories: 321, protein: 5.5, fat: 22, carbs: 25 },
  'чизкейк шоколадный': { calories: 350, protein: 6, fat: 25, carbs: 25 },
  'панакота ягодная': { calories: 300, protein: 5, fat: 25, carbs: 15 },
  'панакота карамельная': { calories: 320, protein: 5, fat: 25, carbs: 20 },
  'брауни': { calories: 466, protein: 6, fat: 30, carbs: 45 },
  'маффин шоколадный': { calories: 450, protein: 6, fat: 25, carbs: 50 },
  'маффин с черникой': { calories: 350, protein: 5, fat: 15, carbs: 45 },
  'кекс': { calories: 350, protein: 5, fat: 15, carbs: 45 },
  'бисквит': { calories: 350, protein: 8, fat: 10, carbs: 55 },
  'меренга': { calories: 406, protein: 6, fat: 0.2, carbs: 94 },
  'зефир': { calories: 326, protein: 1, fat: 0, carbs: 81 },
  'пастила': { calories: 324, protein: 0.5, fat: 0, carbs: 80 },
  'мармелад': { calories: 296, protein: 0.1, fat: 0, carbs: 74 },
  'пряники': { calories: 350, protein: 5, fat: 2, carbs: 80 },
  'козинаки': { calories: 500, protein: 12, fat: 29, carbs: 51 },
  'халва': { calories: 469, protein: 12, fat: 29, carbs: 51 },
  'лукум': { calories: 316, protein: 0.8, fat: 0.7, carbs: 79 },
  'чурчхела': { calories: 500, protein: 10, fat: 15, carbs: 80 },
  'бастурма': { calories: 240, protein: 35, fat: 11, carbs: 0.5 },
  'суджук': { calories: 463, protein: 24, fat: 40, carbs: 1.5 },
  'пахлава': { calories: 450, protein: 7, fat: 25, carbs: 50 },
  'курабье': { calories: 500, protein: 6, fat: 30, carbs: 52 },
  'печенье овсяное': { calories: 450, protein: 7, fat: 18, carbs: 68 },
  'печенье сахарное': { calories: 417, protein: 6, fat: 12, carbs: 70 },
  'печенье сдобное': { calories: 450, protein: 6, fat: 20, carbs: 60 },
  'вафли с начинкой': { calories: 425, protein: 5, fat: 15, carbs: 65 },
  'крем сметанный': { calories: 300, protein: 2, fat: 25, carbs: 18 },
  'крем заварной': { calories: 300, protein: 4, fat: 18, carbs: 30 },
  'крем масляный': { calories: 450, protein: 0.5, fat: 40, carbs: 25 },
  'глазурь шоколадная': { calories: 400, protein: 3, fat: 15, carbs: 65 },
  'помадка': { calories: 373, protein: 0.1, fat: 0.1, carbs: 93 },

  'эспрессо (30 мл)': { calories: 2, protein: 0.2, fat: 0, carbs: 0.3 },
  'американо': { calories: 2, protein: 0.1, fat: 0, carbs: 0.2 },
  'латте': { calories: 65, protein: 3.5, fat: 3.5, carbs: 5 },
  'капучино': { calories: 45, protein: 2.8, fat: 2.4, carbs: 3.2 },
  'флет уайт': { calories: 55, protein: 3.2, fat: 3, carbs: 4 },
  'чай черный (без сахара)': { calories: 1, protein: 0, fat: 0, carbs: 0.2 },
  'чай зеленый (без сахара)': { calories: 1, protein: 0, fat: 0, carbs: 0.2 },
  'чай с сахаром (1 ч.л.)': { calories: 35, protein: 0, fat: 0, carbs: 9 },
  'кока-кола': { calories: 42, protein: 0, fat: 0, carbs: 10.6 },
  'пепси': { calories: 42, protein: 0, fat: 0, carbs: 10.6 },
  'спрайт': { calories: 40, protein: 0, fat: 0, carbs: 10 },
  'фанта апельсин': { calories: 44, protein: 0, fat: 0, carbs: 11 },
  'газированная вода': { calories: 0, protein: 0, fat: 0, carbs: 0 },
  'вода негазированная': { calories: 0, protein: 0, fat: 0, carbs: 0 },
  'яблочный сок (100%)': { calories: 46, protein: 0.1, fat: 0.1, carbs: 11.3 },
  'апельсиновый сок (100%)': { calories: 45, protein: 0.7, fat: 0.2, carbs: 10.4 },
  'томатный сок': { calories: 21, protein: 0.9, fat: 0.1, carbs: 3.9 },
  'виноградный сок': { calories: 70, protein: 0.3, fat: 0, carbs: 17.2 },
  'клюквенный морс': { calories: 50, protein: 0, fat: 0, carbs: 12.5 },
  'компот из сухофруктов': { calories: 60, protein: 0.3, fat: 0, carbs: 14.5 },
  'молоко 3.2%': { calories: 62, protein: 3, fat: 3.2, carbs: 4.7 },
  'молоко 1.5%': { calories: 45, protein: 3, fat: 1.5, carbs: 4.8 },
  'молоко обезжиренное': { calories: 35, protein: 3.3, fat: 0.1, carbs: 5 },
  'кефир 3.2%': { calories: 59, protein: 3, fat: 3.2, carbs: 4 },
  'кефир 1%': { calories: 40, protein: 3, fat: 1, carbs: 4 },
  'айран/тан': { calories: 25, protein: 1.1, fat: 1.5, carbs: 1.4 },
  'питьевой йогурт (натуральный)': { calories: 70, protein: 3.5, fat: 2, carbs: 8 },
  'питьевой йогурт с фруктами': { calories: 90, protein: 2.8, fat: 2.5, carbs: 14 },
  'смузи ягодный': { calories: 75, protein: 1.5, fat: 0.5, carbs: 16 },
  'смузи зеленый (шпинат, яблоко)': { calories: 40, protein: 1, fat: 0.3, carbs: 9 },
  'протеиновый коктейль (молочный)': { calories: 60, protein: 10, fat: 1, carbs: 2 },
  'горячий шоколад': { calories: 90, protein: 3, fat: 3.5, carbs: 12 },
  'какао на молоке': { calories: 85, protein: 3.2, fat: 3.8, carbs: 10 },
  'энергетик (Red Bull)': { calories: 45, protein: 0, fat: 0, carbs: 11 },
  'энергетик (Burn)': { calories: 48, protein: 0, fat: 0, carbs: 11.5 },
  'изотоник (Powerade)': { calories: 25, protein: 0, fat: 0, carbs: 6.3 },
  'пиво светлое (4.5%)': { calories: 42, protein: 0.5, fat: 0, carbs: 3.5 },
  'пиво темное': { calories: 54, protein: 0.6, fat: 0, carbs: 5.5 },
  'красное сухое вино': { calories: 68, protein: 0.1, fat: 0, carbs: 0.2 },
  'белое сухое вино': { calories: 66, protein: 0.1, fat: 0, carbs: 0.6 },
  'шампанское брют': { calories: 70, protein: 0.2, fat: 0, carbs: 1.5 },
  'водка': { calories: 235, protein: 0, fat: 0, carbs: 0 },
  'виски': { calories: 250, protein: 0, fat: 0, carbs: 0.1 },
  'ром': { calories: 220, protein: 0, fat: 0, carbs: 0 },
  'джин': { calories: 220, protein: 0, fat: 0, carbs: 0 },
  'тоник (Schweppes)': { calories: 34, protein: 0, fat: 0, carbs: 8.6 },
  'квас': { calories: 30, protein: 0, protein: 0, fat: 0, carbs: 5 },
  'содовая (газированная с лимоном)': { calories: 0, protein: 0, fat: 0, carbs: 0 },
  'грейпфрутовый сок (100%)': { calories: 39, protein: 0.5, fat: 0.1, carbs: 9.2 },
  'кокосовая вода': { calories: 19, protein: 0, fat: 0, carbs: 3.7 },
  'мате (без сахара)': { calories: 2, protein: 0, fat: 0, carbs: 0.3 }
};


console.log(`📊 Загружено продуктов: ${Object.keys(foodDatabase).length}`);

// ========== ПОМОЩНИКИ ПОИСКА ==========
function levenshteinDistance(a, b) {
  const matrix = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

function findProductInDatabaseEnhanced(text) {
  const lowerText = text.toLowerCase().trim();
  
  // 1. Прямой поиск
  for (const [productName, nutrition] of Object.entries(foodDatabase)) {
    if (lowerText === productName.toLowerCase()) {
      return { productName, nutrition, method: 'точное совпадение' };
    }
  }
  
  // 2. Поиск по подстроке
  for (const [productName, nutrition] of Object.entries(foodDatabase)) {
    if (lowerText.includes(productName.toLowerCase()) || 
        productName.toLowerCase().includes(lowerText)) {
      return { productName, nutrition, method: 'поиск по подстроке' };
    }
  }
  
  // 3. Поиск по словам
  const words = lowerText.split(/\s+/).filter(w => w.length > 2);
  
  if (words.length > 0) {
    // Ищем продукты, содержащие все слова
    for (const [productName, nutrition] of Object.entries(foodDatabase)) {
      const lowerProductName = productName.toLowerCase();
      const hasAllWords = words.every(word => lowerProductName.includes(word));
      if (hasAllWords) {
        return { productName, nutrition, method: 'все слова в названии' };
      }
    }
    
    // Ищем продукты, содержащие хотя бы одно слово
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [productName, nutrition] of Object.entries(foodDatabase)) {
      const lowerProductName = productName.toLowerCase();
      let score = 0;
      
      for (const word of words) {
        if (lowerProductName.includes(word)) {
          score++;
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { productName, nutrition, method: 'частичное совпадение' };
      }
    }
    
    if (bestScore > 0) {
      return bestMatch;
    }
  }
  
  // 4. Левенштейн расстояние для похожих названий
  let closestMatch = null;
  let smallestDistance = Infinity;
  
  for (const [productName, nutrition] of Object.entries(foodDatabase)) {
    const distance = levenshteinDistance(lowerText, productName.toLowerCase());
    if (distance < smallestDistance && distance <= 3) {
      smallestDistance = distance;
      closestMatch = { productName, nutrition, method: 'похожее название' };
    }
  }
  
  return closestMatch;
}

function estimateCaloriesFromText(text, quantity = 100) {
  const lowerText = text.toLowerCase();
  let baseCalories = 100; // Среднее значение
  
  if (lowerText.includes('салат') || lowerText.includes('овощ')) {
    baseCalories = 30;
  } else if (lowerText.includes('фрукт') || lowerText.includes('ягод')) {
    baseCalories = 50;
  } else if (lowerText.includes('мясо') || lowerText.includes('куриц') || lowerText.includes('говядин')) {
    baseCalories = 200;
  } else if (lowerText.includes('рыб') || lowerText.includes('море')) {
    baseCalories = 150;
  } else if (lowerText.includes('сыр') || lowerText.includes('творог')) {
    baseCalories = 300;
  } else if (lowerText.includes('хлеб') || lowerText.includes('булк')) {
    baseCalories = 250;
  } else if (lowerText.includes('макарон') || lowerText.includes('паст') || lowerText.includes('спагетт')) {
    baseCalories = 150;
  } else if (lowerText.includes('рис') || lowerText.includes('гречк') || lowerText.includes('каш')) {
    baseCalories = 130;
  } else if (lowerText.includes('суп')) {
    baseCalories = 80;
  } else if (lowerText.includes('десерт') || lowerText.includes('торт') || lowerText.includes('пирожн')) {
    baseCalories = 350;
  } else if (lowerText.includes('фастфуд') || lowerText.includes('бургер') || lowerText.includes('пицц')) {
    baseCalories = 300;
  }
  
  return Math.round((baseCalories * quantity) / 100);
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function showTodayStats(chatId, user) {
  if (!user.dailyGoal) {
    bot.sendMessage(chatId, '❌ Сначала установите норму через /start', {
      parse_mode: 'Markdown'
    });
    return;
  }
  
  const consumed = user.consumed || 0;
  const remaining = Math.max(0, user.dailyGoal - consumed);
  const percent = Math.round((consumed / user.dailyGoal) * 100);
  const barLength = 10;
  const filled = Math.min(barLength, Math.floor(percent / 10));
  const bar = '🟩'.repeat(filled) + '⬜'.repeat(barLength - filled);
  
  let message = `📊 *Статистика за день*\n\n`;
  message += `🎯 Норма: *${user.dailyGoal} ккал*\n`;
  message += `🍽️ Съедено: *${consumed} ккал*\n`;
  message += `📉 Осталось: *${remaining} ккал*\n`;
  message += `📈 Прогресс: *${percent}%*\n\n`;
  message += `${bar}\n\n`;
  
  if (user.foods && user.foods.length > 0) {
    message += `🍎 *Съеденные продукты:*\n`;
    user.foods.forEach((food, index) => {
      const time = food.time || '';
      message += `${index + 1}. ${food.name} - ${food.calories} ккал ${time}\n`;
    });
  } else {
    message += `🍽️ *Сегодня еще ничего не добавлено*\n`;
    message += `Используйте "🍽️ Добавить еду" для начала!`;
  }
  
  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: mainKeyboard
  });
}

function showProductsList(chatId) {
  const categories = {
    '🍎 Фрукты и ягоды': ['яблоко', 'банан', 'апельсин', 'мандарин', 'груша', 'персик', 'виноград', 'арбуз', 'дыня', 'клубника', 'малина', 'черника', 'авокадо'],
    '🥦 Овощи': ['помидор', 'огурец', 'морковь', 'картофель', 'лук', 'перец болгарский', 'баклажан', 'кабачок', 'тыква', 'свекла', 'капуста', 'брокколи', 'шпинат'],
    '🌾 Крупы и бобовые': ['рис', 'гречка', 'овсянка', 'макароны', 'хлеб', 'горох', 'фасоль', 'чечевица'],
    '🍗 Мясо и птица': ['курица', 'индейка', 'говядина', 'свинина', 'баранина', 'колбаса', 'сосиски', 'ветчина'],
    '🐟 Рыба и морепродукты': ['лосось', 'тунец', 'сельдь', 'треска', 'креветки', 'кальмары'],
    '🥛 Молочные продукты': ['молоко', 'творог', 'сыр', 'йогурт', 'сметана', 'кефир', 'масло'],
    '🥚 Яйца': ['яйцо'],
    '🌰 Орехи и семена': ['орехи грецкие', 'миндаль', 'арахис', 'семечки'],
    '🍕 Готовые блюда': ['пицца', 'бургер', 'салат цезарь', 'суп', 'шашлык', 'пельмени', 'блины'],
    '🥤 Напитки': ['кофе', 'чай', 'сок', 'вода']
  };
  
  let message = `📋 *Список продуктов в базе*\n\n`;
  message += `Всего продуктов: ${Object.keys(foodDatabase).length}\n\n`;
  
  for (const [category, items] of Object.entries(categories)) {
    message += `*${category}:*\n`;
    items.forEach(item => {
      if (foodDatabase[item]) {
        message += `• ${item} - ${foodDatabase[item].calories} ккал/100г\n`;
      }
    });
    message += '\n';
  }
  
  message += `🔍 *Для поиска:*\n`;
  message += `Просто напишите название продукта при добавлении еды`;
  
  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: mainKeyboard
  });
}

function showHelp(chatId) {
  const helpMessage = `🤖 *Помощь по боту-калориметру*\n\n` +
    `*Основные команды:*\n` +
    `/start - Начать работу с ботом\n` +
    `/stats - Показать статистику за день\n` +
    `/goal - Показать/изменить норму калорий\n` +
    `/list - Показать список продуктов\n` +
    `/reset - Сбросить данные за день\n` +
    `/help - Эта справка\n\n` +
    `*Как добавлять еду:*\n` +
    `1. Нажмите "🍽️ Добавить еду"\n` +
    `2. Опишите что съели:\n` +
    `   • "200г риса с курицей"\n` +
    `   • "2 яблока и кофе"\n` +
    `   • "Салат цезарь 300г"\n` +
    `   • "Бургер и кола"\n\n` +
    `*Как работает поиск:*\n` +
    `• Бот ищет в базе из ${Object.keys(foodDatabase).length} продуктов\n` +
    `• Автоматически определяет количество\n` +
    `• Если не нашел - предложит ввести калории вручную\n\n` +
    `*Примечания:*\n` +
    `• Данные сохраняются только до сброса\n` +
    `• Норму можно изменить в любой момент\n` +
    `• Для точности указывайте вес продукта`;
  
  bot.sendMessage(chatId, helpMessage, {
    parse_mode: 'Markdown',
    reply_markup: mainKeyboard
  });
}

function promptManualFoodEntry(chatId, originalText = '') {
  const message = `✍️ *Ручное добавление блюда*\n\n` +
    `Похоже, "${originalText}" не найден в базе.\n\n` +
    `📝 *Введите в формате:*\n` +
    `1. Название - калории\n` +
    `   "Лазанья - 450 ккал"\n\n` +
    `2. Название + количество\n` +
    `   "Салат 250г - 180 ккал"\n\n` +
    `3. Можно просто: "Блюдо 350"\n\n` +
    `4. С количеством: "Бургер 250г 550 ккал"\n\n` +
    `*Примеры:*\n` +
    `• "Домашний борщ - 210 ккал"\n` +
    `• "Шаурма 450"\n` +
    `• "Фирменный торт 300г - 520 ккал"\n` +
    `• "Пицца 350г 850 ккал"`;
  
  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown'
  });
  
  userStates.set(chatId, { step: 'correcting_food_manual' });
  
  pendingCorrections.set(chatId, {
    text: originalText,
    analysis: {
      foodName: originalText,
      quantity: 100,
      unit: 'г',
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0
    },
    timestamp: Date.now()
  });
}

// ========== КОМАНДА START ==========
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name;
  
  const welcomeMessage = `👋 *Привет, ${userName}!*\n\n` +
    `Я бот для подсчета калорий! 🍎\n\n` +
    `Я помогу вам:\n` +
    `• Отслеживать дневную норму калорий\n` +
    `• Узнавать калорийность продуктов\n` +
    `• Контролировать питание\n\n` +
    `*Давайте начнем!*\n\n` +
    `🎯 *Установите вашу дневную норму калорий:*`;
  
  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: goalKeyboard
  });
  
  userStates.set(chatId, { step: 'waiting_for_goal' });
});

// ========== КОМАНДЫ ==========
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId) || {};
  showTodayStats(chatId, user);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  showHelp(chatId);
});

bot.onText(/\/reset/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId) || {};
  
  user.consumed = 0;
  user.foods = [];
  userData.set(chatId, user);
  
  bot.sendMessage(chatId, 
    '✅ *Данные за день сброшены!*\n\n' +
    'Можно начинать новый день!',
    { parse_mode: 'Markdown', reply_markup: mainKeyboard }
  );
});

bot.onText(/\/goal/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData.get(chatId) || {};
  
  if (user.dailyGoal) {
    bot.sendMessage(chatId, 
      `🎯 *Текущая дневная норма:* ${user.dailyGoal} ккал\n\n` +
      `🍽️ *Съедено сегодня:* ${user.consumed || 0} ккал\n` +
      `📉 *Осталось:* ${Math.max(0, user.dailyGoal - (user.consumed || 0))} ккал\n\n` +
      `Используйте меню "🎯 Изменить норму" для изменения`,
      { parse_mode: 'Markdown', reply_markup: mainKeyboard }
    );
  } else {
    bot.sendMessage(chatId, 
      '❌ *Норма калорий не установлена!*\n\n' +
      'Используйте /start для настройки бота',
      { parse_mode: 'Markdown' }
    );
  }
});

bot.onText(/\/list/, (msg) => {
  const chatId = msg.chat.id;
  showProductsList(chatId);
});

function logMessage(msg) {
  const timestamp = new Date().toISOString();
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Неизвестный';
  const text = msg.text || '(без текста)';
  const messageType = msg.photo ? 'ФОТО' : 
                     msg.document ? 'ДОКУМЕНТ' : 
                     msg.location ? 'МЕСТОПОЛОЖЕНИЕ' : 
                     'ТЕКСТ';
  
  console.log(`📨 [${timestamp}]`);
  console.log(`👤 Пользователь: ${userName} (ID: ${chatId})`);
  console.log(`📝 Тип: ${messageType}`);
  console.log(`💬 Сообщение: "${text}"`);
  console.log(`📊 Данные:`, JSON.stringify(msg, null, 2).substring(0, 500) + '...');
  console.log('─'.repeat(50));
}

// Затем в обработчике сообщений добавьте вызов этой функции в самом начале:
bot.on('message', async (msg) => {
  // Логируем ВСЕ сообщения
  logMessage(msg);
// ========== ОБРАБОТКА СООБЩЕНИЙ ==========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userName = msg.from.first_name;
  
  // Пропускаем команды
  if (text && text.startsWith('/')) return;
  if (!text) return;
  
  const userState = userStates.get(chatId) || {};
  const user = userData.get(chatId) || {};
  
  // ========== УСТАНОВКА НОРМЫ ==========
  if (userState.step === 'waiting_for_goal') {
    let goal = 0;
    
    if (text.includes('1500')) {
      goal = 1500;
    } else if (text.includes('2000')) {
      goal = 2000;
    } else if (text.includes('2500')) {
      goal = 2500;
    } else if (text === 'Ввести свою норму') {
      bot.sendMessage(chatId, 
        '✍️ *Введите вашу индивидуальную норму калорий:*\n\n' +
        'Просто напишите число (например: 1800)',
        { parse_mode: 'Markdown' }
      );
      userStates.set(chatId, { step: 'waiting_for_custom_goal' });
      return;
    } else {
      const match = text.match(/\d+/);
      if (match) {
        goal = parseInt(match[0]);
      } else {
        bot.sendMessage(chatId, 
          '❌ Пожалуйста, выберите вариант из меню или введите число\n\n' +
          'Пример: "1800" или нажмите кнопку',
          { reply_markup: goalKeyboard }
        );
        return;
      }
    }
    
    if (goal < 500 || goal > 10000) {
      bot.sendMessage(chatId, 
        '❌ Пожалуйста, введите реалистичную норму (500-10000 ккал)\n\n' +
        'Пример: 2000',
        { reply_markup: goalKeyboard }
      );
      return;
    }
    
    user.dailyGoal = goal;
    user.consumed = 0;
    user.foods = [];
    userData.set(chatId, user);
    
    userStates.set(chatId, { step: 'main_menu' });
    
    const successMessage = `✅ *Отлично, ${userName}!*\n\n` +
      `Дневная норма установлена: *${goal} ккал*\n\n` +
      `🍎 *Теперь вы можете:*\n` +
      `• Добавлять съеденную еду\n` +
      `• Следить за статистикой\n` +
      `• Искать продукты в базе\n\n` +
      `*Просто нажмите нужную кнопку в меню ниже!*`;
    
    bot.sendMessage(chatId, successMessage, {
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard
    });
    
    return;
  }
  
  // ========== ВВОД ИНДИВИДУАЛЬНОЙ НОРМЫ ==========
  if (userState.step === 'waiting_for_custom_goal') {
    const goal = parseInt(text);
    
    if (isNaN(goal) || goal < 500 || goal > 10000) {
      bot.sendMessage(chatId, 
        '❌ Пожалуйста, введите число от 500 до 10000\n\n' +
        'Пример: 1800',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    user.dailyGoal = goal;
    user.consumed = 0;
    user.foods = [];
    userData.set(chatId, user);
    
    userStates.set(chatId, { step: 'main_menu' });
    
    const successMessage = `✅ *Норма установлена: ${goal} ккал*\n\n` +
      `Теперь используйте меню ниже для работы с ботом!`;
    
    bot.sendMessage(chatId, successMessage, {
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard
    });
    
    return;
  }
  
  // ========== ОСНОВНОЕ МЕНЮ ==========
  if (userState.step === 'main_menu') {
    if (!user.dailyGoal) {
      userStates.set(chatId, { step: 'waiting_for_goal' });
      bot.sendMessage(chatId, 
        '🎯 Сначала установите дневную норму калорий:',
        { reply_markup: goalKeyboard }
      );
      return;
    }
    
    switch (text) {
      case '🍽️ Добавить еду':
        userStates.set(chatId, { step: 'adding_food' });
        bot.sendMessage(chatId, 
          '🍽️ *Что вы съели?*\n\n' +
          'Опишите блюдо или продукт:\n\n' +
          '*Примеры:*\n' +
          '• "200г риса с курицей"\n' +
          '• "2 яйца и кофе"\n' +
          '• "Яблоко 150г"\n\n' +
          'Просто напишите и нажмите отправить!',
          { parse_mode: 'Markdown' }
        );
        break;
        
      case '📊 Статистика':
        showTodayStats(chatId, user);
        break;
        
      case '🎯 Изменить норму':
        userStates.set(chatId, { step: 'changing_goal' });
        bot.sendMessage(chatId, 
          '🎯 *Текущая норма: ' + user.dailyGoal + ' ккал*\n\n' +
          'Введите новую дневную норму калорий:',
          { parse_mode: 'Markdown' }
        );
        break;
        
      case '📋 Продукты':
        showProductsList(chatId);
        break;
        
      case '🔄 Сбросить день':
        user.consumed = 0;
        user.foods = [];
        userData.set(chatId, user);
        bot.sendMessage(chatId, 
          '✅ *Данные за день сброшены!*\n\n' +
          'Можно начинать новый день!',
          { parse_mode: 'Markdown', reply_markup: mainKeyboard }
        );
        break;
        
      case '❓ Помощь':
        showHelp(chatId);
        break;
        
      default:
        if (user.dailyGoal) {
          userStates.set(chatId, { step: 'adding_food' });
          const fakeMsg = { ...msg, text: text };
          setTimeout(() => bot.emit('message', fakeMsg), 100);
        }
        break;
    }
    return;
  }
  
  // ========== ДОБАВЛЕНИЕ ЕДЫ ==========
  if (userState.step === 'adding_food') {
    if (!text || text.length < 2) {
      bot.sendMessage(chatId, 'Пожалуйста, опишите что вы съели');
      return;
    }
    
    bot.sendChatAction(chatId, 'typing');
    
    try {
      const searchResult = findProductInDatabaseEnhanced(text);
      
      let quantity = 100;
      let unit = 'г';
      const quantityMatch = text.match(/(\d+)\s*(г|грамм|мл|шт|штук)/i);
      
      if (quantityMatch) {
        quantity = parseInt(quantityMatch[1]);
        unit = quantityMatch[2].toLowerCase();
      }
      
      let analysis = null;
      
      if (searchResult) {
        const nutrition = searchResult.nutrition;
        const calories = Math.round((nutrition.calories * quantity) / 100);
        
        analysis = {
          foodName: searchResult.productName,
          quantity: quantity,
          unit: unit,
          calories: calories,
          protein: Math.round((nutrition.protein * quantity) / 100 * 10) / 10,
          fat: Math.round((nutrition.fat * quantity) / 100 * 10) / 10,
          carbs: Math.round((nutrition.carbs * quantity) / 100 * 10) / 10,
          source: '📚 База данных'
        };
      } else {
        const estimatedCalories = estimateCaloriesFromText(text, quantity);
        analysis = {
          foodName: text.substring(0, 40),
          quantity: quantity,
          unit: unit,
          calories: estimatedCalories,
          protein: Math.round(quantity * 0.1),
          fat: Math.round(quantity * 0.08),
          carbs: Math.round(quantity * 0.2),
          source: '📊 Примерная оценка'
        };
      }
      
      let response = `🍽️ *${analysis.foodName}*\n`;
      response += `📏 ${analysis.quantity}${analysis.unit}\n`;
      response += `🔥 *${analysis.calories} ккал*\n\n`;
      
      if (analysis.protein > 0 || analysis.fat > 0 || analysis.carbs > 0) {
        response += `🥩 Белки: ${analysis.protein.toFixed(1)}г\n`;
        response += `🥑 Жиры: ${analysis.fat.toFixed(1)}г\n`;
        response += `🍚 Углеводы: ${analysis.carbs.toFixed(1)}г\n\n`;
      }
      
      response += `${analysis.source}\n\n`;
      response += `*Это правильно?*`;
      
      pendingCorrections.set(chatId, {
        text: text,
        analysis: analysis,
        timestamp: Date.now()
      });
      
      const confirmKeyboard = {
        keyboard: [
          ['✅ Да, добавить', '✏️ Нет, изменить калории'],
          ['✏️ Нет, это другое блюдо', '🔍 Найти в базе'],
          ['↩️ Отмена']
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      };
      
      bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        reply_markup: confirmKeyboard
      });
      
      userStates.set(chatId, { step: 'confirming_food' });
      
    } catch (error) {
      console.error('Ошибка обработки:', error);
      bot.sendMessage(chatId, 
        '❌ Ошибка. Попробуйте еще раз или опишите по-другому',
        { reply_markup: mainKeyboard }
      );
      userStates.set(chatId, { step: 'main_menu' });
    }
    return;
  }
  
  // ========== ПОДТВЕРЖДЕНИЕ ЕДЫ ==========
  if (userState.step === 'confirming_food') {
    const pending = pendingCorrections.get(chatId);
    
    if (!pending) {
      bot.sendMessage(chatId, 'Время истекло. Попробуйте снова.', {
        reply_markup: mainKeyboard
      });
      userStates.set(chatId, { step: 'main_menu' });
      return;
    }
    
    const analysis = pending.analysis;
    
    switch (text) {
      case '✅ Да, добавить':
        user.consumed = (user.consumed || 0) + analysis.calories;
        user.foods = user.foods || [];
        user.foods.push({
          name: analysis.foodName,
          calories: analysis.calories,
          quantity: analysis.quantity,
          unit: analysis.unit,
          protein: analysis.protein || 0,
          fat: analysis.fat || 0,
          carbs: analysis.carbs || 0,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          source: analysis.source,
          addedAt: new Date().toISOString()
        });
        
        userData.set(chatId, user);
        pendingCorrections.delete(chatId);
        
        const remaining = Math.max(0, user.dailyGoal - user.consumed);
        const percent = Math.round((user.consumed / user.dailyGoal) * 100);
        
        let response = `✅ *Добавлено!*\n\n`;
        response += `🍽️ ${analysis.foodName}\n`;
        response += `📏 ${analysis.quantity}${analysis.unit}\n`;
        response += `🔥 ${analysis.calories} ккал\n\n`;
        response += `📊 *Итого за день:* ${user.consumed}/${user.dailyGoal} ккал\n`;
        response += `📉 *Осталось:* ${remaining} ккал\n`;
        response += `📈 *Прогресс:* ${percent}%`;
        
        const barLength = 10;
        const filled = Math.min(barLength, Math.floor(percent / 10));
        const bar = '🟩'.repeat(filled) + '⬜'.repeat(barLength - filled);
        response += `\n\n${bar}`;
        
        bot.sendMessage(chatId, response, {
          parse_mode: 'Markdown',
          reply_markup: mainKeyboard
        });
        
        userStates.set(chatId, { step: 'main_menu' });
        break;
        
      case '✏️ Нет, изменить калории':
        bot.sendMessage(chatId, 
          '✍️ *Введите правильное количество калорий:*\n\n' +
          `Для: ${analysis.foodName}\n` +
          `Примерное количество: ${analysis.quantity}${analysis.unit}\n\n` +
          'Просто напишите число (например: 350)',
          { parse_mode: 'Markdown' }
        );
        userStates.set(chatId, { step: 'correcting_calories' });
        break;
        
      case '✏️ Нет, это другое блюдо':
        promptManualFoodEntry(chatId, analysis.foodName);
        break;
        
      case '🔍 Найти в базе':
        bot.sendMessage(chatId, 
          '🔍 *Поиск продукта в базе*\n\n' +
          'Введите название продукта для поиска:',
          { parse_mode: 'Markdown' }
        );
        userStates.set(chatId, { step: 'searching_food' });
        break;
        
      case '↩️ Отмена':
        bot.sendMessage(chatId, 'Отменено. Что делаем дальше?', {
          reply_markup: mainKeyboard
        });
        userStates.set(chatId, { step: 'main_menu' });
        pendingCorrections.delete(chatId);
        break;
        
      default:
        bot.sendMessage(chatId, 'Пожалуйста, выберите вариант из меню', {
          reply_markup: {
            keyboard: [
              ['✅ Да, добавить', '✏️ Нет, изменить калорий'],
              ['✏️ Нет, это другое блюдо', '🔍 Найти в базе'],
              ['↩️ Отмена']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        });
        break;
    }
    return;
  }
  
  // ========== КОРРЕКТИРОВКА КАЛОРИЙ ==========
  if (userState.step === 'correcting_calories') {
    const pending = pendingCorrections.get(chatId);
    
    if (!pending) {
      bot.sendMessage(chatId, 'Время истекло. Попробуйте снова.', {
        reply_markup: mainKeyboard
      });
      userStates.set(chatId, { step: 'main_menu' });
      return;
    }
    
    const calories = parseInt(text);
    const analysis = pending.analysis;
    
    if (isNaN(calories) || calories <= 0 || calories > 5000) {
      bot.sendMessage(chatId, 
        '❌ Введите число от 1 до 5000\n\n' +
        'Пример: 350',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    user.consumed = (user.consumed || 0) + calories;
    user.foods = user.foods || [];
    user.foods.push({
      name: analysis.foodName,
      calories: calories,
      quantity: analysis.quantity,
      unit: analysis.unit,
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
    
    let response = `✅ *Добавлено с корректировкой!*\n\n`;
    response += `🍽️ ${analysis.foodName}\n`;
    response += `📏 ${analysis.quantity}${analysis.unit}\n`;
    response += `🔥 ${calories} ккал\n\n`;
    response += `📊 *Итого за день:* ${user.consumed}/${user.dailyGoal} ккал\n`;
    response += `📉 *Осталось:* ${remaining} ккал\n`;
    response += `📈 *Прогресс:* ${percent}%\n\n`;
    response += `✍️ *Калории указаны вручную*`;
    
    bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard
    });
    
    userStates.set(chatId, { step: 'main_menu' });
    return;
  }
  
  // ========== РУЧНОЙ ВВОД БЛЮДА ==========
  if (userState.step === 'correcting_food_manual') {
    const pending = pendingCorrections.get(chatId);
    
    if (!pending) {
      bot.sendMessage(chatId, 'Время истекло. Попробуйте снова.', {
        reply_markup: mainKeyboard
      });
      userStates.set(chatId, { step: 'main_menu' });
      return;
    }
    
    const originalAnalysis = pending.analysis;
    
    let foodName = text;
    let calories = 0;
    
    const match1 = text.match(/(.+?)\s*[-–—]\s*(\d+)\s*(ккал|калорий|кал)?/i);
    const match2 = text.match(/(.+?)\s+(\d+)\s*$/);
    const match3 = text.match(/^(\d+)\s*[-–—]\s*(.+)/i);
    const match4 = text.match(/(.+?)\s+(\d+)(г|мл|шт)\s+(\d+)/i);
    
    if (match4) {
      foodName = match4[1].trim();
      calories = parseInt(match4[4]);
      originalAnalysis.quantity = parseInt(match4[2]);
      originalAnalysis.unit = match4[3];
    } else if (match1) {
      foodName = match1[1].trim();
      calories = parseInt(match1[2]);
    } else if (match2) {
      foodName = match2[1].trim();
      calories = parseInt(match2[2]);
    } else if (match3) {
      foodName = match3[2].trim();
      calories = parseInt(match3[1]);
    } else {
      bot.sendMessage(chatId, 
        '❌ *Неверный формат!*\n\n' +
        'Пожалуйста, введите в формате:\n' +
        '• "Лазанья - 450 ккал"\n' +
        '• "Салат Цезарь 350"\n' +
        '• "450 - Пицца Маргарита"\n' +
        '• "Бургер 250г 550 ккал"\n\n' +
        'Сначала название, затем калории.',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    if (isNaN(calories) || calories <= 0 || calories > 5000) {
      bot.sendMessage(chatId, 
        '❌ Введите корректное количество калорий (1-5000)\n\n' +
        'Пример: "Бургер - 550 ккал"',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    const quantity = originalAnalysis.quantity || 100;
    const unit = originalAnalysis.unit || 'г';
    
    user.consumed = (user.consumed || 0) + calories;
    user.foods = user.foods || [];
    user.foods.push({
      name: foodName,
      calories: calories,
      quantity: quantity,
      unit: unit,
      protein: originalAnalysis.protein || 0,
      fat: originalAnalysis.fat || 0,
      carbs: originalAnalysis.carbs || 0,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      source: '✍️ Ручной ввод (не найден в базе)',
      addedAt: new Date().toISOString()
    });
    
    userData.set(chatId, user);
    pendingCorrections.delete(chatId);
    
    const remaining = Math.max(0, user.dailyGoal - user.consumed);
    const percent = Math.round((user.consumed / user.dailyGoal) * 100);
    
    let response = `✅ *Добавлено с ручным вводом!*\n\n`;
    response += `🍽️ ${foodName}\n`;
    response += `📏 ${quantity}${unit}\n`;
    response += `🔥 ${calories} ккал\n\n`;
    response += `📊 *Итого за день:* ${user.consumed}/${user.dailyGoal} ккал\n`;
    response += `📉 *Осталось:* ${remaining} ккал\n`;
    response += `📈 *Прогресс:* ${percent}%\n\n`;
    response += `✍️ *Добавлено вручную*`;
    
    bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard
    });
    
    userStates.set(chatId, { step: 'main_menu' });
    return;
  }
  
  // ========== ПОИСК В БАЗЕ ==========
  if (userState.step === 'searching_food') {
    const searchResult = findProductInDatabaseEnhanced(text);
    
    if (searchResult) {
      const { productName, nutrition } = searchResult;
      
      let response = `🔍 *Найдено в базе:*\n\n`;
      response += `🍽️ *${productName}*\n`;
      response += `📊 ${nutrition.calories} ккал/100г\n`;
      
      if (nutrition.protein || nutrition.fat || nutrition.carbs) {
        response += `🥩 Белки: ${nutrition.protein || 0}г\n`;
        response += `🥑 Жиры: ${nutrition.fat || 0}г\n`;
        response += `🍚 Углеводы: ${nutrition.carbs || 0}г\n\n`;
      }
      
      response += `*Хотите добавить этот продукт?*`;
      
      pendingCorrections.set(chatId, {
        text: text,
        analysis: {
          foodName: productName,
          nutrition: nutrition
        },
        timestamp: Date.now()
      });
      
      const searchKeyboard = {
        keyboard: [
          ['✅ Да, добавить', '✏️ Указать количество'],
          ['✏️ Добавить другое блюдо', '🔍 Новый поиск'],
          ['↩️ Отмена']
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      };
      
      bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        reply_markup: searchKeyboard
      });
      
      userStates.set(chatId, { step: 'confirming_search' });
    } else {
      bot.sendMessage(chatId, 
        `❌ *"${text}" не найден в базе*\n\n` +
        `Попробуйте:\n` +
        `• Другое название\n` +
        `• Более общее название\n` +
        `• Или добавьте вручную`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [
              ['✏️ Добавить вручную', '🔍 Новый поиск'],
              ['↩️ Назад к добавлению']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
    }
    return;
  }
  
  // ========== ПОДТВЕРЖДЕНИЕ ПОИСКА ==========
  if (userState.step === 'confirming_search') {
    const pending = pendingCorrections.get(chatId);
    
    if (!pending) {
      bot.sendMessage(chatId, 'Время истекло. Попробуйте снова.', {
        reply_markup: mainKeyboard
      });
      userStates.set(chatId, { step: 'main_menu' });
      return;
    }
    
    const analysis = pending.analysis;
    const nutrition = analysis.nutrition;
    
    switch (text) {
      case '✅ Да, добавить':
        const calories = nutrition.calories;
        
        user.consumed = (user.consumed || 0) + calories;
        user.foods = user.foods || [];
        user.foods.push({
          name: analysis.foodName,
          calories: calories,
          quantity: 100,
          unit: 'г',
          protein: nutrition.protein || 0,
          fat: nutrition.fat || 0,
          carbs: nutrition.carbs || 0,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          source: '📚 База данных (поиск)',
          addedAt: new Date().toISOString()
        });
        
        userData.set(chatId, user);
        pendingCorrections.delete(chatId);
        
        const remaining = Math.max(0, user.dailyGoal - user.consumed);
        const percent = Math.round((user.consumed / user.dailyGoal) * 100);
        
        let response = `✅ *Добавлено из поиска!*\n\n`;
        response += `🍽️ ${analysis.foodName}\n`;
        response += `📏 100г = ${calories} ккал\n\n`;
        response += `📊 *Итого за день:* ${user.consumed}/${user.dailyGoal} ккал\n`;
        response += `📉 *Осталось:* ${remaining} ккал\n`;
        response += `📈 *Прогресс:* ${percent}%`;
        
        bot.sendMessage(chatId, response, {
          parse_mode: 'Markdown',
          reply_markup: mainKeyboard
        });
        
        userStates.set(chatId, { step: 'main_menu' });
        break;
        
      case '✏️ Указать количество':
        bot.sendMessage(chatId, 
          `✍️ *Укажите количество для ${analysis.foodName}:*\n\n` +
          `Пример: "200г" или просто "200"\n` +
          `По умолчанию: 100г`,
          { parse_mode: 'Markdown' }
        );
        userStates.set(chatId, { step: 'specifying_quantity' });
        break;
        
      case '✏️ Добавить другое блюдо':
        promptManualFoodEntry(chatId, analysis.foodName);
        break;
        
      case '🔍 Новый поиск':
        bot.sendMessage(chatId, 
          '🔍 *Введите название продукта для поиска:*',
          { parse_mode: 'Markdown' }
        );
        userStates.set(chatId, { step: 'searching_food' });
        break;
        
      case '↩️ Отмена':
        bot.sendMessage(chatId, 'Отменено.', {
          reply_markup: mainKeyboard
        });
        userStates.set(chatId, { step: 'main_menu' });
        pendingCorrections.delete(chatId);
        break;
    }
    return;
  }
  
  // ========== УКАЗАНИЕ КОЛИЧЕСТВА ==========
  if (userState.step === 'specifying_quantity') {
    const pending = pendingCorrections.get(chatId);
    
    if (!pending) {
      bot.sendMessage(chatId, 'Время истекло. Попробуйте снова.', {
        reply_markup: mainKeyboard
      });
      userStates.set(chatId, { step: 'main_menu' });
      return;
    }
    
    const analysis = pending.analysis;
    const nutrition = analysis.nutrition;
    
    let quantity = 100;
    const match = text.match(/(\d+)/);
    if (match) {
      quantity = parseInt(match[0]);
    }
    
    if (isNaN(quantity) || quantity <= 0 || quantity > 5000) {
      bot.sendMessage(chatId, '❌ Введите число от 1 до 5000');
      return;
    }
    
    const calories = Math.round((nutrition.calories * quantity) / 100);
    
    user.consumed = (user.consumed || 0) + calories;
    user.foods = user.foods || [];
    user.foods.push({
      name: analysis.foodName,
      calories: calories,
      quantity: quantity,
      unit: 'г',
      protein: Math.round((nutrition.protein * quantity) / 100 * 10) / 10,
      fat: Math.round((nutrition.fat * quantity) / 100 * 10) / 10,
      carbs: Math.round((nutrition.carbs * quantity) / 100 * 10) / 10,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      source: '📚 База данных (поиск)',
      addedAt: new Date().toISOString()
    });
    
    userData.set(chatId, user);
    pendingCorrections.delete(chatId);
    
    const remaining = Math.max(0, user.dailyGoal - user.consumed);
    const percent = Math.round((user.consumed / user.dailyGoal) * 100);
    
    let response = `✅ *Добавлено из поиска!*\n\n`;
    response += `🍽️ ${analysis.foodName}\n`;
    response += `📏 ${quantity}г = ${calories} ккал\n\n`;
    response += `📊 *Итого за день:* ${user.consumed}/${user.dailyGoal} ккал\n`;
    response += `📉 *Осталось:* ${remaining} ккал\n`;
    response += `📈 *Прогресс:* ${percent}%`;
    
    bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard
    });
    
    userStates.set(chatId, { step: 'main_menu' });
    return;
  }
  
  // ========== ИЗМЕНЕНИЕ НОРМЫ ==========
  if (userState.step === 'changing_goal') {
    const goal = parseInt(text);
    
    if (isNaN(goal) || goal < 500 || goal > 10000) {
      bot.sendMessage(chatId, 
        '❌ Введите число от 500 до 10000\n\n' +
        'Пример: 1800',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    user.dailyGoal = goal;
    userData.set(chatId, user);
    
    bot.sendMessage(chatId, 
      `✅ *Норма изменена: ${goal} ккал*\n\n` +
      `Теперь продолжайте отслеживание!`,
      { parse_mode: 'Markdown', reply_markup: mainKeyboard }
    );
    
    userStates.set(chatId, { step: 'main_menu' });
    return;
  }
});

// ========== HTTP СЕРВЕР ДЛЯ RENDER ==========
const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    products: Object.keys(foodDatabase).length,
    users: userData.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Calorie Bot</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          color: white;
        }
        .container {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        h1 {
          color: white;
          text-align: center;
          margin-bottom: 30px;
          font-size: 2.5em;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin: 30px 0;
        }
        .stat-card {
          background: rgba(255, 255, 255, 0.15);
          padding: 20px;
          border-radius: 15px;
          text-align: center;
          transition: transform 0.3s;
        }
        .stat-card:hover {
          transform: translateY(-5px);
        }
        .stat-value {
          font-size: 2em;
          font-weight: bold;
          margin: 10px 0;
        }
        .status {
          padding: 15px;
          border-radius: 10px;
          margin: 20px 0;
          text-align: center;
          background: rgba(255, 255, 255, 0.1);
        }
        .online {
          color: #4ade80;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🍎 Calorie Counter Bot</h1>
        
        <div class="status">
          <h2 class="online">✅ Бот работает</h2>
          <p>Сервис для подсчета калорий в Telegram</p>
        </div>
        
        <div class="stats">
          <div class="stat-card">
            <div>📊 Продуктов в базе</div>
            <div class="stat-value">${Object.keys(foodDatabase).length}</div>
          </div>
          
          <div class="stat-card">
            <div>👥 Пользователей</div>
            <div class="stat-value">${userData.size}</div>
          </div>
          
          <div class="stat-card">
            <div>🚀 Статус</div>
            <div class="stat-value">Online</div>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 40px;">
          <p>Используйте Telegram бота для отслеживания калорий</p>
          <p style="opacity: 0.8; margin-top: 20px;">
            Порт: ${port}<br>
            URL: ${appUrl}
          </p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ========== KEEP ALIVE СИСТЕМА ==========
async function startKeepAlive() {
  try {
    const response = await fetch(`${appUrl}/health`);
    const data = await response.json();
    console.log(`🔄 KeepAlive ping - Users: ${data.users}, Products: ${data.products}`);
  } catch (error) {
    console.log('⚠️ KeepAlive error:', error.message);
  }
}

// Запускаем пингинг каждые 5 минут
if (appUrl && !appUrl.includes('localhost')) {
  setInterval(startKeepAlive, 5 * 60 * 1000);
  console.log(`🌐 KeepAlive system started for: ${appUrl}`);
}

// ========== ЗАПУСК СЕРВЕРА ==========
const server = app.listen(port, () => {
  console.log(`
╔════════════════════════════════════════╗
║     🍎 CALORIE BOT - READY 🍏         ║
╠════════════════════════════════════════╣
║ Продуктов: ${Object.keys(foodDatabase).length.toString().padEnd(30)}║
║ Порт:     ${port.toString().padEnd(31)}║
║ URL:      ${appUrl.padEnd(31).substring(0, 31)}║
║ Поиск:    ✅ Улучшенный               ║
║ Состояния: ✅ Полная система           ║
╚════════════════════════════════════════╝
  `);
});

// Обработка ошибок
server.on('error', (error) => {
  console.error('❌ Server error:', error);
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Обработка необработанных ошибок
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});
});
