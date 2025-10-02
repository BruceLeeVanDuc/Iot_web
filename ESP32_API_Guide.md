# 📡 Hướng dẫn cấu hình ESP32 với API Token

## 🔐 Thông tin API Token
- **Token**: `esp32_secure_token_2024`
- **Server**: `http://localhost:3000` (hoặc IP server của bạn)

## 📋 Code ESP32 cần cập nhật

### 1. Gửi dữ liệu cảm biến (Telemetry)

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Cấu hình WiFi
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Cấu hình API
const char* serverUrl = "http://YOUR_SERVER_IP:3000/api/telemetry";
const char* apiToken = "esp32_secure_token_2024";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void sendTelemetryData(float temp, float humidity, float light) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected!");
    return;
  }
  
  HTTPClient http;
  http.begin(serverUrl);
  
  // Thêm API token vào header
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-token", apiToken);
  
  // Tạo JSON data
  DynamicJsonDocument doc(1024);
  doc["deviceId"] = "ESP32_001";
  doc["timestamp"] = "2024-01-15T10:30:00.000Z";
  
  JsonObject data = doc.createNestedObject("data");
  data["temp"] = temp;
  data["humi"] = humidity;
  data["light"] = light;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Sending data: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("HTTP Response Code: " + String(httpResponseCode));
    Serial.println("Response: " + response);
  } else {
    Serial.println("Error on HTTP request: " + String(httpResponseCode));
  }
  
  http.end();
}

void loop() {
  // Đọc dữ liệu từ cảm biến
  float temperature = 25.5; // Thay bằng code đọc cảm biến thực tế
  float humidity = 60.2;    // Thay bằng code đọc cảm biến thực tế
  float light = 800;        // Thay bằng code đọc cảm biến thực tế
  
  // Gửi dữ liệu
  sendTelemetryData(temperature, humidity, light);
  
  // Chờ 30 giây trước khi gửi lần tiếp theo
  delay(30000);
}
```

### 2. Lấy lệnh điều khiển từ server

```cpp
void getControlCommands() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected!");
    return;
  }
  
  HTTPClient http;
  String url = "http://YOUR_SERVER_IP:3000/api/control/pending?deviceId=ESP32_001";
  http.begin(url);
  
  // Thêm API token
  http.addHeader("x-api-token", apiToken);
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Control commands: " + response);
    
    // Parse JSON response và thực hiện lệnh
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, response);
    
    if (doc.is<JsonArray>()) {
      JsonArray commands = doc.as<JsonArray>();
      for (JsonObject command : commands) {
        String device = command["device"];
        String status = command["status"];
        int commandId = command["id"];
        
        Serial.println("Executing command: " + device + " -> " + status);
        
        // Thực hiện lệnh điều khiển thiết bị
        executeControlCommand(device, status);
        
        // Xác nhận đã thực hiện lệnh
        acknowledgeCommand(commandId);
      }
    }
  } else {
    Serial.println("Error getting commands: " + String(httpResponseCode));
  }
  
  http.end();
}

void executeControlCommand(String device, String status) {
  // Thực hiện lệnh điều khiển
  if (device == "Đèn") {
    if (status == "ON") {
      digitalWrite(LED_PIN, HIGH);
      Serial.println("Đèn đã BẬT");
    } else {
      digitalWrite(LED_PIN, LOW);
      Serial.println("Đèn đã TẮT");
    }
  }
  // Thêm các thiết bị khác...
}

