// ── Role & Tier enums ──────────────────────────────────────────────────────
export type UserRole = 'super_admin' | 'admin' | 'member' | 'viewer';
export type UserTier = 'free' | 'pro' | 'elite';

// ── Trade core types ───────────────────────────────────────────────────────
export type Protocol =
  | 'PROTECTOR'
  | 'HALF_AND_HALF'
  | 'DOUBLE_SCALPER'
  | 'SINGLE_SCALPER';

export type TradeStatus = 'ACTIVE' | 'CLOSED' | 'KILLED' | 'SL_HIT';
export type TradeMode = 'PAPER' | 'LIVE';
export type TradeOrigin = 'SELF' | 'COPY';
export type TargetMode = 'MOMENTUM' | 'MANUAL';
export type LtpSource = 'BROKER' | 'SIM';

export type TradeEventType =
  | 'T1_HIT'
  | 'T2_HIT'
  | 'T3_HIT'
  | 'SL_HIT'
  | 'SL_TRAILED'
  | 'TRADE_OPENED'
  | 'TRADE_CLOSED'
  | 'TRADE_KILLED';

export type OrderType =
  | 'ENTRY'
  | 'EXIT_T1'
  | 'EXIT_T2'
  | 'EXIT_T3'
  | 'EXIT_SL'
  | 'CANCEL_SL'
  | 'TRAIL_SL';

export type BrokerOrderStatus =
  | 'PENDING'
  | 'FILLED'
  | 'REJECTED'
  | 'CANCELLED';

export type BrokerHealthState = 'HEALTHY' | 'DEGRADED' | 'DOWN';
export type BrokerName = 'dhan' | 'zerodha' | 'upstox';

// ── Profile ────────────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  tier: UserTier;
  is_active: boolean;
  daily_trades_used: number;
  daily_trades_reset_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DhanAuthMethod = 'manual' | 'oauth' | 'totp';

// ── Broker Account ─────────────────────────────────────────────────────────
export interface BrokerAccount {
  id: string;
  user_id: string;
  broker: string;
  client_id: string;
  /** In OAuth mode: Dhan app_id (API Key). In manual mode: any key identifier. */
  api_key: string;
  access_token: string | null;
  auth_method: DhanAuthMethod;
  /** OAuth only: app_secret is never returned to frontend by default */
  app_secret?: string | null;
  token_expires_at: string | null;
  is_active: boolean;
  mode: 'LIVE' | 'PAPER';
  health_status: 'OK' | 'ERROR' | 'UNKNOWN' | null;
  failure_count: number;
  last_checked_at: string | null;
  created_at: string;
}

// ── Trade Node (core table) ────────────────────────────────────────────────
export interface TradeNode {
  id: string;
  user_id: string;
  broker_account_id: string | null;
  origin: TradeOrigin;
  parent_trade_id: string | null;
  symbol: string;
  strike: string;
  trading_symbol: string;
  security_id: string | null;
  exchange: string;
  protocol: Protocol;
  target_mode: TargetMode;
  mode: TradeMode;
  entry_price: number;
  ltp: number | null;
  sl: number;
  initial_sl: number;
  t1: number;
  t2: number;
  t3: number;
  lots: number;
  lot_size: number;
  remaining_quantity: number;
  remaining_buckets: number;
  lots_per_bucket: number;
  qty_per_bucket: number;
  t1_hit: boolean;
  t2_hit: boolean;
  t3_hit: boolean;
  sl_hit: boolean;
  is_processing: boolean;
  booked_pnl: number;
  max_price_reached: number | null;
  broker_order_id: string | null;
  sl_order_id: string | null;
  exit_price: number | null;
  realised_pnl: number | null;
  is_master_signal: boolean;
  is_copy_trade: boolean;
  copied_from: string | null;
  status: TradeStatus;
  ltp_source: LtpSource;
  created_at: string;
  closed_at: string | null;
  updated_at: string;
}

// ── Copy Subscription ──────────────────────────────────────────────────────
export interface CopySubscription {
  id: string;
  follower_id: string;
  leader_id: string;
  is_active: boolean;
  lot_multiplier: number;
  created_at: string;
}

// ── Order Log ──────────────────────────────────────────────────────────────
export interface OrderLog {
  id: string;
  user_id: string;
  trade_node_id: string;
  type: OrderType;
  price: number;
  qty: number;
  lot_size: number;
  pnl: number | null;
  broker_order_id: string | null;
  broker_status: BrokerOrderStatus;
  error_message: string | null;
  created_at: string;
}

