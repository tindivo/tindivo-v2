-- 0055_customer_otp_attempts
-- Tabla dedicada para rate limiting de envío de OTP (Twilio Verify).
-- NO se reusa order_event_log — tiene FK a orders que impide inserts sin order real.
CREATE TABLE IF NOT EXISTS customer_otp_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,  -- E.164: +519XXXXXXXX
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Rate limiting: consulta por user_id en ventana de 24h (now() - interval '24 hours').
-- Usa últimas 24h en vez de día calendario para evitar desfase UTC vs Perú (UTC-5).
CREATE INDEX idx_otp_attempts_user_24h ON customer_otp_attempts (user_id, sent_at);
