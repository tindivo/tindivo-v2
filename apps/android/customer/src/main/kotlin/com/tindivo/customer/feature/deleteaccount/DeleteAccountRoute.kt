package com.tindivo.customer.feature.deleteaccount

import kotlinx.serialization.Serializable

/** La pantalla «Borrar mi cuenta». */
@Serializable
data object DeleteAccountRoute

/** La portada lo recibe en su `SavedStateHandle` cuando se llega a ella tras borrar la cuenta. No lleva datos. */
const val ACCOUNT_DELETED_KEY = "account_deleted"
