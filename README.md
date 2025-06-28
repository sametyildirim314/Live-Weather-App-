# 🌤️ Live-Weather-App

## 📌 Proje Özeti

Bu proje, Türkiye’nin büyük şehirlerinden elde edilen **hava durumu verilerini gerçek zamanlı olarak izleyen ve görselleştiren bir web tabanlı izleme sistemidir.** 

- Backend tarafında Node.js ve Socket.IO kullanılarak canlı veri akışı sağlanır.  
- Frontend tarafı HTML, CSS ve JavaScript ile geliştirilmiş, **dinamik bir dashboard** sunar.  
- MongoDB ile veri kalıcılığı, Azure Event Hub ile **canlı veri entegrasyonu** sağlanmıştır.

---

## 🧪 Kullanılan Teknolojiler

| Katman     | Teknoloji                                  |
|------------|---------------------------------------------|
| Backend    | Node.js (Express.js), Socket.IO             |
| Frontend   | HTML, CSS, JavaScript                       |
| Veritabanı | MongoDB (lokal veya MongoDB Atlas)          |
| Bulut      | Azure Event Hub (canlı veri bağlantısı)     |

---

## 🧱 Mimari ve Sistem Tasarımı

- **Node.js Backend**:
  - Azure Event Hub'dan gelen verileri dinler.
  - MongoDB’ye geçmiş verileri kaydeder.
  - Socket.IO ile canlı verileri frontend’e WebSocket üzerinden iletir.

- **Frontend**:
  - WebSocket ile canlı bağlantı kurar.
  - Şehir bazlı hava durumu bilgilerini kartlar halinde kullanıcıya gösterir.
  - Responsive tasarıma sahiptir.

- **MongoDB**:
  - Geçmiş veri saklama ve sorgulama amaçlı kullanılır.

- **Azure Event Hub**:
  - Gerçek zamanlı veya test modunda hava durumu verisi sağlar.

---

## 🔌 API ve WebSocket Özellikleri

### 📡 WebSocket Event’leri

| Event Adı          | Açıklama                                |
|--------------------|------------------------------------------|
| `weatherUpdate`    | Yeni gelen canlı hava durumu verisi      |
| `latestWeatherData`| Son 10 hava durumu kaydını gönderir      |

### 🌐 REST API Uç Noktaları

```http
GET /api/weather/latest
→ Son hava durumu kayıtlarını döner

GET /api/weather/city/:cityName
→ Belirtilen şehrin hava durumu verilerini döner

GET /api/weather/statistics
→ Genel istatistiksel verileri döner (ortalama sıcaklık vb.)
