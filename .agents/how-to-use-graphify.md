# Guía de Uso de Graphify (Tindivo Project)

Esta guía explica cómo utilizar Graphify en este proyecto para explorar la arquitectura, consultar relaciones entre componentes y entender las distintas funcionalidades del sistema.

---

## 🛠️ Configuración y Generación del Grafo

### 1. Variables de Entorno y API Key
Para realizar la extracción semántica de la documentación e imágenes, Graphify utiliza **DeepSeek** como motor de lenguaje. La API Key se configuró de dos formas para que esté siempre disponible:

*   **Permanente a nivel de usuario en Windows:** Se registró directamente en el sistema mediante PowerShell:
    ```powershell
    [System.Environment]::SetEnvironmentVariable('DEEPSEEK_API_KEY', 'sk-c0d.....', 'User')
    [System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', 'sk-c0d.....', 'User')
    ```
*   **En tu perfil de PowerShell:** Añadida a `$PROFILE` ([Microsoft.PowerShell_profile.ps1](file:///C:/Users/Jesus/Documents/WindowsPowerShell/Microsoft.PowerShell_profile.ps1)) para cargar automáticamente estas y otras variables al abrir cualquier terminal.

### 2. Cómo se Generó el Grafo
El grafo se construyó usando `uv` para administrar Python 3.13 de forma aislada sin requerir privilegios de administrador. Además, instalamos los extras `openai` y `anthropic` necesarios para interactuar con DeepSeek y etiquetar comunidades:
```powershell
uv tool install "graphifyy[openai,anthropic]" --python 3.13 --force
```

La extracción inicial se corrió con:
```powershell
graphify . --backend deepseek
graphify cluster-only .
```

---

## 🔍 ¿Qué puedes hacer con Graphify?

### 1. Mostrar la relación entre dos partes del proyecto (`graphify path`)
¿Quieres saber cómo se conecta una vista con el cliente de base de datos o el backend? Puedes trazar el camino más corto entre dos componentes y ver cada salto intermedio.

*   **Ejemplo de comando:**
    ```powershell
    graphify path "orders/page.tsx" "supabase/client.ts"
    ```
    *Esto te devolverá la cadena exacta de llamadas, importaciones o referencias que unen ambos archivos.*

### 2. Explicar una funcionalidad o componente (`graphify explain` / `query`)
Puedes obtener explicaciones contextuales de cualquier concepto del sistema o hacer preguntas complejas de arquitectura en lenguaje natural.

*   **Explicar un componente específico:**
    ```powershell
    graphify explain "PushManager"
    ```
*   **Preguntar sobre flujos del proyecto:**
    ```powershell
    graphify query "¿Cómo funciona el sistema de cobros y liquidaciones de motorizados?"
    ```
    *Esto consultará el archivo `graph.json` y generará un subgrafo relevante con la respuesta estructurada sin necesidad de buscar manualmente con `grep`.*

---

## 📊 Previsualización del Grafo
No necesitas ninguna extensión para visualizar tu base de código mapeada:

1.  Abre tu terminal en la raíz del proyecto.
2.  Ejecuta:
    ```powershell
    Start-Process .\graphify-out\graph.html
    ```
3.  Se abrirá un mapa de red en 3D/2D interactivo en tu navegador web por defecto. Puedes hacer clic en los nodos, ver sus conexiones inmediatas, buscar símbolos y filtrar por comunidades.

---

## 🔄 Actualización
Cuando realices cambios en el código o agregues nuevos archivos de diseño/documentación, puedes sincronizar el grafo de forma incremental ejecutando:
```powershell
graphify update .
```
*(Para hacerlo automático tras cada commit, instala los hooks con `graphify hook install`).*
