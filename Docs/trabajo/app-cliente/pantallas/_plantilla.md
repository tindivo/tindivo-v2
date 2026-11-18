# <ÁREA> · <Nombre de la pantalla>

> Una línea de contexto: maquetas del canvas «Tindivo app — pantallas» (tableros) y, si hay, decisiones que mandan sobre
> la maqueta. Copia el formato de `CHK-confirmar-pedido.md`. Nombre del archivo: `<ÁREA>-<nombre>.md` (áreas en el README).
> Borra estas instrucciones al llenar la plantilla.

| | |
|---|---|
| **Tarea de la persona** | Una frase: qué viene a hacer y cuál es la única acción primaria. |
| **Se llega desde** | Cada puerta de entrada (pantalla o notificación) y, si cambia lo que se ve, el estado de la persona (sin sesión, sin celular…). |
| **Se sale hacia** | Cada acción → pantalla destino; indica si **reemplaza** o se apila, y adónde vuelve «Volver». |
| **Requisitos** | IDs `CUS-<ÁREA>-NNN` que cumple la pantalla. Donde no exista el requisito: «(requisito nuevo: <qué>)»; no inventes números. |
| **Endpoints** | Solo rutas que existen en `apps/api/app/api/v1/**/route.ts`, con método. Si hace falta una que no existe: «(endpoint nuevo: <qué>)». |
| **Estado** | Android: ✅ 🟡 ⚠️ ⬜ (di qué hace hoy) · iOS: ⬜ |

## Contenido, de arriba abajo

1. Lista numerada en el orden en que se ve. Textos de interfaz **exactos** entre «…». Montos y plazos con su parámetro ⚙
   (`app_settings`), nunca el número suelto: `S/ [TOTAL]`, `[PLAZO]`.
2. Lo fijo (barra superior, barra de acción, barra inferior, pastillas) se dice aparte de lo que desplaza.
3. Una variante con su propia maqueta lleva su subtítulo (`### Variante …`).

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando | Esqueleto o texto exacto | |
| Vacío | | |
| Error | Texto exacto y acción de reintento | |
| Variantes de la maqueta | | |
| Estados que el código ya maneja y la maqueta no dibuja | Márcalo | |

Incluye siempre carga, vacío, error y sin conexión. Una fila por estado; el texto del código va tal cual.

## Criterios de aceptación propios de la pantalla

```
CA-<ÁREA>-P1 · Título corto que dice el comportamiento
  Dado <estado inicial concreto>
  Cuando <acción de la persona>
  Entonces <resultado observable>
  Y <segundo resultado, si hace falta>
```

Mínimo 2 por pantalla; cada uno se comprueba con una aserción o una consulta. Numera `P1, P2…` dentro del área (sin repetir
los de otras pantallas del área). Los de `requisitos/<ÁREA>.md` también aplican.

## Movimiento

Duraciones y curva (`cubic-bezier(.2,.8,.2,1)`, 150–250 ms), qué anima y qué pasa con «reducir movimiento». Se copia de los
comentarios `<!-- Movimiento -->` de la maqueta; no se inventa.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** donde no coincidan, no elijas: descríbelas las dos («maqueta dice A; código dice B»).
- Lo que la maqueta no dibuja (variantes, textos que faltan) y las dudas de negocio.
- Marca «pendiente de la decisión X de Jesús» si depende de una decisión abierta.
