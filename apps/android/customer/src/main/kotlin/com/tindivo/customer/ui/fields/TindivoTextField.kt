package com.tindivo.customer.ui.fields

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.customer.R

/** Alto de todo campo de texto: 56 dp, el mismo que el botón principal. */
internal val FieldHeight: Dp = 56.dp

/**
 * El campo de texto de la app: etiqueta siempre visible, 56 dp, el error debajo y un check verde cuando es válido.
 *
 * Reglas (auditoría UX, sección 3):
 * - [error] es la validación: solo se ve cuando la persona sale del campo o intenta enviar ([submitted]); nunca
 *   mientras escribe.
 * - [immediateError] (por ejemplo, lo que respondió el servidor) se ve de inmediato.
 * - [valid] pinta el check verde.
 * - El contador de [maxLength] solo aparece desde el 80 % del límite.
 * - [focusRequester] deja que quien guarda lleve el foco al campo que falta; [autoFocus] lo pide al aparecer.
 * - [onImeAction] es lo que hace la tecla del teclado; sin él, Next pasa al campo siguiente y Done cierra el teclado.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
internal fun TindivoTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    error: String? = null,
    submitted: Boolean = false,
    immediateError: String? = null,
    valid: Boolean = false,
    prefix: String? = null,
    placeholder: String? = null,
    maxLength: Int? = null,
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboardType: KeyboardType = KeyboardType.Text,
    capitalization: KeyboardCapitalization = KeyboardCapitalization.None,
    autoCorrect: Boolean = false,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    contentType: ContentType? = null,
    focusRequester: FocusRequester? = null,
    autoFocus: Boolean = false,
) {
    var touched by rememberSaveable { mutableStateOf(false) }
    var hadFocus by remember { mutableStateOf(false) }
    val requester = focusRequester ?: remember { FocusRequester() }
    if (autoFocus) LaunchedEffect(Unit) { requester.requestFocus() }
    val shownError = immediateError ?: error?.takeIf { shouldShowError(error, touched, submitted) }
    val counter = maxLength?.takeIf { showsCounter(value.length, it) }
    OutlinedTextField(
        value = value,
        onValueChange = { onValueChange(if (maxLength != null) it.take(maxLength) else it) },
        enabled = enabled,
        singleLine = singleLine,
        minLines = minLines,
        label = { Text(text = label) },
        placeholder = placeholder?.let { { Text(text = it) } },
        prefix = prefix?.let { { Text(text = it) } },
        trailingIcon = if (valid && shownError == null && value.isNotEmpty()) ValidCheck else null,
        isError = shownError != null,
        supportingText = supporting(shownError, counter, value.length, maxLength),
        visualTransformation = visualTransformation,
        keyboardOptions =
            KeyboardOptions(
                capitalization = capitalization,
                autoCorrectEnabled = autoCorrect,
                keyboardType = keyboardType,
                imeAction = imeAction,
            ),
        keyboardActions =
            if (onImeAction == null) {
                KeyboardActions.Default
            } else {
                KeyboardActions(
                    onNext = { onImeAction() },
                    onDone = { onImeAction() },
                    onGo = { onImeAction() },
                    onSend = { onImeAction() },
                )
            },
        modifier =
            modifier
                .fillMaxWidth()
                .heightIn(min = FieldHeight)
                .focusRequester(requester)
                .onFocusChanged {
                    if (it.isFocused) {
                        hadFocus = true
                    } else if (hadFocus) {
                        touched = true
                    }
                }.let { base ->
                    if (contentType == null) base else base.semantics { this.contentType = contentType }
                },
    )
}

private val ValidCheck: @Composable () -> Unit = {
    Icon(imageVector = TindivoIcons.Check, contentDescription = null, tint = TindivoColors.success)
}

private fun supporting(
    error: String?,
    counter: Int?,
    length: Int,
    max: Int?,
): (@Composable () -> Unit)? {
    if (error == null && counter == null) return null
    return {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(modifier = Modifier.weight(1f)) {
                if (error !=
                    null
                ) {
                    Text(text = error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                }
            }
            if (counter != null && max != null) {
                Text(
                    text = stringResource(R.string.field_counter, length, max),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
