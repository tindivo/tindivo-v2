---
canvas: []
requisitos: []
operaciones: []
textos: []
tokens: []
codigo:
  web: []
  android: []
  ios: []
---

# Nombre de la pantalla

<!-- Plantilla de una ficha de pantalla (Docs/README.md §2.4). Va en Docs/producto/<capacidad>/pantallas/<slug>.md.
     La clave de la pantalla es `<capacidad>/<slug>`: no hay otro identificador. Una sola ficha para web, Android e iOS.

     Cabecera:
     - canvas: nombres de los tableros del canvas de maquetas que dibujan esta pantalla.
     - requisitos: IDs de requisito (de su capacidad o de otra) que esta pantalla cumple.
     - operaciones: operationId de packages/contracts/openapi/v1.json que llama.
     - textos: claves del catálogo de textos (cuando exista packages/copy).
     - tokens: tokens de diseño propios de la pantalla, si los hay.
     - codigo: globs de los archivos de esta pantalla por plataforma.

     Cuando cambia el diseño: se edita esta ficha en la misma rama que el código y Jesús aprueba ese diff, con el antes
     y el después del tablero. Si el cambio no cabe en un PR, va primero como delta a Docs/planes/ (o a Docs/trabajo/
     si no está aprobado). -->

| | |
|---|---|
| **Tarea de la persona** | … |
| **Se llega desde** | `<capacidad>/<slug>` · … |
| **Se sale hacia** | … |

## Contenido, de arriba abajo

1. …

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Cargando | … | … |
| Vacío | … | … |
| Error | … | … |

## Diferencias por plataforma

<!-- Solo si una plataforma se adapta a sus convenciones (ADAPTAR). Si todas hacen lo mismo, borra esta sección. -->
