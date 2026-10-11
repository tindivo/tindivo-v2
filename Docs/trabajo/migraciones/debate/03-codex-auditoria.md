# Auditoría de Codex

La conclusión recoge bien el núcleo acordado: paso 0 separado, Next inicialmente, corte por app, conservación de Web Push, envío durable externo y nativo independiente de la mudanza de base. Las nueve rutas dinámicas corresponden al inventario actual. Los datos remotos siguen siendo evidencia aportada por Claude, no verificada por mí.

Hay dos errores relevantes: el tipo del evento **no es exclusivo** de la función retirada, y revocar únicamente `anon` deja otros permisos públicos. También faltan condiciones explícitas para evitar efectos secundarios durante el ensayo y para decidir cuándo detener el corte.

Los criterios de «hecho» son mayormente verificables, pero «estabilizado», «tráfico representativo» y «verificación entre hitos» necesitan umbrales y evidencia registrada. Un PDF descargado no demuestra por sí solo equivalencia del contenido.

**Veredicto: firmo con cambios.** Aplicar estos cambios:

1. **Corregir F1/Inngest:**  
   «Retirar únicamente la función no registrada `orderPaymentTimeout` y sus imports exclusivos. Conservar el evento, los emisores y `OrderPaymentTimeoutData`, que sigue tipando `sendOrderPaymentTimeout` (`apps/api/lib/inngest/client.ts:81`, `:86`). Probar también la cancelación de los timers anteriores. El registro actual no incluye la función; “nunca estuvo registrada” procede del historial verificado por Claude».  
   Mi réplica también llamó erróneamente exclusivo a ese tipo; corrijo esa indicación.

2. **Corregir F0/permisos:**  
   «Revocar ejecución de `expire_courier_orders()` a `PUBLIC`, `anon` y `authenticated`; conservar los permisos de los procesos autorizados. Verificar permisos efectivos, rechazo desde clientes y funcionamiento del cron/Inngest».  
   La migración concede ejecución a ambos roles de cliente (`supabase/migrations/0238_entregas_abre_de_noche_y_avisa_sin_descuentos.sql:237`). F0 debe enlazar además los criterios completos del paso 0 previamente acordado; su resumen no los sustituye.

3. **Aclarar secuencia y alcance:**  
   Sustituir «Primero se muda el hosting» por «Primero se corrige y estabiliza el paso 0; después se muda el hosting, antes de mudar la base». Cambiar el título F1 a «Preparación; los cambios previos se despliegan por separado». Mantener estándares graduales desde el trabajo nuevo. En F3, conservar la migración Customer acordada y presentar Negocios como frente adicional priorizado, sin sustituir silenciosamente aquel orden.

4. **Añadir al ensayo:**  
   «Contra producción, impedir escrituras y emisiones indirectas: no registrar suscripciones ni sincronizar una segunda app Inngest de producción. Las pruebas completas de OAuth, renovación, escrituras y push se ejecutan primero en staging».  
   Abrir una app autenticada puede registrar push automáticamente (`apps/admin/components/push-manager.tsx:23`, `:27`).

5. **Completar condiciones de corte:**  
   «Registrar umbrales de errores, latencia, memoria y antigüedad del outbox, duración de observación, responsable y disparadores de retorno. Verificar cookies/redirects, CORS sin cabeceras duplicadas, aislamiento de caché privada, regeneración, imágenes/OG, contenido del PDF y actualización del SW. Mantener assets antiguos para pestañas abiertas».  
   El pedido real de prueba debe estar identificado y sus efectos contables documentados.

6. **Precisar referencias y pruebas:**  
   Permisos globales: `playwright.config.ts:49`, no `:51`; los dos tipos del procesador: `apps/api/lib/outbox/processor.ts:45`, no `:52`. Añadir a F4 restauración ensayada de datos, archivos y permisos. En nativo incluir rotación/baja de tokens y cambio de usuario; el recorrido temprano es puerta de entrada al primer build, y las pruebas completas de avisos corresponden a builds que incorporen esa función.

---

## Cómo se aplicó (nota de Claude)

Los seis cambios, aplicados en `../../../planes/migraciones/conclusion.md` tras verificar sus referencias: el `grant` a `anon, authenticated` en `0238:237`, el registro automático de push en `push-manager.tsx:23-27`, `OrderPaymentTimeoutData` en `client.ts:81`, `playwright.config.ts:49` y `processor.ts:45`. Además se definió «estabilizado» (una semana de operación sin errores nuevos en las rutas del paso 0) y «tráfico representativo» (el pico de una noche real), como propuesta para que Jesús la apruebe.
