/**
 * Dhan HQ v2 API — Annexure Constants
 * All enums, codes, and reference maps from the official Dhan API documentation.
 * Use `as const` objects for runtime access and derive union types via `keyof typeof`.
 */

// ─── Exchange Segments ────────────────────────────────────────────────────────

export const EXCHANGE_SEGMENT = {
  IDX_I:        0,  // Index — Index Value
  NSE_EQ:       1,  // NSE — Equity Cash
  NSE_FNO:      2,  // NSE — Futures & Options
  NSE_CURRENCY: 3,  // NSE — Currency
  BSE_EQ:       4,  // BSE — Equity Cash
  MCX_COMM:     5,  // MCX — Commodity
  BSE_CURRENCY: 7,  // BSE — Currency
  BSE_FNO:      8,  // BSE — Futures & Options
} as const;

export type ExchangeSegmentKey   = keyof typeof EXCHANGE_SEGMENT;
export type ExchangeSegmentValue = (typeof EXCHANGE_SEGMENT)[ExchangeSegmentKey];

/** Human-readable label for each segment */
export const EXCHANGE_SEGMENT_LABEL: Record<ExchangeSegmentKey, string> = {
  IDX_I:        'Index',
  NSE_EQ:       'NSE Equity',
  NSE_FNO:      'NSE F&O',
  NSE_CURRENCY: 'NSE Currency',
  BSE_EQ:       'BSE Equity',
  MCX_COMM:     'MCX Commodity',
  BSE_CURRENCY: 'BSE Currency',
  BSE_FNO:      'BSE F&O',
};

export const EXCHANGE_SEGMENT_OPTIONS: { value: ExchangeSegmentKey; label: string }[] =
  (Object.keys(EXCHANGE_SEGMENT) as ExchangeSegmentKey[]).map((key) => ({
    value: key,
    label: EXCHANGE_SEGMENT_LABEL[key],
  }));

// ─── Product Types ────────────────────────────────────────────────────────────

export const PRODUCT_TYPE = {
  CNC:      'CNC',
  INTRADAY: 'INTRADAY',
  MARGIN:   'MARGIN',
  MTF:      'MTF',
  CO:       'CO',
  BO:       'BO',
} as const;

export type ProductType = (typeof PRODUCT_TYPE)[keyof typeof PRODUCT_TYPE];

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  CNC:      'CNC (Delivery)',
  INTRADAY: 'Intraday',
  MARGIN:   'Margin (Carry Forward)',
  MTF:      'MTF',
  CO:       'Cover Order',
  BO:       'Bracket Order',
};

/** CO and BO are valid only for Intraday */
export const PRODUCT_TYPE_INTRADAY_ONLY: ProductType[] = ['CO', 'BO'];

export const PRODUCT_TYPE_OPTIONS: { value: ProductType; label: string }[] =
  (Object.keys(PRODUCT_TYPE) as ProductType[]).map((key) => ({
    value: key,
    label: PRODUCT_TYPE_LABEL[key],
  }));

// ─── Order Status ─────────────────────────────────────────────────────────────

export const ORDER_STATUS = {
  TRANSIT:      'TRANSIT',
  PENDING:      'PENDING',
  CLOSED:       'CLOSED',
  TRIGGERED:    'TRIGGERED',
  REJECTED:     'REJECTED',
  CANCELLED:    'CANCELLED',
  PART_TRADED:  'PART_TRADED',
  TRADED:       'TRADED',
  EXPIRED:      'EXPIRED',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  TRANSIT:     'Transit',
  PENDING:     'Pending',
  CLOSED:      'Closed',
  TRIGGERED:   'Triggered',
  REJECTED:    'Rejected',
  CANCELLED:   'Cancelled',
  PART_TRADED: 'Partially Traded',
  TRADED:      'Traded',
  EXPIRED:     'Expired',
};

/** Orders considered "open / active" */
export const ORDER_STATUS_OPEN: OrderStatus[] = ['TRANSIT', 'PENDING', 'PART_TRADED'];
/** Orders considered "closed / terminal" */
export const ORDER_STATUS_CLOSED: OrderStatus[] = [
  'CLOSED', 'TRIGGERED', 'REJECTED', 'CANCELLED', 'TRADED', 'EXPIRED',
];

// ─── After Market Order (AMO) Time ───────────────────────────────────────────

export const AMO_TIME = {
  PRE_OPEN: 'PRE_OPEN',
  OPEN:     'OPEN',
  OPEN_30:  'OPEN_30',
  OPEN_60:  'OPEN_60',
} as const;

export type AmoTime = (typeof AMO_TIME)[keyof typeof AMO_TIME];

