package com.tindivo.customer.session

/** [SessionFile] en memoria para las pruebas que no necesitan cifrado. */
internal class InMemorySessionFile : SessionFile {
    var plain: String? = null

    override fun read(): String? = plain

    override fun write(plain: String) {
        this.plain = plain
    }

    override fun delete() {
        plain = null
    }
}
