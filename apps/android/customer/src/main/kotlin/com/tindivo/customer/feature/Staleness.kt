package com.tindivo.customer.feature

import java.time.Duration
import java.time.Instant

private const val STALE_AFTER_SECONDS = 30L

/** Pasado este tiempo desde la última carga buena, una pestaña que se vuelve a ver recarga en silencio. */
internal val STALE_AFTER: Duration = Duration.ofSeconds(STALE_AFTER_SECONDS)

/** `true` si nunca se cargó bien o la última carga buena tiene [STALE_AFTER] o más. */
internal fun isStale(
    loadedAt: Instant?,
    now: Instant,
): Boolean = loadedAt == null || Duration.between(loadedAt, now) >= STALE_AFTER