export const AMO_TIME_LABEL: Record<AmoTime, string> = {
  PRE_OPEN: 'Pre-Open Session',
  OPEN:     'Market Open',
  OPEN_30:  '30 min After Open',
  OPEN_60:  '60 min After Open',
};

export const AMO_TIME_OPTIONS: { value: AmoTime; label: string }[] =
  (Object.keys(AMO_TIME) as AmoTime[]).map((key) => ({
    value: key,
    label: AMO_TIME_LABEL[key],
  }));

// ─── Expiry Code ─────────────────────────────────────────────────────────────

export const EXPIRY_CODE = {
  NEAR:    0,
  NEXT:    1,
  FAR:     2,
} as const;

export type ExpiryCode = (typeof EXPIRY_CODE)[keyof typeof EXPIRY_CODE];

export const EXPIRY_CODE_LABEL: Record<ExpiryCode, string> = {
  0: 'Current / Near Expiry',
  1: 'Next Expiry',
  2: 'Far Expiry',
};

// ─── Instrument Types ─────────────────────────────────────────────────────────

export const INSTRUMENT = {
  INDEX:   'INDEX',
  FUTIDX:  'FUTIDX',
  OPTIDX:  'OPTIDX',
  EQUITY:  'EQUITY',
  FUTSTK:  'FUTSTK',
  OPTSTK:  'OPTSTK',
  FUTCOM:  'FUTCOM',
  OPTFUT:  'OPTFUT',
  FUTCUR:  'FUTCUR',
  OPTCUR:  'OPTCUR',
} as const;

export type Instrument = (typeof INSTRUMENT)[keyof typeof INSTRUMENT];

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  INDEX:  'Index',
  FUTIDX: 'Index Futures',
  OPTIDX: 'Index Options',
  EQUITY: 'Equity',
  FUTSTK: 'Stock Futures',
  OPTSTK: 'Stock Options',
  FUTCOM: 'Commodity Futures',
  OPTFUT: 'Commodity Futures Options',
  FUTCUR: 'Currency Futures',
  OPTCUR: 'Currency Options',
};

// ─── Feed Request Codes ───────────────────────────────────────────────────────

export const FEED_REQUEST_CODE = {
  CONNECT:                    11,
  DISCONNECT:                 12,
  SUBSCRIBE_TICKER:           15,
  UNSUBSCRIBE_TICKER:         16,
  SUBSCRIBE_QUOTE:            17,
  UNSUBSCRIBE_QUOTE:          18,
  SUBSCRIBE_FULL:             21,
  UNSUBSCRIBE_FULL:           22,
  SUBSCRIBE_FULL_MARKET_DEPTH:   23,
  UNSUBSCRIBE_FULL_MARKET_DEPTH: 24,
} as const;

export type FeedRequestCode = (typeof FEED_REQUEST_CODE)[keyof typeof FEED_REQUEST_CODE];

export const FEED_REQUEST_LABEL: Record<FeedRequestCode, string> = {
  11: 'Connect Feed',
  12: 'Disconnect Feed',
  15: 'Subscribe Ticker',
  16: 'Unsubscribe Ticker',
  17: 'Subscribe Quote',
  18: 'Unsubscribe Quote',
  21: 'Subscribe Full',
  22: 'Unsubscribe Full',
  23: 'Subscribe Full Market Depth',
  24: 'Unsubscribe Full Market Depth',
};

// ─── Feed Response Codes ──────────────────────────────────────────────────────

export const FEED_RESPONSE_CODE = {
  INDEX_PACKET:      1,
  TICKER_PACKET:     2,
  QUOTE_PACKET:      4,
  OI_PACKET:         5,
  PREV_CLOSE_PACKET: 6,
  MARKET_STATUS:     7,
  FULL_PACKET:       8,
  FEED_DISCONNECT:   50,
} as const;

export type FeedResponseCode = (typeof FEED_RESPONSE_CODE)[keyof typeof FEED_RESPONSE_CODE];

export const FEED_RESPONSE_LABEL: Record<FeedResponseCode, string> = {
  1:  'Index Packet',
  2:  'Ticker Packet',
  4:  'Quote Packet',
  5:  'OI Packet',
  6:  'Prev Close Packet',
  7:  'Market Status Packet',
  8:  'Full Packet',
  50: 'Feed Disconnect',
};

// ─── Trading API Error Codes ──────────────────────────────────────────────────

export const TRADING_ERROR_CODE = {
  INVALID_AUTH:          'DH-901',
  INVALID_ACCESS:        'DH-902',
  USER_ACCOUNT:          'DH-903',
  RATE_LIMIT:            'DH-904',
  INPUT_EXCEPTION:       'DH-905',
  ORDER_ERROR:           'DH-906',
  DATA_ERROR:            'DH-907',
  INTERNAL_SERVER_ERROR: 'DH-908',
  NETWORK_ERROR:         'DH-909',
  OTHERS:                'DH-910',
} as const;

