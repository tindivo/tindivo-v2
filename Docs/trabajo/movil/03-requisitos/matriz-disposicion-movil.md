# Matriz de disposición móvil

> **Generada por script** a partir de las tablas de `CUS-cliente.md`, `NEG-negocios.md`, `MOT-motorizados.md`,
> `ADM-admin.md`, `SYS-transversal.md` y `NAT-capacidades-nativas.md` (2026-09-20). No se edita a mano: si cambia un
> requisito, se regenera. Leyenda de disposiciones, fases y estados: [`00-formato-y-convenciones.md`](00-formato-y-convenciones.md).

**324 requisitos y capacidades catalogados**, de los cuales **68 son ★ críticos de paridad** (26 en el Customer).

## 1. Qué se hace con cada cosa (disposición)

| App | IGUAL | ADAPTAR | SOLO-WEB | DIFERIR | MUERTO | NUEVO | Total |
|---|---|---|---|---|---|---|---|
| Clientes (`CUS`) | 85 | 33 | 9 | 1 | 2 | 10 | **140** |
| Negocios (`NEG`) | 0 | 1 | 2 | 37 | 0 | 0 | **40** |
| Motorizados (`MOT`) | 0 | 5 | 0 | 16 | 0 | 0 | **21** |
| Admin (`ADM`) | 0 | 0 | 24 | 0 | 0 | 0 | **24** |
| Servidor transversal (`SYS`) | 34 | 4 | 1 | 0 | 0 | 2 | **41** |
| Nativo nuevo (`NAT`) | 0 | 0 | 0 | 0 | 0 | 58 | **58** |
| **Total** | **119** | **43** | **36** | **54** | **2** | **70** | **324** |

- **IGUAL:** se replica tal cual (dominio del negocio).
- **ADAPTAR:** se replica con la capacidad nativa equivalente (push, GPS, mapa, sesión, cámara).
- **SOLO-WEB:** no existe en la app; se queda en la web o se descarta con la PWA.
- **DIFERIR:** se replica después del primer lanzamiento.
- **MUERTO:** código vestigial; no se migra.
- **NUEVO:** capacidad que no existe hoy.

## 2. Cuándo (fase)

| App | M1 | M2 | M3 | W | — | Total |
|---|---|---|---|---|---|---|
| Clientes (`CUS`) | 126 | 3 | 0 | 9 | 2 | **140** |
| Negocios (`NEG`) | 0 | 0 | 38 | 2 | 0 | **40** |
| Motorizados (`MOT`) | 0 | 0 | 21 | 0 | 0 | **21** |
| Admin (`ADM`) | 0 | 0 | 0 | 24 | 0 | **24** |
| Servidor transversal (`SYS`) | 40 | 0 | 0 | 1 | 0 | **41** |
| Nativo nuevo (`NAT`) | 30 | 19 | 9 | 0 | 0 | **58** |
| **Total** | **196** | **22** | **68** | **36** | **2** | **324** |

**M1** = clientes, primer lanzamiento · **M2** = clientes tras el lanzamiento · **M3** = otras apps · **W** = se queda en web.

## 3. En qué estado está hoy (real, verificado en código)

| App | ✅ | 🟡 | ⚠️ | 🗑️ | 📝 | ➕ | Total |
|---|---|---|---|---|---|---|---|
| Clientes (`CUS`) | 117 | 4 | 7 | 4 | 0 | 8 | **140** |
| Negocios (`NEG`) | 38 | 0 | 2 | 0 | 0 | 0 | **40** |
| Motorizados (`MOT`) | 21 | 0 | 0 | 0 | 0 | 0 | **21** |
| Admin (`ADM`) | 22 | 0 | 1 | 1 | 0 | 0 | **24** |
| Servidor transversal (`SYS`) | 35 | 1 | 5 | 0 | 0 | 0 | **41** |
| Nativo nuevo (`NAT`) | 0 | 0 | 0 | 0 | 0 | 58 | **58** |
| **Total** | **233** | **5** | **15** | **5** | **0** | **66** | **324** |

