# 🔧 Documentación Técnica Detallada

## 🏗️ Arquitectura del Sistema

### Stack Tecnológico
```
Frontend: WhatsApp Business API
Backend: FastAPI + SQLAlchemy  
Base de Datos: SQLite
IA: OpenAI GPT-4o
Seguridad: Custom middleware
Scheduler: APScheduler
```

### Flujo de Procesamiento
```
WhatsApp → Webhook → Validación → IA (GPT) → Base de Datos → WodBuster API → Respuesta
```

## 📊 Modelos de Base de Datos

### Gym (Gimnasios)
```python
class Gym(Base):
    id = Column(String, primary_key=True)
    nombre = Column(String, nullable=False)
    telefono = Column(String, nullable=False)
    clave_api = Column(String(255))  # WodBuster API Key
    
    # WhatsApp Business Credentials
    whatsapp_access_token = Column(String(512))
    whatsapp_phone_number_id = Column(String(100))
    whatsapp_business_account_id = Column(String(100))
    whatsapp_webhook_verify_token = Column(String(255))
```

### TrialReservation (Reservas de Prueba)
```python
class TrialReservation(Base):
    id = Column(Integer, primary_key=True)
    gym_id = Column(String, ForeignKey("gyms.id"))
    nombre = Column(String, nullable=False)
    email = Column(String, nullable=False)
    telefono = Column(String, nullable=False)
    fecha_clase = Column(DateTime)
    estado = Column(String, default="pendiente")
    wodbuster_client_id = Column(String)
    wodbuster_schedule_event_id = Column(String)
```

### ReservaPendiente (Pre-reservas)
```python
class ReservaPendiente(Base):
    id = Column(Integer, primary_key=True)
    nombre = Column(String, nullable=False)
    email = Column(String, nullable=False)
    telefono = Column(String, nullable=False)
    dia_semana = Column(Integer)  # 1=Lunes, 7=Domingo
    hora = Column(String(5))      # HH:MM
    fecha_objetivo = Column(String(10))  # YYYY-MM-DD
    semana_objetivo = Column(String(10)) # Lunes de esa semana
    gym_id = Column(String)
    estado = Column(SQLEnum(EstadoReservaPendiente), default=EstadoReservaPendiente.PENDIENTE)
```

## 🤖 Sistema de Inteligencia Artificial

### DetecciónIntents Híbrida

#### 1. Detección por Keywords (Rápida)
```python
KEYWORDS_MAP = {
    IntentType.CLASE_PRUEBA: ["clase", "prueba", "reservar", "apuntar"],
    IntentType.VER_HORARIOS: ["horario", "horas", "cuando", "disponible"],
    IntentType.CANCELAR: ["cancelar", "anular", "eliminar"],
    IntentType.INFO_TARIFAS: ["precio", "cuesta", "tarifa", "pagar"]
}
```

#### 2. GPT Fallback (Contexto Complejo)
```python
def _detect_with_gpt(self, message: str, context: ConversationContext) -> IntentResult:
    prompt = f"""
    Eres un detector de intenciones para un chatbot de gimnasio.
    
    Mensaje: "{message}"
    Contexto previo: {context.last_intent}
    
    Responde SOLO con una de estas opciones:
    - clase_prueba
    - cancelar  
    - ver_horarios
    - info_tarifas
    - info_gimnasio
    - apuntarse
    - small_talk
    """
```

### Extracción de Entidades

#### Fechas
```python
def extraer_fecha(mensaje: str) -> Optional[datetime]:
    """
    Convierte texto a fecha:
    - "lunes" → próximo lunes
    - "31/07" → 2024-07-31
    - "mañana" → fecha + 1 día
    """
```

#### Horas
```python
def extraer_hora(mensaje: str) -> Optional[str]:
    """
    Convierte texto a HH:MM:
    - "a las 8" → "08:00"
    - "por la tarde" → "18:00"
    - "16:00" → "16:00"
    """
```

