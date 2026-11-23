package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.customer.R
import com.tindivo.customer.feature.profile.NAME_MAX
import com.tindivo.customer.feature.profile.cleanName
import com.tindivo.customer.feature.profile.nameProblem
import com.tindivo.customer.ui.fields.NameField

/**
 * El nombre con el que se hace este pedido, en una hoja como la de la dirección. El botón no se apaga: tocarlo con un
 * nombre que no vale enseña el error en el campo. Lo escrito sobrevive a girar la pantalla.
 */
@Composable
internal fun NameSheet(
    current: String,
    actions: CheckoutSheetActions,
) {
    var text by rememberSaveable { mutableStateOf(current) }
    var tried by rememberSaveable { mutableStateOf(false) }
    val valid = nameProblem(text) == null
    val save = {
        tried = true
        if (valid) actions.onNameSaved(cleanName(text))
    }
    SheetFrame(title = stringResource(R.string.checkout_sheet_name_title), onClose = actions.onClose) {
        ScrollingBody {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                NameField(
                    value = text,
                    onValueChange = { text = it },
                    label = stringResource(R.string.checkout_name_label),
                    error = stringResource(R.string.profile_name_error),
                    submitted = tried,
                    valid = valid,
                    maxLength = NAME_MAX,
                    imeAction = ImeAction.Done,
                    onImeAction = { save() },
                    autoFocus = true,
                )
                TindivoPrimaryButton(text = stringResource(R.string.checkout_sheet_name_save), onClick = save)
            }
        }
    }
}