// ── Trade Event ────────────────────────────────────────────────────────────
export interface TradeEvent {
  id: string;
  trade_id: string;
  user_id: string;
  event_type: TradeEventType;
  ltp_at_event: number;
  payload: Record<string, unknown>;
  created_at: string;
}

// ── Subscription ───────────────────────────────────────────────────────────
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'trial';

export interface Subscription {
  id: string;
  user_id: string;
  tier: 'pro' | 'elite';
  status: SubscriptionStatus;
  started_at: string;
  expires_at: string;
  razorpay_subscription_id: string | null;
  payment_ref: string | null;
}

// ── System Flags ──────────────────────────────────────────────────────────
export interface SystemFlag {
  key: string;
  value: boolean | number | string;
}

// ── Broker Health ─────────────────────────────────────────────────────────
export interface BrokerHealth {
  broker_id: BrokerName;
  state: BrokerHealthState;
  failure_count: number;
  last_checked_at: string;
  last_error: string | null;
}

// ── Signal Parser Result ───────────────────────────────────────────────────
export interface ParsedSignal {
  symbol: string;
  strike: string;
  entryPrice: number;
  t1: number;
  t2: number;
  t3: number;
  sl: number;
  targetMode: TargetMode;
}

// ── Deploy Form ────────────────────────────────────────────────────────────
export interface DeployTradeInput {
  symbol: string;
  strike: string;
  tradingSymbol: string;
  securityId: string;
  exchange: string;
  protocol: Protocol;
  targetMode: TargetMode;
  mode: TradeMode;
  entryPrice: number;
  sl: number;
  t1: number;
  t2: number;
  t3: number;
  lots: number;
  brokerAccountId: string | null;
}

// ── Dhan Order Management ──────────────────────────────────────────────────

export type DhanTransactionType = 'BUY' | 'SELL';
export type DhanProductType = 'CNC' | 'INTRADAY' | 'MARGIN' | 'MTF' | 'CO' | 'BO';
export type DhanOrderType = 'LIMIT' | 'MARKET' | 'STOP_LOSS' | 'STOP_LOSS_MARKET';
export type DhanValidity = 'DAY' | 'IOC';
export type DhanOrderStatus =
  | 'TRANSIT'
  | 'PENDING'
  | 'REJECTED'
  | 'CANCELLED'
  | 'PART_TRADED'
  | 'TRADED'
  | 'EXPIRED';
export type DhanLegName = 'ENTRY_LEG' | 'TARGET_LEG' | 'STOP_LOSS_LEG';
export type DhanAmoTime = 'PRE_OPEN' | 'OPEN' | 'OPEN_30' | 'OPEN_60';
export type DhanOptionType = 'CALL' | 'PUT';

/** Dhan order as returned from GET /v2/orders or saved in dhan_orders table */
export interface DhanOrder {
  id?: string;                              // local UUID (from dhan_orders)
  dhanClientId: string;
  orderId: string;
  correlationId: string;
  orderStatus: DhanOrderStatus;
  transactionType: DhanTransactionType;
  exchangeSegment: string;
  productType: DhanProductType;
  orderType: DhanOrderType;
  validity: DhanValidity;
  tradingSymbol: string;
  securityId: string;
  quantity: number;
  disclosedQuantity: number;
  price: number;
  triggerPrice: number;
  afterMarketOrder: boolean;
  boProfitValue: number;
  boStopLossValue: number;
  legName: DhanLegName | null;
  createTime: string;
  updateTime: string;
  exchangeTime: string;
  drvExpiryDate: string | null;
  drvOptionType: DhanOptionType | null;
  drvStrikePrice: number;
  omsErrorCode: string | null;
  omsErrorDescription: string | null;
  algoId: string;
  remainingQuantity: number;
  averageTradedPrice: number;
  filledQty: number;
}

/** Dhan trade as returned from GET /v2/trades or saved in dhan_trades table */
export interface DhanTrade {
  id?: string;                              // local UUID
  dhanClientId: string;
  orderId: string;
  exchangeOrderId: string;
  exchangeTradeId: string;
  transactionType: DhanTransactionType;
  exchangeSegment: string;
  productType: DhanProductType;
  orderType: DhanOrderType;
  tradingSymbol: string;
  securityId: string;
  tradedQuantity: number;
  tradedPrice: number;
  createTime: string;
  updateTime: string;
  exchangeTime: string;
  drvExpiryDate: string | null;
  drvOptionType: DhanOptionType | null;
  drvStrikePrice: number;
}

