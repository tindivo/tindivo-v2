package com.tindivo.customer.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R

/** Alto de la barra inferior (v3.1: 80 dp), sin contar la barra de gestos del sistema. */
private val BAR_HEIGHT = 80.dp
private val PILL_WIDTH = 56.dp
private val PILL_HEIGHT = 32.dp

private fun RootTab.label(): Int =
    when (this) {
        RootTab.Home -> R.string.nav_home
        RootTab.Courier -> R.string.nav_courier
        RootTab.Orders -> R.string.nav_orders
        RootTab.Account -> R.string.nav_account
    }

private fun RootTab.icon(): ImageVector =
    when (this) {
        RootTab.Home -> TindivoIcons.Home
        RootTab.Courier -> TindivoIcons.LocalShipping
        RootTab.Orders -> TindivoIcons.Receipt
        RootTab.Account -> TindivoIcons.Person
    }

/**
 * La barra inferior fija de las cuatro pestañas raíz. La activa va en naranja de texto (`#C2410C`) sobre la píldora
 * `primaryContainer` (`#FFF7ED`); cada pestaña es un toque de 48 dp como mínimo y TalkBack la lee como pestaña
 * seleccionada o no. El punto de «pedido en curso» sobre Pedidos queda fuera: la app no tiene todavía un dato local
 * que diga si hay uno (habría que consultarlo a la API).
 */
@Composable
internal fun BottomTabBar(
    selected: RootTab,
    onSelect: (RootTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shadowElevation = 8.dp,
    ) {
        Row(
            modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars).height(BAR_HEIGHT),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RootTab.entries.forEach { tab ->
                TabItem(
                    tab = tab,
                    selected = tab == selected,
                    onClick = { onSelect(tab) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TabItem(
    tab: RootTab,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = if (selected) TindivoColors.brandText else MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        modifier =
            modifier
                .heightIn(min = TindivoSpacing.touchTarget)
                .selectable(selected = selected, onClick = onClick, role = Role.Tab),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier =
                Modifier
                    .width(PILL_WIDTH)
                    .height(PILL_HEIGHT)
                    .clip(CircleShape)
                    .background(
                        if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                    ),
            contentAlignment = Alignment.Center,
        ) {
            // Decorativo: el texto de abajo ya nombra la pestaña.
            Icon(imageVector = tab.icon(), contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
        }
        Text(
            text = stringResource(tab.label()),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
            color = tint,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}
