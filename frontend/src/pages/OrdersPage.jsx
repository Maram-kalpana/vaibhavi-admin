import {
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getOrdersApi,
    downloadOrdersPdfApi,
} from "../api/orderApi";


const ROWS_PER_PAGE = 10;


export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
const [downloadingPdf, setDownloadingPdf] = useState(false);
const [downloadError, setDownloadError] = useState("");

  /* =========================================
     LOAD ORDERS FROM BACKEND API ONLY
  ========================================= */

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await getOrdersApi();

      /*
        Supported response:

        {
          success: true,
          data: [...]
        }
      */

      const apiOrders = response?.data?.data;

      setOrders(
        Array.isArray(apiOrders)
          ? apiOrders
          : []
      );
    } catch (error) {
      console.error(
        "Orders fetch error:",
        error
      );

      setOrders([]);

      setError(
        error?.response?.data?.message ||
          "Unable to load orders."
      );
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    loadOrders();
  }, [loadOrders]);


  /* =========================================
     NORMALIZE + GROUP ORDER DATA

     IMPORTANT:

     One Order ID = One Table Row

     Example:

     Order ID: 25

     Chicken Biryani-1,
     Mutton Biryani-3

     Supports:

     1. Nested response
        {
          id: 25,
          items: [...]
        }

     2. Flat response
        Multiple rows with same orderId

     3. Already grouped backend response
        orderItems:
        "Chicken Biryani-1, Mutton Biryani-3"
  ========================================= */

  const orderRows = useMemo(() => {
    const groupedOrders = new Map();


    const getOrderId = (
      order,
      fallbackIndex
    ) => {
      return (
        order?.orderId ??
        order?.order_id ??
        order?.id ??
        fallbackIndex
      );
    };


    const getCustomerName = (order) => {
      return (
        order?.customerName ||
        order?.customer_name ||
        order?.name ||
        "-"
      );
    };


    const getMobile = (order) => {
      return (
        order?.mobile ||
        order?.mobileNumber ||
        order?.mobile_number ||
        order?.phone ||
        "-"
      );
    };


    const getCreatedAt = (order) => {
      return (
        order?.createdAt ||
        order?.created_at ||
        order?.orderDate ||
        order?.order_date ||
        null
      );
    };


    const getOrderTotal = (order) => {
      return Number(
        order?.totalAmount ??
          order?.total_amount ??
          order?.grandTotal ??
          order?.grand_total ??
          order?.total ??
          0
      );
    };


    // const makeItemLabel = (
    //   itemName,
    //   quantity
    // ) => {
    //   const name =
    //     String(
    //       itemName || "-"
    //     ).trim() || "-";

    //   const qty = Number(
    //     quantity ?? 0
    //   );

    //   return `${name}-${qty}`;
    // };
    const makeItemLabel = (itemName, quantity, size = "") => {
  const name = String(itemName || "-").trim() || "-";
  const qty = Number(quantity ?? 0);
  const itemSize = String(size || "").trim();

  return `${name}${itemSize ? ` (${itemSize})` : ""}-${qty}`;
};


    orders.forEach(
      (order, orderIndex) => {

        const orderId =
          getOrderId(
            order,
            orderIndex
          );


        const groupKey =
          String(orderId);


        /*
         * =====================================
         * CREATE ORDER GROUP
         * =====================================
         */

        if (
          !groupedOrders.has(
            groupKey
          )
        ) {
          groupedOrders.set(
            groupKey,
            {
              rowKey:
                `order-${groupKey}`,

              orderId,

              customerName:
                getCustomerName(
                  order
                ),

              mobile:
                getMobile(order),

              location: order?.location || "-",
              paymentMethod: order?.payment_method || order?.paymentMethod || "-",
paymentStatus: order?.payment_status || order?.paymentStatus || "-",

              items: [],

              sizes: [],

              totalAmount:
                getOrderTotal(
                  order
                ),

              createdAt:
                getCreatedAt(
                  order
                ),
            }
          );
        }


        const groupedOrder =
          groupedOrders.get(
            groupKey
          );

          const addSize = (size) => {
  const value = String(size || "").trim();

  if (
    value &&
    !groupedOrder.sizes.includes(value)
  ) {
    groupedOrder.sizes.push(value);
  }
};

const sizeItems = Array.isArray(order?.items)
  ? order.items
  : Array.isArray(order?.orderItems)
    ? order.orderItems
    : Array.isArray(order?.order_items)
      ? order.order_items
      : [];

if (sizeItems.length > 0) {
  sizeItems.forEach((item) => {
    addSize(
      item?.size ||
      item?.portionType ||
      item?.portion_type
    );
  });
} else {
  addSize(
    order?.size ||
    order?.portionType ||
    order?.portion_type
  );
}

        /*
         * =====================================
         * KEEP ORDER INFORMATION
         * =====================================
         */

        if (
          groupedOrder.customerName ===
            "-" &&
          getCustomerName(order) !==
            "-"
        ) {
          groupedOrder.customerName =
            getCustomerName(
              order
            );
        }


        if (
          groupedOrder.mobile ===
            "-" &&
          getMobile(order) !==
            "-"
        ) {
          groupedOrder.mobile =
            getMobile(order);
        }

        if (
  groupedOrder.location === "-" &&
  order?.location
) {
  groupedOrder.location = order.location;
}

        if (
          !groupedOrder.createdAt &&
          getCreatedAt(order)
        ) {
          groupedOrder.createdAt =
            getCreatedAt(
              order
            );
        }


        /*
         * =====================================
         * ORDER TOTAL
         *
         * Use order total once.
         * Do NOT add the same order total for
         * every item.
         * =====================================
         */

        const currentTotal =
          getOrderTotal(order);


        if (
          currentTotal >
          groupedOrder.totalAmount
        ) {
          groupedOrder.totalAmount =
            currentTotal;
        }


        /*
         * =====================================
         * CASE 1:
         * BACKEND ALREADY RETURNS
         * COMBINED ORDER ITEMS
         *
         * orderItems:
         * "Chicken Biryani-1,
         *  Mutton Biryani-3"
         * =====================================
         */

        const combinedItems =
          order?.orderItems ||
          order?.order_items_text ||
          order?.itemsText ||
          order?.items_text;


        if (
          typeof combinedItems ===
            "string" &&
          combinedItems.trim()
        ) {
          groupedOrder.items.push(
            combinedItems.trim()
          );


          return;
        }


        /*
         * =====================================
         * CASE 2:
         * NESTED ITEMS
         *
         * items: [...]
         * =====================================
         */

        const nestedItems =
          Array.isArray(
            order?.items
          )
            ? order.items
            : Array.isArray(
                order?.orderItems
              )
            ? order.orderItems
            : Array.isArray(
                order?.order_items
              )
            ? order.order_items
            : [];


        if (
          nestedItems.length >
          0
        ) {
          nestedItems.forEach(
            (item) => {

              const itemName =
                item?.itemName ||
                item?.item_name ||
                item?.item ||
                item?.menuName ||
                item?.menu_name ||
                item?.name ||
                "-";


              const quantity =
                Number(
                  item?.quantity ??
                    item?.qty ??
                    0
                );

groupedOrder.items.push(
  makeItemLabel(
    itemName,
    quantity,
    item?.size ||
      item?.portionType ||
      item?.portion_type ||
      order?.size ||
      order?.portionType ||
      order?.portion_type
  )
);

              // groupedOrder.items.push(
              //   makeItemLabel(
              //     itemName,
              //     quantity
              //   )
              // );
            }
          );

          return;
        }


        /*
         * =====================================
         * CASE 3:
         * FLAT API RESPONSE
         *
         * Same order ID can occur in
         * multiple API rows.
         * =====================================
         */

        const itemName =
          order?.itemName ||
          order?.item_name ||
          order?.item ||
          order?.menuName ||
          order?.menu_name ||
          "-";


        const quantity =
          Number(
            order?.quantity ??
              order?.qty ??
              0
          );


        /*
         * Avoid adding a fake "-" item
         * when backend returns no item.
         */

        if (
          itemName !== "-" ||
          quantity > 0
        ) {
          // groupedOrder.items.push(
          //   makeItemLabel(
          //     itemName,
          //     quantity
          //   )
          // );
          groupedOrder.items.push(
  makeItemLabel(
    itemName,
    quantity,
    order?.size || order?.portionType || order?.portion_type
  )
);
        }
      }
    );


    /*
     * =====================================
     * FINAL TABLE DATA
     * =====================================
     */

    return Array.from(
      groupedOrders.values()
    ).map((order) => {

      /*
       * Remove duplicate item strings
       * if API sends duplicate values.
       */

      const uniqueItems =
        [
          ...new Set(
            order.items.filter(
              Boolean
            )
          ),
        ];


      return {
        rowKey:
          order.rowKey,

        orderId:
          order.orderId,

        customerName:
          order.customerName,
        mobile:
          order.mobile,

        location:
          order.location,

        paymentMethod:
          order.paymentMethod,

        paymentStatus:
          order.paymentStatus,

        size:
  order.sizes.length > 0
    ? order.sizes.join(", ")
    : "-",

        orderItems:
          uniqueItems.length > 0
            ? uniqueItems.join(", ")
            : "-",

            
        totalAmount:
          Number(
            order.totalAmount ||
              0
          ),

        createdAt:
          order.createdAt,
      };
    });

  }, [orders]);


  useEffect(() => {
  const validIds = new Set(
    orderRows.map((order) => String(order.orderId))
  );

  setSelectedOrderIds((previous) =>
    previous.filter((id) => validIds.has(id))
  );
}, [orderRows]);


  /* =========================================
     TOTAL PAGES
  ========================================= */

  const totalPages = Math.max(
    1,
    Math.ceil(
      orderRows.length /
        ROWS_PER_PAGE
    )
  );


  /* =========================================
     KEEP PAGE VALID
  ========================================= */

  useEffect(() => {
    if (
      currentPage >
      totalPages
    ) {
      setCurrentPage(
        totalPages
      );
    }
  }, [
    currentPage,
    totalPages,
  ]);


  /* =========================================
     PAGINATION
  ========================================= */

  const paginatedOrders =
    useMemo(() => {

      const startIndex =
        (currentPage - 1) *
        ROWS_PER_PAGE;


      return orderRows.slice(
        startIndex,
        startIndex +
          ROWS_PER_PAGE
      );

    }, [
      orderRows,
      currentPage,
    ]);



    // All order IDs across all pagination pages
