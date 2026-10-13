## Qué cambia

<!-- Una o dos frases. Enlaza el plan o la decisión si aplica. -->

Impacto documental: 
<!-- Complétalo en la misma línea: «canon: Docs/…» o «ninguno, porque …» (Docs/README.md §5). La CI falla si queda vacía. -->

## Evidencia

<!-- Salida en crudo de tests, consultas o comandos que demuestran las reglas OBLIGATORIAS sin mecanismo (estándares, «Evidencia»). -->

## Lista de revisión (estándares §7)

- [ ] ¿Añade o quita acoplamiento? (DES)
- [ ] ¿La regla está en un solo sitio, el que da la garantía que necesita? (DES-5)
- [ ] ¿El contrato está en Zod, en el OpenAPI y es compatible? (API-2, API-3)
- [ ] ¿Rompe una app instalada? (API-3, CLI-2, MIG-3)
- [ ] ¿La base protege la invariante, o solo el código que hoy la llama?
- [ ] ¿Hay tests del caso feliz, del acceso ajeno y del fallo a mitad?
- [ ] ¿Se puede volver atrás? En una app nativa, ¿hay *kill switch*? (OPS-6)
