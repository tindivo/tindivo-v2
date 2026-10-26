package com.tindivo.customer.feature.orders

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val SHORT_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", Locale.forLanguageTag("es-PE"))

/** La fecha de un pedido de hace 30 días o más, como la web: `d MMM` en es-PE («15 oct.»). */
internal fun shortDateText(date: LocalDate): String = SHORT_DATE.format(date)
