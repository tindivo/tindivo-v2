package com.tindivo.customer.feature.reviews

import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Los pedidos cuya pregunta ya salió en esta sesión de la app. Los dos lugares que preguntan (el inicio y el
 * historial) tienen cada uno su `ReviewViewModel`; esta memoria, de proceso, evita que el segundo vuelva a preguntar lo
 * que el primero ya mostró y la persona descartó (el aviso al servidor sale detrás y puede no haber llegado).
 */
@Singleton
internal class ReviewPromptMemory
    @Inject
    constructor() {
        private val asked: MutableSet<UUID> = ConcurrentHashMap.newKeySet()

        fun wasAsked(orderId: UUID): Boolean = orderId in asked

        fun markAsked(orderId: UUID) {
            asked.add(orderId)
        }

        fun forget(orderId: UUID) {
            asked.remove(orderId)
        }
    }
