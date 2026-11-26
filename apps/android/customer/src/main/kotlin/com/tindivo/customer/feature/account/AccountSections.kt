package com.tindivo.customer.feature.account

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.R
import com.tindivo.customer.support.arcoRightsLink
import com.tindivo.customer.support.generalHelpLink
import com.tindivo.customer.support.openSafely
import com.tindivo.customer.support.privacyUrl
import com.tindivo.customer.support.termsUrl

private val AVATAR = 56.dp
private val ROW_ICON = 22.dp

/** La inicial del avatar: la primera letra del nombre, o nada si el nombre viene vacío. */
internal fun initialOf(name: String): String =
    name
        .trim()
        .firstOrNull()
        ?.uppercaseChar()
        ?.toString()
        .orEmpty()

/**
 * La cabecera del perfil (tablero «9 · Cuenta»): avatar con la inicial, nombre, teléfono con la píldora «Verificado» y
 * el botón «Editar» de 48 dp de alto para cambiar el nombre. El correo de Google del tablero no está: la cuenta no lo trae todavía.
 */
@Composable
internal fun ProfileCard(
    profile: AccountProfileUi,
    onEditName: () -> Unit,
    onVerifyPhone: () -> Unit,
) {
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(TindivoSpacing.screen),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier.size(AVATAR).background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = initialOf(profile.fullName),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = profile.fullName,
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                PhoneLine(profile)
            }
            // «Editar» en texto, no un lápiz solo; para el lector de pantalla sigue diciendo qué se edita.
            val editDescription = stringResource(R.string.account_name_edit)
            TextButton(
                onClick = onEditName,
                modifier =
                    Modifier
                        .heightIn(min = TindivoSpacing.touchTarget)
                        .semantics { contentDescription = editDescription },
            ) {
                Text(
                    text = stringResource(R.string.account_edit),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = TindivoColors.brandText,
                )
            }
        }
        HorizontalDivider(color = TindivoColors.border)
        SettingsRow(
            label =
                stringResource(
                    if (profile.phoneVerified) R.string.account_phone_change else R.string.account_phone_verify,
                ),
            onClick = onVerifyPhone,
        )
    }
}

/** El número y la píldora van en la misma línea si caben; si no, la píldora baja entera (nunca se parte). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PhoneLine(profile: AccountProfileUi) {
    if (profile.phoneVerified && profile.phone != null) {
        FlowRow(
            modifier = Modifier.padding(top = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = profile.phone, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.tertiaryContainer,
                contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(TindivoIcons.Check, contentDescription = null, modifier = Modifier.size(12.dp))
                    Text(
                        text = stringResource(R.string.account_verified),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }
        }
    } else {
        Text(
            text = stringResource(R.string.account_phone_missing),
            style = MaterialTheme.typography.bodySmall,
            color = TindivoColors.onWarningContainer,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

/**
 * Ayuda y legal (CUS-SUP-001/002/003), en una tarjeta con divisores. Todo lo que sale de la app lleva
 * la flecha de «abrir fuera».
 */
@Composable
internal fun SettingsCard(supportNumber: String) {
    val uriHandler = LocalUriHandler.current
    val open: (String) -> Unit = uriHandler::openSafely
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.account_help_title),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp).semantics { heading() },
        )
        SettingsRow(stringResource(R.string.account_help_whatsapp), TindivoIcons.Chat, external = true) {
            open(generalHelpLink(supportNumber))
        }
        Divider()
        SettingsRow(stringResource(R.string.account_terms), TindivoIcons.Description, external = true) {
            open(termsUrl(BuildConfig.WEB_BASE_URL))
        }
        Divider()
        SettingsRow(stringResource(R.string.account_privacy), TindivoIcons.Shield, external = true) {
            open(privacyUrl(BuildConfig.WEB_BASE_URL))
        }
        Divider()
        SettingsRow(stringResource(R.string.account_arco), TindivoIcons.Person, external = true) {
            open(arcoRightsLink(supportNumber))
        }
    }
}

/** «Cerrar sesión» como fila propia al final de Cuenta, aparte de la ayuda y lo legal. */
@Composable
internal fun SignOutCard(onSignOut: () -> Unit) {
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        SettingsRow(
            stringResource(R.string.account_sign_out),
            TindivoIcons.Logout,
            chevron = false,
            onClick = onSignOut,
        )
    }
}

/** Divisor con sangría hasta el texto (52 dp), como el tablero. */
@Composable
private fun Divider() {
    HorizontalDivider(modifier = Modifier.padding(start = 52.dp), color = TindivoColors.border)
}

/** Una fila de 56 dp: icono, texto y, al final, chevron o «abrir fuera». Toda la fila es el botón. */
@Composable
private fun SettingsRow(
    label: String,
    icon: ImageVector? = null,
    external: Boolean = false,
    chevron: Boolean = true,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .clickable(onClick = onClick, role = Role.Button)
                .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (icon != null) {
            Icon(
                icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(ROW_ICON),
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
        )
        if (chevron) {
            Icon(
                imageVector = if (external) TindivoIcons.OpenInNew else TindivoIcons.ChevronRight,
                contentDescription = null,
                tint = TindivoColors.textMuted,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/** «Borrar mi cuenta» en rojo, discreto pero siempre a la vista (Google Play lo exige), y la versión de la app. */
@Composable
internal fun AccountFooter(
    onDeleteAccount: () -> Unit,
    onOpenDiagnostics: (() -> Unit)? = null,
) {
    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        TextButton(onClick = onDeleteAccount, modifier = Modifier.heightIn(min = TindivoSpacing.touchTarget)) {
            Text(
                text = stringResource(R.string.account_delete),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onErrorContainer,
            )
        }
        Text(
            text = stringResource(R.string.account_version, BuildConfig.VERSION_NAME),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        // Herramienta de desarrollo: solo llega aquí en builds DEBUG (en release es null).
        onOpenDiagnostics?.let {
            TextButton(onClick = it, modifier = Modifier.heightIn(min = TindivoSpacing.touchTarget)) {
                Text(
                    text = stringResource(R.string.diagnostics_title),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
