const express =
  require("express");

const {
  createPaymentOrder,
  verifyPayment,
  createCodOrder,
} = require(
  "../controllers/paymentController"
);

const router =
  express.Router();

router.post(
  "/create-order",
  createPaymentOrder
);

router.post(
  "/verify",
  verifyPayment
);

router.post(
  "/cod-order",
  createCodOrder
);

module.exports = router;