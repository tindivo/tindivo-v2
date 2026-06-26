-- 0047_report_type_prepay_refund.sql
-- #3: nuevo tipo de reporte para la bandeja del admin cuando un PREPAGO se cancela con
-- comprobante subido pero SIN verificar (timeout sin validar, o comprobante marcado
-- inválido). El admin decide si corresponde devolución y a quién se carga.
-- Va en su propia migración: PostgreSQL no permite usar un valor de enum nuevo en la
-- misma transacción en que se agrega. La migración 0048 (función + trigger) lo usa.
-- Idempotente (ADD VALUE IF NOT EXISTS).

alter type public.report_type add value if not exists 'prepay_refund_review';
