package com.tindivo.customer.feature.store

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R

/**
 * La galería del detalle (como la web): deslizable, con «1/N» y la foto COMPLETA, sin recorte, sobre fondo neutro.
 * Tocar una foto abre el visor a pantalla completa en esa misma foto.
 */
@Composable
internal fun StoreGallery(
    images: List<StoreImageUi>,
    title: String,
    badge: StoreBadgeUi?,
) {
    var viewerStart by rememberSaveable { mutableStateOf<Int?>(null) }
    val pager = rememberPagerState(pageCount = { images.size })
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
            val openLabel = stringResource(R.string.store_gallery_open, page + 1, images.size)
            AsyncImage(
                model = images[page].url,
                contentDescription = photoDescription(title, page, images.size),
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize().clickable(onClickLabel = openLabel) { viewerStart = page },
            )
        }
        badge?.let { StoreBadge(it, Modifier.align(Alignment.TopStart).padding(TindivoSpacing.item)) }
        if (images.size > 1) {
            PageCounter(pager, images.size, Modifier.align(Alignment.BottomEnd).padding(TindivoSpacing.item))
        }
    }
    viewerStart?.let { start ->
        StorePhotoViewer(images = images, title = title, start = start, onClose = { viewerStart = null })
    }
}

@Composable
private fun photoDescription(
    title: String,
    page: Int,
    total: Int,
): String = if (page == 0) title else stringResource(R.string.store_gallery_photo, title, page + 1, total)

@Composable
private fun PageCounter(
    pager: PagerState,
    total: Int,
    modifier: Modifier,
) {
    Surface(
        shape = CircleShape,
        color = Color.Black.copy(alpha = 0.6f),
        contentColor = Color.White,
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Text(
            text = stringResource(R.string.store_gallery_counter, pager.currentPage + 1, total),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = TindivoSpacing.tight, vertical = TindivoSpacing.hairline),
        )
    }
}

/** El visor a pantalla completa: fondo negro, deslizar para cambiar, contador y cerrar. */
@Composable
private fun StorePhotoViewer(
    images: List<StoreImageUi>,
    title: String,
    start: Int,
    onClose: () -> Unit,
) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val pager = rememberPagerState(initialPage = start, pageCount = { images.size })
        Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                AsyncImage(
                    model = images[page].url,
                    contentDescription = photoDescription(title, page, images.size),
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            IconButton(
                onClick = onClose,
                modifier =
                    Modifier
                        .align(Alignment.TopEnd)
                        .safeDrawingPadding()
                        .padding(TindivoSpacing.tight)
                        .size(TindivoSpacing.touchTarget),
            ) {
                Icon(
                    TindivoIcons.Close,
                    contentDescription = stringResource(R.string.store_viewer_close),
                    tint = Color.White,
                )
            }
            if (images.size > 1) {
                PageCounter(
                    pager,
                    images.size,
                    Modifier.align(Alignment.BottomCenter).safeDrawingPadding().padding(TindivoSpacing.screen),
                )
            }
        }
    }
}
