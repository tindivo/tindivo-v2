package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R

private val LOGO = 76.dp
private const val MARK_RATIO = 158f / 93f

/** Alto de la portada bajo la barra de estado (tablero «Negocio y carta»). */
internal val BANNER_HEIGHT = 208.dp

/** Etiqueta de pruebas del placeholder de la portada. */
internal const val BANNER_PLACEHOLDER_TAG = "business_banner_placeholder"

/** Alto de la barra superior sin contar la barra de estado. */
internal val TOP_BAR_HEIGHT = 56.dp

/**
 * La portada del negocio: foto de [BANNER_HEIGHT] más la barra de estado, que queda bajo ella (edge-to-edge). Sin
 * [url], o mientras la foto carga o si falla, se ve [BannerPlaceholder] en el mismo alto: nunca un hueco.
 */
@Composable
internal fun BusinessBanner(
    url: String?,
    name: String,
    modifier: Modifier = Modifier,
) {
    val statusBar = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    Box(modifier = modifier.fillMaxWidth().height(BANNER_HEIGHT + statusBar)) {
        BannerPlaceholder(name = name)
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/**
 * Portada sin foto: degradado de marca con dos círculos concéntricos muy tenues y la inicial del negocio. Sin
 * imágenes: todo sale de [TindivoColors] y de un `Canvas`.
 */
@Composable
internal fun BannerPlaceholder(
    name: String,
    modifier: Modifier = Modifier,
) {
    val initial =
        name
            .trim()
            .firstOrNull()
            ?.uppercaseChar()
            ?.toString()
            .orEmpty()
    Box(
        modifier =
            modifier
                .fillMaxSize()
                .testTag(BANNER_PLACEHOLDER_TAG)
                .background(Brush.linearGradient(TindivoColors.gradientCta))
                .drawBehind {
                    val ring = Color.White.copy(alpha = 0.10f)
                    val center = Offset(size.width * 0.85f, size.height * 0.2f)
                    drawCircle(ring, radius = size.height * 0.9f, center = center)
                    drawCircle(ring, radius = size.height * 0.55f, center = center)
                },
        contentAlignment = Alignment.Center,
    ) {
        if (initial.isNotEmpty()) {
            // Decorativa: el nombre se lee en la cabecera.
            Text(
                text = initial,
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Bold,
                color = Color.White.copy(alpha = 0.28f),
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

/**
 * Sube [by] el contenido sobre lo que tiene encima, sin dejar hueco debajo: la hoja de la cabecera monta sobre la
 * portada como en el tablero.
 */
internal fun Modifier.pullUp(by: Dp): Modifier =
    layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        val dy = by.roundToPx()
        layout(placeable.width, (placeable.height - dy).coerceAtLeast(0)) { placeable.place(0, -dy) }
    }

/**
 * La cabecera: logo redondo de 76 dp, nombre de 26 sp, el giro y, si está cerrado, la píldora «Cerrado ahora».
 * Con portada, la hoja blanca se monta sobre ella ([overlap] = alto que sube, contando el espacio entre filas).
 */
@Composable
internal fun BusinessHeader(
    business: BusinessDetailUi,
    closed: Boolean = false,
    overlap: Dp? = null,
) {
    val sheet =
        if (overlap != null) {
            Modifier
                .pullUp(overlap)
                .background(
                    MaterialTheme.colorScheme.surfaceContainerLowest,
                    RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                )
        } else {
            Modifier.padding(top = TindivoSpacing.tight)
        }
    Column(
        modifier = Modifier.fillMaxWidth().then(sheet).padding(horizontal = TindivoSpacing.screen),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        BusinessLogo(business, modifier = if (overlap != null) Modifier.pullUp(LOGO / 2) else Modifier)
        Text(
            text = business.name,
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = TindivoSpacing.tight).semantics { heading() },
        )
        business.tagline?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (!closed) {
            statusLine(business)?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
        if (closed) {
            Surface(
                shape = CircleShape,
                color = TindivoColors.warningContainer,
                contentColor = TindivoColors.onWarningContainer,
                modifier = Modifier.padding(top = 6.dp),
            ) {
                Text(
                    text = stringResource(R.string.business_closed_title),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                )
            }
        }
        // Debajo de la hoja con portada queda aire hasta la primera sección, como el tablero.
        if (overlap != null) Box(modifier = Modifier.size(TindivoSpacing.tight))
    }
}

/**
 * «Abierto · 25–35 min» bajo el nombre. Solo con lo que la carta ya trae: sin tiempo se omite ese trozo, y un negocio
 * en modo catálogo no dice «Abierto» (se pide por WhatsApp). La tarifa de delivery no llega en la carta (depende de la
 * dirección), así que no se muestra.
 */
@Composable
private fun statusLine(business: BusinessDetailUi): String? {
    val eta = business.etaLabel()?.let { stringResource(R.string.catalog_eta, it.first, it.second) }
    return statusParts(business, open = stringResource(R.string.catalog_open_now), eta = eta)
}

/** Une los trozos que existen con « · »; `null` si no hay ninguno. */
internal fun statusParts(
    business: BusinessDetailUi,
    open: String,
    eta: String?,
): String? =
    listOfNotNull(open.takeIf { !business.catalogOnly }, eta.takeIf { !business.catalogOnly })
        .takeIf { it.isNotEmpty() }
        ?.joinToString(" · ")

/** El rango de minutos si llegó entero y con sentido; si no, `null`. */
internal fun BusinessDetailUi.etaLabel(): Pair<Int, Int>? {
    val min = etaMin ?: return null
    val max = etaMax ?: return null
    return if (min in 1..max) min to max else null
}

/** El logo en un círculo con borde blanco y sombra; sin logo, el isotipo de Tindivo sobre crema. */
@Composable
private fun BusinessLogo(
    business: BusinessDetailUi,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .size(LOGO)
                .shadow(elevation = 6.dp, shape = CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer, CircleShape)
                .border(3.dp, Color.White, CircleShape)
                .clip(CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        // Decorativo a propósito: el nombre está al lado, y un contentDescription lo haría sonar dos veces.
        Image(
            bitmap = ImageBitmap.imageResource(R.drawable.ic_tindivo_isotipo),
            contentDescription = null,
            modifier = Modifier.width(38.dp).aspectRatio(MARK_RATIO),
        )
        business.logoUrl?.let {
            AsyncImage(
                model = it,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/** El título de una sección de la carta, de 18 sp, con cuántos productos tiene al lado. */
@Composable
internal fun CategoryHeader(category: MenuCategoryUi) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(
            modifier = Modifier.semantics(mergeDescendants = true) { heading() },
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(text = category.name, style = MaterialTheme.typography.titleLarge)
            Text(
                text =
                    pluralStringResource(
                        R.plurals.business_category_count,
                        category.items.size,
                        category.items.size,
                    ),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 2.dp),
            )
        }
        category.blurb?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