/** Payload for POST /api/dhan-order */
export interface PlaceOrderPayload {
  brokerId: string;
  transactionType: DhanTransactionType;
  exchangeSegment: string;
  productType: DhanProductType;
  orderType: DhanOrderType;
  validity?: DhanValidity;
  securityId: string;
  tradingSymbol?: string;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  disclosedQuantity?: number;
  afterMarketOrder?: boolean;
  amoTime?: DhanAmoTime;
  boProfitValue?: number;
  boStopLossValue?: number;
  correlationId?: string;
  slicing?: boolean;
}

/** Payload for PUT /api/dhan-modify-order */
export interface ModifyOrderPayload {
  brokerId: string;
  orderId: string;
  orderType: DhanOrderType;
  legName?: DhanLegName;
  quantity?: number;
  price?: number;
  disclosedQuantity?: number;
  triggerPrice?: number;
  validity?: DhanValidity;
}

// ── Super Orders ───────────────────────────────────────────────────────────

/** Statuses returned by Dhan super order endpoints */
export type DhanSuperOrderStatus =
  | 'TRANSIT'
  | 'PENDING'
  | 'CLOSED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'PART_TRADED'
  | 'TRADED'
  | 'TRIGGERED'
  | 'EXPIRED';

/** A single nested leg inside a DhanSuperOrder */
export interface DhanSuperOrderLegDetail {
  orderId: string;
  legName: DhanLegName;
  transactionType: DhanTransactionType;
  totalQuantity?: number;
  remainingQuantity: number;
  triggeredQuantity: number;
  price: number;
  orderStatus: DhanSuperOrderStatus;
  trailingJump: number;
}

/** Super order as returned from GET /v2/super/orders */
export interface DhanSuperOrder {
  id?: string;                          // local UUID from dhan_super_orders
  dhanClientId: string;
  orderId: string;
  correlationId: string;
  orderStatus: DhanSuperOrderStatus;
  transactionType: DhanTransactionType;
  exchangeSegment: string;
  productType: 'CNC' | 'INTRADAY' | 'MARGIN' | 'MTF';
  orderType: 'LIMIT' | 'MARKET';
  validity: DhanValidity;
  tradingSymbol: string;
  securityId: string;
  quantity: number;
  remainingQuantity: number;
  ltp: number;
  price: number;
  afterMarketOrder: boolean;
  legName: DhanLegName;
  exchangeOrderId: string;
  createTime: string;
  updateTime: string;
  exchangeTime: string;
  omsErrorDescription: string;
  averageTradedPrice: number;
  filledQty: number;
  legDetails: DhanSuperOrderLegDetail[];
}

/** Payload for POST /api/dhan-super-order */
export interface PlaceSuperOrderPayload {
  brokerId: string;
  transactionType: DhanTransactionType;
  exchangeSegment: string;
  productType: 'CNC' | 'INTRADAY' | 'MARGIN' | 'MTF';
  orderType: 'LIMIT' | 'MARKET';
  securityId: string;
  tradingSymbol?: string;
  quantity: number;
  price: number;
  targetPrice: number;
  stopLossPrice: number;
  trailingJump: number;
  correlationId?: string;
}

/** Payload for PUT /api/dhan-modify-super-order */
export interface ModifySuperOrderPayload {
  brokerId: string;
  orderId: string;
  legName: DhanLegName;
  orderType?: 'LIMIT' | 'MARKET';
  quantity?: number;
  price?: number;
  targetPrice?: number;
  stopLossPrice?: number;
  trailingJump?: number;
}

// ── Forever Orders ─────────────────────────────────────────────────────────

export type DhanForeverOrderFlag = 'SINGLE' | 'OCO';

export type DhanForeverOrderStatus =
  | 'TRANSIT'
  | 'PENDING'
  | 'REJECTED'
  | 'CANCELLED'
  | 'TRADED'
  | 'EXPIRED'
  | 'CONFIRM';

