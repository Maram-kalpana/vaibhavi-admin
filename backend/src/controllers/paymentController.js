const crypto = require("crypto");
const Razorpay = require("razorpay");
const db = require("../config/db");


/* =========================================================
   RAZORPAY INSTANCE
========================================================= */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


/* =========================================================
   PROMISE QUERY HELPER

   Supports mysql2/promise style connection/query.
========================================================= */

const query = async (connection, sql, params = []) => {
  const [rows] = await connection.query(sql, params);
  return rows;
};


/* =========================================================
   CREATE RAZORPAY ORDER

   POST /api/payments/create-order

   Expected body:

   {
     "cart_id": 1,
     "customer_name": "Akhila",
     "mobile": "9876543210"
   }

========================================================= */

exports.createPaymentOrder = async (req, res) => {
  let connection;

  try {
    const {
      cart_id,
      cartId,
      customer_name,
      customerName,
      name,
      mobile,
      mobile_number,
    } = req.body;

    const finalCartId =
      Number(cart_id || cartId);

    const finalCustomerName =
      String(
        customer_name ||
        customerName ||
        name ||
        ""
      ).trim();

    const finalMobile =
      String(
        mobile ||
        mobile_number ||
        ""
      ).trim();

      const finalLocation =
  String(
    req.body.location || ""
  ).trim();

    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

    if (
      !Number.isInteger(finalCartId) ||
      finalCartId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid cart id is required.",
      });
    }


    if (!finalCustomerName) {
      return res.status(400).json({
        success: false,
        message: "Customer name is required.",
      });
    }


    if (!/^[6-9]\d{9}$/.test(finalMobile)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10 digit mobile number.",
      });
    }

const allowedLocations = [
  "Main campus",
  "Manikonda campus",
];


