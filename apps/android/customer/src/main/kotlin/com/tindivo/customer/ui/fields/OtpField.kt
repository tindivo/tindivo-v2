package com.tindivo.customer.ui.fields

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/** Dígitos del código que llega por SMS. */
internal const val OTP_LENGTH = 6
private const val SECONDS_PER_MINUTE = 60

/** Lo que queda en el campo del código tras cada tecla o pegado: solo dígitos y nunca más de [length]. */
internal fun normalizeOtpInput(
    raw: String,
    length: Int = OTP_LENGTH,
): String = raw.filter { it in '0'..'9' }.take(length)

/** Lo que dice cada una de las [length] casillas: su dígito, o vacío si todavía no se escribe. */
internal fun otpCells(
    value: String,
    length: Int = OTP_LENGTH,
): List<String> = List(length) { value.getOrNull(it)?.toString().orEmpty() }

/** «0:42»: los segundos que faltan para poder reenviar el código. */
internal fun resendClock(seconds: Int): String {
    val left = seconds.coerceAtLeast(0)
    return "${left / SECONDS_PER_MINUTE}:${(left % SECONDS_PER_MINUTE).toString().padStart(2, '0')}"
}

/**
 * El código del SMS en casillas: un solo campo de texto real (para el teclado numérico, el pegado y el autocompletado
 * del SMS con [ContentType.SmsOtpCode]) dibujado como [length] casillas de 56 dp de alto. Pegar un código completo, con
 * espacios o guiones, lo deja en sus dígitos. [progress] es lo que lee TalkBack junto con los dígitos escritos («Código
 * de 6 dígitos, 3 escritos»); las casillas no dicen nada por su cuenta, para que no se lean una a una.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
internal fun OtpCodeField(
    value: String,
    onValueChange: (String) -> Unit,
    progress: String,
    modifier: Modifier = Modifier,
    length: Int = OTP_LENGTH,
    enabled: Boolean = true,
    isError: Boolean = false,
    autoFocus: Boolean = true,
) {
    val requester = remember { FocusRequester() }
    var focused by remember { mutableStateOf(false) }
    if (autoFocus) LaunchedEffect(Unit) { requester.requestFocus() }
    val cells = otpCells(value, length)
    BasicTextField(
        value = value,
        onValueChange = { onValueChange(normalizeOtpInput(it, length)) },
        enabled = enabled,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
        cursorBrush = SolidColor(Color.Transparent),
        modifier =
            modifier
                .fillMaxWidth()
                .focusRequester(requester)
                .onFocusChanged { focused = it.isFocused }
                .semantics {
                    contentType = ContentType.SmsOtpCode
                    stateDescription = progress
                },
        decorationBox = { inner ->
            // El campo real queda invisible y casi sin tamaño; las casillas son solo su dibujo.
            Box(modifier = Modifier.size(1.dp).alpha(0f)) { inner() }
            Row(
                modifier =
                    Modifier
                        .clearAndSetSemantics {}
                        .fillMaxWidth()
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                            requester.requestFocus()
                        },
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            ) {
                cells.forEachIndexed { index, digit ->
                    OtpCell(
                        digit = digit,
                        active = focused && index == value.length.coerceAtMost(length - 1),
                        isError = isError,
                    )
                }
            }
        },
    )
}

@Composable
private fun RowScope.OtpCell(
    digit: String,
    active: Boolean,
    isError: Boolean,
) {
    val scheme = MaterialTheme.colorScheme
    val border =
        when {
            isError -> BorderStroke(2.dp, scheme.error)
            active -> BorderStroke(2.dp, scheme.primary)
            else -> BorderStroke(1.dp, scheme.outline)
        }
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = scheme.surfaceContainerLowest,
        border = border,
        modifier = Modifier.weight(1f, fill = false).widthIn(min = 40.dp, max = 52.dp).height(FieldHeight),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(text = digit, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        }
    }
}
