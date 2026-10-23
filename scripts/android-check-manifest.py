"""Comprueba la superficie del manifiesto FINAL de un APK (el fusionado con el de las librerías), no el fuente.

Uso: python3 scripts/android-check-manifest.py <manifiesto.xml> <applicationId>
     (el XML sale de `apkanalyzer manifest print <apk>`).

Falla (exit 1) si el APK pide un permiso fuera de la lista, exporta un componente que no sea el lanzador (salvo los
receptores de librerías protegidos por un permiso del sistema), admite tráfico en claro o copia de seguridad, o
declara enlaces entrantes (VIEW/BROWSABLE). Es la evidencia de la superficie del APK que pide la auditoría (CAX-006).
"""
import sys
import xml.etree.ElementTree as ET

A = "{http://schemas.android.com/apk/res/android}"

path, app_id = sys.argv[1], sys.argv[2]
root = ET.parse(path).getroot()
app = root.find("application")
errors: list[str] = []

# Permisos: INTERNET y el permiso de firma que androidx.core declara para sus receptores no exportados.
allowed_permissions = {
    "android.permission.INTERNET",
    f"{app_id}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
}
requested = {e.get(f"{A}name") for e in root.iter("uses-permission")}
requested |= {e.get(f"{A}name") for e in root.iter("uses-permission-sdk-23")}
for p in sorted(requested - allowed_permissions):
    errors.append(f"permiso no permitido: {p}")
for p in root.iter("permission"):
    name, level = p.get(f"{A}name"), p.get(f"{A}protectionLevel", "")
    if name != f"{app_id}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" or "signature" not in level and level != "0x2":
        errors.append(f"permiso declarado no permitido: {name} ({level})")

# Exportados: con minSdk 26, un componente sin `exported` pero con intent-filter cuenta como exportado.
launcher = f"{app_id.removesuffix('.dev')}.MainActivity"
# Receptores de librerías que solo puede invocar el sistema o adb (permiso DUMP, nivel signature|privileged).
system_guarded = {("androidx.profileinstaller.ProfileInstallReceiver", "android.permission.DUMP")}
exported_seen = []
for kind in ("activity", "activity-alias", "service", "receiver", "provider"):
    for c in app.iter(kind):
        name = c.get(f"{A}name")
        flag = c.get(f"{A}exported")
        has_filter = c.find("intent-filter") is not None
        exported = flag in ("true", "0xffffffff") or (flag is None and has_filter and kind != "provider")
        if not exported:
            continue
        exported_seen.append(f"{kind} {name}")
        if kind == "activity" and name == launcher:
            continue
        if (name, c.get(f"{A}permission")) in system_guarded:
            continue
        errors.append(f"componente exportado no permitido: {kind} {name} (permission={c.get(f'{A}permission')})")
        for f in c.iter("intent-filter"):
            actions = {a.get(f"{A}name") for a in f.iter("action")}
            if "android.intent.action.VIEW" in actions:
                errors.append(f"enlace entrante declarado en {name}")

for f in app.iter("intent-filter"):
    cats = {c.get(f"{A}name") for c in f.iter("category")}
    if "android.intent.category.BROWSABLE" in cats:
        errors.append("intent-filter BROWSABLE: la app no admite enlaces entrantes en este PR")

if app.get(f"{A}usesCleartextTraffic") not in ("false", "0x0"):
    errors.append(f"usesCleartextTraffic={app.get(f'{A}usesCleartextTraffic')} (debe ser false)")
if app.get(f"{A}allowBackup") not in ("false", "0x0"):
    errors.append(f"allowBackup={app.get(f'{A}allowBackup')} (debe ser false)")
if app.get(f"{A}networkSecurityConfig") is not None:
    errors.append("networkSecurityConfig presente: revisarlo antes de aceptarlo")

print("permisos pedidos:", ", ".join(sorted(requested)) or "(ninguno)")
print("componentes exportados:", "; ".join(exported_seen) or "(ninguno)")
print("usesCleartextTraffic:", app.get(f"{A}usesCleartextTraffic"), "· allowBackup:", app.get(f"{A}allowBackup"))
for e in errors:
    print("ERROR:", e)
sys.exit(1 if errors else 0)
