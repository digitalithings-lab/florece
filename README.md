# Florece · Backend

API de Florece: NestJS 11 + Prisma 6 + PostgreSQL, con IA de Groq.

## Desarrollo local

Requiere Node 22.

```bash
npm install
cp .env.example .env   # y rellena los valores
npm run dev
```

## Despliegue en Railway

Variables del servicio del backend:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | `openssl rand -base64 32` |
| `JOURNAL_ENCRYPTION_KEY` | `openssl rand -base64 32` (si se pierde, los diarios no se pueden leer) |
| `GROQ_API_KEY` | clave de la consola de Groq |
| `ADMIN_EMAILS` | correos con acceso de administración, separados por comas |

Al arrancar, `npm start` aplica las migraciones pendientes, carga los catálogos (retos y preguntas guiadas) y levanta la API.

## Rutas

Todas exigen `Authorization: Bearer <accessToken>`, salvo las marcadas como públicas.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de la API y la base de datos (pública) |
| GET | `/safety/calm?country=MX` | Ejercicios de «Necesito calmarme» y líneas de ayuda (pública) |
| POST | `/auth/register` | Registro (18+, consentimientos obligatorios) |
| POST | `/auth/login` | Inicio de sesión |
| POST | `/auth/refresh` | Nuevo access token (rota el refresh token) |
| POST | `/auth/logout` | Cierra la sesión |
| GET | `/auth/me` | Usuario actual |
| GET / PATCH | `/profile` | Ver / editar perfil |
| POST | `/profile/onboarding` | Áreas a fortalecer y avatar |
| PUT | `/profile/avatar` | Cambiar avatar |
| POST | `/profile/consents` | Aceptar un consentimiento (p. ej. `AI_PROCESSING`) |
| DELETE | `/profile/consents/:type` | Retirar un consentimiento opcional |
| GET | `/profile/seeds` | Saldo e historial de semillas |
| GET | `/challenges/today` | Retos del día (los asigna si aún no hay) |
| POST | `/challenges/:id/complete` | Completar con evidencia |
| POST | `/challenges/:id/skip` | Saltar un reto |
| GET | `/challenges/history?days=30` | Progreso |
| GET | `/journal/prompts` | Preguntas de escritura guiada |
| GET / POST | `/journal` | Listar / crear entradas |
| GET / PATCH / DELETE | `/journal/:id` | Ver / editar / borrar una entrada |
| POST | `/journal/:id/reflection` | Reflexión de la IA sobre la entrada |
| GET / POST | `/moods` | Calendario del mes (`?month=YYYY-MM`) / registrar emoción |
| GET | `/garden` | Jardín: objetos, posiciones (cuadrícula 5×6) y semillas |
| GET | `/garden/shop` | Tienda: catálogo con precio, si ya lo tienes y si te alcanza |
| POST | `/garden/shop/:itemId/buy` | Comprar un objeto con semillas |
| PUT / DELETE | `/garden/items/:userItemId/placement` | Colocar o mover (`{x, y}`) / quitar del jardín |
| POST | `/challenges/routines/:routineId/complete` | Completar un reto asignado por el psicólogo |
| GET | `/care` | Psicólogo vinculado y próxima cita |
| POST | `/care/preview` · `/care/link` | Ver de quién es un código · vincularse |
| DELETE | `/care/link` | Desvincularse (cancela citas futuras y retos asignados) |
| GET | `/care/slots?days=14` | Horarios libres del psicólogo |
| GET / POST | `/care/appointments` | Mis citas · pedir una cita |
| POST | `/care/appointments/:id/cancel` | Cancelar (mínimo 12 h antes) |
| POST | `/auth/register-psychologist` | Registro de psicólogo (panel web) |
| GET / PATCH | `/psy/me` | Perfil profesional · `POST /psy/me/link-code` genera un código nuevo |
| GET | `/psy/dashboard` | Citas de hoy, solicitudes, respuestas recientes y alertas |
| GET | `/psy/patients` · `/psy/patients/:id` | Pacientes vinculados · ficha con retos, respuestas y citas |
| PATCH | `/psy/patients/:id/settings` | Retos automáticos por día (0 a 6) |
| POST | `/psy/patients/:id/routines` · PATCH `/psy/routines/:id` | Crear / editar o archivar retos asignados |
| GET / PUT / POST / DELETE | `/psy/availability…` | Horario semanal y bloqueos |
| GET / PATCH | `/psy/appointments…` | Citas: confirmar, cancelar, completar, no asistió |
| GET… | `/admin/…` | Estadísticas, psicólogos, catálogo de retos, líneas de ayuda y alertas (solo `ADMIN_EMAILS`) |
| GET | `/chat/usage` | Mensajes usados hoy y límite del plan |
| GET / POST | `/chat/conversations` | Listar / crear conversaciones |
| GET / POST | `/chat/conversations/:id/messages` | Historial / enviar mensaje |
| POST | `/chat/conversations/:id/end` | Terminar conversación |

## Seguridad emocional

- Cada texto que se manda a la IA (chat, reflexiones, evidencias de retos) se clasifica antes por riesgo de suicidio o autolesión, según el contexto. Se prueba `GROQ_SAFETY_MODEL`, luego `GROQ_SAFETY_FALLBACK_MODEL` y, si ambos fallan, palabras clave.
- Riesgo `HIGH` o `IMMINENT`: respuesta de apoyo fija (sin IA generativa) con líneas de ayuda, y se registra en `risk_events`.
- Si hay señales de riesgo, el límite diario de mensajes no se aplica ni se descuenta.
- El contenido del diario y sus reflexiones se guardan cifrados (AES-256-GCM).

**Antes de lanzar:**

- Cargar `crisis_resources` por país, con números verificados.
- Que un profesional de salud mental revise los textos y criterios de `src/safety`, `src/chat` y `src/journal`.
- Pasar Groq a un plan de pago: en el plan gratuito, el modelo de seguridad permite 3 peticiones por minuto.