#### Emails
```python
def extraer_email(mensaje: str) -> Optional[str]:
    """
    Busca y valida emails con regex RFC-compliant
    """
    pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
```

## 🔗 Integraciones de APIs

### WhatsApp Business API

#### Envío de Mensajes
```python
def send_message(to_phone: str, message: str, gym_phone: str) -> dict:
    config = get_gym_whatsapp_config(gym_phone)
    url = f"https://graph.facebook.com/v18.0/{config['phone_number_id']}/messages"
    
    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone_number(to_phone),
        "type": "text",
        "text": {"body": message}
    }
    
    headers = {
        "Authorization": f"Bearer {config['access_token']}",
        "Content-Type": "application/json"
    }
    
    response = requests.post(url, json=payload, headers=headers)
    return handle_whatsapp_response(response)
```

#### Procesamiento de Webhooks
```python
def process_incoming_message(webhook_data: dict) -> List[dict]:
    """
    Procesa webhook de WhatsApp y extrae mensajes:
    - Valida estructura del webhook
    - Extrae datos del remitente
    - Filtra solo mensajes de texto
    - Determina gimnasio por número receptor
    """
```

### WodBuster API

#### Consultar Horarios
```python
def consultar_horarios(api_key: str) -> dict:
    url = "https://my.wodbuster.com/api/booking/schedule"
    headers = {"API_ACCESS_KEY": api_key}
    response = requests.get(url, headers=headers)
    return response.json()
```

#### Crear Reserva
```python
def reservar_en_wodbuster(api_key: str, event_id: int, email: str, nombre: str) -> dict:
    url = "https://my.wodbuster.com/api/booking/book"
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "API_ACCESS_KEY": api_key
    }
    
    payload = {
        "id": str(event_id),
        "email": email,
        "name": nombre
    }
    
    response = requests.post(url, data=payload, headers=headers)
    return response.json()
```

#### Verificar Reserva
```python
def verificar_reserva_wodbuster(api_key: str, schedule_event_id: int, client_id: str) -> bool:
    """
    Verifica que una reserva existe en WodBuster.
    Esencial para prevenir reservas fantasma.
    """
    url = "https://my.wodbuster.com/api/booking/validate"
    payload = {
        "id": str(schedule_event_id),
        "clientId": client_id
    }
    
    response = requests.post(url, data=payload, headers=headers)
    result = response.json()
    return result.get("errorCode") is None
```

## 🔒 Sistema de Seguridad

### Rate Limiting
```python
class RateLimiter:
    def __init__(self):
        self.limits = {
            "webhook": {"count": 10, "window": 60},     # 10 req/min
            "formulario": {"count": 5, "window": 300},  # 5 req/5min
            "panel": {"count": 20, "window": 60}        # 20 req/min
        }
    
    def is_allowed(self, request: Request, endpoint: str) -> Tuple[bool, str]:
        client_ip = request.headers.get("X-Forwarded-For", request.client.host)
        # Implementa sliding window con deque
```

### Validación de Inputs
```python
class SecurityValidator:
    def validate_input(self, input_data: str, field_name: str, max_length: int):
        # 1. Sanitización XSS
        clean_data = bleach.clean(input_data, tags=[], attributes={})
        
        # 2. Validación de longitud
        if len(clean_data) > max_length:
            return False, "", f"Campo {field_name} demasiado largo"
        
        # 3. Patrones sospechosos
        suspicious_patterns = [
            r"<script.*?>", r"javascript:", r"data:text/html",
            r"SELECT.*FROM", r"UNION.*SELECT", r"DROP.*TABLE"
        ]
        
        for pattern in suspicious_patterns:
            if re.search(pattern, clean_data, re.IGNORECASE):
                return False, "", "Contenido no permitido detectado"
        
        return True, clean_data, None
```