✅ implementado · 🟡 parcial · ⚠️ con defecto conocido · 🗑️ muerto · 📝 solo en documentación · ➕ nuevo.

## 4. El Customer por área

| Área | IGUAL | ADAPTAR | SOLO-WEB | DIFERIR | MUERTO | NUEVO | Total |
|---|---|---|---|---|---|---|---|
| `CUS-AUT` | 11 | 3 | 1 | 0 | 0 | 3 | **18** |
| `CUS-CAT` | 17 | 5 | 0 | 0 | 2 | 1 | **25** |
| `CUS-CRT` | 10 | 1 | 0 | 0 | 0 | 1 | **12** |
| `CUS-ADR` | 9 | 4 | 0 | 0 | 0 | 2 | **15** |
| `CUS-CHK` | 16 | 3 | 0 | 1 | 0 | 0 | **20** |
| `CUS-PAY` | 5 | 5 | 0 | 0 | 0 | 0 | **10** |
| `CUS-TRK` | 8 | 7 | 1 | 0 | 0 | 1 | **17** |
| `CUS-ORD` | 2 | 3 | 0 | 0 | 0 | 1 | **6** |
| `CUS-REV` | 3 | 0 | 0 | 0 | 0 | 0 | **3** |
| `CUS-ACC` | 4 | 0 | 0 | 0 | 0 | 0 | **4** |
| `CUS-SUP` | 0 | 2 | 0 | 0 | 0 | 1 | **3** |
| `CUS-WEB` | 0 | 0 | 7 | 0 | 0 | 0 | **7** |

## 5. Lo que **no** va al móvil (Customer): «solo web» y «muerto»

Es la respuesta a *«hay muchas cosas que se usan en web y que no se usarán en el móvil»*.

| ID | Qué es | Disposición |
|---|---|---|
| `CUS-AUT-016` | CUS-AUT-016 | SOLO-WEB |
| `CUS-CAT-024` | CUS-CAT-024 | 🗑️ MUERTO |
| `CUS-CAT-025` | CUS-CAT-025 | 🗑️ MUERTO |
| `CUS-TRK-016` | CUS-TRK-016 | SOLO-WEB |
| `CUS-WEB-001` | CUS-WEB-001 | SOLO-WEB |
| `CUS-WEB-002` | CUS-WEB-002 | SOLO-WEB |
| `CUS-WEB-003` | CUS-WEB-003 | SOLO-WEB |
| `CUS-WEB-004` | CUS-WEB-004 | SOLO-WEB |
| `CUS-WEB-005` | CUS-WEB-005 | SOLO-WEB |
| `CUS-WEB-006` | CUS-WEB-006 | SOLO-WEB |
| `CUS-WEB-007` | CUS-WEB-007 | SOLO-WEB |

## 6. Lo que es **nuevo** (Customer y servidor)

| ID | Qué es | Fase |
|---|---|---|
| `CUS-AUT-003` | CUS-AUT-003 | M1 |
| `CUS-AUT-017` | CUS-AUT-017 | M1 |
| `CUS-AUT-018` | CUS-AUT-018 | M1 |
| `CUS-CAT-023` | CUS-CAT-023 | M1 |
| `CUS-CRT-012` | CUS-CRT-012 | M2 |
| `CUS-ADR-007` | CUS-ADR-007 | M1 |
| `CUS-ADR-013` | CUS-ADR-013 | M1 |
| `CUS-TRK-017` | CUS-TRK-017 | M2 |
| `CUS-ORD-006` | CUS-ORD-006 | M1 |
| `CUS-SUP-003` | CUS-SUP-003 | M1 |
| `SYS-NOT-005` | SYS-NOT-005 | M1 |
| `SYS-ERR-002` | SYS-ERR-002 ★ | M1 |

Las capacidades nativas nuevas (`NAT-*`, con su justificación) están en [`NAT-capacidades-nativas.md`](NAT-capacidades-nativas.md).

## 7. Lo que tiene **defecto conocido** y no debe copiarse tal cual (⚠️)

