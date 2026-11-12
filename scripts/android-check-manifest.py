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

# Permisos: INTERNET, ACCESS_NETWORK_STATE (permiso normal que pide play-services-maps; decisión de Jesús 2026-10-31),
# ubicación en tiempo de uso para «Usar mi ubicación» (decisión de Jesús 2026-11-12: se quiere la exacta; desde
# Android 12 la precisa solo se puede pedir junto con la aproximada, así que van las dos; nunca en segundo plano),
# el permiso de firma que androidx.core declara para sus receptores no exportados y los de los avisos (FCM, KT-10):
# POST_NOTIFICATIONS (Android 13+, se pide en tiempo de ejecución), WAKE_LOCK (permiso normal con el que FCM procesa un
# aviso) y c2dm RECEIVE (recibir mensajes de FCM).
allowed_permissions = {
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_COARSE_LOCATION",
    f"{app_id}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.WAKE_LOCK",
    "com.google.android.c2dm.permission.RECEIVE",
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
# Receptores de librerías que solo puede invocar el sistema o adb (permiso DUMP, nivel signature|privileged), y el de
# FCM, que solo puede invocar Google Play Services (c2dm SEND es un permiso de firma de Google).
system_guarded = {
    ("androidx.profileinstaller.ProfileInstallReceiver", "android.permission.DUMP"),
    ("com.google.firebase.iid.FirebaseInstanceIdReceiver", "com.google.android.c2dm.permission.SEND"),
}
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

# Filtros, aparte de la exportación y en TODOS los componentes, permitidos o no (CAX-007): la app no admite enlaces
# entrantes, así que ningún filtro puede tener VIEW, BROWSABLE ni <data>. Y el lanzador solo tiene MAIN + LAUNCHER.
for kind in ("activity", "activity-alias", "service", "receiver", "provider"):
    for c in app.iter(kind):
        name = c.get(f"{A}name")
        for f in c.iter("intent-filter"):
            actions = {a.get(f"{A}name") for a in f.iter("action")}
            cats = {x.get(f"{A}name") for x in f.iter("category")}
            if "android.intent.action.VIEW" in actions:
                errors.append(f"filtro con VIEW (enlace entrante) en {kind} {name}")
            if "android.intent.category.BROWSABLE" in cats:
                errors.append(f"filtro BROWSABLE en {kind} {name}")
            if f.find("data") is not None:
                errors.append(f"filtro con <data> en {kind} {name}")
            if kind == "activity" and name == launcher and (
                actions != {"android.intent.action.MAIN"} or cats != {"android.intent.category.LAUNCHER"}
            ):
                errors.append(f"el lanzador tiene un filtro distinto de MAIN + LAUNCHER: {sorted(actions | cats)}")

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