const allOrderIds = useMemo(
  () => orderRows.map((order) => String(order.orderId)),
  [orderRows]
);

const allSelected =
  allOrderIds.length > 0 &&
  allOrderIds.every((id) => selectedOrderIds.includes(id));

const someSelected =
  selectedOrderIds.length > 0 && !allSelected;

// Select one order
const handleSelectOrder = (orderId) => {
  const id = String(orderId);

  setSelectedOrderIds((previous) =>
    previous.includes(id)
      ? previous.filter((value) => value !== id)
      : [...previous, id]
  );
};

// Select all orders, including other pagination pages
const handleSelectAll = () => {
  setSelectedOrderIds(
    allSelected ? [] : allOrderIds
  );
};

// Download selected orders from backend
const handleDownloadPdf = async () => {
  if (selectedOrderIds.length === 0 || downloadingPdf) return;

  try {
    setDownloadingPdf(true);
    setDownloadError("");

    const response = await downloadOrdersPdfApi(
      selectedOrderIds.map(Number)
    );

    const blob = new Blob([response.data], {
      type: "application/pdf",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download =
      `biryani-orders-${new Date().toISOString().slice(0, 10)}.pdf`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error("PDF download error:", error);

    setDownloadError(
      "Unable to download the selected orders. Please try again."
    );
  } finally {
    setDownloadingPdf(false);
  }
};
  /* =========================================
     FORMAT AMOUNT
  ========================================= */

  const formatAmount = (
    amount
  ) => {

    const value =
      Number(
        amount || 0
      );


    return `₹${value.toLocaleString(
      "en-IN",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }
    )}`;

  };


  /* =========================================
     FORMAT ORDER DATE
  ========================================= */

  const formatOrderDate = (
    date
  ) => {

    if (!date) {
      return "-";
    }


    const value =
      new Date(date);


    if (
      Number.isNaN(
        value.getTime()
      )
    ) {
      return "-";
    }


    return value.toLocaleString(
      "en-IN",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }
    );

  };


  /* =========================================
     PAGINATION BUTTONS
  ========================================= */

  const handlePrevious = () => {

    setCurrentPage(
      (page) =>
        Math.max(
          1,
          page - 1
        )
    );

  };


  const handleNext = () => {

    setCurrentPage(
      (page) =>
        Math.min(
          totalPages,
          page + 1
        )
    );

  };


  return (

    <div className="w-full min-w-0">

      {/* =====================================
          PAGE HEADER
      ===================================== */}
  <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h2 className="text-xl font-black text-slate-900 sm:text-2xl">
      Orders
    </h2>

    <p className="mt-1 text-xs text-slate-500 sm:text-sm">
      View customer order and payment details.
    </p>
  </div>

  <button
    type="button"
    onClick={handleDownloadPdf}
    disabled={selectedOrderIds.length === 0 || downloadingPdf}
    className="
      inline-flex items-center justify-center gap-2
      rounded-xl bg-[#bf0000] px-5 py-3
      text-sm font-semibold text-white
      shadow-sm transition
      hover:bg-[#990000]
      disabled:cursor-not-allowed
      disabled:opacity-50
      sm:self-auto
    "
  >
    <Download size={17} />

    {downloadingPdf
      ? "Generating PDF..."
      : selectedOrderIds.length > 0
        ? `Download PDF (${selectedOrderIds.length})`
        : "Download PDF"}
  </button>
</div>

{downloadError && (
  <p className="mb-4 text-sm font-medium text-red-600">
    {downloadError}
  </p>
)}
      {/* <div className="mb-5 sm:mb-6">

        <h2 className="text-xl font-black text-slate-900 sm:text-2xl">
          Orders
        </h2>

        <p className="mt-1 text-xs text-slate-500 sm:text-sm">
          View customer order and payment details.
        </p>

      </div> */}


      {/* =====================================
          ERROR
      ===================================== */}

      {error && (

        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </div>

      )}


      {/* =====================================
          ORDERS TABLE
      ===================================== */}

      <div className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white sm:rounded-2xl">

        <div
          className="
            w-full
            max-w-full
            overflow-x-auto
            overflow-y-hidden
            overscroll-x-contain
            [-webkit-overflow-scrolling:touch]
          "
        >

          {/*
            UI kept same.

            Removed:
            Portion
            Quantity
            Payment Method

            Added:
            Order ID
          */}

          {/* <table className="w-full min-w-[1050px] border-collapse"> */}
          <table className="w-full min-w-[1500px] border-collapse">

            <thead>

              <tr className="bg-slate-50">

                {/* ORDER ID */}
                <th className="w-[50px] px-4 py-4 text-center">
  <input
    type="checkbox"
    checked={allSelected}
    ref={(element) => {
      if (element) {
        element.indeterminate = someSelected;
      }
    }}
    onChange={handleSelectAll}
    disabled={loading || allOrderIds.length === 0}
    aria-label="Select all orders"
    className="h-4 w-4 cursor-pointer accent-[#bf0000]"
  />
</th>
                <th className="min-w-[120px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
                  Order ID
                </th>


                {/* CUSTOMER */}

                <th className="min-w-[150px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
                  Customer
                </th>


                {/* MOBILE */}

                <th className="min-w-[145px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
                  Mobile
                </th>

                <th className="min-w-[170px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
                  Location
                </th>

                {/* ORDER ITEM */}

                <th className="min-w-[320px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
                  Order Item
                </th>

{/* <th className="min-w-[120px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
  Size
</th> */}

                {/* TOTAL AMOUNT */}

                <th className="min-w-[150px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
                  Total Amount
                </th>
                <th className="min-w-[170px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
  Payment
</th>


                {/* ORDER DATE */}

                <th className="min-w-[190px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
                  Order Date
                </th>

              </tr>

            </thead>


            <tbody>

              {loading ? (

                <tr>

                  <td
                    colSpan="9"
                    className="px-5 py-16 text-center"
                  >

                    <p className="text-sm font-semibold text-slate-500">
                      Loading orders...
                    </p>

                  </td>

                </tr>

              ) : paginatedOrders.length > 0 ? (

                paginatedOrders.map(
                  (order) => (

                    <tr
                      key={
                        order.rowKey
                      }
                      className="border-t border-slate-100 transition hover:bg-slate-50/70"
                    >

                      <td className="px-4 py-4 text-center">
  <input
    type="checkbox"
    checked={selectedOrderIds.includes(String(order.orderId))}
    onChange={() => handleSelectOrder(order.orderId)}
    aria-label={`Select order ${order.orderId}`}
    className="h-4 w-4 cursor-pointer accent-[#bf0000]"
  />
</td>

                      {/* =========================
                          ORDER ID
                      ========================== */}

                      <td className="whitespace-nowrap px-5 py-4">

                        <span className="text-sm font-bold text-slate-800">

                          #
                          {order.orderId}

                        </span>

                      </td>


                      {/* =========================
                          CUSTOMER
                      ========================== */}

                      <td className="whitespace-nowrap px-5 py-4">

                        <span className="text-sm font-semibold text-slate-800">

                          {order.customerName}

                        </span>

                      </td>


                      {/* =========================
                          MOBILE
                      ========================== */}

                      <td className="whitespace-nowrap px-5 py-4">

                        <span className="text-sm text-slate-600">

                          {order.mobile}

                        </span>

                      </td>

<td className="whitespace-nowrap px-5 py-4">
  <span className="text-sm text-slate-600">
    {order.location}
  </span>
</td>
                      {/* =========================
                          ORDER ITEMS

                          Example:

                          Chicken Biryani-1,
                          Mutton Biryani-3
                      ========================== */}

                      <td className="px-5 py-4">

                        <span className="text-sm font-medium leading-6 text-slate-700">

                          {order.orderItems}

                        </span>

                      </td>

{/* <td className="px-5 py-4">
  <span className="text-sm font-semibold text-slate-700">
    {order.size}
  </span>
</td> */}

                      {/* =========================
                          TOTAL AMOUNT
                      ========================== */}

                      <td className="whitespace-nowrap px-5 py-4">

                        <span className="text-sm font-black text-slate-900">

                          {formatAmount(
                            order.totalAmount
                          )}

                        </span>

                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
  {order.paymentMethod === "COD" && order.paymentStatus !== "paid" ? (
    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
      COD - Collect cash
    </span>
  ) : (
    <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
      {order.paymentMethod === "COD" ? "COD - Paid" : "Paid Online"}
    </span>
  )}
</td>


                      {/* =========================
                          ORDER DATE
                      ========================== */}

                      <td className="whitespace-nowrap px-5 py-4">

                        <span className="text-sm font-medium text-slate-600">

                          {formatOrderDate(
                            order.createdAt
                          )}

                        </span>

                      </td>

                    </tr>

                  )
                )

              ) : (

                <tr>

                  <td
                    colSpan="8"
                    className="px-5 py-16 text-center"
                  >

                    <p className="text-sm font-bold text-slate-700">
                      No orders found
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                     Customer orders will appear here.
                    </p>

                  </td>

                </tr>

              )}

            </tbody>

          </table>

        </div>


        {/* =================================
            PAGINATION
        ================================= */}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">

          <p className="text-xs font-medium text-slate-500">

            Showing{" "}

            {orderRows.length === 0
              ? 0
              : (currentPage - 1) *
                  ROWS_PER_PAGE +
                1}

            {" - "}

            {Math.min(
              currentPage *
                ROWS_PER_PAGE,
              orderRows.length
            )}

            {" of "}

            {orderRows.length}

            {selectedOrderIds.length > 0 && (
  <span className="font-semibold text-[#bf0000]">
    {" | "}
    {selectedOrderIds.length} selected
  </span>
)}

          </p>


          <div className="flex items-center gap-3">

            <button
              type="button"
              onClick={
                handlePrevious
              }
              disabled={
                currentPage === 1
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >

              <ChevronLeft
                size={17}
              />

            </button>


            <span className="min-w-[55px] whitespace-nowrap text-center text-sm font-bold text-slate-700">

              {currentPage}

              {" / "}

              {totalPages}

            </span>


            <button
              type="button"
              onClick={
                handleNext
              }
              disabled={
                currentPage ===
                totalPages
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >

              <ChevronRight
                size={17}
              />

            </button>

          </div>

        </div>

      </div>


      {/* =====================================
          MOBILE / TABLET SWIPE MESSAGE
      ===================================== */}

      <p className="mt-3 text-center text-[11px] font-medium text-slate-400 lg:hidden">
        Swipe left or right to view all order details
      </p>

    </div>

  );
}






// import {
//   ChevronLeft,
//   ChevronRight,
// } from "lucide-react";

// import {
//   useCallback,
//   useEffect,
//   useMemo,
//   useState,
// } from "react";

// import {
//   getOrdersApi,
// } from "../api/orderApi";


// const ROWS_PER_PAGE = 10;


// export default function OrdersPage() {
//   const [orders, setOrders] = useState([]);
//   const [currentPage, setCurrentPage] = useState(1);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");


//   /* =========================================
//      LOAD ORDERS FROM BACKEND API ONLY
//   ========================================= */

//   const loadOrders = useCallback(async () => {
//     try {
//       setLoading(true);
//       setError("");

//       const response = await getOrdersApi();

//       /*
//         Supported response:

//         {
//           success: true,
//           data: [...]
//         }
//       */

//       const apiOrders = response?.data?.data;

//       setOrders(
//         Array.isArray(apiOrders)
//           ? apiOrders
//           : []
//       );
//     } catch (error) {
//       console.error(
//         "Orders fetch error:",
//         error
//       );

//       setOrders([]);

//       setError(
//         error?.response?.data?.message ||
//           "Unable to load orders."
//       );
//     } finally {
//       setLoading(false);
//     }
//   }, []);


//   useEffect(() => {
//     loadOrders();
//   }, [loadOrders]);


//   /* =========================================
//      NORMALIZE + GROUP ORDER DATA

//      IMPORTANT:

//      One Order ID = One Table Row

//      Example:

//      Order ID: 25

//      Chicken Biryani-1,
//      Mutton Biryani-3

//      Supports:

//      1. Nested response
//         {
//           id: 25,
//           items: [...]
//         }

//      2. Flat response
//         Multiple rows with same orderId

//      3. Already grouped backend response
//         orderItems:
//         "Chicken Biryani-1, Mutton Biryani-3"
//   ========================================= */

//   const orderRows = useMemo(() => {
//     const groupedOrders = new Map();


//     const getOrderId = (
//       order,
//       fallbackIndex
//     ) => {
//       return (
//         order?.orderId ??
//         order?.order_id ??
//         order?.id ??
//         fallbackIndex
//       );
//     };


//     const getCustomerName = (order) => {
//       return (
//         order?.customerName ||
//         order?.customer_name ||
//         order?.name ||
//         "-"
//       );
//     };


//     const getMobile = (order) => {
//       return (
//         order?.mobile ||
//         order?.mobileNumber ||
//         order?.mobile_number ||
//         order?.phone ||
//         "-"
//       );
//     };


//     const getCreatedAt = (order) => {
//       return (
//         order?.createdAt ||
//         order?.created_at ||
//         order?.orderDate ||
//         order?.order_date ||
//         null
//       );
//     };


//     const getOrderTotal = (order) => {
//       return Number(
//         order?.totalAmount ??
//           order?.total_amount ??
//           order?.grandTotal ??
//           order?.grand_total ??
//           order?.total ??
//           0
//       );
//     };


//     const makeItemLabel = (
//       itemName,
//       quantity
//     ) => {
//       const name =
//         String(
//           itemName || "-"
//         ).trim() || "-";

//       const qty = Number(
//         quantity ?? 0
//       );

//       return `${name}-${qty}`;
//     };


//     orders.forEach(
//       (order, orderIndex) => {

//         const orderId =
//           getOrderId(
//             order,
//             orderIndex
//           );


//         const groupKey =
//           String(orderId);


//         /*
//          * =====================================
//          * CREATE ORDER GROUP
//          * =====================================
//          */

//         if (
//           !groupedOrders.has(
//             groupKey
//           )
//         ) {
//           groupedOrders.set(
//             groupKey,
//             {
//               rowKey:
//                 `order-${groupKey}`,

//               orderId,

//               customerName:
//                 getCustomerName(
//                   order
//                 ),

//               mobile:
//                 getMobile(order),

//               location: order?.location || "-",

//               items: [],

//               sizes: [],

//               totalAmount:
//                 getOrderTotal(
//                   order
//                 ),

//               createdAt:
//                 getCreatedAt(
//                   order
//                 ),
//             }
//           );
//         }


//         const groupedOrder =
//           groupedOrders.get(
//             groupKey
//           );

//           const addSize = (size) => {
//   const value = String(size || "").trim();

//   if (
//     value &&
//     !groupedOrder.sizes.includes(value)
//   ) {
//     groupedOrder.sizes.push(value);
//   }
// };

// const sizeItems = Array.isArray(order?.items)
//   ? order.items
//   : Array.isArray(order?.orderItems)
//     ? order.orderItems
//     : Array.isArray(order?.order_items)
//       ? order.order_items
//       : [];

// if (sizeItems.length > 0) {
//   sizeItems.forEach((item) => {
//     addSize(
//       item?.size ||
//       item?.portionType ||
//       item?.portion_type
//     );
//   });
// } else {
//   addSize(
//     order?.size ||
//     order?.portionType ||
//     order?.portion_type
//   );
// }

//         /*
//          * =====================================
//          * KEEP ORDER INFORMATION
//          * =====================================
//          */

//         if (
//           groupedOrder.customerName ===
//             "-" &&
//           getCustomerName(order) !==
//             "-"
//         ) {
//           groupedOrder.customerName =
//             getCustomerName(
//               order
//             );
//         }


//         if (
//           groupedOrder.mobile ===
//             "-" &&
//           getMobile(order) !==
//             "-"
//         ) {
//           groupedOrder.mobile =
//             getMobile(order);
//         }

//         if (
//   groupedOrder.location === "-" &&
//   order?.location
// ) {
//   groupedOrder.location = order.location;
// }

//         if (
//           !groupedOrder.createdAt &&
//           getCreatedAt(order)
//         ) {
//           groupedOrder.createdAt =
//             getCreatedAt(
//               order
//             );
//         }


//         /*
//          * =====================================
//          * ORDER TOTAL
//          *
//          * Use order total once.
//          * Do NOT add the same order total for
//          * every item.
//          * =====================================
//          */

//         const currentTotal =
//           getOrderTotal(order);


//         if (
//           currentTotal >
//           groupedOrder.totalAmount
//         ) {
//           groupedOrder.totalAmount =
//             currentTotal;
//         }


//         /*
//          * =====================================
//          * CASE 1:
//          * BACKEND ALREADY RETURNS
//          * COMBINED ORDER ITEMS
//          *
//          * orderItems:
//          * "Chicken Biryani-1,
//          *  Mutton Biryani-3"
//          * =====================================
//          */

//         const combinedItems =
//           order?.orderItems ||
//           order?.order_items_text ||
//           order?.itemsText ||
//           order?.items_text;


//         if (
//           typeof combinedItems ===
//             "string" &&
//           combinedItems.trim()
//         ) {
//           groupedOrder.items.push(
//             combinedItems.trim()
//           );

//           return;
//         }


//         /*
//          * =====================================
//          * CASE 2:
//          * NESTED ITEMS
//          *
//          * items: [...]
//          * =====================================
//          */

//         const nestedItems =
//           Array.isArray(
//             order?.items
//           )
//             ? order.items
//             : Array.isArray(
//                 order?.orderItems
//               )
//             ? order.orderItems
//             : Array.isArray(
//                 order?.order_items
//               )
//             ? order.order_items
//             : [];


//         if (
//           nestedItems.length >
//           0
//         ) {
//           nestedItems.forEach(
//             (item) => {

//               const itemName =
//                 item?.itemName ||
//                 item?.item_name ||
//                 item?.item ||
//                 item?.menuName ||
//                 item?.menu_name ||
//                 item?.name ||
//                 "-";


//               const quantity =
//                 Number(
//                   item?.quantity ??
//                     item?.qty ??
//                     0
//                 );


//               groupedOrder.items.push(
//                 makeItemLabel(
//                   itemName,
//                   quantity
//                 )
//               );
//             }
//           );

//           return;
//         }


//         /*
//          * =====================================
//          * CASE 3:
//          * FLAT API RESPONSE
//          *
//          * Same order ID can occur in
//          * multiple API rows.
//          * =====================================
//          */

//         const itemName =
//           order?.itemName ||
//           order?.item_name ||
//           order?.item ||
//           order?.menuName ||
//           order?.menu_name ||
//           "-";


//         const quantity =
//           Number(
//             order?.quantity ??
//               order?.qty ??
//               0
//           );


//         /*
//          * Avoid adding a fake "-" item
//          * when backend returns no item.
//          */

//         if (
//           itemName !== "-" ||
//           quantity > 0
//         ) {
//           groupedOrder.items.push(
//             makeItemLabel(
//               itemName,
//               quantity
//             )
//           );
//         }
//       }
//     );


//     /*
//      * =====================================
//      * FINAL TABLE DATA
//      * =====================================
//      */

//     return Array.from(
//       groupedOrders.values()
//     ).map((order) => {

//       /*
//        * Remove duplicate item strings
//        * if API sends duplicate values.
//        */

//       const uniqueItems =
//         [
//           ...new Set(
//             order.items.filter(
//               Boolean
//             )
//           ),
//         ];


//       return {
//         rowKey:
//           order.rowKey,

//         orderId:
//           order.orderId,

//         customerName:
//           order.customerName,

//         mobile:
//           order.mobile,

//           location:
//   order.location,

// size:
//   order.sizes.length > 0
//     ? order.sizes.join(", ")
//     : "-",

//         orderItems:
//           uniqueItems.length > 0
//             ? uniqueItems.join(", ")
//             : "-",

            
//         totalAmount:
//           Number(
//             order.totalAmount ||
//               0
//           ),

//         createdAt:
//           order.createdAt,
//       };
//     });

//   }, [orders]);


//   /* =========================================
//      TOTAL PAGES
//   ========================================= */

//   const totalPages = Math.max(
//     1,
//     Math.ceil(
//       orderRows.length /
//         ROWS_PER_PAGE
//     )
//   );


//   /* =========================================
//      KEEP PAGE VALID
//   ========================================= */

//   useEffect(() => {
//     if (
//       currentPage >
//       totalPages
//     ) {
//       setCurrentPage(
//         totalPages
//       );
//     }
//   }, [
//     currentPage,
//     totalPages,
//   ]);


//   /* =========================================
//      PAGINATION
//   ========================================= */

//   const paginatedOrders =
//     useMemo(() => {

//       const startIndex =
//         (currentPage - 1) *
//         ROWS_PER_PAGE;


//       return orderRows.slice(
//         startIndex,
//         startIndex +
//           ROWS_PER_PAGE
//       );

//     }, [
//       orderRows,
//       currentPage,
//     ]);


//   /* =========================================
//      FORMAT AMOUNT
//   ========================================= */

//   const formatAmount = (
//     amount
//   ) => {

//     const value =
//       Number(
//         amount || 0
//       );


//     return `₹${value.toLocaleString(
//       "en-IN",
//       {
//         minimumFractionDigits: 0,
//         maximumFractionDigits: 2,
//       }
//     )}`;

//   };


//   /* =========================================
//      FORMAT ORDER DATE
//   ========================================= */

//   const formatOrderDate = (
//     date
//   ) => {

//     if (!date) {
//       return "-";
//     }


//     const value =
//       new Date(date);


//     if (
//       Number.isNaN(
//         value.getTime()
//       )
//     ) {
//       return "-";
//     }


//     return value.toLocaleString(
//       "en-IN",
//       {
//         day: "2-digit",
//         month: "2-digit",
//         year: "numeric",
//         hour: "2-digit",
//         minute: "2-digit",
//         hour12: true,
//       }
//     );

//   };


//   /* =========================================
//      PAGINATION BUTTONS
//   ========================================= */

//   const handlePrevious = () => {

//     setCurrentPage(
//       (page) =>
//         Math.max(
//           1,
//           page - 1
//         )
//     );

//   };


//   const handleNext = () => {

//     setCurrentPage(
//       (page) =>
//         Math.min(
//           totalPages,
//           page + 1
//         )
//     );

//   };


//   return (

//     <div className="w-full min-w-0">

//       {/* =====================================
//           PAGE HEADER
//       ===================================== */}

//       <div className="mb-5 sm:mb-6">

//         <h2 className="text-xl font-black text-slate-900 sm:text-2xl">
//           Orders
//         </h2>

//         <p className="mt-1 text-xs text-slate-500 sm:text-sm">
//           View customer order and payment details.
//         </p>

//       </div>


//       {/* =====================================
//           ERROR
//       ===================================== */}

//       {error && (

//         <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
//           {error}
//         </div>

//       )}


//       {/* =====================================
//           ORDERS TABLE
//       ===================================== */}

//       <div className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white sm:rounded-2xl">

//         <div
//           className="
//             w-full
//             max-w-full
//             overflow-x-auto
//             overflow-y-hidden
//             overscroll-x-contain
//             [-webkit-overflow-scrolling:touch]
//           "
//         >

//           {/*
//             UI kept same.

//             Removed:
//             Portion
//             Quantity
//             Payment Method

//             Added:
//             Order ID
//           */}

//           {/* <table className="w-full min-w-[1050px] border-collapse"> */}
//           <table className="w-full min-w-[1350px] border-collapse">

//             <thead>

//               <tr className="bg-slate-50">

//                 {/* ORDER ID */}

//                 <th className="min-w-[120px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
//                   Order ID
//                 </th>


//                 {/* CUSTOMER */}

//                 <th className="min-w-[150px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
//                   Customer
//                 </th>


//                 {/* MOBILE */}

//                 <th className="min-w-[145px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
//                   Mobile
//                 </th>

//                 <th className="min-w-[170px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
//                   Location
//                 </th>

//                 {/* ORDER ITEM */}

//                 <th className="min-w-[320px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
//                   Order Item
//                 </th>

// {/* <th className="min-w-[120px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
//   Size
// </th> */}

//                 {/* TOTAL AMOUNT */}

//                 <th className="min-w-[150px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
//                   Total Amount
//                 </th>


//                 {/* ORDER DATE */}

//                 <th className="min-w-[190px] whitespace-nowrap px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
//                   Order Date
//                 </th>

//               </tr>

//             </thead>


//             <tbody>

//               {loading ? (

//                 <tr>

//                   <td
//                     colSpan="7"
//                     className="px-5 py-16 text-center"
//                   >

//                     <p className="text-sm font-semibold text-slate-500">
//                       Loading orders...
//                     </p>

//                   </td>

//                 </tr>

//               ) : paginatedOrders.length > 0 ? (

//                 paginatedOrders.map(
//                   (order) => (

//                     <tr
//                       key={
//                         order.rowKey
//                       }
//                       className="border-t border-slate-100 transition hover:bg-slate-50/70"
//                     >

//                       {/* =========================
//                           ORDER ID
//                       ========================== */}

//                       <td className="whitespace-nowrap px-5 py-4">

//                         <span className="text-sm font-bold text-slate-800">

//                           #
//                           {order.orderId}

//                         </span>

//                       </td>


//                       {/* =========================
//                           CUSTOMER
//                       ========================== */}

//                       <td className="whitespace-nowrap px-5 py-4">

//                         <span className="text-sm font-semibold text-slate-800">

//                           {order.customerName}

//                         </span>

//                       </td>


//                       {/* =========================
//                           MOBILE
//                       ========================== */}

//                       <td className="whitespace-nowrap px-5 py-4">

//                         <span className="text-sm text-slate-600">

//                           {order.mobile}

//                         </span>

//                       </td>

// <td className="whitespace-nowrap px-5 py-4">
//   <span className="text-sm text-slate-600">
//     {order.location}
//   </span>
// </td>
//                       {/* =========================
//                           ORDER ITEMS

//                           Example:

//                           Chicken Biryani-1,
//                           Mutton Biryani-3
//                       ========================== */}

//                       <td className="px-5 py-4">

//                         <span className="text-sm font-medium leading-6 text-slate-700">

//                           {order.orderItems}

//                         </span>

//                       </td>

// {/* <td className="px-5 py-4">
//   <span className="text-sm font-semibold text-slate-700">
//     {order.size}
//   </span>
// </td> */}

//                       {/* =========================
//                           TOTAL AMOUNT
//                       ========================== */}

//                       <td className="whitespace-nowrap px-5 py-4">

//                         <span className="text-sm font-black text-slate-900">

//                           {formatAmount(
//                             order.totalAmount
//                           )}

//                         </span>

//                       </td>


//                       {/* =========================
//                           ORDER DATE
//                       ========================== */}

//                       <td className="whitespace-nowrap px-5 py-4">

//                         <span className="text-sm font-medium text-slate-600">

//                           {formatOrderDate(
//                             order.createdAt
//                           )}

//                         </span>

//                       </td>

//                     </tr>

//                   )
//                 )

//               ) : (

//                 <tr>

//                   <td
//                     colSpan="7"
//                     className="px-5 py-16 text-center"
//                   >

//                     <p className="text-sm font-bold text-slate-700">
//                       No orders found
//                     </p>

//                     <p className="mt-1 text-xs text-slate-400">
//                       Successful customer orders will appear here.
//                     </p>

//                   </td>

//                 </tr>

//               )}

//             </tbody>

//           </table>

//         </div>


//         {/* =================================
//             PAGINATION
//         ================================= */}

//         <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">

//           <p className="text-xs font-medium text-slate-500">

//             Showing{" "}

//             {orderRows.length === 0
//               ? 0
//               : (currentPage - 1) *
//                   ROWS_PER_PAGE +
//                 1}

//             {" - "}

//             {Math.min(
//               currentPage *
//                 ROWS_PER_PAGE,
//               orderRows.length
//             )}

//             {" of "}

//             {orderRows.length}

//           </p>


//           <div className="flex items-center gap-3">

//             <button
//               type="button"
//               onClick={
//                 handlePrevious
//               }
//               disabled={
//                 currentPage === 1
//               }
//               className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
//             >

//               <ChevronLeft
//                 size={17}
//               />

//             </button>


//             <span className="min-w-[55px] whitespace-nowrap text-center text-sm font-bold text-slate-700">

//               {currentPage}

//               {" / "}

//               {totalPages}

//             </span>


//             <button
//               type="button"
//               onClick={
//                 handleNext
//               }
//               disabled={
//                 currentPage ===
//                 totalPages
//               }
//               className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
//             >

//               <ChevronRight
//                 size={17}
//               />

//             </button>

//           </div>

//         </div>

//       </div>


//       {/* =====================================
//           MOBILE / TABLET SWIPE MESSAGE
//       ===================================== */}

//       <p className="mt-3 text-center text-[11px] font-medium text-slate-400 lg:hidden">
//         Swipe left or right to view all order details
//       </p>

//     </div>

//   );
// }






