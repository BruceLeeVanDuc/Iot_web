# 🚀 Hướng dẫn cấu hình MQTT cho ESP32

## 📋 Tóm tắt kiến trúc

```
ESP32 ←→ MQTT Broker ←→ Node.js Server ←→ Web Dashboard
```

## 🔧 Cài đặt MQTT Broker

### **Cách 1: Sử dụng Mosquitto (Khuyến nghị)**

**Windows:**
```bash
# Tải và cài đặt Mosquitto
# https://mosquitto.org/download/

# Hoặc dùng Chocolatey
choco install mosquitto

# Khởi động service
net start mosquitto
```

**Linux/Ubuntu:**
```bash
sudo apt update
sudo apt install mosquitto mosquitto-clients

# Khởi động service
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

### **Cách 2: Sử dụng Docker**
```bash
# Chạy MQTT broker với Docker
docker run -it -p 1883:1883 -p 9001:9001 eclipse-mosquitto
```

## 📡 Code ESP32 với MQTT

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// Cấu hình WiFi
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Cấu hình MQTT
const char* mqtt_server = "YOUR_MQTT_BROKER_IP";  // IP của máy chạy MQTT broker
const int mqtt_port = 1883;

// Topics
const char* sensor_topic = "dataSensor";
const char* control_topics[] = {
  "control/led1",  // Đèn
  "control/led2",  // Quạt
  "control/led3"   // Điều hòa
};

WiFiClient espClient;
PubSubClient client(espClient);

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
  
  // Setup MQTT
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);
  
  // Connect to MQTT
  connectToMQTT();
}

void loop() {
  if (!client.connected()) {
    connectToMQTT();
  }
  client.loop();
  
  // Gửi dữ liệu cảm biến mỗi 30 giây
  static unsigned long lastSensorData = 0;
  if (millis() - lastSensorData > 30000) {
    sendSensorData();
    lastSensorData = millis();
  }
}

void connectToMQTT() {
  while (!client.connected()) {
    Serial.print("Connecting to MQTT...");
    
    // Tạo unique client ID
    String clientId = "ESP32Client-" + String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str())) {
      Serial.println(" connected!");
      
      // Subscribe to control topics
      for (int i = 0; i < 3; i++) {
        client.subscribe(control_topics[i]);
        Serial.println("Subscribed to: " + String(control_topics[i]));
      }
      
    } else {
      Serial.print(" failed, rc=");
      Serial.print(client.state());
      Serial.println(" retrying in 5 seconds");
      delay(5000);
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message received [");
  Serial.print(topic);
  Serial.print("]: ");
  
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);
  
  // Xử lý lệnh điều khiển
  if (String(topic) == "control/led1") {
    controlDevice(LED_PIN, message);
    Serial.println("Đèn: " + message);
  } else if (String(topic) == "control/led2") {
    controlDevice(FAN_PIN, message);
    Serial.println("Quạt: " + message);
  } else if (String(topic) == "control/led3") {
    controlDevice(AC_PIN, message);
    Serial.println("Điều hòa: " + message);
  }
}

void controlDevice(int pin, String command) {
  if (command == "ON") {
    digitalWrite(pin, HIGH);
  } else if (command == "OFF") {
    digitalWrite(pin, LOW);
  }
}

void sendSensorData() {
  // Đọc dữ liệu cảm biến (thay bằng code thực tế)
  float temp = random(20, 35);    // Giả lập nhiệt độ
  float humidity = random(40, 80); // Giả lập độ ẩm
  float light = random(100, 1000); // Giả lập ánh sáng
  
  // Tạo JSON data
  DynamicJsonDocument doc(1024);
  doc["deviceId"] = "esp32-001";
  doc["temp"] = temp;
  doc["humi"] = humidity;
  doc["light"] = light;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Publish to MQTT
  if (client.publish(sensor_topic, jsonString.c_str())) {
    Serial.println("Sensor data sent: " + jsonString);
  } else {
    Serial.println("Failed to send sensor data");
  }
}
```

## 🔧 Cấu hình Server

### **1. Tạo file .env:**
```bash
# MQTT Configuration
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_USER=
MQTT_PASSWORD=

# API Token (cho Web Dashboard)
API_TOKEN=esp32_secure_token_2024

# Database (nếu cần)
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=iot_dashboard
```

### **2. Cài đặt MQTT client library:**
```bash
npm install mqtt
```

## 🧪 Test MQTT

### **Test bằng mosquitto client:**
```bash
# Subscribe to sensor data
mosquitto_sub -h localhost -t "dataSensor"

# Publish control command
mosquitto_pub -h localhost -t "control/led1" -m "ON"
mosquitto_pub -h localhost -t "control/led2" -m "OFF"
```

### **Test bằng MQTT Explorer:**
1. Tải MQTT Explorer: https://mqtt-explorer.com/
2. Kết nối đến `localhost:1883`
3. Subscribe topics: `dataSensor`, `control/led1`, `control/led2`, `control/led3`

## 📋 Checklist hoạt động:

- [ ] MQTT Broker đang chạy (port 1883)
- [ ] Node.js server kết nối được MQTT broker
- [ ] ESP32 kết nối được WiFi
- [ ] ESP32 kết nối được MQTT broker
- [ ] ESP32 subscribe được control topics
- [ ] ESP32 publish được sensor data
- [ ] Web dashboard điều khiển được thiết bị

## 🔍 Troubleshooting:

### **Lỗi kết nối MQTT:**
```bash
# Kiểm tra MQTT broker có chạy không
netstat -an | findstr :1883

# Kiểm tra firewall
# Mở port 1883 trong Windows Firewall
```

### **Lỗi ESP32 không kết nối:**
- Kiểm tra WiFi credentials
- Kiểm tra IP MQTT broker
- Kiểm tra ESP32 và MQTT broker cùng mạng

### **Lỗi không nhận được lệnh:**
- Kiểm tra ESP32 subscribe đúng topics
- Kiểm tra server publish đúng topics
- Kiểm tra QoS và retain settings
