plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.tindivo.customer"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.tindivo.customer"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }
}
