# Dhan API v2 — Orders & Trades Reference

Base URLs:
- **Live**: `https://api.dhan.co/v2`
- **Sandbox (Paper)**: `https://sandbox.dhan.co/v2`

All requests require **`access-token`** header.

---

## Order Status Enum

| Status | Description |
|---|---|
| `TRANSIT` | Did not reach the exchange server |
| `PENDING` | Reached exchange, awaiting execution |
| `REJECTED` | Rejected at exchange/broker's end |
| `CANCELLED` | Cancelled by user |
| `PART_TRADED` | Partially executed |
| `TRADED` | Fully executed |
| `EXPIRED` | Validity of order expired |
| `MODIFIED` | Order modified (returned by modify endpoint) |
| `TRIGGERED` | Order triggered (returned by modify/super order endpoints) |

---

## Orders

### GET `/orders` — Get All Orders
Returns array of all orders placed today with last updated status.

**Response fields:** `dhanClientId`, `orderId`, `exchangeOrderId`, `correlationId`, `orderStatus`, `transactionType`, `exchangeSegment`, `productType`, `orderType`, `validity`, `tradingSymbol`, `securityId`, `quantity` (int32), `disclosedQuantity` (int32), `price` (float), `triggerPrice` (float), `afterMarketOrder`, `boProfitValue`, `boStopLossValue`, `legName`, `createTime`, `updateTime`, `exchangeTime`, `drvExpiryDate`, `drvOptionType`, `drvStrikePrice`, `omsErrorCode`, `omsErrorDescription`, `algoId`, `remainingQuantity`, `averageTradedPrice`, `filledQty`

---

### GET `/orders/{order-id}` — Get Order by ID
Returns details and latest status of a specific order.

**Path:** `order-id` (required)

**Response:** Same fields as Get All Orders (single object, not array).

---

### GET `/orders/external/{correlation-id}` — Get Order by Correlation ID
Retrieve order details using the user-provided `correlationId` set at order placement.

**Path:** `correlation-id` (required)

**Response:** Same fields as Get All Orders (single object).

---

### POST `/orders` — Place Order

**Body fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `dhanClientId` | string | | Auto-filled from broker account |
| `correlationId` | string | | User tracking ID, max 25 chars |
| `transactionType` | `BUY \| SELL` | ✓ | |
| `exchangeSegment` | string | ✓ | See Exchange Segment Enum |
| `productType` | string | | See Product Type Enum |
| `orderType` | string | | See Order Type Enum |
| `validity` | `DAY \| IOC` | | Default: `DAY` |
| `securityId` | string | ✓ | Exchange scrip ID |
| `quantity` | int32 | ✓ | **Must be integer, not string** |
| `disclosedQuantity` | int32 | | Min 30% of quantity if used |
| `price` | float | | Required for LIMIT/STOP_LOSS |
| `triggerPrice` | float | | Required for STOP_LOSS/STOP_LOSS_MARKET |
| `afterMarketOrder` | boolean | | |
| `amoTime` | `OPEN \| OPEN_30 \| OPEN_60 \| PRE_OPEN` | | If AMO |
| `boProfitValue` | float | | BO target price |
| `boStopLossValue` | float | | BO/CO stop loss |

**Response:** `{ orderId, orderStatus }`

> ⚠️ **Important**: `quantity`, `price`, `triggerPrice` must be sent as **numbers** (not strings).

---

### POST `/orders/slicing` — Place Slice Order
Same body as Place Order. Response is an **array** of `{ orderId, orderStatus }`.

---

### PUT `/orders/{order-id}` — Modify Order
Modifies a pending order. Only `price`, `quantity`, `orderType`, `validity`, `disclosedQuantity`, `triggerPrice` can be changed.

**Body fields:**

| Field | Type | Required |
|---|---|---|
| `dhanClientId` | string | |
| `orderId` | string | ✓ |
| `orderType` | `LIMIT \| MARKET \| STOP_LOSS \| STOP_LOSS_MARKET` | ✓ |
| `legName` | `ENTRY_LEG \| STOP_LOSS_LEG \| TARGET_LEG \| NA` | |
| `quantity` | int32 | |
| `price` | float | |
| `disclosedQuantity` | int32 | |
| `triggerPrice` | float | |
| `validity` | `DAY \| IOC` | |

