// keep-alive.js
const https = require('https');
const http = require('http');
const { URL } = require('url');

class KeepAlive {
  constructor(serverUrl, interval = 5 * 60 * 1000) { // 5 минут по умолчанию
    this.serverUrl = serverUrl;
    this.interval = interval;
    this.timer = null;
    this.isRunning = false;
    this.logEnabled = true;
    
    // Парсим URL
    try {
      this.url = new URL(serverUrl);
    } catch (error) {
      console.error(`❌ Некорректный URL: ${serverUrl}`);
      console.error('Используется локальный сервер http://localhost:3000');
      this.url = new URL('http://localhost:3000');
    }
  }

  log(message) {
    if (this.logEnabled) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${message}`);
    }
  }

  async ping() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.url.hostname,
        port: this.url.port || (this.url.protocol === 'https:' ? 443 : 80),
        path: this.url.pathname || '/',
        method: 'GET',
        timeout: 10000, // 10 секунд таймаут
        headers: {
          'User-Agent': 'KeepAlive-Bot/1.0'
        }
      };

      const protocol = this.url.protocol === 'https:' ? https : http;
      
      const req = protocol.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.log(`✅ PING ${this.serverUrl} - Status: ${res.statusCode}`);
            resolve({
              success: true,
              statusCode: res.statusCode,
              data: data.substring(0, 100) // Первые 100 символов
            });
          } else {
            this.log(`⚠️  PING ${this.serverUrl} - Status: ${res.statusCode}`);
            resolve({
              success: false,
              statusCode: res.statusCode,
              data: data.substring(0, 100)
            });
          }
        });
      });

      req.on('error', (error) => {
        this.log(`❌ PING ${this.serverUrl} - Error: ${error.message}`);
        resolve({
          success: false,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        this.log(`⏰ PING ${this.serverUrl} - Timeout`);
        resolve({
          success: false,
          error: 'Timeout'
        });
      });

      req.end();
    });
  }

  start() {
    if (this.isRunning) {
      this.log('KeepAlive уже запущен');
      return;
    }

    this.isRunning = true;
    this.log(`🚀 Запуск KeepAlive для ${this.serverUrl} (интервал: ${this.interval / 1000} секунд)`);
    
    // Первый пинг сразу
    this.ping();
    
    // Затем по интервалу
    this.timer = setInterval(async () => {
      await this.ping();
    }, this.interval);

    // Также пингуем при запуске и каждую минуту первые 5 минут
    setTimeout(() => this.ping(), 60000);
    setTimeout(() => this.ping(), 120000);
    setTimeout(() => this.ping(), 180000);
    setTimeout(() => this.ping(), 240000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.log('🛑 KeepAlive остановлен');
  }

  setInterval(newInterval) {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }
    
    this.interval = newInterval;
    this.log(`📊 Интервал изменен на ${newInterval / 1000} секунд`);
    
    if (wasRunning) {
      this.start();
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      serverUrl: this.serverUrl,
      interval: this.interval,
      nextPing: this.timer ? 'Активен' : 'Не активен'
    };
  }
}

// Экспорт для использования в основном файле
module.exports = KeepAlive;

// Если файл запускается напрямую
if (require.main === module) {
  // Получаем URL из переменных окружения или используем по умолчанию
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
  const interval = parseInt(process.env.PING_INTERVAL) || 5 * 60 * 1000; // 5 минут
  
  const keepAlive = new KeepAlive(serverUrl, interval);
  
  // Запускаем
  keepAlive.start();
  
  // Обработка сигналов завершения
  process.on('SIGINT', () => {
    console.log('\n🛑 Получен SIGINT (Ctrl+C)');
    keepAlive.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Получен SIGTERM');
    keepAlive.stop();
    process.exit(0);
  });
  
  // Обработка необработанных исключений
  process.on('uncaughtException', (error) => {
    console.error('💥 Необработанное исключение:', error);
    keepAlive.stop();
    process.exit(1);
  });
  
  console.log('🔧 KeepAlive скрипт запущен');
  console.log(`🌐 Сервер: ${serverUrl}`);
  console.log(`⏱️  Интервал: ${interval / 1000} секунд`);
  console.log('Press Ctrl+C to stop');
}