void acknowledgeCommand(int commandId) {
  HTTPClient http;
  String url = "http://YOUR_SERVER_IP:3000/api/control/" + String(commandId) + "/ack";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-token", apiToken);
  
  String jsonString = "{\"status\":\"acknowledged\"}";
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    Serial.println("Command acknowledged: " + String(commandId));
  }
  
  http.end();
}
```

### 3. Code hoàn chỉnh cho ESP32

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Cấu hình
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://YOUR_SERVER_IP:3000";
const char* apiToken = "esp32_secure_token_2024";

// Pin definitions
#define LED_PIN 2
#define FAN_PIN 4
#define AC_PIN 5

void setup() {
  Serial.begin(115200);
  
  // Setup pins
  pinMode(LED_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  pinMode(AC_PIN, OUTPUT);
  
  // Connect WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // Gửi dữ liệu cảm biến mỗi 30 giây
  sendTelemetryData();
  
  // Kiểm tra lệnh điều khiển mỗi 5 giây
  getControlCommands();
  
  delay(5000);
}

void sendTelemetryData() {
  // Đọc dữ liệu cảm biến (thay bằng code thực tế)
  float temp = random(20, 35);    // Giả lập nhiệt độ
  float humidity = random(40, 80); // Giả lập độ ẩm
  float light = random(100, 1000); // Giả lập ánh sáng
  
  HTTPClient http;
  http.begin(serverUrl + "/api/telemetry");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-token", apiToken);
  
  DynamicJsonDocument doc(1024);
  doc["deviceId"] = "ESP32_001";
  doc["timestamp"] = "2024-01-15T10:30:00.000Z";
  
  JsonObject data = doc.createNestedObject("data");
  data["temp"] = temp;
  data["humi"] = humidity;
  data["light"] = light;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    Serial.println("Data sent successfully");
  } else {
    Serial.println("Error sending data: " + String(httpResponseCode));
  }
  
  http.end();
}

void getControlCommands() {
  HTTPClient http;
  String url = serverUrl + "/api/control/pending?deviceId=ESP32_001";
  http.begin(url);
  http.addHeader("x-api-token", apiToken);
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, response);
    
    if (doc.is<JsonArray>()) {
      JsonArray commands = doc.as<JsonArray>();
      for (JsonObject command : commands) {
        String device = command["device"];
        String status = command["status"];
        int commandId = command["id"];
        
        executeControlCommand(device, status);
        acknowledgeCommand(commandId);
      }
    }
  }
  
  http.end();
}

void executeControlCommand(String device, String status) {
  bool isOn = (status == "ON");
  
  if (device == "Đèn") {
    digitalWrite(LED_PIN, isOn);
    Serial.println("Đèn: " + status);
  } else if (device == "Quạt") {
    digitalWrite(FAN_PIN, isOn);
    Serial.println("Quạt: " + status);
  } else if (device == "Điều hòa") {
    digitalWrite(AC_PIN, isOn);
    Serial.println("Điều hòa: " + status);
  }
}

void acknowledgeCommand(int commandId) {
  HTTPClient http;
  String url = serverUrl + "/api/control/" + String(commandId) + "/ack";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-token", apiToken);
  
  String jsonString = "{\"status\":\"acknowledged\"}";
  http.POST(jsonString);
  http.end();
  
  Serial.println("Command " + String(commandId) + " acknowledged");
}
```

## 🔧 Các bước thực hiện:

1. **Thay đổi thông tin kết nối**:
   - `YOUR_WIFI_SSID`: Tên WiFi của bạn
   - `YOUR_WIFI_PASSWORD`: Mật khẩu WiFi
   - `YOUR_SERVER_IP`: IP của máy chạy server (thay `localhost`)

2. **Cài đặt thư viện**:
   - ArduinoJson
   - HTTPClient (có sẵn trong ESP32)

3. **Upload code lên ESP32**

4. **Kiểm tra Serial Monitor** để xem log

## 🧪 Test API với Postman:

1. Mở file `IoT_ESP_Control_API.postman_collection.json` trong Postman
2. Thay đổi biến `api_token` thành `esp32_secure_token_2024`
3. Test các API endpoints

## ⚠️ Lưu ý quan trọng:

- **Bảo mật**: Không chia sẻ API token với người khác
- **Network**: Đảm bảo ESP32 và server cùng mạng
- **Port**: Server phải chạy trên port 3000
- **Firewall**: Tắt firewall hoặc mở port 3000
