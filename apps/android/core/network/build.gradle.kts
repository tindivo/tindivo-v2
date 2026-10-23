import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.openapi.generator)
}

// El JDK local puede ser más nuevo que el 21 de la CI: se compila a bytecode 21 sin exigir ese toolchain.
java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_21)
    }
}

val generatedDir = layout.buildDirectory.dir("generated/openapi")

openApiGenerate {
    generatorName.set("kotlin")
    library.set("jvm-okhttp4")
    inputSpec.set(file("openapi/v1.json").path)
    outputDir.set(generatedDir)
    packageName.set("com.tindivo.core.network.generated")
    apiPackage.set("com.tindivo.core.network.generated.api")
    modelPackage.set("com.tindivo.core.network.generated.model")
    generateApiDocumentation.set(false)
    generateModelDocumentation.set(false)
    generateApiTests.set(false)
    generateModelTests.set(false)
    configOptions.set(
        mapOf(
            "serializationLibrary" to "kotlinx_serialization",
            "dateLibrary" to "string",
        ),
    )
    // CLI-2: cada enum lleva el caso de reserva `unknown_default_open_api`. Tiene que ir aquí y no en `configOptions`:
    // ahí el generador 7.25.0 lo ignora sin avisar (medido: 0 de 16 enums con el caso; aquí, todos).
    additionalProperties.set(mapOf("enumUnknownDefaultCase" to "true"))
    // `additionalProperties: {}` (objeto libre) sale como `Any`, que kotlinx.serialization no sabe leer: va como JsonElement.
    typeMappings.set(mapOf("AnyType" to "JsonElement"))
    importMappings.set(mapOf("JsonElement" to "kotlinx.serialization.json.JsonElement"))
}

sourceSets {
    main {
        kotlin.srcDir(generatedDir.map { it.dir("src/main/kotlin") })
    }
}

tasks.named("compileKotlin") {
    dependsOn("openApiGenerate")
}

// ktlint lee las fuentes del sourceSet, que incluye lo generado: que espere a que exista, aunque lo excluya.
tasks.matching { it.name.startsWith("runKtlint") }.configureEach {
    dependsOn("openApiGenerate")
}

dependencies {
    api(libs.okhttp)
    api(libs.kotlinx.serialization.json)
    api(libs.kotlinx.coroutines.core)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
}
