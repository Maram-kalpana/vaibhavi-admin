const db = require("../config/db");



exports.getOrders = async (req, res) => {
  try {

    /* =====================================================
       GET PAID ORDERS

       One database order = one result row.
    ===================================================== */

    const [orders] = await db.query(
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
    WHERE payment_status = 'paid'
       OR payment_method = 'COD'
    ORDER BY created_at DESC, id DESC
  `
);


    /* =====================================================
       NO ORDERS
    ===================================================== */

    if (!orders.length) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        orders: [],
      });
    }


    /* =====================================================
       GET ALL ORDER ITEMS FOR PAID ORDERS

       We don't select portion_type because Portion has
       been removed from the application UI.
    ===================================================== */

    const orderIds =
      orders.map(
        (order) => order.id
      );


    const placeholders =
      orderIds
        .map(() => "?")
        .join(",");


    const [items] = await db.query(
      `
        SELECT
          id,
          order_id,
          menu_item_id,
          item_name,
          portion_type,
          quantity,
          unit_amount,
          total_amount,
          created_at
        FROM order_items
        WHERE order_id IN (${placeholders})
        ORDER BY order_id DESC, id ASC
      `,
      orderIds
    );


    /* =====================================================
       GROUP ITEMS BY ORDER ID

       Example:

       {
         25: [
           Chicken Biryani,
           Mutton Biryani
         ]
       }
    ===================================================== */

    const itemsByOrderId =
      new Map();


    items.forEach((item) => {

      const orderId =
        Number(item.order_id);


      if (
        !itemsByOrderId.has(
          orderId
        )
      ) {
        itemsByOrderId.set(
          orderId,
          []
        );
      }


      itemsByOrderId
        .get(orderId)
        .push({
          id:
            item.id,

          menuItemId:
            item.menu_item_id,

          menu_item_id:
            item.menu_item_id,

          item:
            item.item_name,

          itemName:
            item.item_name,

          item_name:
            item.item_name,
          
            size: item.portion_type,
portion_type: item.portion_type,


          quantity:
            Number(
              item.quantity || 0
            ),

          amount:
            Number(
              item.unit_amount || 0
            ),

          unitAmount:
            Number(
              item.unit_amount || 0
            ),

          unit_amount:
            Number(
              item.unit_amount || 0
            ),

          totalAmount:
            Number(
              item.total_amount || 0
            ),

          total_amount:
            Number(
              item.total_amount || 0
            ),

          createdAt:
            item.created_at,

          created_at:
            item.created_at,
        });
    });


    /* =====================================================
       BUILD FINAL ORDER RESPONSE

       IMPORTANT:
       totalAmount comes from orders.total_amount.

       It is NOT item_total_amount.

       This gives the complete amount for all items
       purchased in that payment.
    ===================================================== */

    const formattedOrders =
      orders.map((order) => {

        const orderItems =
          itemsByOrderId.get(
            Number(order.id)
          ) || [];


        /* =================================================
           CREATE COMBINED ITEM TEXT

           Example:

           Chicken Biryani-1, Mutton Biryani-3
        ================================================= */

        // const orderItemsText =
        //   orderItems
        //     .map((item) => {

        //       return (
        //         `${item.itemName}-${item.quantity}`
        //       );

        //     })
        //     .join(", ");
        const orderItemsText =
  orderItems
    .map((item) => {
      const size = item.size
        ? ` (${item.size})`
        : "";

      return `${item.itemName}${size}-${item.quantity}`;
    })
    .join(", ");


        return {

          /* ===============================================
             ORDER ID
          =============================================== */

          id:
            order.id,

          orderId:
            order.id,

          order_id:
            order.id,


          /* ===============================================
             CUSTOMER
          =============================================== */

          name:
            order.customer_name,

          customerName:
            order.customer_name,

          customer_name:
            order.customer_name,

          mobile:
            order.mobile,

          location: order.location,
          /* ===============================================
             ORDER ITEMS

             Full array remains available if another page
             needs individual item details.
          =============================================== */

          items:
            orderItems,


          /* ===============================================
             COMBINED ORDER ITEM

             Used by Admin OrdersPage.jsx.

             Example:
             Chicken Biryani-1, Mutton Biryani-3
          =============================================== */

          orderItems:
            orderItemsText,

          order_items_text:
            orderItemsText,

          itemsText:
            orderItemsText,


          /* ===============================================
             COMPLETE ORDER TOTAL

             This is orders.total_amount.

             Example:

             Chicken Biryani
             ₹400 x 1 = ₹400

             Mutton Biryani
             ₹500 x 3 = ₹1500

             Total = ₹1900
          =============================================== */

          totalAmount:
            Number(
              order.total_amount || 0
            ),

          total_amount:
            Number(
              order.total_amount || 0
            ),
            paymentMethod:
  order.payment_method,

payment_method:
  order.payment_method,


          /* ===============================================
             PAYMENT STATUS

             Kept because this is useful backend data.

             Payment Method is intentionally not returned
             because it is removed from Admin Orders UI.
          =============================================== */

          paymentStatus:
            order.payment_status,

          payment_status:
            order.payment_status,


          /* ===============================================
             RAZORPAY IDs

             Keep these because payment-related functionality
             may need them elsewhere.

             They are NOT displayed on OrdersPage.
          =============================================== */

          razorpayOrderId:
            order.razorpay_order_id,

          razorpay_order_id:
            order.razorpay_order_id,

          razorpayPaymentId:
            order.razorpay_payment_id,

          razorpay_payment_id:
            order.razorpay_payment_id,


          /* ===============================================
             DATE
          =============================================== */

          createdAt:
            order.created_at,

          created_at:
            order.created_at,
        };
      });


    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.status(200).json({
      success: true,

      count:
        formattedOrders.length,

      data:
        formattedOrders,

      orders:
        formattedOrders,
    });

  } catch (error) {

    console.error(
      "GET ORDERS ERROR:",
      error
    );


    return res.status(500).json({
      success: false,

      message:
        error?.message ||
        "Unable to load orders.",

      data: [],

      orders: [],
    });

  }
};


/* =========================================================
   GET SINGLE ORDER

   GET /api/orders/:id

   Used for:
   - Payment success page
   - Order details
   - Any existing single-order functionality

   Existing functionality is preserved.

   Portion removed only from response.
========================================================= */

exports.getOrderById = async (
  req,
  res
) => {

  try {

    /* =====================================================
       ORDER ID
    ===================================================== */

    const orderId =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(
        orderId
      ) ||
      orderId <= 0
    ) {

      return res
        .status(400)
        .json({
          success: false,

          message:
            "Invalid order id.",
        });

    }


    /* =====================================================
       GET ORDER
    ===================================================== */

    const [orders] =
      await db.query(
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
            created_at,
            updated_at
          FROM orders
          WHERE id = ?
          LIMIT 1
        `,
        [
          orderId,
        ]
      );


    /* =====================================================
       ORDER NOT FOUND
    ===================================================== */

    if (
      !orders.length
    ) {

      return res
        .status(404)
        .json({
          success: false,

          message:
            "Order not found.",
        });

    }


    const order =
      orders[0];


    /* =====================================================
       GET ORDER ITEMS

       Portion removed from SELECT because it is no longer
       required by the UI.
    ===================================================== */

    const [items] =
      await db.query(
        `
          SELECT
            id,
            menu_item_id,
            item_name,
            portion_type,
            quantity,
            unit_amount,
            total_amount,
            created_at
          FROM order_items
          WHERE order_id = ?
          ORDER BY id ASC
        `,
        [
          orderId,
        ]
      );


    /* =====================================================
       FORMAT ORDER ITEMS
    ===================================================== */

    const formattedItems =
      items.map(
        (item) => ({

          id:
            item.id,

          menuItemId:
            item.menu_item_id,

          menu_item_id:
            item.menu_item_id,

          item:
            item.item_name,

          itemName:
            item.item_name,

          item_name:
            item.item_name,
          size: item.portion_type,
portion_type: item.portion_type,

          quantity:
            Number(
              item.quantity || 0
            ),

          amount:
            Number(
              item.unit_amount || 0
            ),

          unitAmount:
            Number(
              item.unit_amount || 0
            ),

          unit_amount:
            Number(
              item.unit_amount || 0
            ),

          totalAmount:
            Number(
              item.total_amount || 0
            ),

          total_amount:
            Number(
              item.total_amount || 0
            ),

          createdAt:
            item.created_at,

          created_at:
            item.created_at,
        })
      );


    /* =====================================================
       COMBINED ITEM TEXT

       Example:
       Chicken Biryani-1, Mutton Biryani-3
    ===================================================== */

    // const orderItemsText =
    //   formattedItems
    //     .map(
    //       (item) =>
    //         `${item.itemName}-${item.quantity}`
    //     )
    //     .join(", ");
    const orderItemsText = formattedItems
  .map((item) => {
    const size = item.size
      ? ` (${item.size})`
      : "";

    return `${item.itemName}${size}-${item.quantity}`;
  })
  .join(", ");


    /* =====================================================
       RESPONSE
    ===================================================== */

    return res
      .status(200)
      .json({

        success: true,

        data: {

          /* =============================================
             ORDER ID
          ============================================= */

          id:
            order.id,

          orderId:
            order.id,

          order_id:
            order.id,


          /* =============================================
             CUSTOMER
          ============================================= */

          customerName:
            order.customer_name,

          customer_name:
            order.customer_name,

          name:
            order.customer_name,

          mobile:
            order.mobile,

          location: order.location,
          /* =============================================
             COMPLETE ORDER TOTAL
          ============================================= */

          totalAmount:
            Number(
              order.total_amount || 0
            ),

          total_amount:
            Number(
              order.total_amount || 0
            ),


          /* =============================================
             PAYMENT

             Kept here because existing payment success /
             order detail functionality may use it.

             It is simply not shown on Admin OrdersPage.
          ============================================= */

          paymentMethod:
            order.payment_method,

          payment_method:
            order.payment_method,

          paymentStatus:
            order.payment_status,

          payment_status:
            order.payment_status,


          /* =============================================
             RAZORPAY
          ============================================= */

          razorpayOrderId:
            order.razorpay_order_id,

          razorpay_order_id:
            order.razorpay_order_id,

          razorpayPaymentId:
            order.razorpay_payment_id,

          razorpay_payment_id:
            order.razorpay_payment_id,


          /* =============================================
             DATE
          ============================================= */

          createdAt:
            order.created_at,

          created_at:
            order.created_at,


          /* =============================================
             ITEMS
          ============================================= */

          items:
            formattedItems,

          orderItems:
            orderItemsText,

          order_items_text:
            orderItemsText,

          itemsText:
            orderItemsText,
        },
      });

  } catch (error) {

    console.error(
      "GET ORDER ERROR:",
      error
    );


    return res
      .status(500)
      .json({
        success: false,

        message:
          error?.message ||
          "Unable to load order.",
      });

  }
};