**Response:** `{ orderId, orderStatus }` — status may be `MODIFIED`

---

### DELETE `/orders/{order-id}` — Cancel Order
Cancels a pending order by order ID.

**Response:** `{ orderId, orderStatus }` — status will be `CANCELLED`

---

## Trades

### GET `/trades` — Get All Trades
Returns all trades executed today.

**Response fields:** `dhanClientId`, `orderId`, `exchangeOrderId`, `exchangeTradeId`, `transactionType`, `exchangeSegment`, `productType`, `orderType`, `tradingSymbol`, `customSymbol`, `securityId`, `tradedQuantity` (int32), `tradedPrice` (float), `createTime`, `updateTime`, `exchangeTime`, `drvExpiryDate`, `drvOptionType`, `drvStrikePrice`

---

### GET `/trades/{order-id}` — Get Trades by Order ID
Returns all execution fills for a specific order (useful for partial fills, BO/CO orders).

**Response:** Array of trade objects (same fields as Get All Trades).

---

### GET `/trades/{from-date}/{to-date}/{page-number}` — Trade History
Historical trades with brokerage breakdown. Date format: `yyyy-MM-dd`. Page default: `0`.

**Additional response fields:** `isin`, `instrument`, `sebiTax`, `stt`, `brokerageCharges`, `serviceTax`, `exchangeTransactionCharges`, `stampDuty`

---

## Enumerations

### Exchange Segment
| Value | Exchange | Segment |
|---|---|---|
| `NSE_EQ` | NSE | Equity Cash |
| `NSE_FNO` | NSE | Futures & Options |
| `NSE_CURRENCY` | NSE | Currency |
| `BSE_EQ` | BSE | Equity Cash |
| `BSE_FNO` | BSE | Futures & Options |
| `BSE_CURRENCY` | BSE | Currency |
| `MCX_COMM` | MCX | Commodity |

### Product Type
| Value | Description |
|---|---|
| `CNC` | Cash & Carry (equity delivery) |
| `INTRADAY` | Intraday |
| `MARGIN` | Carry Forward (F&O) |
| `MTF` | Margin Traded Fund |
| `CO` | Cover Order (entry + SL) — Intraday only |
| `BO` | Bracket Order (entry + SL + target) — Intraday only |

### Order Type
| Value | Description |
|---|---|
| `LIMIT` | Limit order |
| `MARKET` | Market order |
| `STOP_LOSS` | Stop Loss Limit |
| `STOP_LOSS_MARKET` | Stop Loss Market |

### Leg Name
`ENTRY_LEG` | `STOP_LOSS_LEG` | `TARGET_LEG` | `NA`

### Option Type
`CALL` | `PUT` | `NA`

---

## Our Internal API Endpoints (Proxied via Vercel)

| Handler | Route | Dhan Endpoint |
|---|---|---|
| `dhan-orderbook` | `GET /api/dhan-orderbook?brokerId=` | `GET /v2/orders` |
| `dhan-get-order` | `GET /api/dhan-get-order?brokerId=&orderId=` | `GET /v2/orders/{id}` |
| `dhan-get-order` | `GET /api/dhan-get-order?brokerId=&correlationId=` | `GET /v2/orders/external/{id}` |
| `dhan-order` | `POST /api/dhan-order` | `POST /v2/orders` |
| `dhan-order` (slicing) | `POST /api/dhan-order` with `slicing: true` | `POST /v2/orders/slicing` |
| `dhan-modify-order` | `PUT /api/dhan-modify-order` | `PUT /v2/orders/{id}` |
| `dhan-cancel-order` | `DELETE /api/dhan-cancel-order` | `DELETE /v2/orders/{id}` |
| `dhan-tradebook` | `GET /api/dhan-tradebook?brokerId=` | `GET /v2/trades` |
| `dhan-tradebook` | `GET /api/dhan-tradebook?brokerId=&orderId=` | `GET /v2/trades/{id}` |
| `dhan-trade-history` | `GET /api/dhan-trade-history?brokerId=&fromDate=&toDate=&page=` | `GET /v2/trades/{from}/{to}/{page}` |
