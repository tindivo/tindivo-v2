"""Informe del peso de descarga de la app Android (D-57): lee los CSV de `bundletool get-size total`, escribe una
tabla en markdown y compara con un techo opcional.

Uso: python3 scripts/android-size-report.py <budget.json> <informe.md> <todas.csv> <gama-baja.csv>

- <todas.csv>: salida de `get-size total --dimensions=ALL` (varias filas): se toma el mínimo de MIN y el máximo de MAX.
- <gama-baja.csv>: salida de `get-size total --device-spec=gama-baja.json` (una fila): se toma su MAX, el peor caso
  para ese perfil.
- <budget.json>: {"gama_baja_max_download_bytes": null | <entero positivo en bytes>}. `null` = sin techo (D-57: el
  techo se fija después de medir). Cualquier otra clave o tipo es un error.

Salida: tabla en $GITHUB_STEP_SUMMARY (si existe) y en <informe.md>. Exit 0 si no hay techo o se cumple; 1 si el techo
se excede; 2 si algo no se puede leer o no tiene el formato esperado (nunca se «aprueba» por no poder leer). Los
mensajes `::error::` solo llevan texto fijo y números calculados aquí: nada de lo leído de los archivos se interpola.
"""
import csv
import json
import os
import sys

BUDGET_KEY = "gama_baja_max_download_bytes"


class ReportError(Exception):
    """Error de lectura o formato; el mensaje es fijo y no incluye contenido externo."""


def read_range(path: str) -> tuple[int, int]:
    """Devuelve (mínimo de MIN, máximo de MAX) de un CSV de bundletool, en bytes."""
    try:
        with open(path, newline="", encoding="utf-8-sig") as handle:
            rows = [row for row in csv.reader(handle) if any(cell.strip() for cell in row)]
    except (OSError, UnicodeDecodeError, csv.Error) as exc:
        raise ReportError("no se pudo leer un CSV de bundletool") from exc
    if len(rows) < 2:
        raise ReportError("un CSV de bundletool no trae cabecera y al menos una fila")
    header = [cell.strip().upper() for cell in rows[0]]
    if header.count("MIN") != 1 or header.count("MAX") != 1:
        raise ReportError("la cabecera de un CSV de bundletool no tiene las columnas MIN y MAX")
    i_min, i_max = header.index("MIN"), header.index("MAX")
    mins, maxs = [], []
    for row in rows[1:]:
        if len(row) != len(header):
            raise ReportError("una fila de un CSV de bundletool no coincide con su cabecera")
        try:
            low, high = int(row[i_min].strip()), int(row[i_max].strip())
        except ValueError as exc:
            raise ReportError("un MIN o MAX de un CSV de bundletool no es un entero en bytes") from exc
        if low < 0 or high < low:
            raise ReportError("un MIN o MAX de un CSV de bundletool es negativo o MAX < MIN")
        mins.append(low)
        maxs.append(high)
    return min(mins), max(maxs)


def read_budget(path: str) -> int | None:
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, UnicodeDecodeError, ValueError) as exc:
        raise ReportError("no se pudo leer budget.json como JSON") from exc
    if not isinstance(data, dict) or set(data) != {BUDGET_KEY}:
        raise ReportError(f"budget.json debe ser un objeto con la única clave {BUDGET_KEY}")
    value = data[BUDGET_KEY]
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ReportError(f"{BUDGET_KEY} debe ser null o un entero positivo de bytes")
    return value


def mb(size: int) -> str:
    return f"{size / 1_000_000:.2f}"


def build_table(all_range: tuple[int, int], low_range: tuple[int, int], budget: int | None) -> str:
    perfil = "Gama baja (API 26, arm64-v8a y armeabi-v7a, 320 dpi, es)"
    lines = [
        "## Peso de descarga del AAB prodRelease (D-57)",
        "",
        "| Medida | Bytes | MB |",
        "|---|---:|---:|",
        f"| Mínimo en todas las configuraciones | {all_range[0]} | {mb(all_range[0])} |",
        f"| Máximo en todas las configuraciones | {all_range[1]} | {mb(all_range[1])} |",
        f"| {perfil}: mínimo | {low_range[0]} | {mb(low_range[0])} |",
        f"| {perfil}: máximo | {low_range[1]} | {mb(low_range[1])} |",
    ]
    if budget is None:
        lines.append("| Techo de gama baja | sin techo | sin techo |")
    else:
        lines.append(f"| Techo de gama baja | {budget} | {mb(budget)} |")
    lines += ["", "1 MB = 1.000.000 bytes. El máximo es el peor caso de descarga de ese perfil.", ""]
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        print("::error::uso: android-size-report.py <budget.json> <informe.md> <todas.csv> <gama-baja.csv>")
        return 2
    budget_path, report_path, all_csv, low_csv = argv[1:]
    try:
        budget = read_budget(budget_path)
        all_range = read_range(all_csv)
        low_range = read_range(low_csv)
        table = build_table(all_range, low_range, budget)
        with open(report_path, "w", encoding="utf-8") as handle:
            handle.write(table)
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as handle:
                handle.write(table + "\n")
    except ReportError as exc:
        print(f"::error::D-57: {exc}")
        return 2
    except OSError:
        print("::error::D-57: no se pudo escribir el informe de tamaño")
        return 2
    print(table)
    low_max = low_range[1]
    if budget is None:
        print("::notice::D-57: no hay techo de peso definido (budget.json); se fija después de medir. Solo se informa.")
        return 0
    if low_max > budget:
        print(f"::error::D-57: la descarga máxima en gama baja ({low_max} bytes) supera el techo ({budget} bytes)")
        return 1
    print(f"::notice::D-57: gama baja {low_max} bytes, dentro del techo de {budget} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