// const db = require("../config/db");


// /* =========================================================
//    GET ALL PAID ORDERS

//    GET /api/orders

//    Used by Admin Orders page.

//    Response keeps both:
//    - database style fields
//    - frontend friendly fields

//    so existing OrdersPage.jsx does not need UI changes.
// ========================================================= */

// exports.getOrders = async (req, res) => {
//   try {

//     /* -----------------------------------------------------
//        GET PAID ORDERS + ORDER ITEMS
//     ----------------------------------------------------- */

//     const [rows] = await db.query(
//       `
//         SELECT

//           o.id AS order_id,

//           o.customer_name,
//           o.mobile,

//           o.total_amount AS order_total_amount,

//           o.payment_method,
//           o.payment_status,

//           o.razorpay_order_id,
//           o.razorpay_payment_id,

//           o.created_at,

//           oi.id AS order_item_id,

//           oi.menu_item_id,

//           oi.item_name,

//           oi.portion_type,

//           oi.quantity,

//           oi.unit_amount,

//           oi.total_amount AS item_total_amount

//         FROM orders o

//         INNER JOIN order_items oi
//           ON oi.order_id = o.id

//         WHERE o.payment_status = 'paid'

//         ORDER BY
//           o.created_at DESC,
//           oi.id ASC
//       `
//     );