/** Forever order as returned from GET /v2/forever/all */
export interface DhanForeverOrder {
  id?: string;                          // local UUID
  dhanClientId: string;
  orderId: string;
  orderStatus: DhanForeverOrderStatus;
  transactionType: DhanTransactionType;
  exchangeSegment: string;
  productType: DhanProductType;
  orderType: DhanForeverOrderFlag;      // note: Dhan returns 'SINGLE' or 'OCO' here
  tradingSymbol: string;
  securityId: string;
  quantity: number;
  price: number;
  triggerPrice: number;
  disclosedQuantity?: number;
  legName: string;
  createTime: string;
  updateTime: string | null;
  exchangeTime: string | null;
  drvExpiryDate: string | null;
  drvOptionType: DhanOptionType | null;
  drvStrikePrice: number;
  // OCO second leg
  price1?: number;
  triggerPrice1?: number;
  quantity1?: number;
}

/** Payload for POST /api/dhan-forever-order */
export interface PlaceForeverOrderPayload {
  brokerId: string;
  orderFlag: DhanForeverOrderFlag;
  transactionType: DhanTransactionType;
  exchangeSegment: string;
  productType: 'CNC' | 'MTF';
  orderType: 'LIMIT' | 'MARKET';
  validity?: DhanValidity;
  securityId: string;
  tradingSymbol?: string;
  quantity: number;
  price: number;
  triggerPrice: number;
  disclosedQuantity?: number;
  correlationId?: string;
  // OCO second leg
  price1?: number;
  triggerPrice1?: number;
  quantity1?: number;
}

/** Payload for PUT /api/dhan-modify-forever-order */
export interface ModifyForeverOrderPayload {
  brokerId: string;
  orderId: string;
  orderFlag: DhanForeverOrderFlag;
  orderType: 'LIMIT' | 'MARKET' | 'STOP_LOSS' | 'STOP_LOSS_MARKET';
  legName: 'TARGET_LEG' | 'STOP_LOSS_LEG';
  quantity: number;
  price: number;
  triggerPrice: number;
  disclosedQuantity?: number;
  validity?: DhanValidity;
}

// ── Positions ─────────────────────────────────────────────────────────────

export type DhanPositionType = 'LONG' | 'SHORT';

