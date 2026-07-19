# Revisión UI: Botones y Contenido en Sidebar (`pedido-detail.tsx`)

**Archivo auditado**: `apps/negocios/components/dashboard/pedido-detail.tsx`

---

## 1. Botones de acción por estado (Footer fijo inferior)

Para pedidos prepago (`payment_intent = 'prepaid'`), la estructura de botones del footer fijo en la parte inferior del PopUp se renderiza según el estado exacto:

| Estado | Botón Izquierdo | Botón Derecho | Leyenda Explicativa Inferior |
|---|---|---|---|
| **`pending_acceptance`** | **"Rechazar"** (Rojo ghost) | **"Aceptar disponibilidad"** (Verde/Brand) | *"Confirmas disponibilidad para preparar. El cliente procederá a realizar el pago por Yape/Plin."* |
| **`awaiting_payment`** | **"Cancelar"** (Rojo ghost) | **"Esperando pago..."** (Gris deshabilitado) | Ninguna (Banner de espera naranja visible en el cuerpo). |
| **`validando`** | **"Inválido"** (Rojo borde `#FCA5A5`) | **"Confirmar pago"** (Verde `#16A34A`) | Ninguna (Deshabilitados con `opacity: 0.5` si `!proofUrl || busy`). |
| **`confirmed`** | *(No usa footer pendiente)* | **"Listo — llamar moto"** (Verde en cocina) | Ninguna. |

### Evaluación de integridad de botones:
* **No hay superposición de botones**: Las condiciones son mutuamente excluyentes; en cada estado se muestra únicamente el par de botones correspondiente.
* **No faltan botones**: Cada estado tiene la acción positiva (Aceptar disponibilidad / Confirmar pago) y la acción negativa (Rechazar / Cancelar / Inválido) requerida por el flujo.

---

## 2. Botón "Aceptar disponibilidad"

* **Existencia**: Sí existe para pedidos prepago en `pending_acceptance` ([pedido-detail.tsx:L1223-1225](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L1223-L1225)).
* **Independencia**: Es un botón totalmente separado del botón "Confirmar pago". Presionar "Aceptar disponibilidad" dispara `actions.onAccept(prep)` (RPC `advance_order` → `accept`), enviando el pedido a `awaiting_payment`. Presionar "Confirmar pago" en `validando` dispara `actions.onVerifyProof()` (RPC `validate_order` → `pass=true`), enviando el pedido a `confirmed`.
* **Visibilidad**: Es 100% visible en el footer anclado abajo.
* **Bloque de código exacto**:
  ```tsx
  // pedido-detail.tsx:L1215-1227
  <button
    type="button"
    onClick={() => actions.onAccept(prep)}
    disabled={acceptDisabled}
    className="tv-btn tv-btn-brand"
    style={{ flex: 2 }}
  >
    <MS name="check" size={18} filled />
    {order.status === 'pending_acceptance' && isPrepaid
      ? 'Aceptar disponibilidad'
      : `Aceptar · ${prep}m`}
  </button>
  ```

---

## 3. Flujo de botones al abrir un pedido prepago recién llegado (`pending_acceptance`)

* **Primer botón visible**: El restaurante ve en la parte inferior derecha **"Aceptar disponibilidad"** y a la izquierda **"Rechazar"**.
* **Protección contra confusión**: No se muestran los botones de `validando` ("Inválido" / "Confirmar pago") porque la condición `order.status === 'validando'` evalúa a `false`.

---

## 4. Contenido que se corta y visibilidad

* **Imagen del comprobante**: Se ubica dentro del área scrolleable en `<PaySectionPrepaid />`. Al tener el contenedor central `minHeight: 0` y `overflowY: 'auto'`, el usuario puede desplazarse hacia abajo de forma independiente para examinar la imagen completa del comprobante.
* **Selector de Tiempo de Preparación**: Se renderiza en el área central. En `validando` permite fijar el tiempo de cocina antes de pulsar "Confirmar pago".
* **Superposición del footer**: El footer de botones posee un `zIndex` y sombra superior (`boxShadow: '0 -6px 20px rgba(0,0,0,0.06)'`), actuando como un ancla fija sin solaparse ni bloquear las secciones internas.

---

## 5. Condiciones de renderizado del footer de acciones

Bloque de código completo del footer en [pedido-detail.tsx:L1151-1236](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L1151-L1236):

```tsx
{/* Footer de acciones (pendiente) */}
{isPending && (
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
    {order.status === 'validando' && isPrepaid ? (
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => actions.onRejectProof()}
          disabled={!proofUrl || busy}
          className="tv-btn tv-btn-ghost"
          style={{ flex: 1, color: 'var(--tv-danger)', border: '1.5px solid #FCA5A5', background: '#FFF5F5', opacity: (!proofUrl || busy) ? 0.5 : 1 }}
        >
          <MS name="cancel" size={18} /> Inválido
        </button>
        <button
          type="button"
          onClick={() => actions.onVerifyProof()}
          disabled={!proofUrl || busy}
          className="tv-btn tv-btn-brand"
          style={{ flex: 2, background: '#16A34A', opacity: (!proofUrl || busy) ? 0.5 : 1 }}
        >
          <MS name="check_circle" size={18} filled /> Confirmar pago
        </button>
      </div>
    ) : order.status === 'awaiting_payment' && isPrepaid ? (
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => setModal('cancel')}
          disabled={busy}
          className="tv-btn tv-btn-ghost"
          style={{ flex: 1, color: 'var(--tv-danger)' }}
        >
          <MS name="close" size={18} /> Cancelar
        </button>
        <div
          className="tv-btn"
          style={{ flex: 2, background: '#F3F4F6', color: '#9CA3AF', cursor: 'not-allowed', justifyContent: 'center', pointerEvents: 'none' }}
        >
          Esperando pago...
        </div>
      </div>
    ) : (
      <>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={() => setModal('reject')}
            disabled={busy}
            className="tv-btn tv-btn-ghost"
            style={{ flex: 1, color: 'var(--tv-danger)' }}
          >
            <MS name="close" size={18} /> Rechazar
          </button>
          <button
            type="button"
            onClick={() => actions.onAccept(prep)}
            disabled={acceptDisabled}
            className="tv-btn tv-btn-brand"
            style={{ flex: 2 }}
          >
            <MS name="check" size={18} filled />
            {order.status === 'pending_acceptance' && isPrepaid
              ? 'Aceptar disponibilidad'
              : `Aceptar · ${prep}m`}
          </button>
        </div>
        {order.status === 'pending_acceptance' && isPrepaid && (
          <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', textAlign: 'center' }}>
            Confirmas disponibilidad para preparar. El cliente procederá a realizar el pago por Yape/Plin.
          </div>
        )}
      </>
    )}
  </div>
)}
```