//     /* -----------------------------------------------------
//        ADMIN PAGE CURRENTLY DISPLAYS EACH ITEM AS A ROW.

//        Therefore flatten the order + item data.
//     ----------------------------------------------------- */

//     const orders =
//       rows.map((row) => {

//         return {

//           /* ===============================================
//              IDS
//           =============================================== */

//           id:
//             row.order_item_id,

//           orderId:
//             row.order_id,

//           order_id:
//             row.order_id,


//           /* ===============================================
//              CUSTOMER
//           =============================================== */

//           name:
//             row.customer_name,

//           customerName:
//             row.customer_name,

//           customer_name:
//             row.customer_name,

//           mobile:
//             row.mobile,


//           /* ===============================================
//              ITEM
//           =============================================== */

//           menuItemId:
//             row.menu_item_id,

//           menu_item_id:
//             row.menu_item_id,

//           item:
//             row.item_name,

//           itemName:
//             row.item_name,

//           item_name:
//             row.item_name,


//           /* ===============================================
//              PORTION
//           =============================================== */

//           portion:
//             row.portion_type,

//           portionType:
//             row.portion_type,

//           portion_type:
//             row.portion_type,


//           /* ===============================================
//              QUANTITY
//           =============================================== */

//           quantity:
//             Number(
//               row.quantity || 0
//             ),