export interface DhanPosition {
  id?: string;
  dhanClientId: string;
  tradingSymbol: string;
  securityId: string;
  positionType: DhanPositionType;
  exchangeSegment: string;
  productType: DhanProductType;
  buyAvg: number;
  sellAvg: number;
  costPrice: number;
  buyQty: number;
  sellQty: number;
  netQty: number;
  realizedProfit: number;
  unrealizedProfit: number;
  rbiReferenceRate: number;
  multiLotQuantity: number;
  carryForwardBuyQty: number;
  carryForwardSellQty: number;
  carryForwardBuyValue: number;
  carryForwardSellValue: number;
  dayBuyQty: number;
  daySellQty: number;
  dayBuyValue: number;
  daySellValue: number;
  crossCurrency: boolean;
  drvExpiryDate: string | null;
  drvOptionType: DhanOptionType | null;
  drvStrikePrice: number;
  // local fields
  ltp?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ── Holdings ──────────────────────────────────────────────────────────────

export interface DhanHolding {
  id?: string;
  exchange: string;
  tradingSymbol: string;
  securityId: string;
  isin: string;
  totalQty: number;
  dpQty: number;
  t1Qty: number;
  availableQty: number;
  collateralQty: number;
  avgCostPrice: number;
}

export interface ConvertPositionPayload {
  brokerId: string;
  fromProductType: 'CNC' | 'INTRADAY' | 'MARGIN' | 'CO' | 'BO';
  exchangeSegment: string;
  positionType: 'LONG' | 'SHORT' | 'CLOSED';
  securityId: string;
  tradingSymbol?: string;
  convertQty: number;
  toProductType: 'CNC' | 'INTRADAY' | 'MARGIN' | 'CO' | 'BO';
}

// ── Conditional Triggers (Alerts) ─────────────────────────────────────────

export type DhanAlertStatus = 'ACTIVE' | 'TRIGGERED' | 'CANCELLED' | 'EXPIRED' | 'INACTIVE';

export type DhanComparisonType =
  | 'TECHNICAL_WITH_VALUE'
  | 'TECHNICAL_WITH_TECHNICAL'
  | 'PRICE_WITH_VALUE'
  | 'PRICE_WITH_PRICE';

export type DhanAlertTimeframe = 'DAY' | 'ONE_MIN' | 'FIVE_MIN' | 'FIFTEEN_MIN';

export type DhanAlertOperator =
  | 'LESS_THAN'
  | 'GREATER_THAN'
  | 'EQUAL_TO'
  | 'CROSSING_UP'
  | 'CROSSING_DOWN';

export type DhanAlertFrequency = 'ONCE' | 'MANY';

export interface DhanAlertCondition {
  comparisonType: DhanComparisonType;
  exchangeSegment: string;
  securityId: string;
  indicatorName?: string;
  timeFrame: DhanAlertTimeframe;
  operator: DhanAlertOperator;
  comparingValue?: number;
  comparingIndicatorName?: string;
  expDate: string;
  frequency: DhanAlertFrequency;
  userNote?: string;
}

export interface DhanAlertOrder {
  transactionType: DhanTransactionType;
  exchangeSegment: string;
  productType: DhanProductType;
  orderType: DhanOrderType;
  securityId: string;
  quantity: number;
  validity: DhanValidity;
  price: string;
  discQuantity?: string;
  triggerPrice?: string;
}

export interface DhanConditionalTrigger {
  id?: string;
  alertId: string;
  alertStatus: DhanAlertStatus;
  createdTime?: string;
  triggeredTime?: string | null;
  lastPrice?: string | number;
  condition: DhanAlertCondition;
  orders: DhanAlertOrder[];
}

export interface PlaceConditionalTriggerPayload {
  brokerId: string;
  condition: DhanAlertCondition;
  orders: DhanAlertOrder[];
}

export interface ModifyConditionalTriggerPayload {
  brokerId: string;
  alertId: string;
  condition: DhanAlertCondition;
  orders: DhanAlertOrder[];
}

// ── Kill Switch & P&L Exit ─────────────────────────────────────────────────

export type DhanKillSwitchStatus = 'ACTIVATE' | 'DEACTIVATE';

export interface DhanKillSwitchResponse {
  dhanClientId: string;
  killSwitchStatus: string;
}

export type DhanPnlExitStatus = 'ACTIVE' | 'INACTIVE' | 'DISABLED';

export type DhanPnlProductType = 'INTRADAY' | 'DELIVERY';

export interface DhanPnlExitConfig {
  profitValue: string;
  lossValue: string;
  productType: DhanPnlProductType[];
  enableKillSwitch: boolean;
}

export interface DhanPnlExitResponse {
  pnlExitStatus: DhanPnlExitStatus;
  profit?: string;
  loss?: string;
  productType?: DhanPnlProductType[];
  enableKillSwitch?: boolean;
  message?: string;
}

// ── Funds & Margin ─────────────────────────────────────────────────────────

export interface DhanFundLimit {
  dhanClientId: string;
  availabelBalance: number;
  sodLimit: number;
  collateralAmount: number;
  receiveableAmount: number;
  utilizedAmount: number;
  blockedPayoutAmount: number;
  withdrawableBalance: number;
}

export interface MarginCalculatorPayload {
  brokerId: string;
  exchangeSegment: string;
  transactionType: DhanTransactionType;
  quantity: number;
  productType: DhanProductType;
  securityId: string;
  price: number;
  triggerPrice?: number;
}

export interface DhanMarginResult {
  totalMargin: number;
  spanMargin: number;
  exposureMargin: number;
  availableBalance: number;
  variableMargin: number;
  insufficientBalance: number;
  brokerage: number;
  leverage: string;
}

export interface MultiMarginScript {
  exchangeSegment: string;
  transactionType: DhanTransactionType;
  quantity: number;
  productType: DhanProductType;
  securityId: string;
  price: number;
  triggerPrice?: number;
}

export interface MultiMarginCalculatorPayload {
  brokerId: string;
  includePosition?: boolean;
  includeOrders?: boolean;
  scripts: MultiMarginScript[];
}

export interface DhanMultiMarginResult {
  total_margin: string;
  span_margin: string;
  exposure_margin: string;
  equity_margin: string;
  fo_margin: string;
  commodity_margin: string;
  currency: string;
  hedge_benefit: string;
}

// ── Ledger ────────────────────────────────────────────────────────────────
export interface DhanLedgerEntry {
  dhanClientId: string;
  narration: string;
  voucherdate: string;
  exchange: string;
  voucherdesc: string;
  vouchernumber: string;
  debit: string;
  credit: string;
  runbal: string;
}

// ── Trade History ─────────────────────────────────────────────────────────
export interface DhanTradeHistoryEntry {
  dhanClientId: string;
  orderId: string;
  exchangeOrderId: string;
  exchangeTradeId: string;
  transactionType: 'BUY' | 'SELL';
  exchangeSegment: string;
  productType: string;
  orderType: string;
  tradingSymbol: string | null;
  customSymbol: string;
  securityId: string;
  tradedQuantity: number;
  tradedPrice: number;
  isin: string;
  instrument: string;
  sebiTax: number;
  stt: number;
  brokerageCharges: number;
  serviceTax: number;
  exchangeTransactionCharges: number;
  stampDuty: number;
  createTime: string;
  updateTime: string;
  exchangeTime: string;
  drvExpiryDate: string;
  drvOptionType: string | null;
  drvStrikePrice: number;
}

// ── Postback Webhook ──────────────────────────────────────────────────────
export type DhanPostbackStatus = 'TRANSIT' | 'PENDING' | 'REJECTED' | 'CANCELLED' | 'TRADED' | 'EXPIRED';

export interface DhanPostbackPayload {
  dhanClientId: string;
  orderId: string;
  correlationId?: string;
  orderStatus: DhanPostbackStatus;
  transactionType: 'BUY' | 'SELL';
  exchangeSegment: string;
  productType: string;
  orderType: string;
  validity: string;
  tradingSymbol: string;
  securityId: string;
  quantity: number;
  disclosedQuantity: number;
  price: number;
  triggerPrice: number;
  afterMarketOrder: boolean;
  boProfitValue: number;
  boStopLossValue: number;
  legName?: string | null;
  createTime: string;
  updateTime: string;
  exchangeTime: string;
  drvExpiryDate?: string | null;
  drvOptionType?: string | null;
  drvStrikePrice: number;
  omsErrorCode?: string | null;
  omsErrorDescription?: string | null;
  filled_qty: number;
  algoId?: string | null;
}

// ── Live Order Update (WebSocket) ─────────────────────────────────────────
export interface DhanOrderUpdateData {
  Exchange: string;
  Segment: string;
  Source: string;
  SecurityId: string;
  ClientId: string;
  ExchOrderNo: string;
  OrderNo: string;
  Product: string;
  TxnType: string;
  OrderType: string;
  Validity: string;
  DiscQuantity: number;
  RemainingQuantity: number;
  Quantity: number;
  TradedQty: number;
  Price: number;
  TriggerPrice: number;
  TradedPrice: number;
  AvgTradedPrice: number;
  OffMktFlag: string;
  OrderDateTime: string;
  ExchOrderTime: string;
  LastUpdatedTime: string;
  Remarks?: string;
  MktType: string;
  ReasonDescription: string;
  LegNo: number;
  Instrument: string;
  Symbol: string;
  ProductName: string;
  Status: string;
  LotSize: number;
  StrikePrice?: number;
  ExpiryDate: string;
  OptType: string;
  DisplayName: string;
  Isin: string;
  Series: string;
  GoodTillDaysDate: string;
  RefLtp: number;
  TickSize: number;
  AlgoId: string;
  Multiplier: number;
  CorrelationId?: string;
}

export interface DhanOrderUpdateMessage {
  Data: DhanOrderUpdateData;
  Type: 'order_alert';
}

// ── Option Chain ──────────────────────────────────────────────────────────
export interface OptionGreeks {
  delta: number;
  theta: number;
  gamma: number;
  vega:  number;
}

export interface OptionLeg {
  average_price:        number;
  greeks:               OptionGreeks;
  implied_volatility:   number;
  last_price:           number;
  oi:                   number;
  previous_close_price: number;
  previous_oi:          number;
  previous_volume:      number;
  security_id:          number;
  top_ask_price:        number;
  top_ask_quantity:     number;
  top_bid_price:        number;
  top_bid_quantity:     number;
  volume:               number;
}

export interface OptionStrike {
  ce?: OptionLeg;
  pe?: OptionLeg;
}

/** Map of strike price string → OptionStrike */
export type OptionChainOC = Record<string, OptionStrike>;

export interface OptionChainData {
  last_price: number;
  oc:         OptionChainOC;
}

export interface OptionChainResponse {
  data:   OptionChainData;
  status: string;
}

export interface OptionChainRequest {
  brokerId:       string;
  UnderlyingScrip: number;
  UnderlyingSeg:   string;
  Expiry:          string;
}

export interface ExpiryListRequest {
  brokerId:        string;
  UnderlyingScrip: number;
  UnderlyingSeg:   string;
}

export interface ExpiryListResponse {
  data:   string[];
  status: string;
}

// ── Dashboard Stats ────────────────────────────────────────────────────────
export interface DashboardStats {
  totalBookedPnl: number;
  activeTrades: number;
  winRate: number;
  tradesToday: number;
  maxDrawdown: number;
}
