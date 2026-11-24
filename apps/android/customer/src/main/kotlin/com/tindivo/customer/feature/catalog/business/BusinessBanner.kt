package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoColors

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
        // Velo oscuro bajo la barra de estado: sus iconos son claros mientras la portada está a la vista.
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(statusBar + 24.dp)
                    .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.45f), Color.Transparent))),
        )
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
            .firstOrNull { it.isLetterOrDigit() }
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
