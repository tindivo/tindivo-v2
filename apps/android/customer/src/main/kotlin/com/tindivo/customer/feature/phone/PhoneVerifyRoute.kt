package com.tindivo.customer.feature.phone

import kotlinx.serialization.Serializable

/** Verificar o cambiar el teléfono por SMS. Se llega desde la cuenta: hace falta sesión. */
@Serializable
data object PhoneVerifyRoute

/** Clave con la que el flujo avisa a la cuenta que el número cambió (solo un booleano, nada sensible). */
const val PHONE_CHANGED_KEY = "phone_changed"
