// WebSocket Server 
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { EventHubConsumerClient } = require('@azure/event-hubs');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

let eventHubConsumer = null;
let connectedClients = 0;
let isMongoConnected = false;
let testDataInterval = null;

// Logger
function logMessage(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

// MongoDB Bağlantısı - Non-blocking
async function connectMongoDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/weather_data';
    
    // Timeout ve retry ayarları ile
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // 5 saniye timeout
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      bufferCommands: false
    });
    
    logMessage('MongoDB bağlantısı başarılı');
    isMongoConnected = true;
    return true;
  } catch (error) {
    logMessage(`MongoDB bağlantı hatası: ${error.message}`, 'ERROR');
    logMessage('MongoDB olmadan devam ediliyor (sadece WebSocket)', 'WARN');
    isMongoConnected = false;
    return false;
  }
}

// MongoDB Şema ve Model
const weatherSchema = new mongoose.Schema({
  cityName: String,
  coordinates: {
    lat: Number,
    lon: Number
  },
  weather: {
    condition: String,
    icon: String
  },
  main: {
    temperature: Number,
    feelsLike: Number,
    humidity: Number,
    pressure: Number
  },
  wind: {
    speed: Number,
    direction: Number
  },
  clouds: Number,
  visibility: Number,
  timestamp: { type: Date, default: Date.now }
});

let WeatherData = null;

// MongoDB model'ini lazy loading ile oluştur
function getWeatherModel() {
  if (!WeatherData && isMongoConnected) {
    WeatherData = mongoose.model('WeatherData', weatherSchema);
  }
  return WeatherData;
}

// Test verileri - Daha gerçekçi veriler
const testWeatherData = [
  {
    cityName: "İstanbul",
    coordinates: { lat: 41.0082, lon: 28.9784 },
    weather: { condition: "Açık", icon: "01d" },
    main: { temperature: 18, feelsLike: 20, humidity: 65, pressure: 1013 },
    wind: { speed: 3.5, direction: 180 },
    clouds: 20,
    visibility: 10000,
    timestamp: new Date()
  },
  {
    cityName: "Ankara",
    coordinates: { lat: 39.9334, lon: 32.8597 },
    weather: { condition: "Parçalı Bulutlu", icon: "02d" },
    main: { temperature: 15, feelsLike: 17, humidity: 55, pressure: 1015 },
    wind: { speed: 2.8, direction: 270 },
    clouds: 40,
    visibility: 8000,
    timestamp: new Date()
  },
  {
    cityName: "İzmir",
    coordinates: { lat: 38.4192, lon: 27.1287 },
    weather: { condition: "Güneşli", icon: "01d" },
    main: { temperature: 22, feelsLike: 24, humidity: 70, pressure: 1012 },
    wind: { speed: 4.2, direction: 225 },
    clouds: 10,
    visibility: 12000,
    timestamp: new Date()
  },
  {
    cityName: "Bursa",
    coordinates: { lat: 40.1826, lon: 29.0669 },
    weather: { condition: "Hafif Bulutlu", icon: "02d" },
    main: { temperature: 16, feelsLike: 18, humidity: 60, pressure: 1014 },
    wind: { speed: 3.1, direction: 135 },
    clouds: 25,
    visibility: 9000,
    timestamp: new Date()
  },
  {
    cityName: "Antalya",
    coordinates: { lat: 36.8841, lon: 30.7056 },
    weather: { condition: "Sıcak", icon: "01d" },
    main: { temperature: 25, feelsLike: 27, humidity: 45, pressure: 1010 },
    wind: { speed: 2.5, direction: 90 },
    clouds: 15,
    visibility: 15000,
    timestamp: new Date()
  }
];

// Test verilerini gönderme - Optimize edilmiş versiyon
function startTestDataSender() {
  logMessage('Test veri gönderimi başlatılıyor...');
  
  // Önceki interval'ı temizle
  if (testDataInterval) {
    clearInterval(testDataInterval);
  }
  
  // İlk veriyi hemen gönder
  sendTestData();
  
  // Ardından düzenli olarak gönder
  testDataInterval = setInterval(() => {
    if (connectedClients > 0) {
      sendTestData();
    }
  }, 3000); // Her 3 saniyede bir (daha hızlı)
}

function sendTestData() {
  // Rastgele bir şehir seç ve verilerini güncelle
  const randomCity = testWeatherData[Math.floor(Math.random() * testWeatherData.length)];
  
  // Sıcaklığı biraz değiştir
  const tempVariation = (Math.random() - 0.5) * 4; // -2 ile +2 arasında
  const humidityVariation = (Math.random() - 0.5) * 10; // Nem değişimi
  
  const updatedData = {
    ...randomCity,
    main: {
      ...randomCity.main,
      temperature: Math.round((randomCity.main.temperature + tempVariation) * 10) / 10,
      feelsLike: Math.round((randomCity.main.feelsLike + tempVariation) * 10) / 10,
      humidity: Math.max(0, Math.min(100, randomCity.main.humidity + humidityVariation))
    },
    timestamp: new Date(),
    isTestData: true // Test verisi olduğunu belirt
  };

  // MongoDB'ye kaydet (eğer bağlıysa) - Non-blocking
  if (isMongoConnected && getWeatherModel()) {
    const weatherRecord = new (getWeatherModel())(updatedData);
    weatherRecord.save().catch(err => 
      logMessage(`MongoDB kayıt hatası: ${err.message}`, 'ERROR')
    );
  }

  // WebSocket ile gönder
  io.emit('weatherUpdate', updatedData);
  logMessage(`Test verisi gönderildi: ${updatedData.cityName} - ${updatedData.main.temperature}°C`);
}

