const PDFDocument = require("pdfkit");
const db = require("../config/db");

const BRAND_RED = "#bf0000";

const cleanText = (value) =>
  String(value ?? "").trim();

const formatAmount = (amount) =>
  `Rs. ${Number(amount || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

const formatDate = (date) => {
  if (!date) return "-";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "-";

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/* =========================================
   TABLE SETTINGS
   Total width = 505 (fits A4 with 45pt margins)
========================================= */

const TABLE_COLUMNS = [
  { label: "Order ID",   key: "id",            width: 55  },
  { label: "Customer",   key: "customer_name", width: 90  },
  { label: "Location",   key: "location",      width: 90  },
  { label: "Mobile",     key: "mobile",        width: 85  },
  { label: "Order Item", key: "orderItems",    width: 185 },
];

const CELL_PADDING_X = 8;
const CELL_PADDING_Y = 8;
const FONT_SIZE = 9;

function drawTableHeader(doc, left, y) {
  const totalWidth = TABLE_COLUMNS.reduce((sum, c) => sum + c.width, 0);
  const headerHeight = 28;

  doc.rect(left, y, totalWidth, headerHeight).fill(BRAND_RED);

  let x = left;

  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(FONT_SIZE);

  TABLE_COLUMNS.forEach((col) => {
    doc.text(col.label.toUpperCase(), x + CELL_PADDING_X, y + 10, {
      width: col.width - CELL_PADDING_X * 2,
      lineBreak: false,
    });
    x += col.width;
  });

  return y + headerHeight;
}

function drawOrdersTable(doc, orders) {
  const left = 45;
  const totalWidth = TABLE_COLUMNS.reduce((sum, c) => sum + c.width, 0);
  const bottomLimit = doc.page.height - 55;

  let y = drawTableHeader(doc, left, doc.y);

  orders.forEach((order, index) => {
    // Measure the tallest cell in this row
    doc.font("Helvetica").fontSize(FONT_SIZE);

    const cellTexts = TABLE_COLUMNS.map((col) =>
      col.key === "id"
        ? `#${order.id}`
        : cleanText(order[col.key]) || "-"
    );

    const rowHeight = Math.max(
      28,
      ...cellTexts.map(
        (text, i) =>
          doc.heightOfString(text, {
            width: TABLE_COLUMNS[i].width - CELL_PADDING_X * 2,
          }) +
          CELL_PADDING_Y * 2
      )
    );

    // New page + repeat header if the row doesn't fit
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = drawTableHeader(doc, left, doc.page.margins.top);
    }

    // Row background (zebra striping)
    doc
      .rect(left, y, totalWidth, rowHeight)
      .fill(index % 2 === 0 ? "#ffffff" : "#f8fafc");

    // Row border
    doc
      .rect(left, y, totalWidth, rowHeight)
      .lineWidth(0.5)
      .stroke("#d6dce2");

    // Cells
    let x = left;

    TABLE_COLUMNS.forEach((col, i) => {
      if (i > 0) {
        doc
          .moveTo(x, y)
          .lineTo(x, y + rowHeight)
          .lineWidth(0.5)
          .stroke("#d6dce2");
      }

      doc
        .fillColor("#334155")
        .font(col.key === "id" ? "Helvetica-Bold" : "Helvetica")
        .fontSize(FONT_SIZE)
        .text(cellTexts[i], x + CELL_PADDING_X, y + CELL_PADDING_Y, {
          width: col.width - CELL_PADDING_X * 2,
        });

      x += col.width;
    });

    y += rowHeight;
    doc.y = y;
  });
}

/* =========================================
   DOWNLOAD ORDERS PDF
========================================= */

exports.downloadOrdersPdf = async (req, res) => {
  try {
    const rawIds = req.body?.orderIds;

    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one order.",
      });
    }

    const orderIds = [...new Set(rawIds.map(Number))];

    if (
      orderIds.length > 500 ||
      orderIds.some(
        (id) => !Number.isSafeInteger(id) || id <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid order selection.",
      });
    }

    const placeholders = orderIds.map(() => "?").join(",");

    const [orders] = await db.execute(
      `SELECT
         id,
         customer_name,
         mobile,
         location,
         total_amount,
         created_at
       FROM orders
       WHERE id IN (${placeholders})
         AND payment_status = 'paid'`,
      orderIds
    );

    if (orders.length !== orderIds.length) {
      return res.status(400).json({
        success: false,
        message:
          "One or more selected orders are unavailable or unpaid.",
      });
    }

    const [items] = await db.execute(
      `SELECT
         oi.order_id,
         oi.quantity,
         oi.portion_type,
         mi.name AS item_name
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id IN (${placeholders})
       ORDER BY oi.order_id, oi.id`,
      orderIds
    );

    const itemMap = new Map();

    items.forEach((item) => {
      const id = Number(item.order_id);

      if (!itemMap.has(id)) itemMap.set(id, []);

      const name = cleanText(item.item_name) || "Item";
      const size = cleanText(item.portion_type);
      const quantity = Number(item.quantity || 0);

      itemMap.get(id).push(
        `${name}${size ? ` (${size})` : ""}-${quantity}`
      );
    });

    const orderMap = new Map(
      orders.map((order) => [Number(order.id), order])
    );

    const selectedOrders = orderIds.map((id) => {
      const order = orderMap.get(id);

      return {
        ...order,
        orderItems: (itemMap.get(id) || []).join(", ") || "-",
      };
    });

    const doc = new PDFDocument({
      size: "A4",
      margin: 45,
      bufferPages: true,
    });

    const filename =
      `biryani-orders-${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    doc.pipe(res);

    doc.fillColor(BRAND_RED)
      .font("Helvetica-Bold")
      .fontSize(19)
      .text("Biryani House - Order Details");

    doc.moveDown(0.3);

    doc.fillColor("#64748b")
      .font("Helvetica")
      .fontSize(9)
      .text(
        `Generated: ${formatDate(new Date())}    |    Orders: ${selectedOrders.length}`
      );

    doc.moveDown(1.5);

    // ⬇️ This is the changed line (table instead of cards)
    drawOrdersTable(doc, selectedOrders);

    doc.end();
  } catch (error) {
    console.error("Download orders PDF error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Unable to generate orders PDF.",
      });
    }

    res.destroy(error);
  }
};