//           /* ===============================================
//              UNIT AMOUNT
//           =============================================== */

//           amount:
//             Number(
//               row.unit_amount || 0
//             ),

//           unitAmount:
//             Number(
//               row.unit_amount || 0
//             ),

//           unit_amount:
//             Number(
//               row.unit_amount || 0
//             ),


//           /* ===============================================
//              ITEM TOTAL
//           =============================================== */

//           itemTotalAmount:
//             Number(
//               row.item_total_amount ||
//               0
//             ),

//           item_total_amount:
//             Number(
//               row.item_total_amount ||
//               0
//             ),


//           /* ===============================================
//              ORDER TOTAL

//              Your Admin table uses:
//              order.totalAmount
//           =============================================== */
//               totalAmount:
//                 Number(
//                   row.item_total_amount ||
//                   0
//                 ),

//               total_amount:
//                 Number(
//                   row.item_total_amount ||
//                   0
//                 ),
//           // totalAmount:
//           //   Number(
//           //     row.order_total_amount ||
//           //     0
//           //   ),

//           // total_amount:
//           //   Number(
//           //     row.order_total_amount ||
//           //     0
//           //   ),


//           /* ===============================================
//              PAYMENT
//           =============================================== */

//           paymentMethod:
//             row.payment_method ||
//             "Razorpay",

//           payment_method:
//             row.payment_method ||
//             "Razorpay",

//           paymentStatus:
//             row.payment_status,

//           payment_status:
//             row.payment_status,


//           /* ===============================================
//              RAZORPAY
//           =============================================== */

//           razorpayOrderId:
//             row.razorpay_order_id,

//           razorpay_order_id:
//             row.razorpay_order_id,

//           razorpayPaymentId:
//             row.razorpay_payment_id,

//           razorpay_payment_id:
//             row.razorpay_payment_id,


//           /* ===============================================
//              DATE
//           =============================================== */

//           createdAt:
//             row.created_at,

//           created_at:
//             row.created_at,
//         };

//       });


//     return res.status(200).json({
//       success: true,

//       count:
//         orders.length,

//       data:
//         orders,

//       orders:
//         orders,
//     });

//   } catch (error) {

//     console.error(
//       "GET ORDERS ERROR:",
//       error
//     );


//     return res.status(500).json({
//       success: false,