if (
  !allowedLocations.includes(
    finalLocation
  )
) {
  return res.status(400).json({
    success: false,
    message:
      "Please select a valid location.",
  });
}
    /* -----------------------------------------------------
       GET DATABASE CONNECTION
    ----------------------------------------------------- */

    connection = await db.getConnection();

    await connection.beginTransaction();


    /* -----------------------------------------------------
       GET ACTIVE CART
    ----------------------------------------------------- */

    const carts = await query(
      connection,
      `
        SELECT
          id,
          status,
          total_amount
        FROM carts
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [finalCartId]
    );


    if (!carts.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Cart not found.",
      });
    }


    const cart = carts[0];


    if (cart.status !== "active") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "This cart is no longer active.",
      });
    }


    /* -----------------------------------------------------
       GET CART ITEMS

       IMPORTANT:
       Database column is portion_type,
       NOT portion.
    ----------------------------------------------------- */

    const cartItems = await query(
      connection,
      `
        SELECT
          ci.id,
          ci.menu_item_id,
          ci.item_name,
          ci.portion_type,
          ci.quantity,
          ci.unit_amount,
          ci.total_amount,

          mi.name AS current_item_name,
          mi.portion_type AS current_portion_type,
          mi.amount AS current_amount,
          mi.is_active

        FROM cart_items ci

        INNER JOIN menu_items mi
          ON mi.id = ci.menu_item_id

        WHERE ci.cart_id = ?

        ORDER BY ci.id ASC
      `,
      [finalCartId]
    );


    if (!cartItems.length) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Your cart is empty.",
      });
    }


    /* -----------------------------------------------------
       RE-CALCULATE AMOUNT FROM MENU TABLE

       Do NOT trust amount coming from frontend.
    ----------------------------------------------------- */

    let finalTotal = 0;

    const verifiedItems = [];


    for (const item of cartItems) {
      if (Number(item.is_active) !== 1) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: `${item.current_item_name} is currently unavailable.`,
        });
      }


      const quantity =
        Math.max(
          1,
          Number(item.quantity || 1)
        );


      const unitAmount =
        Number(item.current_amount || 0);


      const itemTotal =
        Number(
          (
            unitAmount *
            quantity
          ).toFixed(2)
        );


      finalTotal += itemTotal;


      verifiedItems.push({
        menu_item_id:
          item.menu_item_id,

        item_name:
          item.current_item_name,

        portion_type:
          item.current_portion_type,

        quantity,

        unit_amount:
          unitAmount,

        total_amount:
          itemTotal,
      });
    }


    finalTotal =
      Number(finalTotal.toFixed(2));


    if (
      !Number.isFinite(finalTotal) ||
      finalTotal <= 0
    ) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Invalid cart total.",
      });
    }


    /* -----------------------------------------------------
       UPDATE CART WITH VERIFIED TOTAL
    ----------------------------------------------------- */

    await query(
      connection,
      `
        UPDATE carts
        SET total_amount = ?
        WHERE id = ?
      `,
      [
        finalTotal,
        finalCartId,
      ]
    );


    /* -----------------------------------------------------
       CREATE INTERNAL ORDER
    ----------------------------------------------------- */

    const orderResult = await query(
      connection,
      `
        INSERT INTO orders
        (
          customer_name,
          mobile,
          location,
          total_amount,
          payment_method,
          payment_status
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        finalCustomerName,
        finalMobile,
        finalLocation,
        finalTotal,
        "Razorpay",
        "pending",
      ]
    );


    const orderId =
      orderResult.insertId;


    /* -----------------------------------------------------
       SAVE ORDER ITEMS
    ----------------------------------------------------- */

    for (const item of verifiedItems) {
      await query(
        connection,
        `
          INSERT INTO order_items
          (
            order_id,
            menu_item_id,
            item_name,
            portion_type,
            quantity,
            unit_amount,
            total_amount
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          orderId,
          item.menu_item_id,
          item.item_name,
          item.portion_type,
          item.quantity,
          item.unit_amount,
          item.total_amount,
        ]
      );
    }


    /* -----------------------------------------------------
       CREATE RAZORPAY ORDER

       Razorpay amount must be in paise.
       ₹150 = 15000 paise.
    ----------------------------------------------------- */

    const razorpayOrder =
      await razorpay.orders.create({
        amount:
          Math.round(
            finalTotal * 100
          ),

        currency: "INR",

        receipt:
          `order_${orderId}`,

        notes: {
          internal_order_id:
            String(orderId),

          cart_id:
            String(finalCartId),

          customer_name:
            finalCustomerName,

          mobile:
            finalMobile,
            location:
    finalLocation,
        },
      });


    /* -----------------------------------------------------
       SAVE RAZORPAY ORDER ID
    ----------------------------------------------------- */

    await query(
      connection,
      `
        UPDATE orders
        SET razorpay_order_id = ?
        WHERE id = ?
      `,
      [
        razorpayOrder.id,
        orderId,
      ]
    );


    await connection.commit();


    /* -----------------------------------------------------
       RESPONSE TO FRONTEND
    ----------------------------------------------------- */

    return res.status(200).json({
      success: true,

      message:
        "Payment order created successfully.",

      data: {
        order_id:
          orderId,

        cart_id:
          finalCartId,

        razorpay_order_id:
          razorpayOrder.id,

        key_id:
          process.env.RAZORPAY_KEY_ID,

        amount:
          razorpayOrder.amount,

        amount_in_rupees:
          finalTotal,

        currency:
          razorpayOrder.currency,

        customer_name:
          finalCustomerName,

        mobile:
          finalMobile,

        items:
          verifiedItems,
      },
    });

  } catch (error) {
    console.error(
      "CREATE PAYMENT ORDER ERROR:",
      error
    );


    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "ROLLBACK ERROR:",
          rollbackError
        );
      }
    }


    return res.status(500).json({
      success: false,

      message:
        error?.message ||
        "Unable to create payment order.",
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};


/* =========================================================
   VERIFY RAZORPAY PAYMENT

   POST /api/payments/verify

   Expected body:

   {
     "order_id": 1,
     "cart_id": 1,
     "razorpay_order_id": "...",
     "razorpay_payment_id": "...",
     "razorpay_signature": "..."
   }

========================================================= */

exports.verifyPayment = async (req, res) => {
  let connection;

  try {
    const {
      order_id,
      orderId,

      cart_id,
      cartId,

      razorpay_order_id,
      razorpayOrderId,

      razorpay_payment_id,
      razorpayPaymentId,

      razorpay_signature,
      razorpaySignature,
    } = req.body;


    const internalOrderId =
      Number(
        order_id ||
        orderId
      );


    const finalCartId =
      Number(
        cart_id ||
        cartId
      );


    const finalRazorpayOrderId =
      razorpay_order_id ||
      razorpayOrderId;


    const finalRazorpayPaymentId =
      razorpay_payment_id ||
      razorpayPaymentId;


    const finalSignature =
      razorpay_signature ||
      razorpaySignature;


    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

    if (
      !Number.isInteger(
        internalOrderId
      ) ||
      internalOrderId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid order id is required.",
      });
    }


    if (
      !finalRazorpayOrderId ||
      !finalRazorpayPaymentId ||
      !finalSignature
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Payment verification details are missing.",
      });
    }


    /* -----------------------------------------------------
       VERIFY SIGNATURE
    ----------------------------------------------------- */

    const generatedSignature =
      crypto
        .createHmac(
          "sha256",
          process.env
            .RAZORPAY_KEY_SECRET
        )
        .update(
          `${finalRazorpayOrderId}|${finalRazorpayPaymentId}`
        )
        .digest("hex");


    const signatureBuffer =
      Buffer.from(
        String(finalSignature)
      );


    const generatedBuffer =
      Buffer.from(
        String(
          generatedSignature
        )
      );


    const isValid =
      signatureBuffer.length ===
        generatedBuffer.length &&
      crypto.timingSafeEqual(
        signatureBuffer,
        generatedBuffer
      );


    if (!isValid) {
      return res.status(400).json({
        success: false,
        message:
          "Payment signature verification failed.",
      });
    }


    /* -----------------------------------------------------
       DATABASE TRANSACTION
    ----------------------------------------------------- */

    connection =
      await db.getConnection();

    await connection.beginTransaction();


    /* -----------------------------------------------------
       GET INTERNAL ORDER
    ----------------------------------------------------- */

    const orders = await query(
      connection,
      `
        SELECT
          id,
          customer_name,
          mobile,
            location,
          total_amount,
          payment_method,
          payment_status,
          razorpay_order_id,
          razorpay_payment_id,
          created_at

        FROM orders

        WHERE id = ?

        LIMIT 1

        FOR UPDATE
      `,
      [internalOrderId]
    );


    if (!orders.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message:
          "Order not found.",
      });
    }


    const order =
      orders[0];


    /* -----------------------------------------------------
       MAKE SURE RAZORPAY ORDER MATCHES
    ----------------------------------------------------- */

    if (
      String(
        order.razorpay_order_id
      ) !==
      String(
        finalRazorpayOrderId
      )
    ) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Razorpay order does not match.",
      });
    }


    /* -----------------------------------------------------
       IDEMPOTENT SUCCESS

       If verify API gets called twice,
       don't create/update incorrectly.
    ----------------------------------------------------- */

    if (
      order.payment_status ===
        "paid" &&
      order.razorpay_payment_id
    ) {
      await connection.commit();

      return res.status(200).json({
        success: true,

        message:
          "Payment already verified.",

        data: {
          order_id:
            order.id,

          customer_name:
            order.customer_name,

          mobile:
            order.mobile,

          location: order.location,

          total_amount:
            Number(
              order.total_amount
            ),

          payment_method:
            order.payment_method,

          payment_status:
            order.payment_status,

          razorpay_order_id:
            order.razorpay_order_id,

          razorpay_payment_id:
            order.razorpay_payment_id,
        },
      });
    }


    /* -----------------------------------------------------
       OPTIONAL: FETCH PAYMENT FROM RAZORPAY

       This additionally confirms payment exists.
    ----------------------------------------------------- */

    const payment =
      await razorpay.payments.fetch(
        finalRazorpayPaymentId
      );


    if (!payment) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Unable to verify Razorpay payment.",
      });
    }


    if (
      String(payment.order_id) !==
      String(
        finalRazorpayOrderId
      )
    ) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Razorpay payment order mismatch.",
      });
    }


    /* -----------------------------------------------------
       CHECK PAYMENT AMOUNT
    ----------------------------------------------------- */

    const expectedAmount =
      Math.round(
        Number(
          order.total_amount
        ) * 100
      );


    if (
      Number(payment.amount) !==
      expectedAmount
    ) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Payment amount mismatch.",
      });
    }


    /* -----------------------------------------------------
       UPDATE ORDER AS PAID
    ----------------------------------------------------- */

    await query(
      connection,
      `
        UPDATE orders

        SET
          payment_method = ?,
          payment_status = ?,
          razorpay_payment_id = ?

        WHERE id = ?
      `,
      [
        "Razorpay",
        "paid",
        finalRazorpayPaymentId,
        internalOrderId,
      ]
    );


    /* -----------------------------------------------------
       COMPLETE CART

       Only when cart id is supplied.
    ----------------------------------------------------- */

    if (
      Number.isInteger(
        finalCartId
      ) &&
      finalCartId > 0
    ) {
      await query(
        connection,
        `
          UPDATE carts

          SET status = 'completed'

          WHERE id = ?
        `,
        [finalCartId]
      );
    }


    /* -----------------------------------------------------
       GET ORDER ITEMS FOR SUCCESS PAGE
    ----------------------------------------------------- */

    const orderItems =
      await query(
        connection,
        `
          SELECT
            id,
            menu_item_id,
            item_name,
            portion_type,
            quantity,
            unit_amount,
            total_amount

          FROM order_items

          WHERE order_id = ?

          ORDER BY id ASC
        `,
        [internalOrderId]
      );


    await connection.commit();


    /* -----------------------------------------------------
       SUCCESS RESPONSE
    ----------------------------------------------------- */

    return res.status(200).json({
      success: true,

      message:
        "Payment verified successfully.",

      data: {
        order_id:
          internalOrderId,

        customer_name:
          order.customer_name,

        mobile:
          order.mobile,
        
        location: order.location,

        total_amount:
          Number(
            order.total_amount
          ),

        payment_method:
          "Razorpay",

        payment_status:
          "paid",

        razorpay_order_id:
          finalRazorpayOrderId,

        razorpay_payment_id:
          finalRazorpayPaymentId,

        items:
          orderItems.map(
            (item) => ({
              ...item,

              quantity:
                Number(
                  item.quantity
                ),

              unit_amount:
                Number(
                  item.unit_amount
                ),

              total_amount:
                Number(
                  item.total_amount
                ),
            })
          ),
      },
    });

  } catch (error) {
    console.error(
      "VERIFY PAYMENT ERROR:",
      error
    );


    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "VERIFY ROLLBACK ERROR:",
          rollbackError
        );
      }
    }


    return res.status(500).json({
      success: false,

      message:
        error?.message ||
        "Unable to verify payment.",
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};
/* =========================================================
   CREATE COD ORDER
   POST /api/payments/cod-order
   Body: { cart_id, customer_name, mobile, location }
========================================================= */

exports.createCodOrder = async (req, res) => {
  let connection;

  try {
    const finalCartId = Number(req.body.cart_id || req.body.cartId);
    const finalCustomerName = String(req.body.customer_name || "").trim();
    const finalMobile = String(req.body.mobile || "").trim();
    const finalLocation = String(req.body.location || "").trim();

    if (!Number.isInteger(finalCartId) || finalCartId <= 0) {
      return res.status(400).json({ success: false, message: "Valid cart id is required." });
    }
    if (!finalCustomerName) {
      return res.status(400).json({ success: false, message: "Customer name is required." });
    }
    if (!/^[6-9]\d{9}$/.test(finalMobile)) {
      return res.status(400).json({ success: false, message: "Enter a valid 10 digit mobile number." });
    }
    if (!["Main campus", "Manikonda campus"].includes(finalLocation)) {
      return res.status(400).json({ success: false, message: "Please select a valid location." });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const carts = await query(
      connection,
      `SELECT id, status FROM carts WHERE id = ? LIMIT 1 FOR UPDATE`,
      [finalCartId]
    );

    if (!carts.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Cart not found." });
    }
    if (carts[0].status !== "active") {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "This cart is no longer active." });
    }

    const cartItems = await query(
      connection,
      `
        SELECT ci.menu_item_id, ci.quantity,
               mi.name AS current_item_name,
               mi.portion_type AS current_portion_type,
               mi.amount AS current_amount,
               mi.is_active
        FROM cart_items ci
        INNER JOIN menu_items mi ON mi.id = ci.menu_item_id
        WHERE ci.cart_id = ?
        ORDER BY ci.id ASC
      `,
      [finalCartId]
    );

    if (!cartItems.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Your cart is empty." });
    }

    let finalTotal = 0;
    const verifiedItems = [];

    for (const item of cartItems) {
      if (Number(item.is_active) !== 1) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `${item.current_item_name} is currently unavailable.`,
        });
      }

      const quantity = Math.max(1, Number(item.quantity || 1));
      const unitAmount = Number(item.current_amount || 0);
      const itemTotal = Number((unitAmount * quantity).toFixed(2));

      finalTotal += itemTotal;

      verifiedItems.push({
        menu_item_id: item.menu_item_id,
        item_name: item.current_item_name,
        portion_type: item.current_portion_type,
        quantity,
        unit_amount: unitAmount,
        total_amount: itemTotal,
      });
    }

    finalTotal = Number(finalTotal.toFixed(2));

    if (!Number.isFinite(finalTotal) || finalTotal <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Invalid cart total." });
    }

    await query(connection, `UPDATE carts SET total_amount = ? WHERE id = ?`, [finalTotal, finalCartId]);

    const orderResult = await query(
      connection,
      `
        INSERT INTO orders
        (customer_name, mobile, location, total_amount, payment_method, payment_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [finalCustomerName, finalMobile, finalLocation, finalTotal, "COD", "pending"]
    );

    const orderId = orderResult.insertId;

    for (const item of verifiedItems) {
      await query(
        connection,
        `
          INSERT INTO order_items
          (order_id, menu_item_id, item_name, portion_type, quantity, unit_amount, total_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          orderId,
          item.menu_item_id,
          item.item_name,
          item.portion_type,
          item.quantity,
          item.unit_amount,
          item.total_amount,
        ]
      );
    }

    await query(connection, `UPDATE carts SET status = 'completed' WHERE id = ?`, [finalCartId]);

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "COD order placed successfully.",
      data: {
        order_id: orderId,
        customer_name: finalCustomerName,
        mobile: finalMobile,
        location: finalLocation,
        total_amount: finalTotal,
        payment_method: "COD",
        payment_status: "pending",
        items: verifiedItems,
      },
    });
  } catch (error) {
    console.error("CREATE COD ORDER ERROR:", error);

    if (connection) {
      try { await connection.rollback(); } catch (e) { console.error("ROLLBACK ERROR:", e); }
    }

    return res.status(500).json({
      success: false,
      message: error?.message || "Unable to place COD order.",
    });
  } finally {
    if (connection) connection.release();
  }
};