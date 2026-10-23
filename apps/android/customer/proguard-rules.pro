# kotlinx.serialization y OkHttp traen sus propias reglas de consumidor; aquí solo lo que necesita el modelo generado.
# Los serializadores de los modelos se resuelven por reflexión sobre la clase: sin estos atributos, R8 los pierde.
-keepattributes *Annotation*, InnerClasses, Signature, RuntimeVisibleAnnotations

# Los modelos generados de :core:network (y sus enums con serializador propio) no se renombran ni se podan.
-keep,includedescriptorclasses class com.tindivo.core.network.generated.model.** { *; }
-keepclassmembers class com.tindivo.core.network.generated.model.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