| ID | Qué es | Móvil |
|---|---|---|
| `CUS-AUT-008` | CUS-AUT-008 | IGUAL · M1 |
| `CUS-CRT-012` | CUS-CRT-012 | NUEVO · M2 |
| `CUS-CHK-010` | CUS-CHK-010 ★ | IGUAL · M1 |
| `CUS-CHK-012` | CUS-CHK-012 | IGUAL · M1 |
| `CUS-CHK-020` | CUS-CHK-020 | ADAPTAR · M1 |
| `CUS-ORD-002` | CUS-ORD-002 | IGUAL · M1 |
| `CUS-ORD-004` | CUS-ORD-004 | ADAPTAR · M1 |
| `NEG-TAB-013` | NEG-TAB-013 | ADAPTAR · M3 |
| `NEG-MAN-006` | NEG-MAN-006 | DIFERIR · M3 |
| `ADM-SIS-003` | ADM-SIS-003 | SOLO-WEB · W |
| `SYS-NOT-002` | SYS-NOT-002 ★ | ADAPTAR · M1 |
| `SYS-NOT-005` | SYS-NOT-005 | NUEVO · M1 |
| `SYS-AUT-002` | SYS-AUT-002 | ADAPTAR · M1 |
| `SYS-DAT-004` | SYS-DAT-004 | ADAPTAR · M1 |
| `SYS-ERR-002` | SYS-ERR-002 ★ | NUEVO · M1 |

## 8. Requisitos ★ de paridad del Customer

iOS y Android deben decidir o cobrar exactamente igual. Cada uno lleva criterios de aceptación en `CUS-cliente.md` y
debe tener **vectores de conformidad** compartidos (`ARQ-03`).

| ID | Qué es | Móvil |
|---|---|---|
| `CUS-CAT-008` | CUS-CAT-008 ★ | IGUAL · M1 |
| `CUS-CAT-009` | CUS-CAT-009 ★ | IGUAL · M1 |
| `CUS-CAT-011` | CUS-CAT-011 ★ | IGUAL · M1 |
| `CUS-CAT-012` | CUS-CAT-012 ★ | IGUAL · M1 |
| `CUS-CAT-018` | CUS-CAT-018 ★ | IGUAL · M1 |
| `CUS-CRT-001` | CUS-CRT-001 ★ | IGUAL · M1 |
| `CUS-CRT-005` | CUS-CRT-005 ★ | IGUAL · M1 |
| `CUS-CRT-008` | CUS-CRT-008 ★ | IGUAL · M1 |
| `CUS-ADR-003` | CUS-ADR-003 ★ | IGUAL · M1 |
| `CUS-ADR-011` | CUS-ADR-011 ★ | IGUAL · M1 |
| `CUS-ADR-012` | CUS-ADR-012 ★ | ADAPTAR · M1 |
| `CUS-CHK-002` | CUS-CHK-002 ★ | IGUAL · M1 |
| `CUS-CHK-004` | CUS-CHK-004 ★ | IGUAL · M1 |
| `CUS-CHK-006` | CUS-CHK-006 ★ | IGUAL · M1 |
| `CUS-CHK-007` | CUS-CHK-007 ★ | IGUAL · M1 |
| `CUS-CHK-008` | CUS-CHK-008 ★ | IGUAL · M1 |
| `CUS-CHK-009` | CUS-CHK-009 ★ | ADAPTAR · M1 |
| `CUS-CHK-010` | CUS-CHK-010 ★ | IGUAL · M1 |
| `CUS-CHK-018` | CUS-CHK-018 ★ | IGUAL · M1 |
| `CUS-PAY-001` | CUS-PAY-001 ★ | IGUAL · M1 |
| `CUS-PAY-005` | CUS-PAY-005 ★ | IGUAL · M1 |
| `CUS-PAY-008` | CUS-PAY-008 ★ | IGUAL · M1 |
| `CUS-TRK-002` | CUS-TRK-002 ★ | IGUAL · M1 |
| `CUS-TRK-004` | CUS-TRK-004 ★ | IGUAL · M1 |
| `CUS-TRK-005` | CUS-TRK-005 ★ | IGUAL · M1 |
| `CUS-TRK-006` | CUS-TRK-006 ★ | IGUAL · M1 |