export type TradingErrorCode = (typeof TRADING_ERROR_CODE)[keyof typeof TRADING_ERROR_CODE];

export const TRADING_ERROR_MESSAGE: Record<TradingErrorCode, string> = {
  'DH-901': 'Client ID or access token is invalid or expired.',
  'DH-902': 'User has not subscribed to Data APIs or does not have Trading API access.',
  'DH-903': 'Errors related to User Account (segments, requirements).',
  'DH-904': 'Rate limit exceeded — too many requests. Throttle API calls.',
  'DH-905': 'Input exception — missing required fields or bad parameter values.',
  'DH-906': 'Order error — incorrect request, cannot be processed.',
  'DH-907': 'Data error — incorrect parameters or no data available.',
  'DH-908': 'Internal server error — server could not process the request.',
  'DH-909': 'Network error — API could not communicate with backend.',
  'DH-910': 'Unknown error from other reasons.',
};

// ─── Data API Error Codes ─────────────────────────────────────────────────────

export const DATA_ERROR_CODE = {
  INTERNAL_SERVER_ERROR:     800,
  INSTRUMENTS_LIMIT_EXCEEDED: 804,
  TOO_MANY_REQUESTS:         805,
  DATA_API_NOT_SUBSCRIBED:   806,
  ACCESS_TOKEN_EXPIRED:      807,
  AUTHENTICATION_FAILED:     808,
  ACCESS_TOKEN_INVALID:      809,
  CLIENT_ID_INVALID:         810,
  INVALID_EXPIRY_DATE:       811,
  INVALID_DATE_FORMAT:       812,
  INVALID_SECURITY_ID:       813,
  INVALID_REQUEST:           814,
} as const;

export type DataErrorCode = (typeof DATA_ERROR_CODE)[keyof typeof DATA_ERROR_CODE];

export const DATA_ERROR_MESSAGE: Record<DataErrorCode, string> = {
  800: 'Internal Server Error',
  804: 'Requested number of instruments exceeds limit',
  805: 'Too many requests or connections — further requests may result in blocking',
  806: 'Data APIs not subscribed',
  807: 'Access token is expired',
  808: 'Authentication failed — Client ID or access token invalid',
  809: 'Access token is invalid',
  810: 'Client ID is invalid',
  811: 'Invalid expiry date',
  812: 'Invalid date format',
  813: 'Invalid security ID',
  814: 'Invalid request',
};

// ─── Conditional Trigger — Comparison Type ────────────────────────────────────

export const COMPARISON_TYPE = {
  TECHNICAL_WITH_VALUE:     'TECHNICAL_WITH_VALUE',
  TECHNICAL_WITH_INDICATOR: 'TECHNICAL_WITH_INDICATOR',
  TECHNICAL_WITH_CLOSE:     'TECHNICAL_WITH_CLOSE',
  PRICE_WITH_VALUE:         'PRICE_WITH_VALUE',
} as const;

export type ComparisonType = (typeof COMPARISON_TYPE)[keyof typeof COMPARISON_TYPE];

export const COMPARISON_TYPE_LABEL: Record<ComparisonType, string> = {
  TECHNICAL_WITH_VALUE:     'Technical vs Fixed Value',
  TECHNICAL_WITH_INDICATOR: 'Technical vs Indicator',
  TECHNICAL_WITH_CLOSE:     'Technical vs Close Price',
  PRICE_WITH_VALUE:         'Market Price vs Fixed Value',
};

/** Required fields per comparison type */
export const COMPARISON_TYPE_REQUIRED_FIELDS: Record<ComparisonType, string[]> = {
  TECHNICAL_WITH_VALUE:     ['indicatorName', 'operator', 'timeFrame', 'comparingValue'],
  TECHNICAL_WITH_INDICATOR: ['indicatorName', 'operator', 'timeFrame', 'comparingIndicatorName'],
  TECHNICAL_WITH_CLOSE:     ['indicatorName', 'operator', 'timeFrame'],
  PRICE_WITH_VALUE:         ['operator', 'comparingValue'],
};

// ─── Conditional Trigger — Indicator Names ────────────────────────────────────