// Event Hub Consumer'ı başlatma - Non-blocking
async function startEventHubConsumer() {
  // Event Hub yapılandırması kontrolü
  if (!process.env.AZURE_EVENT_HUB_CONNECTION_STRING || !process.env.AZURE_EVENT_HUB_NAME) {
    logMessage('Azure Event Hub yapılandırması bulunamadı, test verileri kullanılacak', 'WARN');
    setTimeout(startTestDataSender, 1000); // 1 saniye sonra başlat
    return;
  }

  try {
    eventHubConsumer = new EventHubConsumerClient(
      '$Default',
      process.env.AZURE_EVENT_HUB_CONNECTION_STRING,
      process.env.AZURE_EVENT_HUB_NAME
    );

    logMessage('Event Hub Consumer başlatılıyor...');

    // Event Hub timeout ekle
    const subscriptionTimeout = setTimeout(() => {
      logMessage('Event Hub bağlantı timeout, test verilerine geçiliyor', 'WARN');
      startTestDataSender();
    }, 10000); // 10 saniye timeout

    eventHubConsumer.subscribe({
      processEvents: async (events, context) => {
        clearTimeout(subscriptionTimeout); // Başarılı bağlantıda timeout'u iptal et
        
        for (const event of events) {
          try {
            const weatherData = event.body;
            logMessage(`Event Hub'dan veri: ${weatherData.cityName}`);

            // MongoDB'ye kaydet (eğer bağlıysa)
            if (isMongoConnected && getWeatherModel()) {
              const weatherRecord = new (getWeatherModel())(weatherData);
              await weatherRecord.save();
            }

            // WebSocket ile gönder
            io.emit('weatherUpdate', {
              ...weatherData,
              receivedAt: new Date().toISOString(),
              isTestData: false
            });

          } catch (error) {
            logMessage(`Event Hub veri işleme hatası: ${error.message}`, 'ERROR');
          }
        }
      },
      processError: async (error, context) => {
        clearTimeout(subscriptionTimeout);
        logMessage(`Event Hub hatası: ${error.message}`, 'ERROR');
        logMessage('Test verilerine geçiliyor...', 'WARN');
        startTestDataSender();
      }
    });

    logMessage('Event Hub Consumer başarıyla başlatıldı');
  } catch (error) {
    logMessage(`Event Hub Consumer hatası: ${error.message}`, 'ERROR');
    logMessage('Test verilerine geçiliyor...', 'WARN');
    setTimeout(startTestDataSender, 1000);
  }
}

// WebSocket bağlantı yönetimi
io.on('connection', (socket) => {
  connectedClients++;
  logMessage(`Yeni WebSocket bağlantısı. Toplam: ${connectedClients}`);

  socket.emit('connected', {
    message: 'Gerçek zamanlı hava durumu verilerine bağlandınız',
    clientId: socket.id,
    timestamp: new Date().toISOString()
  });

  // Bağlantı sayısını tüm clientlara gönder
  io.emit('clientCount', connectedClients);

  // İlk bağlantıda test verisi göndermeyi başlat
  if (connectedClients === 1 && !testDataInterval && !eventHubConsumer) {
    startTestDataSender();
  }

  // Son verileri gönder
  socket.on('requestLatestData', async () => {
    try {
      let latestData = [];
      
      if (isMongoConnected && getWeatherModel()) {
        latestData = await getWeatherModel().find()
          .sort({ timestamp: -1 })
          .limit(10)
          .lean(); // Performance için lean() kullan
      } else {
        // MongoDB yoksa test verilerini gönder
        latestData = testWeatherData.map(data => ({
          ...data,
          timestamp: new Date(),
          isTestData: true
        }));
      }
      
      socket.emit('latestWeatherData', latestData);
      logMessage('Son veriler gönderildi');
    } catch (error) {
      logMessage(`Son veriler gönderilirken hata: ${error.message}`, 'ERROR');
      socket.emit('latestWeatherData', testWeatherData);
    }
  });

  // Şehir verisi iste
  socket.on('requestCityData', async (cityName) => {
    try {
      let cityData = [];
      
      if (isMongoConnected && getWeatherModel()) {
        cityData = await getWeatherModel().find({ cityName })
          .sort({ timestamp: -1 })
          .limit(10)
          .lean();
      } else {
        // Test verilerinden ilgili şehri bul
        const cityInfo = testWeatherData.find(data => data.cityName === cityName);
        if (cityInfo) {
          cityData = [{...cityInfo, timestamp: new Date(), isTestData: true}];
        }
      }
      
      socket.emit('cityWeatherData', { city: cityName, data: cityData });
    } catch (error) {
      logMessage(`${cityName} verileri gönderilirken hata: ${error.message}`, 'ERROR');
      socket.emit('error', { message: `${cityName} verileri alınamadı` });
    }
  });

  socket.on('disconnect', () => {
    connectedClients--;
    logMessage(`WebSocket bağlantısı kesildi. Toplam: ${connectedClients}`);
    io.emit('clientCount', connectedClients);
    
    // Hiç client kalmadıysa test verisi göndermeyi durdur
    if (connectedClients === 0 && testDataInterval) {
      clearInterval(testDataInterval);
      testDataInterval = null;
      logMessage('Test veri gönderimi durduruldu (client kalmadı)');
    }
  });
});

