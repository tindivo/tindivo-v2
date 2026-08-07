# Auditoría UI: Sidebar de detalle de pedido en App Negocios

**Archivo auditado**: `apps/negocios/components/dashboard/pedido-detail.tsx`  
**Complemento de datos**: `apps/negocios/lib/orders/view-model.ts`

---

## 1. Estructura y scroll

### ¿La sidebar tiene overflow-y scroll o auto? ¿O el contenido se corta si excede la altura de la pantalla?
* **Propiedad de Scroll**: El contenedor de contenido interno ([pedido-detail.tsx:L789-797](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L789-L797)) declara `overflowY: 'auto'` y `flex: 1`.
* **Causa del corte previo de contenido**: Anteriormente, el div flex hijo carecía de `minHeight: 0`. En el modelo de caja de Flexbox CSS, un hijo flex sin `minHeight: 0` adopta `min-height: auto`, expandiéndose más allá del viewport y provocando que las secciones inferiores (como la imagen del comprobante o datos de validación) se cortaran por debajo del footer de botones sin activar la barra de scroll.
* **Solución aplicada**: Se añadió `minHeight: 0` al contenedor en `pedido-detail.tsx:L792`, permitiendo que Flexbox restrinja la altura al área disponible entre el header superior y el footer de acciones, activando un scroll interno suave.

### ¿Qué componente envuelve la sidebar? ¿Es un div fijo, un Sheet, un panel lateral? Muestra las clases CSS del contenedor.
* **Componente principal**: `DetailScreen` ([pedido-detail.tsx:L593-1293](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L593-L1293)).
* **Estructura Modal Drawer en Desktop**:
  * **Overlay de fondo (Backdrop)**:
    ```tsx
    // pedido-detail.tsx:L1277-1286
    <div
      onClick={actions.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
    ```
  * **Panel lateral deslizable (PopUp)**:
    ```tsx
    // pedido-detail.tsx:L1287-1299
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 420,
        maxWidth: '100vw',
        height: '100%',
        background: '#fff',
        boxShadow: '-12px 0 36px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {content}
    </div>
    ```

---

## 2. Secciones que se renderizan en estado 'validando'

### Lista de secciones de arriba a abajo para pedido prepaid en `validando`:
1. **Header Fijo Superior** ([pedido-detail.tsx:L669-771](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L669-L771)): Número de pedido (`#GRR7Z7LA`), badges de origen/pago (`Online`, `Prepago`), temporizador y monto total.
2. **Tarjeta Cliente** ([pedido-detail.tsx:L812-846](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L812-L846)): Nombre del cliente (`order.customer`) y número telefónico cliqueable.
3. **Tarjeta Dirección** ([pedido-detail.tsx:L849-872](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L849-L872)): Dirección de entrega y referencia.
4. **Tarjeta Pedido e Ítems** ([pedido-detail.tsx:L875-970](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L875-L970)): Lista de platos, modificadores (salsas/opciones), notas, subtotal, delivery y total.
5. **Sección de Validación de Pago `<PaySectionPrepaid />`** ([pedido-detail.tsx:L200-337](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L200-L337), invocada en L999):
   - Banner azul: *"Verificar comprobante de pago"* (con badge rojo *"Segundo y último intento"* si `proofAttempt === 2`).
   - Caja de **DATOS DE VALIDACIÓN**: Monto esperado (`S/ XX.XX`), Hora del pedido (`HH:MM`), Nombre del cliente.
   - Bloque de **COMPROBANTE DEL CLIENTE**: Imagen de la captura subida por el cliente (`proofUrl`).
6. **Selector `TIEMPO DE PREPARACIÓN`** ([pedido-detail.tsx:L986-1030](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L986-L1030)): Botones preset (`10m`, `15m`, `20m`, `25m`, `30m`, `35m`...).
7. **Footer Fijo de Acciones Inferior** ([pedido-detail.tsx:L1151-1185](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L1151-L1185)): Botones de acción principales *"Inválido"* (rojo) y *"Confirmar pago"* (verde).

### Selector de "TIEMPO DE PREPARACIÓN": ¿Debería mostrarse en 'validando' o solo en 'confirmed'?
* **Análisis de experiencia del usuario**: Mostrar el selector de `TIEMPO DE PREPARACIÓN` durante el estado `validando` le permite a la cajera seleccionar el tiempo estimado de preparación en cocina (ej. 20 minutos) **al mismo tiempo** que verifica el comprobante. Al hacer clic en **"Confirmar pago"**, el sistema registra la verificación exitosa del pago y pasa el pedido directamente a cocina (`confirmed`) con el tiempo de preparación ya seleccionado, evitando que el usuario tenga que hacer un clic adicional en un segundo paso.

