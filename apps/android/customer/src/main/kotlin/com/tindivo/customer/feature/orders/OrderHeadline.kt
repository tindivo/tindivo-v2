package com.tindivo.customer.feature.orders

private const val PREPAID = "prepaid"

/** El título del pedido según su fase, con los textos de la web (`STEPS`, `getStepSub`, `cancelledCopy`). */
internal fun headlineOf(
    phase: OrderPhase,
    status: String,
    paymentIntent: String,
    isPickup: Boolean,
): OrderHeadline =
    when (phase) {
        is OrderPhase.Cancelled -> OrderHeadline.Cancelled(cancelCopyOf(phase.reason, isPickup))
        OrderPhase.Delivered -> OrderHeadline.Progress(OrderHero.Delivered)
        OrderPhase.Unknown -> OrderHeadline.Progress(OrderHero.Unknown)
        is OrderPhase.Active -> OrderHeadline.Progress(heroOf(phase.step, status, paymentIntent == PREPAID, isPickup))
    }

private fun heroOf(
    step: TrackingStep,
    status: String,
    prepaid: Boolean,
    isPickup: Boolean,
): OrderHero =
    when (step) {
        TrackingStep.Received -> receivedHeroOf(status, prepaid)
        TrackingStep.Preparing -> OrderHero.Preparing
        TrackingStep.OnTheWay -> if (isPickup) OrderHero.ReadyForPickup else OrderHero.OnTheWay
        TrackingStep.Delivered -> OrderHero.Delivered
    }

private fun receivedHeroOf(
    status: String,
    prepaid: Boolean,
): OrderHero =
    when {
        !prepaid -> OrderHero.Received
        status == "validando" || status == "pending_acceptance" -> OrderHero.AwaitingAvailability
        status == "awaiting_payment" -> OrderHero.PayNow
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
