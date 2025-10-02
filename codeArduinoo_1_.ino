#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// =====================
// Config WiFi + MQTT
// =====================
#define WIFI_SSID "BruceLeeDuc"
#define WIFI_PASSWORD "66662222"
#define MQTT_SERVER "172.20.10.3"
#define MQTT_PORT 1883
#define MQTT_USER "levanduc"
#define MQTT_PASSWORD "0602"
#define TOPIC_SENSOR "dataSensor"

// =====================
// Cấu hình chân
// =====================
#define DHTPIN 25
#define DHTTYPE DHT11
#define LED1 19
#define LED2 16
#define LED3 5
#define LIGHT_SENSOR_PIN 36

DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastRead = 0;

// Trạng thái LED (lưu để khôi phục sau khi reconnect)
String led1State = "OFF";
String led2State = "OFF";
String led3State = "OFF";

// =====================
// Kết nối WiFi
// =====================
void setup_wifi() {
  Serial.print("Đang kết nối WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi đã kết nối, IP: ");
  Serial.println(WiFi.localIP());
}

// =====================
// Hàm điều khiển LED
// =====================
void setLED(int pin, String state, String topic) {
  digitalWrite(pin, state == "ON" ? HIGH : LOW);
  client.publish(topic.c_str(), state.c_str(), true); // retain = true
}

// =====================
// Callback MQTT
// =====================
void callback(char* topic, byte* message, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)message[i];
  msg.trim();

  Serial.printf("Nhận lệnh [%s]: %s\n", topic, msg.c_str());

  if (String(topic) == "control/led1") {
    led1State = msg;
    setLED(LED1, led1State, "device/led1/state");
  } else if (String(topic) == "control/led2") {
    led2State = msg;
    setLED(LED2, led2State, "device/led2/state");
  } else if (String(topic) == "control/led3") {
    led3State = msg;
    setLED(LED3, led3State, "device/led3/state");
  }
}

// =====================
// Kết nối lại MQTT
// =====================
void reconnect() {
  while (!client.connected()) {
    Serial.print("Kết nối MQTT...");
    if (client.connect("ESP32Client", MQTT_USER, MQTT_PASSWORD)) {
      Serial.println(" Thành công");
      client.subscribe("control/led1");
      client.subscribe("control/led2");
      client.subscribe("control/led3");

      // 🔄 Khôi phục trạng thái LED sau khi reconnect
      setLED(LED1, led1State, "device/led1/state");
      setLED(LED2, led2State, "device/led2/state");
      setLED(LED3, led3State, "device/led3/state");

    } else {
      Serial.print(" Lỗi, rc=");
      Serial.print(client.state());
      Serial.println(" -> Thử lại sau 5 giây");

      // ⚡ Tắt LED khi mất kết nối
      digitalWrite(LED1, LOW);
      digitalWrite(LED2, LOW);
      digitalWrite(LED3, LOW);

      delay(5000);
    }
  }
}

// =====================
// Setup
// =====================
void setup() {
  Serial.begin(115200);
  dht.begin();

  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
  pinMode(LED3, OUTPUT);

  setup_wifi();
  client.setServer(MQTT_SERVER, MQTT_PORT);
  client.setCallback(callback);

  analogSetAttenuation(ADC_11db);
}

// =====================
// Loop
// =====================
void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastRead >= 3000) {
    lastRead = now;
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    int lightValue = analogRead(LIGHT_SENSOR_PIN);

    if (isnan(h) || isnan(t)) {
      Serial.println("Lỗi đọc DHT11!");
      return;
    }

    Serial.printf("Nhiệt độ: %.1f °C, Độ ẩm: %.1f %%, Ánh sáng: %d\n", t, h, lightValue);

    char payload[128];
    snprintf(payload, sizeof(payload), "{\"temp\":%.1f,\"humi\":%.1f,\"light\":%d}", t, h, lightValue);
    client.publish(TOPIC_SENSOR, payload);
  }
}