---

## 3. Datos de validación incompletos

### Renderizado de la guía de validación:
Se renderiza dentro del componente `PaySectionPrepaid` ([pedido-detail.tsx:L243-263](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L243-L263)):

```tsx
<div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tv-ink-muted)', marginBottom: 6, letterSpacing: '0.05em' }}>
  DATOS DE VALIDACIÓN
</div>
<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span style={{ color: 'var(--tv-ink-muted)' }}>Monto esperado:</span>
    <span className="tv-mono" style={{ fontWeight: 700, color: '#16A34A' }}>{soles(order.total)}</span>
  </div>
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span style={{ color: 'var(--tv-ink-muted)' }}>Hora del pedido:</span>
    <span className="tv-mono" style={{ fontWeight: 700 }}>{order.createdAtFormatted ?? '—'}</span>
  </div>
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span style={{ color: 'var(--tv-ink-muted)' }}>Nombre del cliente:</span>
    <span style={{ fontWeight: 700 }}>{order.customer ?? 'Cliente'}</span>
  </div>
</div>
```

### Disponibilidad de datos en `OrderVM`:
* **Estado en la base de datos y View Model**:
  * `order.customer`: Mapeado desde `row.customer_name` ([view-model.ts:L226](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/lib/orders/view-model.ts#L226)).
  * `order.createdAtFormatted`: Calculado mediante `fmtTime(row.created_at)` en horario `America/Lima` ([view-model.ts:L259](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/lib/orders/view-model.ts#L259)).
  * `ORDER_SELECT`: Incluye los campos `customer_name` y `created_at` ([view-model.ts:L9-24](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/lib/orders/view-model.ts#L9-L24)).
* **Causa en la captura del cliente**: En la captura previa a la actualización, la guía no renderizaba las líneas de hora y nombre. En el código actual, ambos valores están 100% expuestos y mapeados en el View Model y la interfaz.

---

## 4. Imagen del comprobante

### ¿Se muestra la captura subida por el cliente?
* **Renderizado**: Se incluye en `PaySectionPrepaid` ([pedido-detail.tsx:L276-286](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L276-L286)):
  ```tsx
  <img
    src={proofUrl}
    alt="Comprobante del cliente"
    style={{
      width: '100%',
      height: 160,
      borderRadius: 10,
      objectFit: 'contain',
      background: '#F0EBE3',
    }}
  />
  ```
* **Causa de la invisibilidad inicial**: En la captura previa, el elemento `<img />` quedaba oculto **fuera del viewport por falta de scroll interno** (la caja no permitía scroll por la falta de `minHeight: 0`). Con el fix de `minHeight: 0`, al hacer scroll hacia abajo dentro del PopUp, la imagen del comprobante se visualiza claramente.

---

## 5. Botones de acción

### Posicionamiento de los botones:
* **Fijos en el fondo**: Los botones "Inválido" y "Confirmar pago" están ubicados en la barra de acciones ([pedido-detail.tsx:L1151-1185](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L1151-L1185)) configurada como un hijo directo del flexbox vertical fuera del área scrolleable:
  ```tsx
  <div
    style={{
      background: '#fff',
      borderTop: '1px solid var(--tv-border)',
      padding: '12px 14px 14px',
      boxShadow: '0 -6px 20px rgba(0,0,0,0.06)',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}
  >
  ```
  Esto garantiza que los botones permanezcan **siempre fijos y visibles al fondo del PopUp** mientras el usuario navega y hace scroll por el contenido superior.

### Etiqueta del botón de aprobación:
* **"Confirmar pago"** vs **"Verificar comprobante"**:
  * La etiqueta **"Confirmar pago"** (con ícono `check_circle` y fondo verde `#16A34A`) es altamente precisa y clara, ya que indica a la cajera que al presionar dicho botón valida el ingreso del dinero a Yape/Plin y aprueba el inicio de preparación del pedido.
  * Si la captura aún no ha terminado de cargar en el navegador, el botón se deshabilita automáticamente con `opacity: 0.5` hasta que `proofUrl` esté presente.
