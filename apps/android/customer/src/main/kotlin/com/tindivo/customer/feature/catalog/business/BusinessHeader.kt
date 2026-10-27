package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage

@Composable
internal fun BusinessHeader(business: BusinessDetailUi) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BusinessLogo(business)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = business.name,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            business.tagline?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun BusinessLogo(business: BusinessDetailUi) {
    val logoModifier = Modifier.size(56.dp).clip(RoundedCornerShape(12.dp))
    if (business.logoUrl != null) {
        // Decorativo a propósito: el nombre está al lado, y un contentDescription lo haría sonar dos veces.
        AsyncImage(
            model = business.logoUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = logoModifier,
        )
    } else {
        val accent = business.accent?.let { Color(it) } ?: MaterialTheme.colorScheme.primary
        Box(modifier = logoModifier.background(accent), contentAlignment = Alignment.Center) {
            Text(
                text =
                    business.name
                        .trim()
                        .firstOrNull()
                        ?.uppercase() ?: "T",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}

@Composable
internal fun CategoryHeader(category: MenuCategoryUi) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = category.name,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.semantics { heading() },
        )
        category.blurb?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
