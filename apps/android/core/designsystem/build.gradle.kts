plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.tindivo.core.designsystem"
    // KT-1: compileSdk ≥ targetSdk. Compose 1.12, core 1.19 y lifecycle 2.11 exigen compilar contra la API 37.
    compileSdk = 37

    defaultConfig {
        minSdk = 26
    }

    // Mismo bytecode que :core:network (21), que consume la app: así todos los módulos comparten objetivo.
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildFeatures {
        compose = true
    }

    lint {
        abortOnError = true
        checkDependencies = true
    }
}

dependencies {
    // El BOM fija las versiones de todas las librerías de Compose.
    api(platform(libs.androidx.compose.bom))
    api(libs.androidx.compose.material3)
    api(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
