# App cliente — matriz de trazabilidad

> Estado: **propuesto**, pendiente de aprobación de Jesús · **Generado** por `node scripts/spec-matriz.mjs` desde `requisitos/` y `pantallas/`: no se edita a mano.
> Una fila por requisito: estado por plataforma, disposición móvil y pantallas que lo citan. Los endpoints viven en
> cada pantalla (cabecera «Endpoints») y en la línea «Backend» de cada área. «—» en pantallas = ningún archivo lo cita.

| Requisito | Android | iOS | Móvil | Pantallas |
|---|---|---|---|---|
| CUS-ACC-001  | ✅ | ⬜ | IGUAL · M1 | `ACC-cuenta`, `AUT-celular` |
| CUS-ACC-002  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ACC-003  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-ACC-004  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ACC-005  | ⬜ | ⬜ | ADAPTAR · M1 | — |
| CUS-ACC-006  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-ACC-007  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-ACC-008  | ⚠️ | ⬜ | IGUAL · M1 | — |
| CUS-ADR-001  | ✅ | ⬜ | IGUAL · M1 | `ADR-elegir-direccion`, `ADR-mapa` |
| CUS-ADR-002  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ADR-003 ★ | ✅ | ⬜ | IGUAL · M1 | `ACC-cuenta`, `ADR-elegir-direccion`, `ADR-mapa`, `ENT-pedir-entrega` |
| CUS-ADR-004  | ✅ | ⬜ | IGUAL · M1 | `ADR-mapa` |
| CUS-ADR-005  | ✅ | ⬜ | ADAPTAR · M1 | `ADR-mapa` |
| CUS-ADR-006  | ⬜ | ⬜ | ADAPTAR · M1 | `ADR-mapa` |
| CUS-ADR-007  | 🟡 | ⬜ | NUEVO · M1 | — |
| CUS-ADR-008  | 🟡 | ⬜ | ADAPTAR · M1 | `ADR-mapa` |
| CUS-ADR-009  | ✅ | ⬜ | IGUAL · M1 | `ACC-cuenta`, `ADR-elegir-direccion` |
| CUS-ADR-010  | ✅ | ⬜ | IGUAL · M1 | `ACC-cuenta`, `ADR-elegir-direccion`, `ADR-mapa` |
| CUS-ADR-011 ★ | ✅ | ⬜ | IGUAL · M1 | `ADR-elegir-direccion` |
| CUS-ADR-012 ★ | ✅ | ⬜ | ADAPTAR · M1 | `ADR-elegir-direccion`, `CHK-confirmar-pedido` |
| CUS-ADR-013  | — | — | NUEVO · M1 | — |
| CUS-ADR-014  | ✅ | ⬜ | IGUAL · M1 | `ADR-elegir-direccion` |
| CUS-ADR-015  | 📝 | ⬜ | IGUAL · M1 | — |
| CUS-ADR-016  | ⬜ | ⬜ | ADAPTAR · M1 | — |
| CUS-ADR-017  | ⬜ | ⬜ | IGUAL · M1 | — |
| CUS-ADR-018  | ⬜ | ⬜ | IGUAL · M1 | — |
| CUS-AUT-001  | ✅ | ⬜ | IGUAL · M1 | `AUT-entrar`, `AUT-terminos-actualizados`, `CAT-inicio` |
| CUS-AUT-002  | ✅ | ⬜ | ADAPTAR · M1 | `AUT-entrar` |
| CUS-AUT-003  | — | ⬜ | NUEVO · M1 | `AUT-entrar` |
| CUS-AUT-004  | — | — | **RETIRADO en nativo: solo Google (decisión de Jesús)** · `D-22` · (antes: IGUAL · M1) | — |
| CUS-AUT-005  | — | — | **RETIRADO en nativo: solo Google (decisión de Jesús)** · `D-22` · (antes: IGUAL · M1) | — |
| CUS-AUT-006  | ✅ | ⬜ | IGUAL · M1 | `AUT-terminos-actualizados` |
| CUS-AUT-007  | ✅ | ⬜ | ADAPTAR · M1 | `ACC-cuenta`, `AUT-celular`, `ENT-pedir-entrega` |
| CUS-AUT-008  | — | — | IGUAL · M1 | `AUT-celular` |
| CUS-AUT-009  | 📝 | ⬜ | IGUAL · M1 | `AUT-celular`, `CHK-confirmar-pedido` |
| CUS-AUT-010  | ✅ | ⬜ | IGUAL · M1 | `ACC-cuenta`, `AUT-entrar` |
| CUS-AUT-011  | 📝 | ⬜ | IGUAL · M1 | `AUT-entrar` |
| CUS-AUT-012  | ✅ | ⬜ | IGUAL · M1 | `ACC-cuenta`, `AUT-celular`, `ORD-mis-pedidos`, `TRK-seguimiento` |
| CUS-AUT-013  | 🟡 | ⬜ | ADAPTAR · M1 | `ACC-cuenta` |
| CUS-AUT-014  | ✅ | ⬜ | IGUAL · M1 | `ACC-cuenta` |
| CUS-AUT-015  | 🟡 | ⬜ | IGUAL · M1 | `ACC-cuenta` |
| CUS-AUT-016  | — | — | SOLO-WEB · W | — |
| CUS-AUT-017  | ✅ | ⬜ | NUEVO · M1 | `ACC-cuenta` |
| CUS-AUT-018  | ⬜ | ⬜ | NUEVO · M1 | `NOT-activar-notificaciones` |
| CUS-AUT-019  | ✅ | ⬜ | ADAPTAR · M1 | — |
| CUS-AUT-020  | ⬜ | ⬜ | IGUAL · M1 | — |
| CUS-AUT-021  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-AUT-022  | ⬜ | ⬜ | IGUAL · M1 | — |
| CUS-AUT-023  | ⬜ | ⬜ | IGUAL · M1 | — |
| CUS-AUT-024  | 🟡 | ⬜ | ADAPTAR · M1 | — |
| CUS-AUT-025  | ⬜ | ⬜ | IGUAL · M1 | — |
| CUS-AUT-026  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-CAT-001  | ✅ | ⬜ | IGUAL · M1 | `CAT-inicio` |
| CUS-CAT-002  | ⬜ | ⬜ | ADAPTAR · M1 | `CAT-inicio` |
| CUS-CAT-003  | ⬜ | ⬜ | IGUAL · M1 | `CAT-inicio` |
| CUS-CAT-004  | 🟡 | ⬜ | IGUAL · M1 | `CAT-negocio` |
| CUS-CAT-005  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-CAT-006  | ✅ | ⬜ | IGUAL · M1 | `CAT-negocio` |
| CUS-CAT-007  | 🟡 | ⬜ | ADAPTAR · M1 | `CAT-plato` |
| CUS-CAT-008 ★ | ✅ | ⬜ | IGUAL · M1 | `CAT-plato` |
| CUS-CAT-009 ★ | ✅ | ⬜ | IGUAL · M1 | `CAT-plato` |
| CUS-CAT-010  | ✅ | ⬜ | IGUAL · M1 | `CAT-negocio`, `CAT-plato` |
| CUS-CAT-011 ★ | ✅ | ⬜ | IGUAL · M1 | `CAT-negocio`, `CAT-plato` |
| CUS-CAT-012 ★ | 🟡 | ⬜ | IGUAL · M1 | `CAT-inicio`, `CAT-negocio`, `CHK-confirmar-pedido` |
| CUS-CAT-013  | — | — | IGUAL · M1 | — |
| CUS-CAT-014  | — | — | IGUAL · M1 | `CAT-negocio` |
| CUS-CAT-015  | 🟡 | ⬜ | IGUAL · M1 | `CAT-inicio`, `CAT-negocio` |
| CUS-CAT-016  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-CAT-017  | 🟡 | ⬜ | IGUAL · M1 | `CAT-negocio` |
| CUS-CAT-018 ★ | ⬜ | ⬜ | IGUAL · M1 | `CAT-negocio` |
| CUS-CAT-019  | ⬜ | ⬜ | ADAPTAR · M1 | `CAT-inicio`, `ORD-mis-pedidos` |
| CUS-CAT-020  | ⬜ | ⬜ | ADAPTAR · M1 | `CAT-inicio` |
| CUS-CAT-021  | 📝 | ⬜ | IGUAL · M1 | — |
| CUS-CAT-022  | ⬜ | ⬜ | ADAPTAR · M1 | `CAT-negocio` |
| CUS-CAT-023  | — | — | NUEVO · M1 | — |
| CUS-CAT-024  | — | — | MUERTO · — | — |
| CUS-CAT-025  | — | — | MUERTO · — | — |
| CUS-CHK-001  | ✅ | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido` |
| CUS-CHK-002 ★ | ✅ | ⬜ | IGUAL · M1 | `AUT-celular` |
| CUS-CHK-003  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-CHK-004 ★ | ✅ | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido` |
| CUS-CHK-005  | ✅ | ⬜ | IGUAL · M1 | `ADR-elegir-direccion`, `CHK-confirmar-pedido` |
| CUS-CHK-006 ★ | ✅ | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido`, `PAY-pago-al-recibir` |
| CUS-CHK-007 ★ | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-CHK-008 ★ | ✅ | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido` |
| CUS-CHK-009 ★ | ⬜ | ⬜ | ADAPTAR · M1 | `CHK-confirmar-pedido` |
| CUS-CHK-010 ★ | ✅ | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido` |
| CUS-CHK-011  | 📝 | ⬜ | ADAPTAR · M1 | `CHK-confirmar-pedido`, `TRK-seguimiento` |
| CUS-CHK-012  | ✅ | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido` |
| CUS-CHK-013  | ✅ | ⬜ | IGUAL · M1 | `ADR-elegir-direccion`, `CHK-confirmar-pedido` |
| CUS-CHK-014  | 🟡 | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido` |
| CUS-CHK-015  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-CHK-016  | ✅ | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido` |
| CUS-CHK-017  | 🟡 | ⬜ | DIFERIR · M2 | — |
| CUS-CHK-018 ★ | ✅ | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido` |
| CUS-CHK-019  | ⬜ | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido` |
| CUS-CHK-020  | 🟡 | ⬜ | ADAPTAR · M1 | `CHK-confirmar-pedido` |
| CUS-CHK-021  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-CHK-022  | ⬜ | ⬜ | IGUAL · M1 | — |
| CUS-CHK-023  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-CRT-001 ★ | ✅ | ⬜ | IGUAL · M1 | `CAT-negocio`, `CAT-plato`, `CRT-bolsa` |
| CUS-CRT-002  | ✅ | ⬜ | IGUAL · M1 | `CAT-plato` |
| CUS-CRT-003  | ✅ | ⬜ | IGUAL · M1 | `CRT-bolsa` |
| CUS-CRT-004  | ✅ | ⬜ | ADAPTAR · M1 | `CAT-inicio`, `CAT-plato`, `CRT-bolsa` |
| CUS-CRT-005 ★ | 🟡 | ⬜ | IGUAL · M1 | `CAT-negocio`, `CRT-bolsa` |
| CUS-CRT-006  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-CRT-007  | 📝 | ⬜ | IGUAL · M1 | — |
| CUS-CRT-008 ★ | 🟡 | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido` |
| CUS-CRT-009  | ✅ | ⬜ | IGUAL · M1 | `CRT-bolsa` |
| CUS-CRT-010  | 🟡 | ⬜ | IGUAL · M1 | `CRT-bolsa` |
| CUS-CRT-011  | ✅ | ⬜ | IGUAL · M1 | `CAT-plato`, `CRT-bolsa` |
| CUS-CRT-012  | ⚠️ | ⬜ | NUEVO · M2 | `CRT-bolsa`, `ORD-mis-pedidos` |
| CUS-ENT-001  | ✅ | ⬜ | ADAPTAR · M1 | — |
| CUS-ENT-002  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-003  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-ENT-004  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-005  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-ENT-006  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-007  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-008  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-ENT-009  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-010  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-ENT-011  | ⬜ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-012  | 📝 | ⬜ | IGUAL · M1 | — |
| CUS-ENT-013  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-014  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-015  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-016  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-017  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-018  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-019  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-ENT-020  | 📝 | ⬜ | IGUAL · M1 | — |
| CUS-ENT-021  | ⬜ | ⬜ | NUEVO · M2 | — |
| CUS-NOT-001  | ⬜ | ⬜ | ADAPTAR · M1 | — |
| CUS-NOT-002  | ⬜ | ⬜ | ADAPTAR · M1 | — |
| CUS-NOT-003  | ⬜ | ⬜ | ADAPTAR · M1 | — |
| CUS-NOT-004  | ⬜ | ⬜ | IGUAL · M1 | — |
| CUS-ORD-001  | ✅ | ⬜ | ADAPTAR · M1 | `ORD-mis-pedidos` |
| CUS-ORD-002  | 🟡 | ⬜ | IGUAL · M1 | `ORD-mis-pedidos` |
| CUS-ORD-003  | 🟡 | ⬜ | IGUAL · M1 | `ORD-mis-pedidos` |
| CUS-ORD-004  | ⚠️ | ⬜ | ADAPTAR · M1 | `ORD-mis-pedidos`, `TRK-seguimiento` |
| CUS-ORD-005  | 📝 | ⬜ | ADAPTAR · M1 | — |
| CUS-ORD-006  | — | — | NUEVO · M1 | `ORD-mis-pedidos` |
| CUS-PAY-001 ★ | 🟡 | ⬜ | IGUAL · M1 | `PAY-comprobante`, `PAY-pago-al-recibir`, `TRK-seguimiento` |
| CUS-PAY-002  | ✅ | ⬜ | ADAPTAR · M1 | `PAY-comprobante`, `PAY-pago-al-recibir` |
| CUS-PAY-003  | ✅ | ⬜ | ADAPTAR · M1 | `PAY-comprobante`, `PAY-pago-al-recibir` |
| CUS-PAY-004  | ✅ | ⬜ | ADAPTAR · M1 | `PAY-comprobante`, `PAY-pago-al-recibir` |
| CUS-PAY-005 ★ | ✅ | ⬜ | IGUAL · M1 | `PAY-comprobante`, `PAY-pago-al-recibir` |
| CUS-PAY-006  | ⬜ | ⬜ | ADAPTAR · M1 | — |
| CUS-PAY-007  | 📝 | ⬜ | ADAPTAR · M1 | — |
| CUS-PAY-008 ★ | ⬜ | ⬜ | IGUAL · M1 | `CHK-confirmar-pedido`, `PAY-comprobante` |
| CUS-PAY-009  | 🟡 | ⬜ | IGUAL · M1 | `ORD-mis-pedidos`, `PAY-comprobante`, `TRK-seguimiento` |
| CUS-PAY-010  | 📝 | ⬜ | IGUAL · M1 | — |
| CUS-PAY-011  | 🟡 | ⬜ | ADAPTAR · M1 | — |
| CUS-PAY-012  | ⬜ | ⬜ | IGUAL · M1 | — |
| CUS-PAY-013  | 🟡 | ⬜ | ADAPTAR · M1 | — |
| CUS-REV-001  | 🟡 | ⬜ | IGUAL · M1 | `ORD-mis-pedidos`, `TRK-seguimiento` |
| CUS-REV-002  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-REV-003  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-STO-001  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-STO-002  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-STO-003  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-STO-004  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-STO-005  | ✅ | ⬜ | ADAPTAR · M1 | — |
| CUS-STO-006  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-STO-007  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-STO-008  | ⬜ | ⬜ | IGUAL · M1 | — |
| CUS-SUP-001  | ✅ | ⬜ | ADAPTAR · M1 | `ACC-cuenta` |
| CUS-SUP-002  | 🟡 | ⬜ | ADAPTAR · M1 | `AUT-entrar`, `AUT-terminos-actualizados` |
| CUS-SUP-003  | 📝 | ⬜ | NUEVO · M1 | — |
| CUS-SUP-004  | 🟡 | ⬜ | NUEVO · M1 | — |
| CUS-SUP-005  | 🟡 | ⬜ | IGUAL · M1 | — |
| CUS-TRK-001  | 🟡 | ⬜ | ADAPTAR · M1 | `TRK-seguimiento` |
| CUS-TRK-002 ★ | ✅ | ⬜ | IGUAL · M1 | `TRK-seguimiento` |
| CUS-TRK-003  | ✅ | ⬜ | IGUAL · M1 | `TRK-seguimiento` |
| CUS-TRK-004 ★ | ⬜ | ⬜ | IGUAL · M1 | `TRK-seguimiento` |
| CUS-TRK-005 ★ | 🟡 | ⬜ | IGUAL · M1 | `PAY-comprobante`, `TRK-seguimiento` |
| CUS-TRK-006 ★ | ✅ | ⬜ | IGUAL · M1 | `TRK-seguimiento` |
| CUS-TRK-007  | ✅ | ⬜ | ADAPTAR · M1 | `TRK-seguimiento` |
| CUS-TRK-008  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-TRK-009  | ✅ | ⬜ | IGUAL · M1 | — |
| CUS-TRK-010  | ⬜ | ⬜ | ADAPTAR · M1 | `NOT-activar-notificaciones` |
| CUS-TRK-011  | ⬜ | ⬜ | ADAPTAR · M1 | — |
| CUS-TRK-012  | ⬜ | ⬜ | ADAPTAR · M1 | — |
| CUS-TRK-013  | ⬜ | ⬜ | ADAPTAR · M1 | `NOT-activar-notificaciones` |
| CUS-TRK-014  | 🟡 | ⬜ | ADAPTAR · M1 | `TRK-seguimiento` |
| CUS-TRK-015  | ✅ | ⬜ | IGUAL · M1 | `TRK-seguimiento` |
| CUS-TRK-016  | — | — | SOLO-WEB · W | — |
| CUS-TRK-017  | ⬜ | ⬜ | NUEVO · M2 | — |
| CUS-TRK-018  | 🟡 | ⬜ | ADAPTAR · M1 | — |

Total: 190 requisitos · sin pantalla: 93.