### Sistema de Logs
```python
class SecurityLogger:
    def log_webhook_event(self, success: bool, payload_size: int, ip: str, errors: List[str] = None):
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "event_type": "webhook_request",
            "success": success,
            "ip": ip,
            "payload_size": payload_size,
            "errors": errors or []
        }
        self._write_to_log(log_entry, "webhook_security.log")
```

## 📅 Sistema de Reservas Pendientes

### Flujo Completo

#### 1. Detección de Semana Siguiente
```python
def es_semana_siguiente(fecha_objetivo: date) -> bool:
    hoy = datetime.now().date()
    lunes_actual = hoy - timedelta(days=hoy.weekday())
    domingo_actual = lunes_actual + timedelta(days=6)
    return fecha_objetivo > domingo_actual
```

#### 2. Validación contra Plantillas
```python
def validar_horario_para_semana_siguiente(dia_semana: int, hora: str, gym_id: str) -> bool:
    """
    Verifica si existe una plantilla de horario para esa combinación día+hora
    en la tabla horarios_semana_siguiente
    """
    db = SessionLocal()
    plantilla = db.query(HorarioSemanaSiguiente).filter(
        HorarioSemanaSiguiente.dia_semana == dia_semana,
        HorarioSemanaSiguiente.hora_inicio == hora,
        HorarioSemanaSiguiente.gym_id == gym_id
    ).first()
    db.close()
    return plantilla is not None
```

#### 3. Procesador Automático
```python
def procesar_reservas_pendientes():
    """
    Ejecuta cada 30 minutos via APScheduler:
    1. Obtiene reservas pendientes
    2. Verifica si horarios ya disponibles en WodBuster
    3. Convierte a reservas reales
    4. Envía notificaciones de confirmación/error
    """
    reservas = obtener_reservas_pendientes_procesables()
    
    for reserva in reservas:
        if horario_disponible_en_wodbuster(reserva):
            resultado = procesar_reserva_pendiente(reserva)
            if resultado["success"]:
                enviar_notificacion_confirmacion(reserva)
            else:
                manejar_error_procesamiento(reserva, resultado["error"])
```

## 🔄 Sistema de Notificaciones

### Programador de Tareas
```python
def iniciar_tareas_programadas():
    scheduler = BackgroundScheduler()
    
    # Notificaciones cada minuto
    scheduler.add_job(
        func=procesar_notificaciones_pendientes,
        trigger="interval",
        minutes=1,
        id="procesar_notificaciones"
    )
    
    # Reservas pendientes cada 30 minutos  
    scheduler.add_job(
        func=procesar_reservas_pendientes,
        trigger="interval",
        minutes=30,
        id="reservas_pendientes"
    )
    
    # Actualizar horarios lunes a las 8:00
    scheduler.add_job(
        func=actualizar_horarios_gimnasios,
        trigger="cron",
        day_of_week="mon",
        hour=8,
        minute=0,
        id="actualizar_horarios"
    )
    
    scheduler.start()
```

### Tipos de Notificaciones
```python
class NotificationType:
    CONFIRMATION_IMMEDIATE = "confirmation_immediate"
    REMINDER_1D = "reminder_1d"  # 24 horas antes
    REMINDER_1H = "reminder_1h"  # 1 hora antes
    
def crear_notificaciones_reserva(reserva: TrialReservation):
    """
    Crea automáticamente todas las notificaciones para una reserva:
    - Confirmación inmediata
    - Recordatorio 1 día antes  
    - Recordatorio 1 hora antes
    """
```

## 🏢 Configuración Multi-Tenant

### Configuración por Gimnasio
```python
# config/gym_config.py
GYMNASIOS = {
    "600123456": {
        "name": "CrossFit Madrid",
        "industry": IndustryType.CROSSFIT,
        "personality": BotPersonality.ENERGETIC,
        "welcome_message": "¡Hola guerrero! 💪 ¿Listo para machacarte?",
        "success_booking_messages": [
            "¡Brutal! Te espero el {fecha} a las {hora} 🔥",
            "¡Listo campeón! El {fecha} a las {hora} va a estar épico 💥"
        ],
        "pricing_info": {
            "clase_prueba": "🆓 Clase de prueba GRATUITA",
            "primer_mes": "🎯 Primer mes: 90€ total",
            "ilimitada": "⭐ ILIMITADA: 89€/mes"
        },
        "contact_info": {
            "horarios": "Lunes a Viernes: 06:00 - 22:00",
            "ubicacion": "Calle Gran Vía 123, Madrid",
            "contacto": "WhatsApp: +34 600 123 456"
        }
    }
}
```