// REST API Endpoints
app.get('/api/weather/latest', async (req, res) => {
  try {
    let latestData = [];
    
    if (isMongoConnected && getWeatherModel()) {
      latestData = await getWeatherModel().find()
        .sort({ timestamp: -1 })
        .limit(10)
        .lean();
    } else {
      latestData = testWeatherData.map(data => ({
        ...data,
        timestamp: new Date(),
        isTestData: true
      }));
    }
    
    res.json(latestData);
  } catch (error) {
    logMessage(`API /latest hatası: ${error.message}`, 'ERROR');
    res.status(500).json({ error: 'Veriler alınamadı' });
  }
});

app.get('/api/weather/city/:cityName', async (req, res) => {
  try {
    const { cityName } = req.params;
    let cityData = [];
    
    if (isMongoConnected && getWeatherModel()) {
      cityData = await getWeatherModel().find({ cityName })
        .sort({ timestamp: -1 })
        .limit(20)
        .lean();
    } else {
      const cityInfo = testWeatherData.find(data => data.cityName === cityName);
      if (cityInfo) {
        cityData = [{...cityInfo, timestamp: new Date(), isTestData: true}];
      }
    }
    
    res.json(cityData);
  } catch (error) {
    logMessage(`API /city/${req.params.cityName} hatası: ${error.message}`, 'ERROR');
    res.status(500).json({ error: 'Şehir verileri alınamadı' });
  }
});

app.get('/api/weather/statistics', async (req, res) => {
  try {
    let stats = [];
    
    if (isMongoConnected && getWeatherModel()) {
      stats = await getWeatherModel().aggregate([
        {
          $group: {
            _id: '$cityName',
            avgTemp: { $avg: '$main.temperature' },
            maxTemp: { $max: '$main.temperature' },
            minTemp: { $min: '$main.temperature' },
            avgHumidity: { $avg: '$main.humidity' },
            count: { $sum: 1 }
          }
        }
      ]);
    } else {
      // Test verileri için basit istatistikler
      stats = testWeatherData.map(data => ({
        _id: data.cityName,
        avgTemp: data.main.temperature,
        maxTemp: data.main.temperature,
        minTemp: data.main.temperature,
        avgHumidity: data.main.humidity,
        count: 1
      }));
    }
    
    res.json(stats);
  } catch (error) {
    logMessage(`API /statistics hatası: ${error.message}`, 'ERROR');
    res.status(500).json({ error: 'İstatistikler alınamadı' });
  }
});

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Server durumu
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    connectedClients,
    timestamp: new Date().toISOString(),
    eventHubStatus: eventHubConsumer ? 'Connected' : 'Test Mode',
    mongoStatus: isMongoConnected ? 'Connected' : 'Disconnected',
    testDataActive: testDataInterval !== null
  });
});

// Server başlatma - Optimize edilmiş
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // HTTP server'ı önce başlat
    server.listen(PORT, () => {
      logMessage(`Server http://localhost:${PORT} adresinde çalışıyor`);
    });

    // MongoDB bağlantısını arka planda dene (non-blocking)
    connectMongoDB().then(() => {
      logMessage(`MongoDB: ${isMongoConnected ? 'Bağlı' : 'Bağlı değil'}`);
    });

    // Event Hub Consumer'ı arka planda başlat (non-blocking)
    setTimeout(() => {
      startEventHubConsumer().then(() => {
        logMessage(`Event Hub: ${eventHubConsumer ? 'Bağlı' : 'Test modu'}`);
      });
    }, 2000); // 2 saniye sonra başlat

    logMessage('Server başarıyla başlatıldı');
  } catch (error) {
    logMessage(`Server başlatılamadı: ${error.message}`, 'ERROR');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logMessage('Server kapatılıyor...');
  
  if (testDataInterval) {
    clearInterval(testDataInterval);
  }
  
  if (eventHubConsumer) {
    await eventHubConsumer.close();
  }
  
  if (isMongoConnected) {
    await mongoose.connection.close();
  }
  
  process.exit(0);
});

startServer();