//       message:
//         error?.message ||
//         "Unable to load orders.",

//       data: [],
//       orders: [],
//     });

//   }
// };


// /* =========================================================
//    GET SINGLE ORDER

//    GET /api/orders/:id

//    Useful for payment success page.
// ========================================================= */

// exports.getOrderById = async (
//   req,
//   res
// ) => {

//   try {

//     const orderId =
//       Number(req.params.id);


//     if (
//       !Number.isInteger(
//         orderId
//       ) ||
//       orderId <= 0
//     ) {

//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid order id.",
//       });

//     }


//     /* -----------------------------------------------------
//        GET ORDER
//     ----------------------------------------------------- */

//     const [orders] =
//       await db.query(
//         `
//           SELECT

//             id,

//             customer_name,

//             mobile,

//             total_amount,

//             payment_method,

//             payment_status,

//             razorpay_order_id,

//             razorpay_payment_id,

//             created_at,

//             updated_at

//           FROM orders

//           WHERE id = ?

//           LIMIT 1
//         `,
//         [orderId]
//       );


//     if (!orders.length) {

//       return res.status(404).json({
//         success: false,
//         message:
//           "Order not found.",
//       });

//     }


//     const order =
//       orders[0];


//     /* -----------------------------------------------------
//        GET ORDER ITEMS
//     ----------------------------------------------------- */

//     const [items] =
//       await db.query(
//         `
//           SELECT

//             id,

//             menu_item_id,

//             item_name,

//             portion_type,

//             quantity,

//             unit_amount,

//             total_amount,

//             created_at

//           FROM order_items

//           WHERE order_id = ?

//           ORDER BY id ASC
//         `,
//         [orderId]
//       );


//     /* -----------------------------------------------------
//        RESPONSE
//     ----------------------------------------------------- */

//     return res.status(200).json({

//       success: true,

//       data: {

//         id:
//           order.id,

//         orderId:
//           order.id,

//         order_id:
//           order.id,


//         customerName:
//           order.customer_name,

//         customer_name:
//           order.customer_name,

//         name:
//           order.customer_name,


//         mobile:
//           order.mobile,


//         totalAmount:
//           Number(
//             order.total_amount
//           ),

//         total_amount:
//           Number(
//             order.total_amount
//           ),


//         paymentMethod:
//           order.payment_method,

//         payment_method:
//           order.payment_method,


//         paymentStatus:
//           order.payment_status,

//         payment_status:
//           order.payment_status,


//         razorpayOrderId:
//           order.razorpay_order_id,

//         razorpay_order_id:
//           order.razorpay_order_id,


//         razorpayPaymentId:
//           order.razorpay_payment_id,

//         razorpay_payment_id:
//           order.razorpay_payment_id,


//         createdAt:
//           order.created_at,

//         created_at:
//           order.created_at,


//         items:
//           items.map(
//             (item) => ({

//               id:
//                 item.id,

//               menuItemId:
//                 item.menu_item_id,

//               menu_item_id:
//                 item.menu_item_id,

//               item:
//                 item.item_name,

//               itemName:
//                 item.item_name,

//               item_name:
//                 item.item_name,

//               portion:
//                 item.portion_type,

//               portionType:
//                 item.portion_type,

//               portion_type:
//                 item.portion_type,

//               quantity:
//                 Number(
//                   item.quantity
//                 ),

//               amount:
//                 Number(
//                   item.unit_amount
//                 ),

//               unitAmount:
//                 Number(
//                   item.unit_amount
//                 ),

//               unit_amount:
//                 Number(
//                   item.unit_amount
//                 ),

//               totalAmount:
//                 Number(
//                   item.total_amount
//                 ),

//               total_amount:
//                 Number(
//                   item.total_amount
//                 ),
//             })
//           ),
//       },
//     });

//   } catch (error) {

//     console.error(
//       "GET ORDER ERROR:",
//       error
//     );


//     return res.status(500).json({
//       success: false,

//       message:
//         error?.message ||
//         "Unable to load order.",
//     });

//   }
// };