### Sistema de Personalidad
```python
class PersonalityEngine:
    def generate_response(self, intent: IntentType, context: dict, success_data: dict = None) -> str:
        config = gym_config_manager.load_gym_config(context.get('gym_id'))
        
        if intent == IntentType.CLASE_PRUEBA and success_data:
            messages = config.success_booking_messages
            template = random.choice(messages)
            return template.format(
                fecha=success_data['fecha'],
                hora=success_data['hora']
            )
```

## 🛠️ Desarrollo y Testing

### Testing del Chatbot
```python
def test_chatbot_message(message: str, gym_phone: str = "600123456") -> str:
    """Función de testing rápido"""
    return procesar_mensaje(
        mensaje_usuario=message,
        name="Test User",
        phone_number="+34600000000",
        gym_phone=gym_phone
    )

# Ejemplos de testing
test_chatbot_message("Hola, quiero una clase de prueba")
test_chatbot_message("¿Qué horarios tenéis?") 
test_chatbot_message("Cancelar mi reserva")
```

### Debug de APIs
```python
# Test WodBuster API
from utils.api_wodbuster import consultar_horarios
result = consultar_horarios("tu_api_key")
print(f"Horarios: {len(result.get('data', []))}")

# Test WhatsApp
from services.whatsapp_service import whatsapp_service
result = whatsapp_service.send_message("+34600000000", "Test", "600123456")
print(f"WhatsApp enviado: {result['success']}")
```

## 📝 **Mantenimiento de Documentación**

### **Política de Sincronización Código-Documentación**
⚠️ **IMPORTANTE**: Cada cambio en el código debe reflejarse inmediatamente en la documentación correspondiente.

**Workflow recomendado:**
1. **Hacer cambio en código** (nueva funcionalidad, bug fix, etc.)
2. **Actualizar documentación** inmediatamente:
   - `README.md` - Si afecta funcionalidad principal
   - `TECHNICAL_DOCS.md` - Si es cambio técnico/arquitectural  
   - `WHATSAPP_SETUP.md` - Si afecta integración WhatsApp
   - `QUICK_START.md` - Si afecta setup inicial
3. **Actualizar fecha** de modificación en documentos relevantes
4. **Verificar coherencia** entre todos los documentos

**Tipos de cambios que requieren actualización de docs:**
- ✅ Nuevos endpoints de API
- ✅ Cambios en modelos de base de datos
- ✅ Nuevas variables de entorno
- ✅ Modificaciones en configuración
- ✅ Cambios en flujos de integración
- ✅ Actualizaciones de dependencias importantes

---

## ⚠️ Consideraciones de Producción

### Variables de Entorno Críticas
```bash
# Cambiar en producción
ENCRYPTION_KEY=generar-clave-32-caracteres-aleatoria
WEBHOOK_SECRET=secreto-webhook-seguro

# Admin credentials (cambiar)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

### Monitoring y Logs
```bash
# Logs críticos a monitorear
logs/security.log          # Eventos de seguridad
logs/critical_events.log   # Eventos críticos del sistema  
logs/webhook_security.log  # Actividad webhook específica
```

### Performance
- **Base de Datos**: Índices en `phone_number`, `email`, `gym_id`
- **Rate Limiting**: Configurar según tráfico esperado
- **Cache**: Considerar Redis para configuraciones de gimnasio
- **Backup**: Programar backup automático de `gym_data.db`

---

**📋 Documento técnico actualizado - Agosto 2025**
