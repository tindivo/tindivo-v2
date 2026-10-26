package com.tindivo.customer.feature.orders

import com.tindivo.customer.R

// Qué texto lleva cada caso: los literales de la web viven en strings.xml, aquí solo se elige cuál.

internal fun OrderHero.titleRes(): Int =
    when (this) {
        OrderHero.Received,
        OrderHero.AwaitingAvailability,
        OrderHero.PayNow,
        OrderHero.VerifyingProof,
        OrderHero.PaymentVerified,
        -> R.string.order_hero_received

        OrderHero.Preparing -> R.string.order_hero_preparing

        OrderHero.OnTheWay -> R.string.order_hero_on_the_way

        OrderHero.ReadyForPickup -> R.string.order_hero_ready

        OrderHero.Delivered -> R.string.order_hero_delivered

        OrderHero.Unknown -> R.string.order_hero_unknown
    }

/** El subtítulo del titular; `null` si no lleva (un estado que esta versión no conoce). */
internal fun OrderHero.subtitleRes(): Int? =
    when (this) {
        OrderHero.Received -> R.string.order_hero_received_sub
        OrderHero.AwaitingAvailability -> R.string.order_hero_awaiting_availability_sub
        OrderHero.PayNow -> R.string.order_hero_pay_now_sub
        OrderHero.VerifyingProof -> R.string.order_hero_verifying_proof_sub
        OrderHero.PaymentVerified -> R.string.order_hero_payment_verified_sub
        OrderHero.Preparing -> R.string.order_hero_preparing_sub
        OrderHero.OnTheWay -> R.string.order_hero_on_the_way_sub
        OrderHero.ReadyForPickup -> R.string.order_hero_ready_sub
        OrderHero.Delivered -> R.string.order_hero_delivered_sub
        OrderHero.Unknown -> null
    }

internal fun CancelCopy.titleRes(): Int =
    when (this) {
        CancelCopy.CustomerCancelled -> R.string.order_cancel_customer_title
        CancelCopy.PrepayTimeout -> R.string.order_cancel_prepay_title
        CancelCopy.CouldNotConfirm -> R.string.order_cancel_unconfirmed_title
        CancelCopy.BusinessCancelled -> R.string.order_cancel_business_title
        CancelCopy.AdminCancelled -> R.string.order_cancel_admin_title
        CancelCopy.ProofRejected -> R.string.order_cancel_proof_title
        CancelCopy.PickupNoShow -> R.string.order_cancel_pickup_no_show_title
        CancelCopy.DeliveryNoShow -> R.string.order_cancel_delivery_no_show_title
        CancelCopy.Generic -> R.string.order_cancel_generic_title
    }

/**
 * El cuerpo del aviso de cancelación. Con [alreadyPaid], los cuatro motivos en los que la web diría «sin costo» o «no
 * se te cobró nada» cambian a la frase que pide escribir por WhatsApp para coordinar el pago (`cancelledCopy`).
 */
internal fun CancelCopy.bodyRes(alreadyPaid: Boolean): Int =
    when (this) {
        CancelCopy.CustomerCancelled -> {
            if (alreadyPaid) R.string.order_cancel_customer_paid_body else R.string.order_cancel_customer_body
        }

        CancelCopy.CouldNotConfirm -> {
            if (alreadyPaid) R.string.order_cancel_unconfirmed_paid_body else R.string.order_cancel_unconfirmed_body
        }

        CancelCopy.BusinessCancelled -> {
            if (alreadyPaid) R.string.order_cancel_business_paid_body else R.string.order_cancel_business_body
        }

        CancelCopy.AdminCancelled -> {
            if (alreadyPaid) R.string.order_cancel_admin_paid_body else R.string.order_cancel_admin_body
        }

        CancelCopy.PrepayTimeout -> {
            R.string.order_cancel_prepay_body
        }

        CancelCopy.ProofRejected -> {
            R.string.order_cancel_proof_body
        }

        CancelCopy.PickupNoShow -> {
            R.string.order_cancel_pickup_no_show_body
        }

        CancelCopy.DeliveryNoShow -> {
            R.string.order_cancel_delivery_no_show_body
        }

        CancelCopy.Generic -> {
            R.string.order_cancel_generic_body
        }
    }

/** El nombre del paso del seguimiento; en recojo el tercero se llama «Listo». */
internal fun TrackingStep.labelRes(isPickup: Boolean): Int =
    when (this) {
        TrackingStep.Received -> R.string.order_step_received
        TrackingStep.Preparing -> R.string.order_step_preparing
        TrackingStep.OnTheWay -> if (isPickup) R.string.order_step_ready else R.string.order_step_on_the_way
        TrackingStep.Delivered -> R.string.order_step_delivered
    }

/** El estado corto de una tarjeta del historial. */
internal fun OrderPhase.labelRes(isPickup: Boolean): Int =
    when (this) {
        is OrderPhase.Active -> step.labelRes(isPickup)
        OrderPhase.Delivered -> R.string.order_step_delivered
        is OrderPhase.Cancelled -> R.string.order_card_cancelled
        OrderPhase.Unknown -> R.string.order_hero_unknown
    }
