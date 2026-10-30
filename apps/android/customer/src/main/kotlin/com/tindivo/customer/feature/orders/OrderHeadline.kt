package com.tindivo.customer.feature.orders

/** El título del pedido según su fase, con los textos de la web (`STEPS`, `getStepSub`, `cancelledCopy`). */
internal fun headlineOf(
    phase: OrderPhase,
    status: String,
    payment: PaymentFacts,
    isPickup: Boolean,
): OrderHeadline =
    when (phase) {
        is OrderPhase.Cancelled -> {
            OrderHeadline.Cancelled(cancelCopyOf(phase.reason, isPickup), alreadyPaid = payment.alreadyPaid)
        }

        OrderPhase.Delivered -> {
            OrderHeadline.Progress(OrderHero.Delivered)
        }

        OrderPhase.Unknown -> {
            OrderHeadline.Progress(OrderHero.Unknown)
        }

        is OrderPhase.Active -> {
            OrderHeadline.Progress(heroOf(phase.step, status, payment, isPickup))
        }
    }

private fun heroOf(
    step: TrackingStep,
    status: String,
    payment: PaymentFacts,
    isPickup: Boolean,
): OrderHero =
    when (step) {
        TrackingStep.Received -> receivedHeroOf(status, payment)
        TrackingStep.Preparing -> OrderHero.Preparing
        TrackingStep.OnTheWay -> if (isPickup) OrderHero.ReadyForPickup else OrderHero.OnTheWay
        TrackingStep.Delivered -> OrderHero.Delivered
    }

/** El orden de las preguntas es el de `getStepSub` de la web. */
private fun receivedHeroOf(
    status: String,
    payment: PaymentFacts,
): OrderHero =
    when {
        !payment.prepaid -> OrderHero.Received
        status == "pending_acceptance" -> OrderHero.AwaitingAvailability
        status == "validando" && !payment.proofSent -> OrderHero.AwaitingAvailability
        status == "awaiting_payment" -> OrderHero.PayNow
        status == "validando" -> OrderHero.VerifyingProof
        status == "confirmed" -> OrderHero.PaymentVerified
        else -> OrderHero.Received
    }

private fun cancelCopyOf(
    reason: String?,
    isPickup: Boolean,
): CancelCopy =
    when (reason) {
        "customer_cancelled" -> CancelCopy.CustomerCancelled
        "prepay_timeout" -> CancelCopy.PrepayTimeout
        "validation_timeout", "pending_acceptance_timeout" -> CancelCopy.CouldNotConfirm
        "business_cancelled" -> CancelCopy.BusinessCancelled
        "admin_cancelled" -> CancelCopy.AdminCancelled
        "proof_rejected_final" -> CancelCopy.ProofRejected
        "no_show" -> if (isPickup) CancelCopy.PickupNoShow else CancelCopy.DeliveryNoShow
        else -> CancelCopy.Generic
    }
