import SwiftUI
import TindivoDesign

/// La hoja «Información» del negocio (CUS-CAT-027): el horario de los siete días, con hoy resaltado y «Cerrado» el día
/// sin turno (CUS-CAT-021), y cómo se recibe el pedido, solo como información (CUS-CAT-017). Sin contacto: ni llamar,
/// ni WhatsApp, ni teléfono (CUS-CAT-026). El mapa y la dirección de la ficha esperan a que la carta pública los traiga.
struct BusinessInfoSheet: View {
    let info: BusinessInfo
    let onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceGroup) {
                header
                schedule
                if !info.modes.isEmpty { modes }
                payments
            }
            .padding(TindivoTokens.Spacing.spaceScreen)
        }
        .background(Color.tindivo.background)
        .presentationDetents([.medium, .large])
        .presentationCornerRadius(TindivoTokens.Radius.radiusSheet)
        .accessibilityAction(.escape, onClose)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Información")
                    .tindivoText(TindivoTokens.Typography.titleScreen)
                    .foregroundStyle(Color.tindivo.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(info.name)
                    .tindivoText(TindivoTokens.Typography.body)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            TindivoIconButton(.close, label: "Cerrar", action: onClose)
                .accessibilityIdentifier("info.close")
        }
    }

    private var schedule: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Horarios")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .foregroundStyle(Color.tindivo.ink)
                .accessibilityAddTraits(.isHeader)
            if let status = info.status {
                Text(status)
                    .tindivoText(TindivoTokens.Typography.body)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    .accessibilityIdentifier("info.status")
            }
            VStack(spacing: 0) {
                ForEach(info.week) { row in
                    dayRow(row)
                }
            }
            .padding(.top, 8)
        }
    }

    private func dayRow(_ row: WeekScheduleRow) -> some View {
        let shifts = row.isClosed ? String(localized: "Cerrado") : row.shifts.joined(separator: " · ")
        return ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline) {
                dayName(row)
                Spacer(minLength: 8)
                shiftsText(shifts, row: row)
            }
            VStack(alignment: .leading, spacing: 2) {
                dayName(row)
                shiftsText(shifts, row: row)
            }
        }
        .padding(.horizontal, TindivoTokens.Spacing.spaceInner)
        .padding(.vertical, 10)
        .frame(minHeight: TindivoTokens.Spacing.touchTarget)
        .background(row.isToday ? Color.tindivo.primaryContainer : Color.clear, in: RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusThumb))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(row.isToday ? "info.day.today" : "info.day")
    }

    private func dayName(_ row: WeekScheduleRow) -> some View {
        HStack(spacing: 6) {
            Text(row.name)
                .tindivoText(TindivoTokens.Typography.body)
                .fontWeight(row.isToday ? .bold : .regular)
                .foregroundStyle(Color.tindivo.ink)
            if row.isToday {
                TindivoChip(String(localized: "hoy"))
            }
        }
    }

    private func shiftsText(_ text: String, row: WeekScheduleRow) -> some View {
        Text(text)
            .tindivoText(TindivoTokens.Typography.body)
            .monospacedDigit()
            .fontWeight(row.isToday ? .bold : .regular)
            // «Cerrado» es información: va en el color secundario, no atenuado.
            .foregroundStyle(row.isClosed ? Color.tindivo.inkSecondary : Color.tindivo.ink)
    }

    private var modes: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Cómo lo recibes")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .foregroundStyle(Color.tindivo.ink)
                .accessibilityAddTraits(.isHeader)
            ForEach(Array(info.modes.enumerated()), id: \.offset) { _, mode in
                modeRow(mode)
            }
        }
    }

    @ViewBuilder
    private func modeRow(_ mode: DeliveryMode) -> some View {
        switch mode {
        case let .delivery(eta):
            row(title: String(localized: "Delivery"), detail: eta)
        case .pickup:
            row(title: String(localized: "Recojo"), detail: String(localized: "En el local"))
        }
    }

    /// «Cómo pagas»: Yape, Plin y efectivo son información, no una opción de pago (decisión de Jesús, 2026-11-19).
    private var payments: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Cómo pagas")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .foregroundStyle(Color.tindivo.ink)
                .accessibilityAddTraits(.isHeader)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: 8, alignment: .leading)], alignment: .leading, spacing: 8) {
                TindivoChip(String(localized: "Yape"))
                TindivoChip(String(localized: "Plin"))
                TindivoChip(String(localized: "Efectivo"))
            }
            Text("Pagas directo al negocio. Tindivo no retiene tu dinero")
                .tindivoText(TindivoTokens.Typography.body)
                .foregroundStyle(Color.tindivo.inkSecondary)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("info.payments")
    }

    private func row(title: String, detail: String?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .tindivoText(TindivoTokens.Typography.body)
                .fontWeight(.bold)
                .foregroundStyle(Color.tindivo.ink)
            if let detail {
                Text(detail)
                    .tindivoText(TindivoTokens.Typography.body)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("info.mode")
    }
}

#if DEBUG
#Preview("Información del negocio") {
    let now = Date()
    BusinessInfoSheet(
        info: BusinessInfo(
            name: "Pollería Don Lucho",
            modes: [.delivery(eta: "25–40 min"), .pickup],
            week: weekSchedule(
                days: (1...5).map {
                    ScheduleDay(dayOfWeek: $0, isOpen: true, shift1Start: "18:00", shift1End: "23:00")
                },
                now: now
            ),
            status: "Abierto · cierra 23:00"
        ),
        onClose: {}
    )
    .onAppear { TindivoFonts.register() }
}
#endif
