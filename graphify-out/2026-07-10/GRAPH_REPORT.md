# Graph Report - .  (2026-07-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2012 nodes · 4495 edges · 173 communities (111 shown, 62 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.78)
- Token cost: 5,691 input · 7,705 output

## Graph Freshness
- Built from commit: `64025855`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ok
- enum-drift.ts
- scripts
- getSupabaseBrowser
- soles
- enums.ts
- service.ts
- handleOptions
- page.tsx
- dependencies
- dependencies
- biome.json
- page.tsx
- auth.ts
- dependencies
- home.tsx
- dependencies
- page.tsx
- page.tsx
- Ico
- functions.ts
- page.tsx
- dependencies
- errMsg
- getOpenStatus
- Icon
- compilerOptions
- index.ts
- index.ts
- getRequestId
- index.ts
- compilerOptions
- coverage.ts
- FASE-1 TINDIVO
- Roadmap and Out-of-Scope Items
- index.ts
- page.tsx
- getSupabaseBrowser
- chrome.tsx
- package.json
- package.json
- page.tsx
- order-card.tsx
- requests.ts
- page.tsx
- offline-queue.ts
- Context and State of apps/negocios
- page.tsx
- view-model.ts
- createServiceClient
- moment-picked-up.tsx
- package.json
- package.json
- apps/customer (PWA cliente)
- page.tsx
- page.tsx
- page.tsx
- compilerOptions
- apps/api (REST único)
- route.ts
- package.json
- apps/admin (panel control)
- Negocios PWA
- Checklist de Verificación
- route.ts
- errors.ts
- pedidos-view.tsx
- accent-color-picker.tsx
- types.ts
- layout.tsx
- page.tsx
- react-library.json
- CLAUDE.md (Instructions)
- page.tsx
- tsconfig.json
- tsconfig.json
- map-picker-inner.tsx
- tsconfig.json
- tsconfig.json
- page.tsx
- tsconfig.json
- short-id.ts
- money.ts
- ports.ts
- node-library.json
- route.ts
- Docs/00-visión.md – Part 1 (Vision)
- tsconfig.json
- order-status.ts
- coverage-polygon-editor-inner.tsx
- package.json
- index.ts
- corsHeaders
- handleError
- route.ts
- route.ts
- page.tsx
- page.tsx
- Supabase Realtime
- tsconfig.json
- tsconfig.json
- tsconfig.json
- tsconfig.json
- Phase 1 Orchestration
- How to Use Graphify
- map-readonly-inner.tsx
- packages/core (dominio puro)
- packages/ui (UI compartida)
- .agents/rules/graphify.md
- next.config.ts
- next-env.d.ts
- postcss.config.mjs
- next.config.ts
- next-env.d.ts
- next.config.ts
- next-env.d.ts
- postcss.config.mjs
- next.config.ts
- next-env.d.ts
- postcss.config.mjs
- next.config.ts
- next-env.d.ts
- postcss.config.mjs
- Autenticación JWT (Supabase Auth)
- Docs/00-visión.md – Part 2 (Glossary)
- .github/workflows/ci.yml
- Idempotencia Stripe-style
- Next.js 16 App Router
- Outbox pattern + Inngest
- Animaciones Motion (timing tokens)
- Admin App Icon (SVG)
- Cash Payment Icon (SVG)
- Plin Payment Icon (SVG)
- Yape Payment Icon (SVG)
- Motorizados App Icon (SVG)
- Negocios App Icon (SVG)
- DECISIONS.md – Part 2 (Sections 16-21)
- Docs/01-requerimientos-funcionales.md – Part 2
- Enums (user_role, order_status, etc)
- fetch nativo + packages/api-client
- Leaflet + react-leaflet + OSM
- Material Symbols Rounded
- Motion (ex Framer) v12
- packages/api-client (cliente REST)
- packages/config (configs compartidos)
- packages/contracts (Zod schemas)
- packages/supabase (tipos + helpers)
- React Hook Form + Zod resolver
- Row Level Security siempre activada
- shadcn-based primitives (Button, Card, etc)
- Edge Functions (send-push, prune-events)
- Supabase Storage
- Tabla businesses
- Tabla drivers
- Tabla orders (pedidos)
- Tabla push_subscriptions
- Tailwind CSS v4
- TanStack Query v5
- Turborepo + pnpm workspaces
- TypeScript 5.8 Strict
- Tipografía Manrope (única familia)
- Paleta de colores (Brand #F97316)
- Vercel (deploy)
- Web Push API + VAPID
- Zustand v5

## God Nodes (most connected - your core abstractions)
1. `corsHeaders()` - 124 edges
2. `createServiceClient()` - 124 edges
3. `handleError()` - 120 edges
4. `getRequestId()` - 118 edges
5. `ok()` - 116 edges
6. `handleOptions()` - 112 edges
7. `requireRole()` - 109 edges
8. `DomainError` - 43 edges
9. `getSupabaseBrowser()` - 36 edges
10. `soles()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --indirect_call--> `day()`  [INFERRED]
  apps/api/app/api/v1/public/businesses/route.ts → packages/contracts/src/__tests__/schedule.test.ts
- `Docs/00-visión.md – Part 1 (Vision)` --conceptually_related_to--> `Customer App Landing UI (screenshot)`  [INFERRED]
  Docs/00-vision.md → tindivo-landing-v2.png
- `Customer App Menu UI (screenshot)` --conceptually_related_to--> `Docs/00-visión.md – Part 2 (Glossary)`  [INFERRED]
  tindivo-menu-v2.png → Docs/00-vision.md
- `Customer App Landing UI (screenshot)` --semantically_similar_to--> `Customer App Icon (SVG)`  [INFERRED] [semantically similar]
  tindivo-landing-v2.png → apps/customer/public/icon.svg
- `BusinessDetail` --references--> `ScheduleDayRow`  [EXTRACTED]
  apps/customer/app/negocio/[id]/page.tsx → packages/contracts/src/schedule.ts

## Import Cycles
- 1-file cycle: `apps/admin/components/coverage-polygon-editor.tsx -> apps/admin/components/coverage-polygon-editor.tsx`

## Hyperedges (group relationships)
- **Core Decision and Design Documents** — decisions_pt1, decisions_pt2, claude, readme, deploy [EXTRACTED 0.90]
- **Las 4 apps frontend consumen la misma API REST** — apps_customer, apps_admin, apps_negocios, apps_motorizados, apps_api [EXTRACTED 1.00]
- **Sistema de notificaciones con Outbox + Edge Functions + Inngest** — table_domain_events, supabase_edge_functions, inngest, web_push_api_vapid [EXTRACTED 1.00]
- **Patrones de UI compartidos (GlassTopBar, OrderCard, etc)** — packages_ui, glass_topbar_pattern, order_card_pattern [EXTRACTED 1.00]
- **Antifraud System Documents** — antifraude_paso2_design, auditoria_antifraude_actual, implementacion_antifraude_log, decisions_pt1, decisions_pt2 [EXTRACTED 0.95]
- **Customer App UI Assets** — tindivo_landing_v2, tindivo_menu_v2, apps_customer_public_icon, apps_customer_public_pay_cash, apps_customer_public_pay_plin, apps_customer_public_pay_yape [INFERRED 0.80]
- **Post-MVP Features** — encomiendas, tienda_tindivo, apps_nativas, pasarela_pago, real_time_gps, cupones, propinas_digitales, heatmap_demanda, multi_tenant, rol_soporte, verificacion_telefono_sms, i18n, calificaciones_reviews, fidelizacion [EXTRACTED 1.00]
- **Tindivo Applications** — cliente_app, negocios_app, motorizados_app, admin_app [EXTRACTED 1.00]
- **Tindivo Specification Documents** — doc_maestro, doc_fase1, doc_flujo, doc_design_spec, doc_negocios [EXTRACTED 1.00]
- **Core Business Concepts** — concept_prepago, concept_contraentrega, concept_strikes, concept_fondo_contingencia, concept_banda, concept_equilibrio, concept_bandeja_reportes [INFERRED 0.85]
- **Order Lifecycle Rules** — rule_umbral_prepago, rule_llamada_validacion, rule_timer_aceptacion, rule_timer_prepago, rule_timer_espera, rule_banda_dos [INFERRED 0.80]

## Communities (173 total, 62 thin omitted)

### Community 0 - "ok"
Cohesion: 0.11
Nodes (26): GET(), OPTIONS(), POST(), Schema, OPTIONS(), POST(), Schema, OPTIONS() (+18 more)

### Community 1 - "enum-drift.ts"
Cohesion: 0.05
Nodes (42): serverEnv, ServerEnvSchema, findCompletedReplay(), IdempotentResult, createServerSupabase(), DOMAIN_ENUMS, Assert, _business_primary_capability (+34 more)

### Community 2 - "scripts"
Cohesion: 0.04
Nodes (47): description, devDependencies, @biomejs/biome, turbo, typescript, engines, node, pnpm (+39 more)

### Community 3 - "getSupabaseBrowser"
Cohesion: 0.10
Nodes (33): AuthCallbackPage(), EntrarContent(), AuthOnboardingSheet(), PANEL_ORDER, SKIPPABLE, AuthOnboardingHost(), resumeOnboardingIfPending(), acceptTerms() (+25 more)

### Community 4 - "soles"
Cohesion: 0.06
Nodes (35): getCurrentPositionHA(), MobileOrderRow(), CustomerOptionPill(), cardHover, CardProps, clickProps(), CocinaCard(), COOKING_STATE_STYLE (+27 more)

### Community 5 - "enums.ts"
Cohesion: 0.04
Nodes (45): BUSINESS_PRIMARY_CAPABILITIES, BusinessPrimaryCapability, BusinessPrimaryCapabilitySchema, CANCEL_REASONS, CancelReason, CancelReasonSchema, CASH_SETTLEMENT_STATUSES, CashSettlementStatus (+37 more)

### Community 6 - "service.ts"
Cohesion: 0.10
Nodes (33): OPTIONS(), PUT(), Schema, OPTIONS(), PUT(), Schema, CreateSchema, POST() (+25 more)

### Community 7 - "handleOptions"
Cohesion: 0.09
Nodes (23): OPTIONS(), POST(), Schema, OPTIONS(), OPTIONS(), GET(), OPTIONS(), OPTIONS() (+15 more)

### Community 8 - "page.tsx"
Cohesion: 0.11
Nodes (28): CheckoutPage(), BusinessDetail, Category, MenuItem, NegocioPage(), soles(), CartButton(), CartCtas() (+20 more)

### Community 9 - "dependencies"
Cohesion: 0.06
Nodes (34): dependencies, leaflet, leaflet-draw, next, react, react-dom, react-leaflet, recharts (+26 more)

### Community 10 - "dependencies"
Cohesion: 0.06
Nodes (34): dependencies, inngest, next, react, react-dom, @supabase/ssr, @supabase/supabase-js, @tindivo/contracts (+26 more)

### Community 11 - "biome.json"
Cohesion: 0.06
Nodes (34): source, assist, actions, enabled, files, ignoreUnknown, includes, formatter (+26 more)

### Community 12 - "page.tsx"
Cohesion: 0.11
Nodes (24): ClaimRow, ClaimsPage(), soles(), AdvanceRow, FundInfo, IncidentesPage(), IncidentRow, ReportesPage() (+16 more)

### Community 13 - "auth.ts"
Cohesion: 0.10
Nodes (21): OPTIONS(), POST(), OPTIONS(), POST(), OPTIONS(), POST(), Schema, OPTIONS() (+13 more)

### Community 14 - "dependencies"
Cohesion: 0.06
Nodes (32): dependencies, leaflet, next, react, react-dom, react-leaflet, @supabase/ssr, @supabase/supabase-js (+24 more)

### Community 15 - "home.tsx"
Cohesion: 0.13
Nodes (20): bricolage, geist, jetbrains, metadata, viewport, MotorizadoPage(), Availability, AvailabilityCard() (+12 more)

### Community 16 - "dependencies"
Cohesion: 0.06
Nodes (31): dependencies, leaflet, next, react, react-dom, react-leaflet, @supabase/ssr, @supabase/supabase-js (+23 more)

### Community 17 - "page.tsx"
Cohesion: 0.11
Nodes (23): ACTIVE_STATUSES, DishResultCard(), Home(), PublicBusiness, soles(), TRACKING_LABEL, cancelledCopy(), etaLabel() (+15 more)

### Community 18 - "page.tsx"
Cohesion: 0.08
Nodes (19): ALLOWED_IMAGE_TYPES, BADGE_PRESETS, Category, CustomerPreviewPanel(), FormData, groupRuleLabel(), GroupRuleSelector(), itemMaxPrice() (+11 more)

### Community 19 - "Ico"
Cohesion: 0.12
Nodes (18): bricolage, geist, jetbrains, metadata, AlertsBell(), Signal, base, Ico (+10 more)

### Community 20 - "functions.ts"
Cohesion: 0.11
Nodes (25): { GET, POST, PUT }, CashDeliveredData, EVENT_CASH_DELIVERED, EVENT_ORDER_CREATED, EVENT_ORDER_NOTIFY_BUSINESS, EVENT_ORDER_PREPAY, EVENT_ORDER_VALIDATION, EVENT_TRANSFER_REQUESTED (+17 more)

### Community 21 - "page.tsx"
Cohesion: 0.10
Nodes (19): CAPABILITY_LABELS, capabilityLabel(), ConfiguracionPage(), ConfigView(), Form, isWaInvalid(), ProfileImageUploader(), QrUploader() (+11 more)

### Community 22 - "dependencies"
Cohesion: 0.07
Nodes (28): dependencies, next, react, react-dom, @supabase/ssr, @supabase/supabase-js, @tindivo/api-client, @tindivo/contracts (+20 more)

### Community 23 - "errMsg"
Cohesion: 0.13
Nodes (22): AuditoriaPage(), AuditRow, ContingenciaPage(), CashDisputeRow, EfectivoPage(), dayLabel(), MetricasPage(), PIE (+14 more)

### Community 24 - "getOpenStatus"
Cohesion: 0.11
Nodes (23): DAY_NAMES, limaDayIdx(), ScheduleRow(), Shift, shiftLabel(), shiftsOf(), BusinessOrderingInfo, cache (+15 more)

### Community 25 - "Icon"
Cohesion: 0.14
Nodes (16): CashDeliverCard(), EfectivoPage(), HistoryRow, STATUS_CHIP, TodayRow, CollectCard(), DeliveredScreen(), OrderDetail() (+8 more)

### Community 26 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, incremental, isolatedModules (+18 more)

### Community 27 - "index.ts"
Cohesion: 0.15
Nodes (17): DrvRow, MotorizadosPage(), DEFAULT_FORM, BizRow, CAPABILITY_LABELS, MODE_PRESETS, ModePresetKey, NegociosPage() (+9 more)

### Community 28 - "index.ts"
Cohesion: 0.13
Nodes (14): RANGE_LABEL, BarMini(), Column, DataTable(), DonutMini(), Hero(), ACCENT, KpiCard() (+6 more)

### Community 29 - "getRequestId"
Cohesion: 0.12
Nodes (20): OPTIONS(), PATCH(), Schema, GET(), POST(), Schema, DELETE(), OPTIONS() (+12 more)

### Community 30 - "index.ts"
Cohesion: 0.17
Nodes (16): DeliveryMethod, DistanceBand, OrderStatus, canTransition(), CommissionConfig, CommissionOverrides, computeCommission(), assertCustomerCanCancel() (+8 more)

### Community 31 - "compilerOptions"
Cohesion: 0.08
Nodes (25): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, incremental, isolatedModules, lib (+17 more)

### Community 32 - "coverage.ts"
Cohesion: 0.13
Nodes (21): MapInner, MapPicker(), Coverage, CoveragePolygon, FALLBACK, fetchCoverage(), fetchCoveragePolygon(), fetchLocationValidation() (+13 more)

### Community 33 - "FASE-1 TINDIVO"
Cohesion: 0.11
Nodes (24): Admin App (admin.tindivo.com), Cliente App (tindivo.com), Motorizado App (motorizados.tindivo.com), Negocio App (negocios.tindivo.com), Banda de Delivery (Cerca/Lejos), Bandeja de Reportes Admin, Contraentrega (Efectivo/Yape), Punto de Equilibrio ~10 pedidos/noche (+16 more)

### Community 34 - "Roadmap and Out-of-Scope Items"
Cohesion: 0.11
Nodes (24): Apps Nativas iOS/Android, Businesses Table, Calificaciones y Reviews, Coupons Table, Customer Profiles Table, Roadmap and Out-of-Scope Items, Drivers Table, Encomiendas (+16 more)

### Community 35 - "index.ts"
Cohesion: 0.17
Nodes (17): PushManager(), ButtonProps, Size, SIZES, Variant, VARIANTS, Card(), CardBody() (+9 more)

### Community 36 - "page.tsx"
Cohesion: 0.13
Nodes (13): Mode, DeliverSheet(), PaymentReal, INCIDENT_TYPES, IncidentSheet(), PickupSheet(), SLOT_OPTIONS, ReadyPromptSheet() (+5 more)

### Community 37 - "getSupabaseBrowser"
Cohesion: 0.14
Nodes (16): Advance, ADVANCE_STATE, AdvanceCard(), DeudaPage(), fmtDate(), Settlement, SETTLEMENT_STATE, SettlementRow() (+8 more)

### Community 38 - "chrome.tsx"
Cohesion: 0.16
Nodes (16): activeIdFor(), AuthedChrome(), BizState, BottomNav(), CATALOG_ONLY_NAV, Ctx, DashboardCtx, Login() (+8 more)

### Community 39 - "package.json"
Cohesion: 0.10
Nodes (20): dependencies, zod, devDependencies, @tindivo/tsconfig, typescript, vitest, exports, ./accent-colors (+12 more)

### Community 40 - "package.json"
Cohesion: 0.10
Nodes (20): dependencies, clsx, tailwind-merge, devDependencies, react, @tindivo/tsconfig, @types/react, typescript (+12 more)

### Community 41 - "page.tsx"
Cohesion: 0.18
Nodes (16): Address, AddressSheet(), CuentaPage(), OrderRow, Profile, Addr, AddressBar(), ADDRESS_LABELS (+8 more)

### Community 42 - "order-card.tsx"
Cohesion: 0.20
Nodes (14): PedidoPage(), AvailableTab(), MineTab(), MINE_STEPS, OrderCard(), SourceChip(), DriverBoard, useDriverOrders() (+6 more)

### Community 43 - "requests.ts"
Cohesion: 0.12
Nodes (18): DeliveryMethodSchema, PaymentIntentSchema, AddressReference, AddressReferenceSchema, Coordinates, CoordinatesSchema, MoneyPen, MoneyPenSchema (+10 more)

### Community 44 - "page.tsx"
Cohesion: 0.12
Nodes (14): Address, CASH_CHIPS, CashChoice, CustomerProfile, GeoBlockKind, GpsValidationPayload, OrderDetail(), OrderResult (+6 more)

### Community 45 - "offline-queue.ts"
Cohesion: 0.31
Nodes (14): OfflineBanner(), useOnline(), clearOptimistic(), enqueue(), peekAll(), QueuedTransition, queueSize(), read() (+6 more)

### Community 46 - "Context and State of apps/negocios"
Cohesion: 0.13
Nodes (18): @tindivo/api-client, @tindivo/contracts, @tindivo/ui, Bug: itemMaxPrice Returns Base Price, Bug: onCallDriver Not Passed in Actions, Context and State of apps/negocios, Chrome (Global Context), Configuración (+10 more)

### Community 47 - "page.tsx"
Cohesion: 0.13
Nodes (8): Cfg, ConfiguracionPage(), SaveFn, CoveragePolygonEditor(), LatLng, Inner, TIMER_FIELDS, WEEKDAYS

### Community 48 - "view-model.ts"
Cohesion: 0.16
Nodes (12): bufferPhase(), COOKING_PRIORITY, fmtTime(), getUiState(), limaTime, minutesSince(), OrderColumn, OrderRow (+4 more)

### Community 49 - "createServiceClient"
Cohesion: 0.21
Nodes (13): GET(), money, OPTIONS(), PATCH(), Schema, GET(), OPTIONS(), DELETE() (+5 more)

### Community 50 - "moment-picked-up.tsx"
Cohesion: 0.28
Nodes (11): BusinessCard(), CustomerCard(), MapReadonly(), Inner, MomentPickedUp(), mapsDirToCoords(), mapsSearchAddress(), peDigits() (+3 more)

### Community 51 - "package.json"
Cohesion: 0.12
Nodes (15): dependencies, @tindivo/contracts, devDependencies, @tindivo/supabase, @tindivo/tsconfig, typescript, vitest, exports (+7 more)

### Community 52 - "package.json"
Cohesion: 0.13
Nodes (14): dependencies, @supabase/supabase-js, devDependencies, @tindivo/tsconfig, typescript, exports, ./service, ./types (+6 more)

### Community 53 - "apps/customer (PWA cliente)"
Cohesion: 0.14
Nodes (14): apps/customer (PWA cliente), Pantalla Mi cuenta, Pantalla Editor de direcciones, Sheet Auth y onboarding, Pantalla Cancelado, Pantalla Carrito, Pantalla Checkout, Pantalla Confirmación de pedido (+6 more)

### Community 54 - "page.tsx"
Cohesion: 0.15
Nodes (8): CashRow, KPI_TONE, KpiTone, SettlementCard(), SummaryHero(), NavId, DashboardShell(), DashboardSidebar()

### Community 55 - "page.tsx"
Cohesion: 0.18
Nodes (11): ClaimModal(), DesktopTable(), fmtTime(), HistDisplay, HistFilter, HistorialView(), HistRow, limaFmt (+3 more)

### Community 56 - "page.tsx"
Cohesion: 0.16
Nodes (10): CategoryManagerModal(), CatRow, itemMaxPrice(), itemMinPrice(), ItemRow(), MenuCategory, MenuItem, MenuPage() (+2 more)

### Community 57 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, allowJs, incremental, jsx, lib, module, moduleResolution, noEmit (+5 more)

### Community 58 - "apps/api (REST único)"
Cohesion: 0.15
Nodes (13): apps/api (REST único), CORS estricto (allowed origins), Endpoint Inngest (/api/inngest), Endpoints admin (/admin/*), Endpoints business (/business/*), Endpoints customer (/customer/*), Endpoints driver (/driver/*), Endpoints internos (/internal/*) (+5 more)

### Community 59 - "route.ts"
Cohesion: 0.50
Nodes (4): OPTIONS(), POST(), Schema, sendOrderCreated()

### Community 60 - "package.json"
Cohesion: 0.15
Nodes (12): dependencies, @tindivo/contracts, devDependencies, @tindivo/tsconfig, typescript, exports, name, private (+4 more)

### Community 61 - "apps/admin (panel control)"
Cohesion: 0.17
Nodes (12): Sección Auditoría (eventos), Sección Catálogos públicos, Sección Cobros (liquidaciones semanales), Sección Configuración (horario, reglas, comisiones), Dashboard admin (KPI + monitor), Sección Disputas de efectivo, Sección Métricas (6 sub-tabs), Sección Motorizados (CRUD + autorizaciones) (+4 more)

### Community 62 - "Negocios PWA"
Cohesion: 0.24
Nodes (11): Negocios PWA, Primary Capability Model, Motorizados PWA, Domain Events Outbox, Push Notification Pipeline, Commission and Settlement Model, Supabase Edge Functions, Supabase Backend (+3 more)

### Community 63 - "Checklist de Verificación"
Cohesion: 0.20
Nodes (10): Admin App (admin.tindivo.com), Bug: CORS Headers in Error Responses, Cliente App (tindivo.com), Checklist de Verificación, Motorizados App (motorizados.tindivo.com), Multi-Tenant, Push Pipeline (Outbox → Edge Function), Progressive Web App (PWA) (+2 more)

### Community 64 - "route.ts"
Cohesion: 0.22
Nodes (9): AppSettingValue, EDITABLE, GET(), hhmm, minutes, money, OPTIONS(), PATCH() (+1 more)

### Community 65 - "errors.ts"
Cohesion: 0.20
Nodes (8): ProblemOptions, API_ERROR_CODES, ApiErrorCode, ERROR_CODE_STATUS, ProblemDetailsSchema, RFC-9457, ValidationIssue, ValidationIssueSchema

### Community 66 - "pedidos-view.tsx"
Cohesion: 0.24
Nodes (4): NegocioPedidosPage(), PedidosDesktop(), PedidosMobile(), PedidosViewProps

### Community 67 - "accent-color-picker.tsx"
Cohesion: 0.42
Nodes (6): AccentColorPicker(), normalizeHexInput(), AccentColor, AccentColorSchema, BUSINESS_ACCENT_PALETTE, isPaletteAccentColor()

### Community 68 - "types.ts"
Cohesion: 0.28
Nodes (7): IncomingBanner, DriverOrderStatus, OrderSource, PaymentIntent, TeamResponse, TransferRequestRow, TransitionAction

### Community 69 - "layout.tsx"
Cohesion: 0.25
Nodes (6): bricolage, geist, jetbrains, metadata, viewport, CartHydrator()

### Community 70 - "page.tsx"
Cohesion: 0.32
Nodes (7): ACTIVE_STATUSES, OrderItem, OrderRow, PedidosPage(), relativeDate(), soles(), STATUS_LABEL

### Community 71 - "react-library.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, display, extends, $schema

### Community 72 - "CLAUDE.md (Instructions)"
Cohesion: 0.43
Nodes (7): Antifraude Paso 2 Design, Auditoria Antifraude Actual, CLAUDE.md (Instructions), DECISIONS.md – Part 1 (Sections 0-15), DEPLOY.md (Golive Runbook), Implementacion Antifraude Log (Paso 5), README.md (Root)

### Community 73 - "page.tsx"
Cohesion: 0.33
Nodes (5): CobrosPage(), defaultPeriod(), SettlementRow, Field(), STATEMENT_STATUS

### Community 74 - "tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, exclude, extends, include, @/*

### Community 75 - "tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, exclude, extends, include, @/*

### Community 77 - "tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, exclude, extends, include, @/*

### Community 78 - "tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, exclude, extends, include, @/*

### Community 79 - "page.tsx"
Cohesion: 0.33
Nodes (6): card, NuevoPedidoPage(), num(), Payment, PAYMENTS, PREP_PRESETS

### Community 80 - "tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, exclude, extends, include, @/*

### Community 81 - "short-id.ts"
Cohesion: 0.38
Nodes (4): ShortId, ShortIdSchema, ShortId, InvalidShortIdError

### Community 82 - "money.ts"
Cohesion: 0.67
Nodes (5): addMoney(), fromCents(), roundMoney(), subtractMoney(), toCents()

### Community 83 - "ports.ts"
Cohesion: 0.29
Nodes (3): Clock, IdGenerator, systemClock

### Community 84 - "node-library.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, display, extends, $schema

### Community 85 - "route.ts"
Cohesion: 0.40
Nodes (5): GET(), OPTIONS(), POST(), Schema, sendCashDelivered()

### Community 86 - "Docs/00-visión.md – Part 1 (Vision)"
Cohesion: 0.33
Nodes (6): Customer App Icon (SVG), Docs/00-visión.md – Part 1 (Vision), Docs/01-requerimientos-funcionales.md – Part 1, Docs/02-requerimientos-no-funcionales.md – Part 1, Docs/02-requerimientos-no-funcionales.md – Part 2, Customer App Landing UI (screenshot)

### Community 87 - "tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, lib, exclude, extends, include

### Community 88 - "order-status.ts"
Cohesion: 0.40
Nodes (5): TrackingStep, isTerminal(), ORDER_TRANSITIONS, STATUS_TO_TRACKING, TERMINAL_STATUSES

### Community 90 - "package.json"
Cohesion: 0.40
Nodes (4): files, name, private, version

### Community 91 - "index.ts"
Cohesion: 0.50
Nodes (4): buildNotes(), db, Note, unwrapAvailability()

### Community 92 - "corsHeaders"
Cohesion: 0.11
Nodes (24): GET(), OPTIONS(), GET(), OPTIONS(), GET(), OPTIONS(), GET(), GET() (+16 more)

### Community 93 - "handleError"
Cohesion: 0.15
Nodes (13): OPTIONS(), POST(), Schema, CreateSchema, GET(), POST(), OPTIONS(), POST() (+5 more)

### Community 94 - "route.ts"
Cohesion: 0.67
Nodes (3): GET(), OPTIONS(), resolveRange()

### Community 95 - "route.ts"
Cohesion: 0.67
Nodes (3): GET(), OPTIONS(), TRANSFERABLE

### Community 98 - "Supabase Realtime"
Cohesion: 0.67
Nodes (4): apps/motorizados (PWA driver), apps/negocios (PWA negocio), Supabase Realtime, Vertical slicing

### Community 99 - "tsconfig.json"
Cohesion: 0.50
Nodes (3): exclude, extends, include

### Community 100 - "tsconfig.json"
Cohesion: 0.50
Nodes (3): exclude, extends, include

### Community 101 - "tsconfig.json"
Cohesion: 0.50
Nodes (3): exclude, extends, include

### Community 102 - "tsconfig.json"
Cohesion: 0.50
Nodes (3): exclude, extends, include

### Community 103 - "Phase 1 Orchestration"
Cohesion: 0.67
Nodes (3): Super Admin Panel UI, Audio Notifications for Restaurants, Phase 1 Orchestration

### Community 104 - "How to Use Graphify"
Cohesion: 0.67
Nodes (3): How to Use Graphify, DeepSeek, Graphify

### Community 106 - "packages/core (dominio puro)"
Cohesion: 0.67
Nodes (3): DDD ligero, Arquitectura hexagonal, packages/core (dominio puro)

### Community 107 - "packages/ui (UI compartida)"
Cohesion: 0.67
Nodes (3): GlassTopBar pattern, OrderCard pattern, packages/ui (UI compartida)

## Knowledge Gaps
- **853 isolated node(s):** `AuditRow`, `ClaimRow`, `SettlementRow`, `Cfg`, `SaveFn` (+848 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **62 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `handleOptions()` connect `handleOptions` to `ok`, `route.ts`, `service.ts`, `auth.ts`, `createServiceClient`, `getRequestId`, `route.ts`, `route.ts`, `corsHeaders`, `handleError`, `route.ts`, `route.ts`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `getSupabaseBrowser()` connect `getSupabaseBrowser` to `coverage.ts`, `index.ts`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `ApiError` connect `page.tsx` to `types.ts`, `getSupabaseBrowser`, `soles`, `page.tsx`, `page.tsx`, `offline-queue.ts`, `home.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `Icon`, `index.ts`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `AuditRow`, `ClaimRow`, `SettlementRow` to the rest of the system?**
  _858 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ok` be split into smaller, more focused modules?**
  _Cohesion score 0.11363636363636363 - nodes in this community are weakly interconnected._
- **Should `enum-drift.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.053061224489795916 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._