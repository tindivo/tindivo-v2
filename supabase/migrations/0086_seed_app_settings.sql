-- =============================================================================
-- 0086 · Semilla de configuración global (public.app_settings)
-- =============================================================================

INSERT INTO public.app_settings (key, value) VALUES
('assignment_rules', '{
  "urgentAfterMinutes": 5,
  "maxOrdersPerDriver": 3,
  "groupingWindowMinutes": 5,
  "maxRestaurantsPerDriver": 2,
  "extremeAlertAfterMinutes": 8,
  "maxOccupancySlotsPerOrder": 3
}'::jsonb),
('commissions', '{
  "far": 3.5,
  "near": 3,
  "pickup": 0.5
}'::jsonb),
('coverage', '{
  "radiusKm": 3,
  "centerLat": -9.1547,
  "centerLng": -78.5042
}'::jsonb),
('coverage_polygon', '{
  "polygon": [
    {"lat": -9.138, "lng": -78.504},
    {"lat": -9.143, "lng": -78.488},
    {"lat": -9.156, "lng": -78.485},
    {"lat": -9.17,  "lng": -78.49},
    {"lat": -9.172, "lng": -78.505},
    {"lat": -9.167, "lng": -78.521},
    {"lat": -9.153, "lng": -78.524},
    {"lat": -9.141, "lng": -78.519}
  ]
}'::jsonb),
('delivery_bands', '{
  "far": 2.5,
  "near": 2
}'::jsonb),
('fraud_coverage', '{
  "maxMonthlyCoverage": 200,
  "tindivoCoveragePercentage": 50
}'::jsonb),
('location_validation', '{
  "timeoutMs": 15000,
  "centerLat": -9.1547,
  "centerLng": -78.5042,
  "maxAccuracyM": 500,
  "normalRadiusKm": 10,
  "warningRadiusKm": 30
}'::jsonb),
('order_intake_cutoff', '"22:30"'::jsonb),
('platform_schedule', '{
  "days": ["tue", "wed", "thu", "fri", "sat"],
  "endHHMM": "23:00",
  "startHHMM": "18:00"
}'::jsonb),
('prepay_threshold', '80'::jsonb),
('strikes', '{
  "blockThreshold": 2,
  "temporaryBlockDays": 30,
  "prepaymentOnlyThreshold": 2,
  "temporaryBlockThreshold": 3
}'::jsonb),
('support_phone', '"+51987654321"'::jsonb),
('support_whatsapp', '"+51987654321"'::jsonb),
('terms_version', '"2026-05"'::jsonb),
('timers', '{
  "paymentMinutes": 10,
  "validationMinutes": 5,
  "acceptanceMinutes": 5,
  "noShowWaitMinutes": 5,
  "maxPrepExtensions": 2,
  "prepExtensionMinutes": 10,
  "cashAutoConfirmHours": 24,
  "proofValidationMinutes": 5,
  "prepayVerificationMinutes": 10
}'::jsonb),
('validation', '{
  "spikeMinimumOrdersPerHour": 6,
  "spikeMultiplier": 2,
  "spikeLookbackDays": 14,
  "amountThreshold": 80,
  "samePhoneThreshold": 3,
  "samePhoneWindowMinutes": 30,
  "nearbyAddressRadiusM": 200,
  "nearbyAddressThreshold": 3,
  "nearbyAddressWindowMinutes": 60,
  "newPhoneHighTicketAmount": 50,
  "newPhoneHighTicketThreshold": 3,
  "maxValidationRequestsPerDayPerBusiness": 3
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
