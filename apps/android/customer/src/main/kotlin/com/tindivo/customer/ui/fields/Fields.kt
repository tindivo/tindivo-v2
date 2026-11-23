package com.tindivo.customer.ui.fields

import androidx.compose.runtime.Composable
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import com.tindivo.customer.R

/**
 * Celular de Perú: `+51` fijo (no se edita), solo dígitos con tope de 9 y el formato «987 654 321». El valor que entra
 * y sale es siempre de 9 dígitos sin espacios: un pegado con `+51` o espacios se normaliza aquí.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
internal fun PhoneField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String = stringResource(R.string.field_phone_label),
    enabled: Boolean = true,
    submitted: Boolean = false,
    serverError: String? = null,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
    focusRequester: FocusRequester? = null,
    autoFocus: Boolean = false,
) {
    val digits = normalizePePhoneInput(value)
    val ok = isValidPePhone(digits)
    TindivoTextField(
        value = digits,
        onValueChange = { onValueChange(normalizePePhoneInput(it)) },
        label = label,
        modifier = modifier,
        enabled = enabled,
        error = if (ok) null else stringResource(R.string.field_phone_error),
        submitted = submitted,
        immediateError = serverError,
        valid = ok,
        prefix = stringResource(R.string.field_phone_prefix),
        keyboardType = KeyboardType.Number,
        imeAction = imeAction,
        onImeAction = onImeAction,
        visualTransformation = PePhoneVisualTransformation,
        contentType = ContentType.PhoneNumber,
        focusRequester = focusRequester,
        autoFocus = autoFocus,
    )
}

/** Nombre de una persona: cada palabra empieza en mayúscula y el teclado ofrece el autocompletado de nombre. */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
internal fun NameField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String = stringResource(R.string.field_name_label),
    enabled: Boolean = true,
    error: String? = null,
    submitted: Boolean = false,
    valid: Boolean = false,
    maxLength: Int? = null,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
    focusRequester: FocusRequester? = null,
    autoFocus: Boolean = false,
) {
    TindivoTextField(
        value = value,
        onValueChange = onValueChange,
        label = label,
        modifier = modifier,
        enabled = enabled,
        error = error,
        submitted = submitted,
        valid = valid,
        maxLength = maxLength,
        capitalization = KeyboardCapitalization.Words,
        imeAction = imeAction,
        onImeAction = onImeAction,
        contentType = ContentType.PersonFullName,
        focusRequester = focusRequester,
        autoFocus = autoFocus,
    )
}

/**
 * Un monto en soles: prefijo «S/», teclado decimal y el valor como cadena decimal (nunca `Double`), con dos decimales
 * como mucho. Un monto es válido cuando es mayor que cero, salvo que quien lo usa diga otra cosa con [valid].
 */
@Composable
internal fun MoneyField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String = stringResource(R.string.field_money_label),
    enabled: Boolean = true,
    error: String? = null,
    submitted: Boolean = false,
    valid: Boolean = isValidMoney(value),
    imeAction: ImeAction = ImeAction.Done,
    onImeAction: (() -> Unit)? = null,
    focusRequester: FocusRequester? = null,
    autoFocus: Boolean = false,
) {
    TindivoTextField(
        value = value,
        onValueChange = { onValueChange(normalizeMoneyInput(it)) },
        label = label,
        modifier = modifier,
        enabled = enabled,
        error = error,
        submitted = submitted,
        valid = valid,
        prefix = stringResource(R.string.field_money_prefix),
        keyboardType = KeyboardType.Decimal,
        imeAction = imeAction,
        onImeAction = onImeAction,
        focusRequester = focusRequester,
        autoFocus = autoFocus,
    )
}

/** Calle y número (u otra línea corta de dirección): empieza cada oración en mayúscula. */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
internal fun AddressLineField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String,
    placeholder: String? = null,
    enabled: Boolean = true,
    error: String? = null,
    submitted: Boolean = false,
    valid: Boolean = false,
    maxLength: Int? = null,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
    focusRequester: FocusRequester? = null,
    autoFocus: Boolean = false,
) {
    TindivoTextField(
        value = value,
        onValueChange = onValueChange,
        label = label,
        modifier = modifier,
        enabled = enabled,
        error = error,
        submitted = submitted,
        valid = valid,
        placeholder = placeholder,
        maxLength = maxLength,
        capitalization = KeyboardCapitalization.Sentences,
        autoCorrect = true,
        imeAction = imeAction,
        onImeAction = onImeAction,
        contentType = ContentType.AddressStreet,
        focusRequester = focusRequester,
        autoFocus = autoFocus,
    )
}

/** Una nota o referencia de varias líneas. Con el contador desde el 80 % del límite. */
@Composable
internal fun NoteField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String,
    placeholder: String? = null,
    enabled: Boolean = true,
    error: String? = null,
    submitted: Boolean = false,
    valid: Boolean = false,
    maxLength: Int? = null,
    imeAction: ImeAction = ImeAction.Done,
    onImeAction: (() -> Unit)? = null,
    focusRequester: FocusRequester? = null,
    autoFocus: Boolean = false,
) {
    TindivoTextField(
        value = value,
        onValueChange = onValueChange,
        label = label,
        modifier = modifier,
        enabled = enabled,
        error = error,
        submitted = submitted,
        valid = valid,
        placeholder = placeholder,
        maxLength = maxLength,
        singleLine = false,
        minLines = NOTE_MIN_LINES,
        capitalization = KeyboardCapitalization.Sentences,
        autoCorrect = true,
        imeAction = imeAction,
        onImeAction = onImeAction,
        focusRequester = focusRequester,
        autoFocus = autoFocus,
    )
}

private const val NOTE_MIN_LINES = 2