export const INDICATOR_NAME = {
  SMA_5:       'SMA_5',
  SMA_10:      'SMA_10',
  SMA_20:      'SMA_20',
  SMA_50:      'SMA_50',
  SMA_100:     'SMA_100',
  SMA_200:     'SMA_200',
  EMA_5:       'EMA_5',
  EMA_10:      'EMA_10',
  EMA_20:      'EMA_20',
  EMA_50:      'EMA_50',
  EMA_100:     'EMA_100',
  EMA_200:     'EMA_200',
  BB_UPPER:    'BB_UPPER',
  BB_LOWER:    'BB_LOWER',
  RSI_14:      'RSI_14',
  ATR_14:      'ATR_14',
  STOCHASTIC:  'STOCHASTIC',
  STOCHRSI_14: 'STOCHRSI_14',
  MACD_26:     'MACD_26',
  MACD_12:     'MACD_12',
  MACD_HIST:   'MACD_HIST',
} as const;

export type IndicatorName = (typeof INDICATOR_NAME)[keyof typeof INDICATOR_NAME];

export const INDICATOR_NAME_LABEL: Record<IndicatorName, string> = {
  SMA_5:       'SMA (5)',
  SMA_10:      'SMA (10)',
  SMA_20:      'SMA (20)',
  SMA_50:      'SMA (50)',
  SMA_100:     'SMA (100)',
  SMA_200:     'SMA (200)',
  EMA_5:       'EMA (5)',
  EMA_10:      'EMA (10)',
  EMA_20:      'EMA (20)',
  EMA_50:      'EMA (50)',
  EMA_100:     'EMA (100)',
  EMA_200:     'EMA (200)',
  BB_UPPER:    'Bollinger Upper Band',
  BB_LOWER:    'Bollinger Lower Band',
  RSI_14:      'RSI (14)',
  ATR_14:      'ATR (14)',
  STOCHASTIC:  'Stochastic Oscillator',
  STOCHRSI_14: 'Stochastic RSI (14)',
  MACD_26:     'MACD Long (26)',
  MACD_12:     'MACD Short (12)',
  MACD_HIST:   'MACD Histogram',
};

export const INDICATOR_NAME_OPTIONS: { value: IndicatorName; label: string }[] =
  (Object.keys(INDICATOR_NAME) as IndicatorName[]).map((key) => ({
    value: key,
    label: INDICATOR_NAME_LABEL[key],
  }));

// ─── Conditional Trigger — Comparison Operators ───────────────────────────────

export const TRIGGER_OPERATOR = {
  CROSSING_UP:          'CROSSING_UP',
  CROSSING_DOWN:        'CROSSING_DOWN',
  CROSSING_ANY_SIDE:    'CROSSING_ANY_SIDE',
  GREATER_THAN:         'GREATER_THAN',
  LESS_THAN:            'LESS_THAN',
  GREATER_THAN_EQUAL:   'GREATER_THAN_EQUAL',
  LESS_THAN_EQUAL:      'LESS_THAN_EQUAL',
  EQUAL:                'EQUAL',
  NOT_EQUAL:            'NOT_EQUAL',
} as const;

export type TriggerOperator = (typeof TRIGGER_OPERATOR)[keyof typeof TRIGGER_OPERATOR];

export const TRIGGER_OPERATOR_LABEL: Record<TriggerOperator, string> = {
  CROSSING_UP:        'Crosses Above (↑)',
  CROSSING_DOWN:      'Crosses Below (↓)',
  CROSSING_ANY_SIDE:  'Crosses Either Side (↕)',
  GREATER_THAN:       'Greater Than (>)',
  LESS_THAN:          'Less Than (<)',
  GREATER_THAN_EQUAL: 'Greater Than or Equal (≥)',
  LESS_THAN_EQUAL:    'Less Than or Equal (≤)',
  EQUAL:              'Equal (=)',
  NOT_EQUAL:          'Not Equal (≠)',
};

export const TRIGGER_OPERATOR_OPTIONS: { value: TriggerOperator; label: string }[] =
  (Object.keys(TRIGGER_OPERATOR) as TriggerOperator[]).map((key) => ({
    value: key,
    label: TRIGGER_OPERATOR_LABEL[key],
  }));

// ─── Conditional Trigger — Alert Status ──────────────────────────────────────

export const ALERT_STATUS = {
  ACTIVE:    'ACTIVE',
  TRIGGERED: 'TRIGGERED',
  EXPIRED:   'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

export type AlertStatus = (typeof ALERT_STATUS)[keyof typeof ALERT_STATUS];

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  ACTIVE:    'Active',
  TRIGGERED: 'Triggered',
  EXPIRED:   'Expired',
  CANCELLED: 'Cancelled',
};

export const ALERT_STATUS_COLOR: Record<AlertStatus, string> = {
  ACTIVE:    'text-profit',
  TRIGGERED: 'text-foreground',
  EXPIRED:   'text-muted',
  CANCELLED: 'text-loss',
};
